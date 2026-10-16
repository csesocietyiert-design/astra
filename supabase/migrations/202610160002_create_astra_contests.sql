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
