create or replace function public.delete_sale(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_sale_id uuid;
  payload_organization_id uuid;
  actor_user_id uuid;
  access_code text;
  sale_row sales%rowtype;
  item record;
begin
  target_sale_id := nullif(payload->>'sale_id', '')::uuid;
  payload_organization_id := nullif(payload->>'organization_id', '')::uuid;
  actor_user_id := nullif(payload->>'actor_user_id', '')::uuid;
  access_code := nullif(payload->>'access_code', '');

  if target_sale_id is null then
    raise exception 'O id da venda e obrigatorio.';
  end if;

  if payload_organization_id is null then
    raise exception 'A organizacao da venda e obrigatoria.';
  end if;

  if actor_user_id is not null and public.is_organization_member_for_user(payload_organization_id, actor_user_id) then
    -- Authenticated organization member or admin.
  elsif access_code is not null and public.is_valid_organization_access_code(payload_organization_id, access_code) then
    -- Shared event access code.
  else
    raise exception 'Usuario sem acesso a esta organizacao.';
  end if;

  select *
    into sale_row
    from public.sales
    where id = target_sale_id
      and organization_id = payload_organization_id
    for update;

  if not found then
    raise exception 'Venda nao encontrada.';
  end if;

  for item in
    select product_id, quantity
      from public.sale_items
      where sale_id = target_sale_id
  loop
    update public.products
      set stock_quantity = stock_quantity + item.quantity
      where id = item.product_id;
  end loop;

  delete from public.inventory_movements where sale_id = target_sale_id;
  delete from public.sales where id = target_sale_id;

  return target_sale_id;
end;
$$;

grant execute on function public.delete_sale(jsonb) to anon, authenticated, service_role;
