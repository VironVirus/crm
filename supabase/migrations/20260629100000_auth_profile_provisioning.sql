create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    email,
    phone,
    role,
    member_number,
    status
  )
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.email,
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    'member',
    null,
    'active'
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    phone = coalesce(public.profiles.phone, excluded.phone),
    status = coalesce(public.profiles.status, 'active');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

insert into public.profiles (
  id,
  full_name,
  email,
  phone,
  role,
  member_number,
  status
)
select
  auth_user.id,
  coalesce(
    nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(auth_user.raw_user_meta_data ->> 'name'), ''),
    split_part(auth_user.email, '@', 1)
  ),
  auth_user.email,
  nullif(auth_user.raw_user_meta_data ->> 'phone', ''),
  'member',
  null,
  'active'
from auth.users as auth_user
where not exists (
  select 1
  from public.profiles
  where profiles.id = auth_user.id
);
