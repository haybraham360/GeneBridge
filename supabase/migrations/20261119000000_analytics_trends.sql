-- Programme dashboard: "Understanding over time" (rubric 6).
--
-- Weekly sign-ups and teach-back scores before and after the result
-- explainer, for people who signed up in each week. Aggregate only, like
-- every other analytics function:
--
--   * analyst only (require_analyst), fixed windows only (check_days);
--   * every week with fewer than 10 people is null (k);
--   * weeks are full 7-day buckets counted back from now, never calendar
--     weeks. A partial oldest bucket is dropped, so a week holds the same
--     people whichever window (30 days, 90 days, all time) asked for it, and
--     two windows can't be subtracted to single someone out.
--
-- Windows: 30 days -> the last 4 weeks, 90 days -> the last 12 weeks,
-- all time -> the last 26 weeks (the chart stays readable).

create function public.analytics_trends(p_days integer, p_centre text default null)
returns table (
  weeks_ago   integer,
  week_start  date,
  signups     integer,
  pre_score   numeric,
  post_score  numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  now_at  timestamptz := now();
  n_weeks integer := case p_days when 30 then 4 when 90 then 12 else 26 end;
  w_from  timestamptz;
begin
  perform analytics_private.require_analyst();
  perform analytics_private.check_days(p_days);
  w_from := now_at - make_interval(days => 7 * n_weeks);

  return query
    with f as (
      select u.pre_score as pre, u.post_score as post,
             floor(extract(epoch from now_at - p.created_at) / 604800)::integer as w
        from analytics_private.user_facts(w_from, now_at, p_centre) u
        join public.profiles p on p.user_id = u.user_id
    ),
    weeks as (select generate_series(0, n_weeks - 1) as w),
    per_week as (
      select weeks.w,
             count(f.w) as n_people,
             count(f.w) filter (where f.pre is not null and f.post is not null) as n_tb,
             avg(f.pre) filter (where f.pre is not null and f.post is not null) as pre,
             avg(f.post) filter (where f.pre is not null and f.post is not null) as post
        from weeks
        left join f on f.w = weeks.w
       group by weeks.w
    )
    select pw.w,
           (now_at - make_interval(days => 7 * (pw.w + 1)))::date,
           analytics_private.k(pw.n_people, pw.n_people)::integer,
           analytics_private.k(pw.n_tb, round(pw.pre, 1)),
           analytics_private.k(pw.n_tb, round(pw.post, 1))
      from per_week pw
     order by pw.w desc;
end;
$$;

revoke all on function public.analytics_trends(integer, text) from public, anon;
grant execute on function public.analytics_trends(integer, text) to authenticated;
