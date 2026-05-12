# Sistema Arraia UFG

Sistema serverless para controlar fichas, vendas, baixa de estoque e lucro da festa de arraia dos grupos estudantis da UFG.

## Stack

- Frontend: Next.js App Router
- Banco: Supabase Postgres
- Backend serverless: Supabase Edge Functions
- Persistência: migrations em `supabase/migrations`

## Ambiente

Crie o `.env.local` a partir de `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_REGISTER_SALE_FUNCTION_URL=
```

Para a Edge Function, configure os secrets no Supabase:

```bash
supabase secrets set SUPABASE_URL=https://your-project-ref.supabase.co
supabase secrets set SUPABASE_ANON_KEY=your-anon-key
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Banco de dados

As migrations criam:

- `groups`: grupos estudantis
- `products`: produtos e fichas com preço, custo e estoque
- `sales`: vendas registradas no caixa
- `sale_items`: itens de cada venda
- `inventory_movements`: baixa e ajustes de estoque
- `expenses`: despesas do evento
- `event_profit_report` e `group_profit_report`: relatórios de lucro
- `register_sale(payload jsonb)`: RPC transacional para registrar venda e baixar estoque

Rodando localmente com Supabase CLI:

```bash
supabase start
supabase db reset
supabase functions serve register-sale --env-file supabase/.env
```

Deploy da função:

```bash
supabase functions deploy register-sale
```

## Desenvolvimento

```bash
npm install
npm run dev
```

Enquanto o `.env.local` estiver vazio, a interface abre em modo demonstrativo para validar o fluxo do caixa sem depender do Supabase.
