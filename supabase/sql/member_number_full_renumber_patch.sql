begin;

alter sequence public.member_number_sequence
  minvalue 1
  restart with 1;

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

update public.profiles
set member_number = null
where exists (
  select 1
  from public.members
  where public.members.id = public.profiles.id
);

with ordered_members as (
  select
    profiles.id,
    row_number() over (
      order by
        coalesce(members.created_at, profiles.created_at),
        profiles.created_at,
        profiles.id
    ) as serial_number
  from public.profiles as profiles
  join public.members as members
    on members.id = profiles.id
)
update public.profiles
set member_number = format(
  'IMPCS%s',
  lpad(ordered_members.serial_number::text, 5, '0')
)
from ordered_members
where ordered_members.id = public.profiles.id;

select setval(
  'public.member_number_sequence',
  (
    select coalesce(count(*), 0) + 1
    from public.members
  ),
  false
);

commit;
