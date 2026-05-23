update public.organizations
set
  name = 'Evento Demonstração',
  slug = 'evento-demo'
where slug = 'arraia-parafuso-solto'
  and not exists (
    select 1 from public.organizations o2 where o2.slug = 'evento-demo'
  );

update public.organization_access_codes
set
  code = 'VENDAS26',
  label = 'Código inicial'
where code = 'ARRAIA2026'
  and not exists (
    select 1 from public.organization_access_codes c2 where c2.code = 'VENDAS26'
  );

insert into public.organizations (name, slug)
values ('Evento Demonstração', 'evento-demo')
on conflict (slug) do nothing;

insert into public.organization_access_codes (organization_id, code, label, is_active)
select id, 'VENDAS26', 'Código inicial', true
from public.organizations
where slug = 'evento-demo'
on conflict (code) do update set is_active = true;
