"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Banknote,
  BarChart3,
  Minus,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  ShoppingBasket,
  Ticket,
  WalletCards,
} from "lucide-react";
import {
  demoProducts,
  demoRecentSales,
  demoReport,
} from "@/lib/demo-data";
import {
  isSupabaseConfigured,
  registerSaleUrl,
  supabase,
  supabaseAnonKey,
} from "@/lib/supabase";
import type {
  Product,
  RecentSale,
  SaleItemDraft,
  SaleReport,
} from "@/types/database";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const paymentLabels: Record<string, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  card: "Cartão",
  token: "Ficha",
};

export default function ArraiaDashboard() {
  const [products, setProducts] = useState<Product[]>(demoProducts);
  const [report, setReport] = useState<SaleReport>(demoReport);
  const [recentSales, setRecentSales] = useState<RecentSale[]>(demoRecentSales);
  const [cart, setCart] = useState<SaleItemDraft[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [cashierName, setCashierName] = useState("Caixa 1");
  const [searchTerm, setSearchTerm] = useState("");
  const [status, setStatus] = useState(
    isSupabaseConfigured
      ? "Conectando ao Supabase..."
      : "Modo demonstrativo: preencha o .env.local para usar dados reais.",
  );
  const [isSaving, setIsSaving] = useState(false);

  async function loadData({ announce = true } = {}) {
    if (!supabase) return;

    if (announce) {
      setStatus("Atualizando dados...");
    }

    const [productsResult, reportResult, salesResult] = await Promise.all([
      supabase
        .from("products")
        .select("*, group:groups(*)")
        .eq("is_active", true)
        .order("name"),
      supabase.from("event_profit_report").select("*").single(),
      supabase
        .from("sales")
        .select("id, created_at, cashier_name, payment_method, gross_total, profit_total")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    if (productsResult.error || reportResult.error || salesResult.error) {
      setStatus("Não foi possível carregar tudo. Confira as variáveis de ambiente e migrations.");
      return;
    }

    setProducts(productsResult.data ?? []);
    setReport(reportResult.data as SaleReport);
    setRecentSales((salesResult.data ?? []) as RecentSale[]);
    setStatus("Dados sincronizados com Supabase.");
  }

  useEffect(() => {
    queueMicrotask(() => {
      void loadData({ announce: false });
    });
  }, []);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return products;

    return products.filter((product) => {
      return [product.name, product.category, product.group?.name]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
    });
  }, [products, searchTerm]);

  const cartTotal = cart.reduce(
    (total, item) => total + item.quantity * item.product.sale_price,
    0,
  );

  const cartProfit = cart.reduce((total, item) => {
    return total + item.quantity * (item.product.sale_price - item.product.unit_cost);
  }, 0);

  function addToCart(product: Product) {
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (existing) {
        return current.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }

      return [...current, { product, quantity: 1 }];
    });
  }

  function changeQuantity(productId: string, delta: number) {
    setCart((current) =>
      current
        .map((item) =>
          item.product.id === productId
            ? { ...item, quantity: item.quantity + delta }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  async function finishSale() {
    if (!cart.length) return;

    if (!isSupabaseConfigured || !registerSaleUrl) {
      const sale: RecentSale = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        cashier_name: cashierName,
        payment_method: paymentMethod,
        gross_total: cartTotal,
        profit_total: cartProfit,
      };

      setRecentSales((current) => [sale, ...current].slice(0, 8));
      setReport((current) => ({
        gross_revenue: current.gross_revenue + cartTotal,
        total_cost: current.total_cost + (cartTotal - cartProfit),
        gross_profit: current.gross_profit + cartProfit,
        total_expenses: current.total_expenses,
        net_profit: current.net_profit + cartProfit,
        sales_count: current.sales_count + 1,
        items_sold: current.items_sold + cart.reduce((sum, item) => sum + item.quantity, 0),
      }));
      setProducts((current) =>
        current.map((product) => {
          const item = cart.find((draft) => draft.product.id === product.id);
          return item
            ? { ...product, stock_quantity: product.stock_quantity - item.quantity }
            : product;
        }),
      );
      setCart([]);
      setStatus("Venda registrada no modo demonstrativo.");
      return;
    }

    setIsSaving(true);
    setStatus("Registrando venda e dando baixa no estoque...");

    const response = await fetch(registerSaleUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({
        cashier_name: cashierName,
        payment_method: paymentMethod,
        items: cart.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
        })),
      }),
    });

    setIsSaving(false);

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setStatus(payload?.error ?? "Falha ao registrar venda.");
      return;
    }

    setCart([]);
    await loadData();
    setStatus("Venda registrada com baixa de estoque.");
  }

  return (
    <main className="min-h-screen bg-[#f7f2e8] text-stone-950">
      <div className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-emerald-700">
                UFG - Festa de Arraia
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-normal text-stone-950">
                Caixa, fichas e lucro por grupo
              </h1>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={cashierName}
                onChange={(event) => setCashierName(event.target.value)}
                className="h-11 rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-emerald-700"
                aria-label="Nome do caixa"
              />
              <button
                type="button"
                onClick={() => void loadData()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-stone-950 px-4 text-sm font-semibold text-white transition hover:bg-stone-800"
              >
                <RefreshCw size={16} />
                Atualizar
              </button>
            </div>
          </div>
          <p className="text-sm text-stone-600">{status}</p>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[1fr_390px] lg:px-8">
        <section className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={<Banknote size={18} />} label="Receita" value={currency.format(report.gross_revenue)} />
            <Metric icon={<BarChart3 size={18} />} label="Lucro bruto" value={currency.format(report.gross_profit)} />
            <Metric icon={<WalletCards size={18} />} label="Lucro líquido" value={currency.format(report.net_profit)} />
            <Metric icon={<Ticket size={18} />} label="Itens vendidos" value={String(report.items_sold)} />
          </div>

          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-bold">Produtos e fichas</h2>
              <label className="flex h-11 items-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-600 sm:w-80">
                <Search size={16} />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar item, grupo ou categoria"
                  className="w-full bg-transparent outline-none"
                />
              </label>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addToCart(product)}
                  className="min-h-32 rounded-lg border border-stone-200 bg-stone-50 p-4 text-left transition hover:border-emerald-700 hover:bg-emerald-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-stone-950">{product.name}</p>
                      <p className="mt-1 text-sm text-stone-600">
                        {product.category} - {product.group?.acronym ?? product.group?.name ?? "Sem grupo"}
                      </p>
                    </div>
                    <span className="rounded-md bg-white px-2 py-1 text-sm font-bold text-emerald-800">
                      {currency.format(product.sale_price)}
                    </span>
                  </div>
                  <div className="mt-5 flex items-center justify-between text-sm">
                    <span className="text-stone-600">Estoque: {product.stock_quantity}</span>
                    <span className="font-medium text-stone-800">
                      Lucro un.: {currency.format(product.sale_price - product.unit_cost)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <h2 className="text-lg font-bold">Últimas vendas</h2>
            <div className="mt-3 divide-y divide-stone-100">
              {recentSales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-stone-900">
                      {paymentLabels[sale.payment_method] ?? sale.payment_method}
                    </p>
                    <p className="text-sm text-stone-600">
                      {new Date(sale.created_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      - {sale.cashier_name ?? "Sem caixa"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{currency.format(sale.gross_total)}</p>
                    <p className="text-sm text-emerald-700">
                      +{currency.format(sale.profit_total)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="h-fit rounded-lg border border-stone-200 bg-white p-4 lg:sticky lg:top-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Venda atual</h2>
            <ReceiptText size={20} />
          </div>

          <div className="mt-4 space-y-3">
            {cart.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 text-center text-sm text-stone-500">
                <ShoppingBasket className="mb-2" size={24} />
                Selecione produtos para montar a venda.
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.product.id}
                  className="rounded-lg border border-stone-200 bg-stone-50 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{item.product.name}</p>
                      <p className="text-sm text-stone-600">
                        {currency.format(item.product.sale_price)} cada
                      </p>
                    </div>
                    <p className="font-bold">
                      {currency.format(item.product.sale_price * item.quantity)}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Diminuir quantidade"
                      onClick={() => changeQuantity(item.product.id, -1)}
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-stone-300 bg-white"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="flex h-9 min-w-12 items-center justify-center rounded-md bg-white px-3 text-sm font-bold">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label="Aumentar quantidade"
                      onClick={() => changeQuantity(item.product.id, 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-stone-300 bg-white"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-5 grid grid-cols-4 gap-2">
            {Object.entries(paymentLabels).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPaymentMethod(value)}
                className={`h-10 rounded-md border text-sm font-semibold transition ${
                  paymentMethod === value
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <dl className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-stone-600">Total</dt>
              <dd className="font-bold">{currency.format(cartTotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-600">Lucro previsto</dt>
              <dd className="font-bold text-emerald-700">{currency.format(cartProfit)}</dd>
            </div>
          </dl>

          <button
            type="button"
            disabled={!cart.length || isSaving}
            onClick={finishSale}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            <ReceiptText size={18} />
            {isSaving ? "Registrando..." : "Finalizar venda"}
          </button>
        </aside>
      </div>
    </main>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-stone-600">
        {icon}
        {label}
      </div>
      <p className="mt-3 text-2xl font-bold tracking-normal text-stone-950">{value}</p>
    </div>
  );
}
