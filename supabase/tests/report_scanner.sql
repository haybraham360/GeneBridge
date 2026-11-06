-- Task 12: report scanner. Run with `npm run test:sql`. Rolls back; leaves
-- nothing behind.

\set ON_ERROR_STOP on
\o /dev/null
begin;

insert into auth.users (id) values
  ('5ca10000-0000-4000-8000-0000000000a1'),  -- person A
  ('5ca10000-0000-4000-8000-0000000000b2');  -- person B (A's partner)

create function pg_temp.as_user(id text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;

-- Saving: server only, rows are unverified scans, flags enforced.
do $$
declare ref text; n integer;
begin
  perform pg_temp.as_user('5ca10000-0000-4000-8000-0000000000a1');
  begin
    perform public.save_scanned_report('5ca10000-0000-4000-8000-0000000000a1',
      '{"findings":[{"condition_code":"beta_thalassemia","status":"carrier","flagged":false}]}');
    raise exception 'a user could save results directly';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  perform pg_temp.as_service();
  ref := public.save_scanned_report('5ca10000-0000-4000-8000-0000000000a1', jsonb_build_object(
    'lab_name', '[Sample Genomics Lab]', 'report_date', '2026-10-12',
    'findings', jsonb_build_array(
      jsonb_build_object('condition_code', 'beta_thalassemia', 'status', 'carrier', 'genotype', 'heterozygous',
                         'flagged', false, 'condition_text', 'Beta-thalassemia'),
      jsonb_build_object('condition_code', 'cystic_fibrosis', 'status', 'no_variant', 'flagged', false,
                         'condition_text', 'Cystic fibrosis'))));
  if ref !~ '^SCAN-[0-9A-F]{12}$' then raise exception 'unexpected reference %', ref; end if;
  select count(*) into n from public.screening_results
   where reference_code = ref and source = 'scan' and not verified
     and owner_id = '5ca10000-0000-4000-8000-0000000000a1' and claimed_at is not null and centre = '[Sample Genomics Lab]';
  if n <> 2 then raise exception 'scanned rows not saved as unverified scans (%)', n; end if;

  begin
    perform public.save_scanned_report('5ca10000-0000-4000-8000-0000000000a1',
      '{"findings":[{"condition_code":"g6pd_deficiency","status":"affected","flagged":false}]}');
    raise exception 'an unflagged affected scan was saved';
  exception when check_violation then null;
  end;
  begin
    perform public.save_scanned_report('5ca10000-0000-4000-8000-0000000000a1', '{"findings":[]}');
    raise exception 'an empty report was saved';
  exception when invalid_parameter_value then null;
  end;
  execute 'reset role';
  raise notice 'ok: server-only save, unverified scan rows, affected scans always flagged';
end $$;

-- A user can't fake a scan row, or mark one verified.
do $$
begin
  perform pg_temp.as_user('5ca10000-0000-4000-8000-0000000000a1');
  begin
    update public.screening_results set verified = true where source = 'scan';
    raise exception 'user updated their own result';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  raise notice 'ok: no direct updates';
end $$;

-- Claiming the same report from the screening centre verifies the scan.
do $$
declare v boolean;
begin
  insert into public.screening_results (reference_code, condition_code, status, centre)
  values ('AD-PMS-2026-SCAN01', 'beta_thalassemia', 'carrier', '[Screening centre]');
  perform pg_temp.as_user('5ca10000-0000-4000-8000-0000000000a1');
  if public.claim_screening_result('ad-pms-2026-scan01') <> 'claimed' then raise exception 'claim failed'; end if;
  execute 'reset role';
  select verified into v from public.screening_results
   where owner_id = '5ca10000-0000-4000-8000-0000000000a1' and source = 'scan' and condition_code = 'beta_thalassemia';
  if not v then raise exception 'scan not verified after claim'; end if;
  select verified into v from public.screening_results
   where owner_id = '5ca10000-0000-4000-8000-0000000000a1' and source = 'scan' and condition_code = 'cystic_fibrosis';
  if v then raise exception 'unrelated scan verified'; end if;
  -- Scan reference codes can't be claimed by reference.
  perform pg_temp.as_user('5ca10000-0000-4000-8000-0000000000b2');
  if public.claim_screening_result((select reference_code from public.screening_results where source = 'scan' limit 1)) <> 'not_found' then
    raise exception 'someone else claimed a scanned report';
  end if;
  execute 'reset role';
  raise notice 'ok: claiming by reference verifies matching scans only';
end $$;

-- Couples: unverified findings count only if both partners saved a scan.
do $$
declare r record;
begin
  -- Start again: A has only an unverified scan, B a centre result.
  delete from public.screening_results where owner_id = '5ca10000-0000-4000-8000-0000000000a1';
  perform pg_temp.as_service();
  perform public.save_scanned_report('5ca10000-0000-4000-8000-0000000000a1',
    '{"findings":[{"condition_code":"gjb2_hearing_loss","status":"carrier","flagged":false}]}');
  execute 'reset role';
  insert into public.screening_results (owner_id, claimed_at, reference_code, condition_code, status)
  values ('5ca10000-0000-4000-8000-0000000000b2', now(), 'AD-PMS-2026-SCAN02', 'gjb2_hearing_loss', 'carrier');
  insert into public.couple_links (inviter_id, invitee_id, status)
  values ('5ca10000-0000-4000-8000-0000000000a1', '5ca10000-0000-4000-8000-0000000000b2', 'active');
  insert into public.consents (user_id, kind, scope) values
    ('5ca10000-0000-4000-8000-0000000000a1', 'couple_view', 'shared_only'),
    ('5ca10000-0000-4000-8000-0000000000b2', 'couple_view', 'shared_only');

  perform pg_temp.as_user('5ca10000-0000-4000-8000-0000000000a1');
  select * into r from public.couple_shared_conditions() limit 1;
  if r.available or r.reason <> 'result_missing' then
    raise exception 'one partner''s unverified scan was used (available %, reason %)', r.available, r.reason;
  end if;
  execute 'reset role';

  -- B saves a scan too: now both uploaded, and the view says so.
  perform pg_temp.as_service();
  perform public.save_scanned_report('5ca10000-0000-4000-8000-0000000000b2',
    '{"findings":[{"condition_code":"cystic_fibrosis","status":"no_variant","flagged":false}]}');
  execute 'reset role';
  perform pg_temp.as_user('5ca10000-0000-4000-8000-0000000000a1');
  select * into r from public.couple_shared_conditions() limit 1;
  if not r.available or r.condition_code <> 'gjb2_hearing_loss' or not r.based_on_upload then
    raise exception 'shared scanned condition missing (available %, code %, upload %)', r.available, r.condition_code, r.based_on_upload;
  end if;
  execute 'reset role';
  raise notice 'ok: couples use unverified findings only when both saved a scan, and say so';
end $$;

-- Storage: each person's own folder only.
do $$
begin
  perform pg_temp.as_user('5ca10000-0000-4000-8000-0000000000a1');
  insert into storage.objects (bucket_id, name) values ('scan-uploads', '5ca10000-0000-4000-8000-0000000000a1/page-1');
  begin
    insert into storage.objects (bucket_id, name) values ('scan-uploads', '5ca10000-0000-4000-8000-0000000000b2/page-1');
    raise exception 'uploaded into someone else''s folder';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  insert into storage.objects (bucket_id, name, created_at)
  values ('scan-uploads', '5ca10000-0000-4000-8000-0000000000b2/old', now() - interval '20 minutes');

  perform pg_temp.as_user('5ca10000-0000-4000-8000-0000000000b2');
  if (select count(*) from storage.objects where name like '5ca10000-0000-4000-8000-0000000000a1/%') <> 0 then
    raise exception 'B can see A''s uploads';
  end if;
  begin
    perform public.storage_expired_objects('scan-uploads', 900);
    raise exception 'a user listed expired uploads';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  perform pg_temp.as_service();
  if (select array_agg(name) from public.storage_expired_objects('scan-uploads', 900)) <> array['5ca10000-0000-4000-8000-0000000000b2/old'] then
    raise exception 'sweep should list only the 20-minute-old upload';
  end if;
  if exists (select 1 from public.storage_expired_objects('avatars', 0)) then raise exception 'sweep reached another bucket'; end if;
  execute 'reset role';
  if (select public from storage.buckets where id = 'scan-uploads') then raise exception 'scan bucket is public'; end if;
  raise notice 'ok: owner-only storage, private bucket, sweep lists only expired uploads';
end $$;

-- 10 scans a day: counted from the caller's own scan_started events.
do $$
begin
  insert into public.events (user_id, name, props)
  select '5ca10000-0000-4000-8000-0000000000a1', 'scan_started', '{"entry":"results"}' from generate_series(1, 10);
  insert into public.events (user_id, name, props, created_at)
  values ('5ca10000-0000-4000-8000-0000000000a1', 'scan_started', '{}', now() - interval '2 days');
  perform pg_temp.as_user('5ca10000-0000-4000-8000-0000000000a1');
  if public.scans_last_day() <> 10 then raise exception 'scan count wrong'; end if;
  execute 'reset role';
  perform pg_temp.as_user('5ca10000-0000-4000-8000-0000000000b2');
  if public.scans_last_day() <> 0 then raise exception 'scan count leaks across users'; end if;
  execute 'reset role';
  raise notice 'ok: daily scan count is per person';
end $$;

-- Dashboard: reports scanned, analysts only, hidden under 10 people.
do $$
declare r record;
begin
  insert into auth.users (id) select ('5ca1aaaa-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid from generate_series(1, 12) g;
  insert into auth.users (id) values ('5ca1bbbb-0000-4000-8000-000000000001');
  perform pg_temp.as_service();
  update public.profiles set role = 'analyst' where user_id = '5ca1bbbb-0000-4000-8000-000000000001';
  execute 'reset role';
  -- now() is fixed inside a transaction: date the fixtures earlier.
  update public.profiles set created_at = now() - interval '2 hours' where user_id::text like '5ca1%';
  insert into public.events (user_id, name, props, created_at)
  select ('5ca1aaaa-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid, 'scan_completed',
         jsonb_build_object('seconds', 20 + g, 'findings', 8, 'flagged', 0, 'report_type', 'carrier_screening'),
         now() - interval '1 hour'
    from generate_series(1, 9) g;

  perform pg_temp.as_user('5ca1bbbb-0000-4000-8000-000000000001');
  select * into r from public.analytics_scans(30);
  if r.scanned is not null or r.avg_seconds is not null then raise exception '9 people shown'; end if;
  execute 'reset role';

  insert into public.events (user_id, name, props, created_at)
  select ('5ca1aaaa-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid, 'scan_completed',
         jsonb_build_object('seconds', 20 + g), now() - interval '1 hour'
    from generate_series(10, 12) g;
  perform pg_temp.as_user('5ca1bbbb-0000-4000-8000-000000000001');
  select * into r from public.analytics_scans(30);
  if r.scanned <> 12 or r.people <> 12 or r.avg_seconds <> 26.5 then
    raise exception 'unexpected scan figures (%, %, %)', r.scanned, r.people, r.avg_seconds;
  end if;
  execute 'reset role';

  perform pg_temp.as_user('5ca1aaaa-0000-4000-8000-000000000001');
  begin
    perform public.analytics_scans(30);
    raise exception 'a non-analyst read scan figures';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  raise notice 'ok: scan figures for analysts only, hidden under 10 people';
end $$;

\o
select 'report_scanner: all checks passed' as result;
rollback;
