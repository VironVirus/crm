create schema if not exists extensions;

create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema extensions;

create or replace function public.enable_row_level_security_on_public_tables()
returns event_trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  command record;
begin
  for command in
    select
      namespace.nspname as schema_name,
      relation.relname as table_name
    from pg_event_trigger_ddl_commands() as ddl_command
    join pg_class as relation
      on relation.oid = ddl_command.objid
    join pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where ddl_command.command_tag = 'CREATE TABLE'
      and relation.relkind = 'r'
      and namespace.nspname = 'public'
  loop
    execute format(
      'alter table %I.%I enable row level security',
      command.schema_name,
      command.table_name
    );
  end loop;
end;
$$;

drop event trigger if exists on_public_table_create_enable_rls;

create event trigger on_public_table_create_enable_rls
  on ddl_command_end
  when tag in ('CREATE TABLE')
  execute function public.enable_row_level_security_on_public_tables();

do $$
declare
  existing_table record;
begin
  for existing_table in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format(
      'alter table %I.%I enable row level security',
      existing_table.schemaname,
      existing_table.tablename
    );
  end loop;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'roles'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.roles as enum (
      'admin',
      'loan_officer',
      'treasurer',
      'member'
    );
  end if;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  phone text,
  role public.roles not null default 'member',
  member_number text unique,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'suspended')),
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.profiles enable row level security;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.current_user_is_admin() to service_role;

drop policy if exists "Members can read their own profile" on public.profiles;
create policy "Members can read their own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles"
on public.profiles
for select
to authenticated
using (public.current_user_is_admin());
