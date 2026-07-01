create table if not exists public.members (
  id uuid primary key references public.profiles(id) on delete cascade,
  date_of_birth date not null,
  address text not null,
  occupation text not null,
  next_of_kin_name text,
  next_of_kin_phone text,
  next_of_kin_relationship text,
  national_id_path text,
  passport_photo_path text,
  utility_bill_path text,
  onboarding_status text not null default 'pending'
    check (onboarding_status in ('pending', 'registered')),
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.members enable row level security;

create index if not exists idx_members_onboarding_status
  on public.members(onboarding_status);

drop policy if exists "Members can read their own member record" on public.members;
create policy "Members can read their own member record"
on public.members
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Admins can read all member records" on public.members;
create policy "Admins can read all member records"
on public.members
for select
to authenticated
using (public.current_user_is_admin());

create sequence if not exists public.member_number_sequence
  start with 1
  increment by 1
  minvalue 1;

create or replace function public.assign_member_number(target_profile_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_member_number text;
  generated_member_number text;
begin
  if target_profile_id is null then
    raise exception 'target_profile_id is required'
      using errcode = '23502';
  end if;

  select member_number
  into existing_member_number
  from public.profiles
  where id = target_profile_id
  for update;

  if not found then
    raise exception 'No profile found for %', target_profile_id
      using errcode = 'P0002';
  end if;

  perform 1
  from public.members
  where id = target_profile_id;

  if not found then
    raise exception 'No member registration found for %', target_profile_id
      using errcode = 'P0002';
  end if;

  if existing_member_number is not null then
    return existing_member_number;
  end if;

  generated_member_number := format(
    'IMPCS%s',
    lpad(nextval('public.member_number_sequence')::text, 5, '0')
  );

  update public.profiles
  set member_number = generated_member_number
  where id = target_profile_id;

  update public.members
  set onboarding_status = 'registered'
  where id = target_profile_id;

  return generated_member_number;
end;
$$;

revoke all on function public.assign_member_number(uuid) from public;
grant execute on function public.assign_member_number(uuid) to authenticated;
grant execute on function public.assign_member_number(uuid) to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'member-kyc',
  'member-kyc',
  false,
  1048576,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Members can read their own KYC files" on storage.objects;
create policy "Members can read their own KYC files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'member-kyc'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Admins can read all KYC files" on storage.objects;
create policy "Admins can read all KYC files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'member-kyc'
  and public.current_user_is_admin()
);
