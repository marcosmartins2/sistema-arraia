alter table public.products
  add column if not exists original_sale_price numeric(10, 2);
