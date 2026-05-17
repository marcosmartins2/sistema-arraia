alter table public.products
  add column if not exists promo_min_quantity integer,
  add column if not exists promo_discount_amount numeric(10, 2),
  add column if not exists original_sale_price numeric(10, 2);

alter table public.sale_items
  alter column unit_price type numeric(12, 6);

alter table public.products
  drop constraint if exists products_promo_min_quantity_check;

alter table public.products
  add constraint products_promo_min_quantity_check
  check (promo_min_quantity is null or promo_min_quantity >= 2);

alter table public.products
  drop constraint if exists products_promo_discount_amount_check;

alter table public.products
  add constraint products_promo_discount_amount_check
  check (promo_discount_amount is null or promo_discount_amount >= 0);

create or replace function public.register_sale(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_sale_id uuid;
  item jsonb;
  current_product products%rowtype;
  requested_quantity integer;
  payload_organization_id uuid;
  actor_user_id uuid;
  access_code text;
  effective_unit_price numeric(12, 6);
  line_total numeric(10, 2);
  promotional_package_total numeric(10, 2);
  promotional_package_count integer;
  regular_unit_count integer;
  v_gross_total numeric(10, 2) := 0;
  v_cost_total numeric(10, 2) := 0;
  v_profit_total numeric(10, 2) := 0;
begin
  if payload->'items' is null or jsonb_array_length(payload->'items') = 0 then
    raise exception 'A venda precisa ter pelo menos um item.';
  end if;

  payload_organization_id := nullif(payload->>'organization_id', '')::uuid;
  actor_user_id := nullif(payload->>'actor_user_id', '')::uuid;
  access_code := nullif(payload->>'access_code', '');

  if payload_organization_id is null then
    raise exception 'A organizacao da venda e obrigatoria.';
  end if;

  if actor_user_id is not null and public.is_organization_member_for_user(payload_organization_id, actor_user_id) then
    -- Admin or authenticated organization member.
  elsif access_code is not null and public.is_valid_organization_access_code(payload_organization_id, access_code) then
    -- Shared event access code.
  else
    raise exception 'Usuario sem acesso a esta organizacao.';
  end if;

  insert into public.sales (
    organization_id,
    group_id,
    cashier_name,
    payment_method,
    notes
  )
  values (
    payload_organization_id,
    nullif(payload->>'group_id', '')::uuid,
    nullif(payload->>'cashier_name', ''),
    coalesce(nullif(payload->>'payment_method', ''), 'pix'),
    nullif(payload->>'notes', '')
  )
  returning id into created_sale_id;

  for item in select * from jsonb_array_elements(payload->'items')
  loop
    requested_quantity := coalesce((item->>'quantity')::integer, 0);

    if requested_quantity <= 0 then
      raise exception 'Quantidade invalida para o produto %.', item->>'product_id';
    end if;

    select *
      into current_product
      from public.products
      where id = (item->>'product_id')::uuid
        and organization_id = payload_organization_id
      for update;

    if not found or not current_product.is_active then
      raise exception 'Produto indisponivel: %.', item->>'product_id';
    end if;

    if current_product.stock_quantity < requested_quantity then
      raise exception 'Estoque insuficiente para %.', current_product.name;
    end if;

    effective_unit_price := current_product.sale_price;
    line_total := requested_quantity * current_product.sale_price;

    if current_product.promo_min_quantity is not null
      and current_product.promo_discount_amount is not null
      and current_product.promo_min_quantity >= 2
      and current_product.promo_discount_amount > 0
      and requested_quantity >= current_product.promo_min_quantity then
      promotional_package_count := requested_quantity / current_product.promo_min_quantity;
      regular_unit_count := requested_quantity % current_product.promo_min_quantity;
      promotional_package_total := greatest(
        0,
        current_product.promo_min_quantity * current_product.sale_price - current_product.promo_discount_amount
      );
      line_total := promotional_package_count * promotional_package_total + regular_unit_count * current_product.sale_price;
      effective_unit_price := line_total / requested_quantity;
    end if;

    insert into public.sale_items (
      organization_id,
      sale_id,
      product_id,
      group_id,
      quantity,
      unit_price,
      unit_cost
    )
    values (
      payload_organization_id,
      created_sale_id,
      current_product.id,
      current_product.group_id,
      requested_quantity,
      effective_unit_price,
      current_product.unit_cost
    );

    update public.products
      set stock_quantity = stock_quantity - requested_quantity
      where id = current_product.id;

    insert into public.inventory_movements (
      organization_id,
      product_id,
      sale_id,
      movement_type,
      quantity_delta,
      reason
    )
    values (
      payload_organization_id,
      current_product.id,
      created_sale_id,
      'sale',
      requested_quantity * -1,
      'Venda registrada no caixa'
    );

    v_gross_total := v_gross_total + line_total;
    v_cost_total := v_cost_total + (requested_quantity * current_product.unit_cost);
    v_profit_total := v_profit_total + (line_total - (requested_quantity * current_product.unit_cost));
  end loop;

  update public.sales
    set
      gross_total = v_gross_total,
      cost_total = v_cost_total,
      profit_total = v_profit_total
    where id = created_sale_id;

  return created_sale_id;
end;
$$;
