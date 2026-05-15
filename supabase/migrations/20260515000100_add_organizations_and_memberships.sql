create type public.app_role as enum ('admin', 'member');
create type public.organization_role as enum ('owner', 'manager', 'member');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  role public.app_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.organization_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.organization_access_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null unique,
  label text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger organization_access_codes_set_updated_at
before update on public.organization_access_codes
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.organization_members
      where organization_id = target_organization_id
        and user_id = auth.uid()
    );
$$;

create or replace function public.can_manage_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.organization_members
      where organization_id = target_organization_id
        and user_id = auth.uid()
        and role in ('owner', 'manager')
    );
$$;

create or replace function public.is_organization_member_for_user(
  target_organization_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = target_user_id
      and role = 'admin'
  )
  or exists (
    select 1
    from public.organization_members
    where organization_id = target_organization_id
      and user_id = target_user_id
  );
$$;

create or replace function public.is_valid_organization_access_code(
  target_organization_id uuid,
  target_code text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_access_codes
    where organization_id = target_organization_id
      and code = upper(trim(target_code))
      and is_active = true
  );
$$;

insert into public.organizations (name, slug)
values ('Arraia Parafuso Solto', 'arraia-parafuso-solto')
on conflict (slug) do nothing;

insert into public.organization_access_codes (organization_id, code, label)
select id, 'ARRAIA2026', 'Codigo inicial'
from public.organizations
where slug = 'arraia-parafuso-solto'
on conflict (code) do nothing;

alter table public.groups
  add column organization_id uuid references public.organizations(id) on delete cascade;

alter table public.products
  add column organization_id uuid references public.organizations(id) on delete cascade;

alter table public.sales
  add column organization_id uuid references public.organizations(id) on delete cascade;

alter table public.sale_items
  add column organization_id uuid references public.organizations(id) on delete cascade;

alter table public.expenses
  add column organization_id uuid references public.organizations(id) on delete cascade;

alter table public.inventory_movements
  add column organization_id uuid references public.organizations(id) on delete cascade;

update public.groups
set organization_id = (select id from public.organizations where slug = 'arraia-parafuso-solto')
where organization_id is null;

update public.products p
set organization_id = g.organization_id
from public.groups g
where p.group_id = g.id
  and p.organization_id is null;

update public.sales
set organization_id = (select id from public.organizations where slug = 'arraia-parafuso-solto')
where organization_id is null;

update public.sale_items si
set organization_id = p.organization_id
from public.products p
where si.product_id = p.id
  and si.organization_id is null;

update public.expenses e
set organization_id = coalesce(
  g.organization_id,
  (select id from public.organizations where slug = 'arraia-parafuso-solto')
)
from public.groups g
where e.group_id = g.id
  and e.organization_id is null;

update public.expenses
set organization_id = (select id from public.organizations where slug = 'arraia-parafuso-solto')
where organization_id is null;

update public.inventory_movements im
set organization_id = p.organization_id
from public.products p
where im.product_id = p.id
  and im.organization_id is null;

alter table public.groups alter column organization_id set not null;
alter table public.products alter column organization_id set not null;
alter table public.sales alter column organization_id set not null;
alter table public.sale_items alter column organization_id set not null;
alter table public.expenses alter column organization_id set not null;
alter table public.inventory_movements alter column organization_id set not null;

create unique index groups_id_organization_id_idx on public.groups(id, organization_id);
create index organizations_slug_idx on public.organizations(slug);
create index organization_members_user_id_idx on public.organization_members(user_id);
create index organization_access_codes_organization_id_idx on public.organization_access_codes(organization_id);
create index groups_organization_id_idx on public.groups(organization_id);
create index products_organization_id_idx on public.products(organization_id);
create index sales_organization_id_idx on public.sales(organization_id);
create index sale_items_organization_id_idx on public.sale_items(organization_id);
create index expenses_organization_id_idx on public.expenses(organization_id);
create index inventory_movements_organization_id_idx on public.inventory_movements(organization_id);

alter table public.products
  add constraint products_group_organization_fk
  foreign key (group_id, organization_id)
  references public.groups(id, organization_id);

