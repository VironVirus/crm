-- Ifemelunma Cooperative Society
-- Post-schema patch for member notifications and realtime subscriptions.
-- Use this when your main schema was already run before notifications were added.

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'notification_type'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.notification_type as enum (
      'loan_approved',
      'loan_rejected',
      'payment_received',
      'guarantor_invite',
      'due_reminder',
      'dividend_paid'
    );
  end if;
end;
$$;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  type public.notification_type not null,
  title text not null check (char_length(trim(title)) > 0),
  message text not null check (char_length(trim(message)) > 0),
  is_read boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.notifications enable row level security;

create index if not exists idx_notifications_member_id
  on public.notifications(member_id);

create index if not exists idx_notifications_type
  on public.notifications(type);

create index if not exists idx_notifications_is_read
  on public.notifications(is_read);

create index if not exists idx_notifications_created_at
  on public.notifications(created_at desc);

drop policy if exists "Members can read their own notifications" on public.notifications;
create policy "Members can read their own notifications"
on public.notifications
for select
to authenticated
using (auth.uid() = member_id);

drop policy if exists "Members can update their own notifications" on public.notifications;
create policy "Members can update their own notifications"
on public.notifications
for update
to authenticated
using (auth.uid() = member_id)
with check (auth.uid() = member_id);

drop policy if exists "Admins can read all notifications" on public.notifications;
create policy "Admins can read all notifications"
on public.notifications
for select
to authenticated
using (public.current_user_is_admin());

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception
  when undefined_object then
    null;
end;
$$;
