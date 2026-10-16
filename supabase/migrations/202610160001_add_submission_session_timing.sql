begin;

alter table public.astra_submissions
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

notify pgrst, 'reload schema';

commit;
