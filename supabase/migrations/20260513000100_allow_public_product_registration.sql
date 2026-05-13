grant insert on public.products to anon, authenticated;

create policy "public insert products"
on public.products
for insert
to anon
with check (
  is_active = true
  and sale_price >= 0
  and unit_cost >= 0
  and stock_quantity >= 0
);
