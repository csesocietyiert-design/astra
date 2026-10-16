-- ASTRA consolidated Supabase setup.
-- Run once in the Supabase SQL Editor for the intended project.
-- This consolidates the repository migrations dated 2026-10-13 through 2026-10-16.
-- It does not change Supabase's migration ledger.

begin;

grant usage on schema public to service_role;

-- Member and outsider account credentials.
create table if not exists public.astra_credentials (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text,
  first_name text,
  last_name text,
  date_of_birth date,
  gender text check (gender is null or gender in ('female', 'male', 'non_binary', 'prefer_not_to_say')),
  blood_group text check (blood_group is null or blood_group in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  avatar_path text,
  aktu_enrollment_number text,
  admission_batch_year smallint check (
    admission_batch_year is null or admission_batch_year between 2000 and 2100
  ),
  branch text,
  secondary_email text,
  mobile_number text,
  whatsapp_number text,
  whatsapp_same_as_mobile boolean not null default true,
  address text,
  member_account_id text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists astra_credentials_email_lower_key
  on public.astra_credentials (lower(email));

alter table public.astra_credentials
  alter column password_hash drop not null,
  alter column first_name drop not null,
  alter column last_name drop not null,
  add column if not exists member_account_id text,
  add column if not exists avatar_url text;

create unique index if not exists astra_credentials_member_account_id_key
  on public.astra_credentials (member_account_id)
  where member_account_id is not null;

alter table public.astra_credentials enable row level security;
revoke all on table public.astra_credentials from anon, authenticated;
grant all on table public.astra_credentials to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'astra-profile-photos',
  'astra-profile-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Notifications and per-account read state.
create table if not exists public.astra_notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  message text not null check (char_length(message) between 1 and 1200),
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists astra_notifications_created_at_idx
  on public.astra_notifications (created_at desc);

create table if not exists public.astra_notification_reads (
  notification_id uuid not null references public.astra_notifications (id) on delete cascade,
  account_type text not null check (account_type in ('member', 'outsider')),
  user_id text not null,
  read_at timestamptz not null default now(),
  primary key (notification_id, account_type, user_id)
);

create index if not exists astra_notification_reads_user_idx
  on public.astra_notification_reads (account_type, user_id, notification_id);

alter table public.astra_notifications enable row level security;
revoke all on table public.astra_notifications from anon, authenticated;
grant all on table public.astra_notifications to service_role;

alter table public.astra_notification_reads enable row level security;
revoke all on table public.astra_notification_reads from anon, authenticated;
grant all on table public.astra_notification_reads to service_role;

-- Accepted-submission streak activity and submission history.
create table if not exists public.astra_streak_activity (
  id uuid primary key default gen_random_uuid(),
  account_type text not null check (account_type in ('member', 'outsider')),
  user_id text not null,
  activity_date date not null,
  created_at timestamptz not null default now(),
  unique (account_type, user_id, activity_date)
);

create index if not exists astra_streak_activity_user_date_idx
  on public.astra_streak_activity (account_type, user_id, activity_date desc);

alter table public.astra_streak_activity enable row level security;
revoke all on table public.astra_streak_activity from anon, authenticated;
grant all on table public.astra_streak_activity to service_role;

create table if not exists public.astra_submissions (
  id uuid primary key default gen_random_uuid(),
  account_type text not null check (account_type in ('member', 'outsider')),
  user_id text not null,
  problem_slug text not null,
  problem_title text not null,
  difficulty text not null check (difficulty in ('Easy', 'Medium', 'Hard')),
  problem_tags text[] not null default '{}',
  language text not null,
  verdict text not null,
  failed_test_case integer,
  source_code text,
  passed_test_cases integer,
  total_test_cases integer,
  execution_time numeric,
  memory_kb integer,
  diagnostic text,
  session_started_at timestamptz,
  session_ended_at timestamptz,
  time_taken_seconds integer,
  created_at timestamptz not null default now()
);

alter table public.astra_submissions
  add column if not exists source_code text,
  add column if not exists passed_test_cases integer,
  add column if not exists total_test_cases integer,
  add column if not exists execution_time numeric,
  add column if not exists memory_kb integer,
  add column if not exists diagnostic text,
  add column if not exists session_started_at timestamptz,
  add column if not exists session_ended_at timestamptz,
  add column if not exists time_taken_seconds integer;

alter table public.astra_submissions
  drop constraint if exists astra_submissions_session_timing_check;
alter table public.astra_submissions
  add constraint astra_submissions_session_timing_check
  check (
    time_taken_seconds is null
    or (
      time_taken_seconds >= 0
      and session_started_at is not null
      and session_ended_at is not null
      and session_ended_at >= session_started_at
    )
  );

create index if not exists astra_submissions_user_created_idx
  on public.astra_submissions (account_type, user_id, created_at desc);

create index if not exists astra_submissions_accepted_problem_idx
  on public.astra_submissions (account_type, user_id, problem_slug)
  where verdict = 'Accepted';

alter table public.astra_submissions enable row level security;
revoke all on table public.astra_submissions from anon, authenticated;
grant all on table public.astra_submissions to service_role;

create or replace function public.record_astra_submission_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.verdict = 'Accepted' then
    insert into public.astra_streak_activity (account_type, user_id, activity_date)
    values (new.account_type, new.user_id, (now() at time zone 'Asia/Kolkata')::date)
    on conflict (account_type, user_id, activity_date) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.record_astra_submission_activity() from public, anon, authenticated;

drop trigger if exists astra_submission_activity_after_insert on public.astra_submissions;
create trigger astra_submission_activity_after_insert
  after insert on public.astra_submissions
  for each row execute function public.record_astra_submission_activity();

-- Problem library and judging configuration.
create table if not exists public.astra_problems (
  problem_id text primary key,
  slug text not null unique,
  title text not null check (char_length(title) between 3 and 120),
  difficulty text not null check (difficulty in ('Easy', 'Medium', 'Hard')),
  topic text not null check (char_length(topic) between 2 and 60),
  tags text[] not null check (cardinality(tags) between 1 and 10),
  description text not null check (char_length(description) between 10 and 4000),
  input_format text not null check (char_length(input_format) between 1 and 2000),
  output_format text not null check (char_length(output_format) between 1 and 2000),
  constraints text not null check (char_length(constraints) between 1 and 2000),
  sample_input text not null check (char_length(sample_input) <= 10000),
  sample_output text not null check (char_length(sample_output) <= 10000),
  starter_code text not null default '' check (char_length(starter_code) <= 30000),
  test_cases jsonb not null check (
    jsonb_typeof(test_cases) = 'array'
    and jsonb_array_length(test_cases) between 1 and 25
  ),
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists astra_problems_created_at_idx
  on public.astra_problems (created_at desc);

alter table public.astra_problems
  add column if not exists supported_languages jsonb not null default '[]'::jsonb,
  add column if not exists starter_codes jsonb not null default '{}'::jsonb,
  add column if not exists time_limit_ms integer not null default 2000,
  add column if not exists memory_limit_mb integer not null default 256,
  add column if not exists publication_status text not null default 'published';

alter table public.astra_problems
  drop constraint if exists astra_problems_publication_status_check;
alter table public.astra_problems
  add constraint astra_problems_publication_status_check
  check (publication_status in ('published', 'archived'));

alter table public.astra_problems enable row level security;
revoke all on table public.astra_problems from anon, authenticated;
grant all on table public.astra_problems to service_role;

create table if not exists public.astra_problem_drafts (
  draft_id uuid primary key default gen_random_uuid(),
  problem_id text,
  title text not null default '',
  draft_data jsonb not null default '{}'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint astra_problem_drafts_problem_fk
    foreign key (problem_id) references public.astra_problems(problem_id) on delete cascade
);

create index if not exists astra_problem_drafts_owner_updated_idx
  on public.astra_problem_drafts (created_by, updated_at desc);

alter table public.astra_problem_drafts enable row level security;
revoke all on table public.astra_problem_drafts from anon, authenticated;
grant all on table public.astra_problem_drafts to service_role;

-- Contests and per-account registration.
create table if not exists public.astra_contests (
  contest_id text primary key check (contest_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '',
  starts_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 15 and 600),
  registration_open boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists astra_contests_starts_at_idx
  on public.astra_contests (starts_at);

create table if not exists public.astra_contest_registrations (
  contest_id text not null references public.astra_contests (contest_id) on delete cascade,
  account_type text not null check (account_type in ('member', 'outsider')),
  user_id text not null,
  registered_at timestamptz not null default now(),
  primary key (contest_id, account_type, user_id)
);

create index if not exists astra_contest_registrations_account_idx
  on public.astra_contest_registrations (account_type, user_id, registered_at desc);

alter table public.astra_contests enable row level security;
revoke all on table public.astra_contests from anon, authenticated;
grant all on table public.astra_contests to service_role;

alter table public.astra_contest_registrations enable row level security;
revoke all on table public.astra_contest_registrations from anon, authenticated;
grant all on table public.astra_contest_registrations to service_role;

insert into public.astra_contests (contest_id, title, description, starts_at, duration_minutes)
values
  ('astra-weekly-sprint', 'ASTRA Weekly Sprint', 'A timed weekly coding challenge for the CSE Society.', '2026-10-18 09:00:00+05:30', 90),
  ('dynamic-programming-duel', 'Dynamic Programming Duel', 'Practice dynamic programming in a focused timed contest.', '2026-10-25 09:00:00+05:30', 120),
  ('graph-rush', 'Graph Rush', 'A timed challenge covering graph traversal and problem solving.', '2026-11-05 09:00:00+05:30', 75)
on conflict (contest_id) do nothing;

-- Ask PostgREST to refresh its schema cache after this transaction commits.
notify pgrst, 'reload schema';

commit;
