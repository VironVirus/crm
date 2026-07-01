-- Run this after the target user has signed up, so they already exist in auth.users.
-- You can target the user by email or by auth user id.
--
-- Helpful lookup query:
-- select id, email, created_at from auth.users order by created_at desc;

do $$
declare
  target_email text := 'replace-with-your-email@example.com';
  target_user_id uuid := null;
  target_user record;
begin
  if target_user_id is null
    and (
      target_email is null
      or trim(target_email) = ''
      or target_email = 'replace-with-your-email@example.com'
    ) then
    raise exception
      'Set target_email or target_user_id before running this script.';
  end if;

  if target_user_id is not null then
    select
      id,
      email,
      raw_user_meta_data
    into target_user
    from auth.users
    where id = target_user_id
    limit 1;
  else
    select
      id,
      email,
      raw_user_meta_data
    into target_user
    from auth.users
    where email = target_email
    limit 1;
  end if;

  if target_user.id is null then
    raise exception
      'No auth.users record found for %. Make sure the user has signed up first, or use target_user_id.',
      coalesce(target_email, target_user_id::text);
  end if;

  insert into public.profiles as profiles (
    id,
    full_name,
    email,
    phone,
    role,
    member_number,
    status
  )
  values (
    target_user.id,
    coalesce(
      nullif(trim(target_user.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(target_user.raw_user_meta_data ->> 'name'), ''),
      split_part(target_user.email, '@', 1)
    ),
    target_user.email,
    nullif(target_user.raw_user_meta_data ->> 'phone', ''),
    'admin',
    nullif(target_user.raw_user_meta_data ->> 'member_number', ''),
    'active'
  )
  on conflict (id) do update
  set
    full_name = coalesce(profiles.full_name, excluded.full_name),
    email = excluded.email,
    phone = coalesce(profiles.phone, excluded.phone),
    role = 'admin',
    member_number = coalesce(profiles.member_number, excluded.member_number),
    status = 'active';
end;
$$;

select
  id,
  full_name,
  email,
  role,
  status
from public.profiles
where email = 'replace-with-your-email@example.com';
