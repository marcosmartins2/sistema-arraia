insert into public.groups (name, acronym, color)
values
  ('Atlética UFG', 'AA', '#c2410c'),
  ('Centro Acadêmico', 'CA', '#047857'),
  ('Empresa Júnior', 'EJ', '#1d4ed8')
on conflict do nothing;

insert into public.products (group_id, name, category, sale_price, unit_cost, stock_quantity)
select g.id, p.name, p.category, p.sale_price, p.unit_cost, p.stock_quantity
from (
  values
    ('AA', 'Caldo', 'Comida', 12.00, 5.50, 84),
    ('AA', 'Ficha R$ 10', 'Ficha', 10.00, 0.00, 300),
    ('CA', 'Correio elegante', 'Brincadeira', 4.00, 0.80, 160),
    ('EJ', 'Refrigerante', 'Bebida', 6.00, 3.20, 120)
) as p(acronym, name, category, sale_price, unit_cost, stock_quantity)
join public.groups g on g.acronym = p.acronym;

insert into public.inventory_movements (product_id, movement_type, quantity_delta, reason)
select id, 'initial', stock_quantity, 'Carga inicial do evento'
from public.products;