create or replace view public.event_profit_report as
select
  o.id as organization_id,
  coalesce(sales.gross_revenue, 0)::numeric(10, 2) as gross_revenue,
  coalesce(sales.total_cost, 0)::numeric(10, 2) as total_cost,
  coalesce(sales.gross_profit, 0)::numeric(10, 2) as gross_profit,
  coalesce(expenses.total_expenses, 0)::numeric(10, 2) as total_expenses,
  (coalesce(sales.gross_profit, 0) - coalesce(expenses.total_expenses, 0))::numeric(10, 2) as net_profit,
  coalesce(sales.sales_count, 0)::integer as sales_count,
  coalesce(items.items_sold, 0)::integer as items_sold
from public.organizations o
left join (
  select
    organization_id,
    sum(gross_total) as gross_revenue,
    sum(cost_total) as total_cost,
    sum(profit_total) as gross_profit,
    count(*) as sales_count
  from public.sales
  group by organization_id
) sales on sales.organization_id = o.id
left join (
  select organization_id, sum(amount) as total_expenses
  from public.expenses
  group by organization_id
) expenses on expenses.organization_id = o.id
left join (
  select organization_id, sum(quantity) as items_sold
  from public.sale_items
  group by organization_id
) items on items.organization_id = o.id;

alter view public.event_profit_report set (security_invoker = true);

create or replace view public.group_profit_report as
select
  g.organization_id,
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
left join public.sale_items si on si.group_id = g.id and si.organization_id = g.organization_id
left join (
  select organization_id, group_id, sum(amount) as total_expenses
  from public.expenses
  group by organization_id, group_id
) expenses on expenses.group_id = g.id and expenses.organization_id = g.organization_id
group by g.organization_id, g.id, expenses.total_expenses;

alter view public.group_profit_report set (security_invoker = true);

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
      current_product.sale_price,
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

drop policy if exists "public read groups" on public.groups;
drop policy if exists "public read products" on public.products;
drop policy if exists "public read sales" on public.sales;
drop policy if exists "public read sale items" on public.sale_items;
drop policy if exists "public read inventory" on public.inventory_movements;
drop policy if exists "public read expenses" on public.expenses;
drop policy if exists "authenticated manage groups" on public.groups;
drop policy if exists "authenticated manage products" on public.products;
drop policy if exists "authenticated manage expenses" on public.expenses;
drop policy if exists "public insert products" on public.products;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_access_codes enable row level security;

revoke all on public.profiles, public.organizations, public.organization_members, public.organization_access_codes from anon;
revoke insert, update, delete on public.groups, public.products, public.sales, public.sale_items, public.inventory_movements, public.expenses from anon;

grant usage on type public.app_role to authenticated;
grant usage on type public.organization_role to authenticated;
grant select on public.profiles, public.organizations, public.organization_members to authenticated;
grant insert, update, delete on public.organizations, public.organization_members to authenticated;
grant select, insert, update, delete on public.organization_access_codes to authenticated;
grant select on public.groups, public.products, public.sales, public.sale_items, public.inventory_movements, public.expenses to authenticated;
grant insert, update, delete on public.groups, public.products, public.expenses to authenticated;

create policy "users read own profile or admins read all"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

create policy "admins manage profiles"
on public.profiles for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "members read organizations"
on public.organizations for select
to authenticated
using (public.is_organization_member(id));

create policy "admins create organizations"
on public.organizations for insert
to authenticated
with check (public.is_admin());

create policy "admins update organizations"
on public.organizations for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admins delete organizations"
on public.organizations for delete
to authenticated
using (public.is_admin());

create policy "members read organization memberships"
on public.organization_members for select
to authenticated
using (public.is_organization_member(organization_id));

create policy "admins manage organization memberships"
on public.organization_members for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admins read organization access codes"
on public.organization_access_codes for select
to authenticated
using (public.is_admin());

create policy "admins manage organization access codes"
on public.organization_access_codes for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "members read groups"
on public.groups for select
to authenticated
using (public.is_organization_member(organization_id));

create policy "managers manage groups"
on public.groups for all
to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

create policy "members read products"
on public.products for select
to authenticated
using (public.is_organization_member(organization_id));

create policy "managers manage products"
on public.products for all
to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

create policy "members read sales"
on public.sales for select
to authenticated
using (public.is_organization_member(organization_id));

create policy "members read sale items"
on public.sale_items for select
to authenticated
using (public.is_organization_member(organization_id));

create policy "members read inventory"
on public.inventory_movements for select
to authenticated
using (public.is_organization_member(organization_id));

create policy "members read expenses"
on public.expenses for select
to authenticated
using (public.is_organization_member(organization_id));

create policy "managers manage expenses"
on public.expenses for all
to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));
