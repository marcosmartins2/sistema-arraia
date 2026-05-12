create extension if not exists pgcrypto;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  acronym text,
  color text not null default '#047857',
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete restrict,
  name text not null,
  category text not null,
  sale_price numeric(10, 2) not null check (sale_price >= 0),
  unit_cost numeric(10, 2) not null default 0 check (unit_cost >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete set null,
  cashier_name text,
  payment_method text not null check (payment_method in ('pix', 'cash', 'card', 'token')),
  gross_total numeric(10, 2) not null default 0,
  cost_total numeric(10, 2) not null default 0,
  profit_total numeric(10, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  group_id uuid not null references public.groups(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  unit_cost numeric(10, 2) not null check (unit_cost >= 0),
  line_total numeric(10, 2) generated always as (quantity * unit_price) stored,
  line_profit numeric(10, 2) generated always as (quantity * (unit_price - unit_cost)) stored,
  created_at timestamptz not null default now()
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete set null,
  movement_type text not null check (movement_type in ('initial', 'sale', 'adjustment', 'loss')),
  quantity_delta integer not null,
  reason text,
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete set null,
  description text not null,
  amount numeric(10, 2) not null check (amount >= 0),
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index products_group_id_idx on public.products(group_id);
create index products_active_idx on public.products(is_active);
create index sale_items_sale_id_idx on public.sale_items(sale_id);
create index sale_items_product_id_idx on public.sale_items(product_id);
create index sales_created_at_idx on public.sales(created_at desc);
create index inventory_product_id_idx on public.inventory_movements(product_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create or replace view public.event_profit_report as
select
  coalesce((select sum(gross_total) from public.sales), 0)::numeric(10, 2) as gross_revenue,
  coalesce((select sum(cost_total) from public.sales), 0)::numeric(10, 2) as total_cost,
  coalesce((select sum(profit_total) from public.sales), 0)::numeric(10, 2) as gross_profit,
  coalesce((select sum(amount) from public.expenses), 0)::numeric(10, 2) as total_expenses,
  (
    coalesce((select sum(profit_total) from public.sales), 0) -
    coalesce((select sum(amount) from public.expenses), 0)
  )::numeric(10, 2) as net_profit,
  coalesce((select count(*) from public.sales), 0)::integer as sales_count,
  coalesce((select sum(quantity) from public.sale_items), 0)::integer as items_sold;

create or replace view public.group_profit_report as
select
  g.id as group_id,
  g.name as group_name,
  g.acronym,
  g.color,
  coalesce(sum(si.line_total), 0)::numeric(10, 2) as gross_revenue,
  coalesce(sum(si.quantity * si.unit_cost), 0)::numeric(10, 2) as total_cost,
  coalesce(sum(si.line_profit), 0)::numeric(10, 2) as gross_profit,
  coalesce(expenses.total_expenses, 0)::numeric(10, 2) as total_expenses,
  (coalesce(sum(si.line_profit), 0) - coalesce(expenses.total_expenses, 0))::numeric(10, 2) as net_profit,
  coalesce(sum(si.quantity), 0)::integer as items_sold
from public.groups g
left join public.sale_items si on si.group_id = g.id
left join (
  select group_id, sum(amount) as total_expenses
  from public.expenses
  group by group_id
) expenses on expenses.group_id = g.id
group by g.id, expenses.total_expenses;

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
  v_gross_total numeric(10, 2) := 0;
  v_cost_total numeric(10, 2) := 0;
  v_profit_total numeric(10, 2) := 0;
begin
  if payload->'items' is null or jsonb_array_length(payload->'items') = 0 then
    raise exception 'A venda precisa ter pelo menos um item.';
  end if;

  insert into public.sales (
    group_id,
    cashier_name,
    payment_method,
    notes
  )
  values (
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
      raise exception 'Quantidade inválida para o produto %.', item->>'product_id';
    end if;

    select *
      into current_product
      from public.products
      where id = (item->>'product_id')::uuid
      for update;

    if not found or not current_product.is_active then
      raise exception 'Produto indisponível: %.', item->>'product_id';
    end if;

    if current_product.stock_quantity < requested_quantity then
      raise exception 'Estoque insuficiente para %.', current_product.name;
    end if;

    insert into public.sale_items (
      sale_id,
      product_id,
      group_id,
      quantity,
      unit_price,
      unit_cost
    )
    values (
      created_sale_id,
      current_product.id,
      current_product.group_id,
      requested_quantity,
      current_product.sale_price,
      current_product.unit_cost
    );

    update public.products
      set stock_quantity = stock_quantity - requested_quantity
      where id = current_product.id;

    insert into public.inventory_movements (
      product_id,
      sale_id,
      movement_type,
      quantity_delta,
      reason
    )
    values (
      current_product.id,
      created_sale_id,
      'sale',
      requested_quantity * -1,
      'Venda registrada no caixa'
    );

    v_gross_total := v_gross_total + (requested_quantity * current_product.sale_price);
    v_cost_total := v_cost_total + (requested_quantity * current_product.unit_cost);
    v_profit_total := v_profit_total + (requested_quantity * (current_product.sale_price - current_product.unit_cost));
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

grant usage on schema public to anon, authenticated;
grant select on public.groups, public.products, public.sales, public.sale_items, public.inventory_movements, public.expenses to anon, authenticated;
grant select on public.event_profit_report, public.group_profit_report to anon, authenticated;
grant execute on function public.register_sale(jsonb) to anon, authenticated, service_role;

alter table public.groups enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.expenses enable row level security;

create policy "public read groups" on public.groups for select using (true);
create policy "public read products" on public.products for select using (true);
create policy "public read sales" on public.sales for select using (true);
create policy "public read sale items" on public.sale_items for select using (true);
create policy "public read inventory" on public.inventory_movements for select using (true);
create policy "public read expenses" on public.expenses for select using (true);

create policy "authenticated manage groups" on public.groups for all to authenticated using (true) with check (true);
create policy "authenticated manage products" on public.products for all to authenticated using (true) with check (true);
create policy "authenticated manage expenses" on public.expenses for all to authenticated using (true) with check (true);
