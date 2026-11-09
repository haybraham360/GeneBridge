-- Family notices may name any condition in the catalogue (content/library),
-- not only the first eight. The app checks the id against the catalogue
-- before inserting (lib/notices/types.ts isNoticeCondition); the database
-- keeps the same id format as family_member_conditions and followed
-- conditions.
alter table public.family_notifications
  drop constraint if exists family_notifications_condition_id_check;

alter table public.family_notifications
  add constraint family_notifications_condition_id_check
  check (condition_id is null or condition_id ~ '^[a-z0-9_]{2,40}$');
