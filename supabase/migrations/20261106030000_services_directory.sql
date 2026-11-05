-- Care & services directory (design refresh: Services screen).
--
-- Placeholder listings only (guardrail 12): every name, area and phone stays
-- in [BRACKETS] until the health authority directory is confirmed. Signed-in
-- users can list services (policy from task 07); nothing here is personal.

alter table public.services drop constraint if exists services_kind_check;
alter table public.services
  add constraint services_kind_check check (kind in (
    'genetic_counselling', 'screening', 'confirmatory_testing', 'haematology',
    'neuromuscular', 'audiology', 'metabolic', 'ivf_embryo_testing', 'support_group'));

alter table public.services
  add column description_en text,
  add column description_ar text,
  add column coverage       text not null default 'details'
    check (coverage in ('programme', 'referral', 'free', 'details')),
  add column women_only     boolean not null default false,
  add column phone          text not null default '[CONFIRM]';

-- Existing rows (tasks 07 and 08).
update public.services set
  description_en = 'Couple and individual sessions, in person or by video.',
  description_ar = 'جلسات للأزواج والأفراد، حضورياً أو عبر الفيديو.',
  coverage = 'programme'
 where name = '[Genetic counselling clinic A]';
update public.services set
  description_en = 'Evening and weekend video sessions. Women-only staff available.',
  description_ar = 'جلسات فيديو مسائية وفي عطلة نهاية الأسبوع. يتوفر طاقم نسائي فقط.',
  coverage = 'programme', women_only = true
 where name = '[Genetic counselling clinic B]';
update public.services set
  description_en = 'Follow-up blood tests your counsellor may advise.',
  description_ar = 'فحوصات دم للمتابعة قد ينصح بها المستشار.',
  coverage = 'referral'
 where name = '[Confirmatory testing lab]';
update public.services set
  description_en = 'Care for inherited blood conditions such as the thalassemias, sickle cell disease and G6PD deficiency.',
  description_ar = 'رعاية لأمراض الدم الوراثية مثل الثلاسيميا وفقر الدم المنجلي ونقص إنزيم G6PD.',
  coverage = 'referral'
 where name = '[Haematology clinic]';
update public.services set
  description_en = 'Information sessions on IVF with embryo testing (PGT).',
  description_ar = 'جلسات تعريفية عن أطفال الأنابيب مع فحص الأجنة (PGT).',
  coverage = 'details'
 where name = '[Fertility centre]';
update public.services set
  description_en = 'Premarital and preconception screening for couples.',
  description_ar = 'فحص ما قبل الزواج وما قبل الحمل للأزواج.',
  coverage = 'programme'
 where name = '[Premarital screening centre]';

-- New listings from the design.
insert into public.services (kind, name, sort, area, languages, description_en, description_ar, coverage) values
  ('neuromuscular', '[Neuromuscular clinic]', 7, '[Area], Abu Dhabi', '{ar,en}',
   'Care for conditions such as spinal muscular atrophy and Duchenne muscular dystrophy.',
   'رعاية لحالات مثل ضمور العضلات الشوكي وضمور العضلات الدوشيني.', 'referral'),
  ('audiology', '[Audiology and hearing clinic]', 8, '[Area], Al Ain', '{ar,en,ur}',
   'Hearing tests and support for hereditary hearing loss.',
   'فحوصات السمع والدعم لضعف السمع الوراثي.', 'referral'),
  ('metabolic', '[Metabolic clinic]', 9, '[Area], Abu Dhabi', '{ar,en}',
   'Care for inherited metabolic conditions such as phenylketonuria.',
   'رعاية لحالات الأيض الوراثية مثل بيلة الفينيل كيتون.', 'referral'),
  ('support_group', '[Family support group]', 10, 'Online and [Area]', '{ar,en}',
   'Monthly meetings for families living with inherited conditions.',
   'لقاءات شهرية للعائلات التي تعيش مع حالات وراثية.', 'free')
on conflict (name) do nothing;
