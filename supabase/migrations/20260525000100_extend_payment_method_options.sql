alter table public.sales
  drop constraint if exists sales_payment_method_check;

alter table public.sales
  add constraint sales_payment_method_check
  check (payment_method in ('pix', 'cash', 'credit', 'debit', 'card', 'token'));
