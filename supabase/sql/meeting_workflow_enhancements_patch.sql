-- Patch existing projects with the newer meeting workflow fields used by the app.

alter table public.meetings
  add column if not exists lateness_starts_at timestamptz;

update public.meetings
set lateness_starts_at = starts_at
where lateness_starts_at is null;

alter table public.meetings
  alter column lateness_starts_at set not null;

alter table public.meetings
  drop constraint if exists meetings_lateness_window_valid;

alter table public.meetings
  add constraint meetings_lateness_window_valid
  check (
    lateness_starts_at >= starts_at
    and attendance_closes_at > lateness_starts_at
  );

alter table public.meeting_attendance
  add column if not exists is_approved boolean;

alter table public.meeting_attendance
  add column if not exists approved_at timestamptz;

alter table public.meeting_attendance
  add column if not exists approved_by uuid references public.profiles(id) on delete set null;

update public.meeting_attendance
set
  is_approved = true,
  approved_at = coalesce(approved_at, updated_at),
  approved_by = coalesce(approved_by, marked_by)
where is_approved is null;

alter table public.meeting_attendance
  alter column is_approved set default false;

alter table public.meeting_attendance
  alter column is_approved set not null;
