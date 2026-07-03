-- Operational features patch for the cooperative app.
-- Run this once if your database was already created from full_schema_setup.sql.

alter table public.profiles
  add column if not exists is_verified boolean not null default false,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles(id) on delete set null,
  add column if not exists verification_note text;

create index if not exists idx_profiles_is_verified
  on public.profiles(is_verified);

alter table public.loan_products
  add column if not exists description text,
  add column if not exists terms_summary text,
  add column if not exists processing_fee_rate numeric(5,2) not null default 0,
  add column if not exists penalty_rate numeric(5,2) not null default 0,
  add column if not exists maximum_disbursable_amount numeric(14,2);

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'meeting_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.meeting_status as enum (
      'scheduled',
      'closed',
      'cancelled'
    );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'meeting_attendance_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.meeting_attendance_status as enum (
      'present',
      'late',
      'absent'
    );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'member_charge_source_type'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.member_charge_source_type as enum (
      'meeting_late',
      'meeting_absence',
      'manual'
    );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'member_charge_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.member_charge_status as enum (
      'pending',
      'waived',
      'paid'
    );
  end if;
end;
$$;

alter type public.notification_type add value if not exists 'meeting_update';
alter type public.notification_type add value if not exists 'attendance_charge';
alter type public.notification_type add value if not exists 'member_verified';

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) > 0),
  agenda text,
  location text,
  starts_at timestamptz not null,
  lateness_starts_at timestamptz not null,
  attendance_closes_at timestamptz not null,
  reminder_message text,
  status public.meeting_status not null default 'scheduled',
  daily_reminder_sent_at timestamptz,
  final_reminder_sent_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint meetings_attendance_window_valid
    check (attendance_closes_at > starts_at),
  constraint meetings_lateness_window_valid
    check (
      lateness_starts_at >= starts_at
      and attendance_closes_at > lateness_starts_at
    )
);

create table if not exists public.meeting_attendance (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  status public.meeting_attendance_status not null,
  marked_at timestamptz,
  marked_by uuid references public.profiles(id) on delete set null,
  is_approved boolean not null default false,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  notes text,
  charge_amount numeric(14,2) not null default 0 check (charge_amount >= 0),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint meeting_attendance_unique_member unique (meeting_id, member_id)
);

create table if not exists public.member_charges (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  source_type public.member_charge_source_type not null,
  source_id uuid,
  status public.member_charge_status not null default 'pending',
  amount numeric(14,2) not null check (amount >= 0),
  title text not null check (char_length(trim(title)) > 0),
  description text,
  due_at timestamptz,
  resolved_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint member_charges_source_unique unique (member_id, source_type, source_id)
);

alter table public.meetings enable row level security;
alter table public.meeting_attendance enable row level security;
alter table public.member_charges enable row level security;

create index if not exists idx_meetings_starts_at
  on public.meetings(starts_at);

create index if not exists idx_meetings_status
  on public.meetings(status);

create index if not exists idx_meeting_attendance_member_id
  on public.meeting_attendance(member_id);

create index if not exists idx_meeting_attendance_status
  on public.meeting_attendance(status);

create index if not exists idx_member_charges_member_id
  on public.member_charges(member_id);

create index if not exists idx_member_charges_status
  on public.member_charges(status);

drop policy if exists "Authenticated users can read meetings" on public.meetings;
create policy "Authenticated users can read meetings"
on public.meetings
for select
to authenticated
using (true);

drop policy if exists "Admins can manage meetings" on public.meetings;
create policy "Admins can manage meetings"
on public.meetings
for all
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "Members can read their own meeting attendance" on public.meeting_attendance;
create policy "Members can read their own meeting attendance"
on public.meeting_attendance
for select
to authenticated
using (auth.uid() = member_id);

drop policy if exists "Admins can manage all meeting attendance" on public.meeting_attendance;
create policy "Admins can manage all meeting attendance"
on public.meeting_attendance
for all
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "Members can read their own charges" on public.member_charges;
create policy "Members can read their own charges"
on public.member_charges
for select
to authenticated
using (auth.uid() = member_id);

drop policy if exists "Admins can manage all member charges" on public.member_charges;
create policy "Admins can manage all member charges"
on public.member_charges
for all
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());
