-- Follow-up to 20261114000000_notice_any_condition.sql. That migration drops
-- the old list of eight condition ids by its usual generated name; if the
-- constraint had another name, the old list would still apply. This drops
-- every check on family_notifications that mentions condition_id, whatever
-- its name, then adds the format check once. Safe to run more than once.
do $$
declare
  c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.family_notifications'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%condition_id%'
  loop
    execute format('alter table public.family_notifications drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.family_notifications
  add constraint family_notifications_condition_id_check
  check (condition_id is null or condition_id ~ '^[a-z0-9_]{2,40}$');
