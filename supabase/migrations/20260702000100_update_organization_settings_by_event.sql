create or replace function public.update_organization_settings(payload jsonb)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  payload_organization_id uuid;
  actor_user_id uuid;
  access_code text;
  next_name text;
  next_cashier_names text[];
  updated_organization public.organizations%rowtype;
begin
  payload_organization_id := nullif(payload->>'organization_id', '')::uuid;
  actor_user_id := nullif(payload->>'actor_user_id', '')::uuid;
  access_code := nullif(payload->>'access_code', '');

  if payload_organization_id is null then
    raise exception 'A organizacao do evento e obrigatoria.';
  end if;

  if actor_user_id is not null and public.is_organization_member_for_user(payload_organization_id, actor_user_id) then
    -- Authenticated organization member or admin.
  elsif access_code is not null and public.is_valid_organization_access_code(payload_organization_id, access_code) then
    -- Shared event access code.
  else
    raise exception 'Usuario sem acesso a este evento.';
  end if;

  if payload ? 'name' then
    next_name := trim(payload->>'name');
    if next_name = '' then
      raise exception 'O nome do evento nao pode ficar vazio.';
    end if;
  end if;

  if payload ? 'cashier_names' then
    select coalesce(array_agg(trim(value)) filter (where trim(value) <> ''), '{}'::text[])
      into next_cashier_names
      from jsonb_array_elements_text(coalesce(payload->'cashier_names', '[]'::jsonb)) as value;
  end if;

  update public.organizations
    set
      name = coalesce(next_name, name),
      cashier_names = coalesce(next_cashier_names, cashier_names)
    where id = payload_organization_id
    returning * into updated_organization;

  if not found then
    raise exception 'Evento nao encontrado.';
  end if;

  return updated_organization;
end;
$$;

grant execute on function public.update_organization_settings(jsonb) to anon, authenticated;
