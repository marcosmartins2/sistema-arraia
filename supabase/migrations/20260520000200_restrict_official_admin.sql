create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    case
      when lower(coalesce(new.email, '')) = 'annalimonta@outlook.com' then 'admin'::public.app_role
      else 'member'::public.app_role
    end
  )
  on conflict (id) do update
    set
      email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name),
      role = excluded.role;

  return new;
end;
$$;

create or replace function public.enforce_official_admin_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.email, '')) = 'annalimonta@outlook.com' then
    new.role := 'admin'::public.app_role;
  elsif new.role = 'admin'::public.app_role then
    raise exception 'Only annalimonta@outlook.com can be an admin profile.';
  end if;

  return new;
end;
$$;

update public.profiles
set role = 'member'::public.app_role
where role = 'admin'::public.app_role
  and lower(coalesce(email, '')) <> 'annalimonta@outlook.com';

update public.profiles
set role = 'admin'::public.app_role
where lower(coalesce(email, '')) = 'annalimonta@outlook.com';

drop trigger if exists profiles_enforce_official_admin on public.profiles;

create trigger profiles_enforce_official_admin
before insert or update of email, role on public.profiles
for each row execute function public.enforce_official_admin_profile();
