-- Treat a lowered "novo valor" (sale_price below original_sale_price) as a discount/promo too,
-- and split each sold line into homogeneous price buckets so the report can show, per product,
-- exactly how many units were sold at each value and how many were sold with a discount.
alter table public.sale_items
  add column if not exists is_promo boolean not null default false;

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
  promotional_package_total numeric(10, 2);
  promotional_package_count integer;
  promo_unit_count integer;
  regular_unit_count integer;
  promo_unit_price numeric(12, 6);
  promo_amount numeric(10, 2);
  regular_amount numeric(10, 2);
  regular_is_promo boolean;
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

    -- Default: everything sold at the regular sale price.
    promo_unit_count := 0;
    regular_unit_count := requested_quantity;
    promo_unit_price := null;
    promo_amount := 0;

    -- Package promotion ("N por R$X"): full packages get the discounted price.
    if current_product.promo_min_quantity is not null
      and current_product.promo_discount_amount is not null
      and current_product.promo_min_quantity >= 2
      and current_product.promo_discount_amount > 0
      and requested_quantity >= current_product.promo_min_quantity then
      promotional_package_count := requested_quantity / current_product.promo_min_quantity;
      promo_unit_count := promotional_package_count * current_product.promo_min_quantity;
      regular_unit_count := requested_quantity - promo_unit_count;
      promotional_package_total := greatest(
        0,
        current_product.promo_min_quantity * current_product.sale_price - current_product.promo_discount_amount
      );
      promo_amount := promotional_package_count * promotional_package_total;
      promo_unit_price := promo_amount / promo_unit_count;
    end if;

    -- A lowered "novo valor" (sale_price marked down below the original) is a discount too.
    regular_is_promo := current_product.original_sale_price is not null
      and current_product.original_sale_price > current_product.sale_price;
    regular_amount := regular_unit_count * current_product.sale_price;

    -- Bucket sold inside a package promotion.
    if promo_unit_count > 0 then
      insert into public.sale_items (
        organization_id,
        sale_id,
        product_id,
        group_id,
        quantity,
        unit_price,
        unit_cost,
        promo_quantity,
        is_promo
      )
      values (
        payload_organization_id,
        created_sale_id,
        current_product.id,
        current_product.group_id,
        promo_unit_count,
        promo_unit_price,
        current_product.unit_cost,
        promo_unit_count,
        true
      );
    end if;

    -- Bucket sold at the regular price (flagged as promo when the price was marked down).
    if regular_unit_count > 0 then
      insert into public.sale_items (
        organization_id,
        sale_id,
        product_id,
        group_id,
        quantity,
        unit_price,
        unit_cost,
        promo_quantity,
        is_promo
      )
      values (
        payload_organization_id,
        created_sale_id,
        current_product.id,
        current_product.group_id,
        regular_unit_count,
        current_product.sale_price,
        current_product.unit_cost,
        case when regular_is_promo then regular_unit_count else 0 end,
        regular_is_promo
      );
    end if;

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

    v_gross_total := v_gross_total + promo_amount + regular_amount;
    v_cost_total := v_cost_total + (requested_quantity * current_product.unit_cost);
    v_profit_total := v_profit_total + (promo_amount + regular_amount) - (requested_quantity * current_product.unit_cost);
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
