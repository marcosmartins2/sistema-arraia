alter table public.organizations
  add column if not exists event_date date,
  add column if not exists responsible_group text,
  add column if not exists cashier_names text[] not null default '{}',
  add column if not exists is_active boolean not null default true;
