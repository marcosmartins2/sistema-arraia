"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Banknote,
  BarChart3,
  Bolt,
  CircleDollarSign,
  Minus,
  Package,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  ShoppingBasket,
  Ticket,
  UserRound,
  WalletCards,
} from "lucide-react";
import {
  demoGroups,
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
  Group,
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

const initialProductForm = {
  name: "",
  category: "",
  groupId: "",
  salePrice: "",
  unitCost: "",
  stockQuantity: "",
};

type DashboardView = "cashier" | "products" | "report" | "sales";

const dashboardViews: Array<{
  id: DashboardView;
  label: string;
  icon: ReactNode;
}> = [
  { id: "cashier", label: "Caixa", icon: <ShoppingBasket size={15} /> },
  { id: "products", label: "Produtos", icon: <Package size={15} /> },
  { id: "report", label: "Relatório", icon: <BarChart3 size={15} /> },
  { id: "sales", label: "Vendas", icon: <ReceiptText size={15} /> },
];

function parseNumber(value: string) {
  return Number(value.replace(",", "."));
}

export default function ArraiaDashboard() {
  const [groups, setGroups] = useState<Group[]>(demoGroups);
  const [products, setProducts] = useState<Product[]>(demoProducts);
  const [report, setReport] = useState<SaleReport>(demoReport);
  const [recentSales, setRecentSales] = useState<RecentSale[]>(demoRecentSales);
  const [cart, setCart] = useState<SaleItemDraft[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [cashierName, setCashierName] = useState("Caixa 1");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeView, setActiveView] = useState<DashboardView>("cashier");
  const [productForm, setProductForm] = useState(initialProductForm);
  const [status, setStatus] = useState(
    isSupabaseConfigured
      ? "Conectando ao Supabase..."
      : "Modo demonstrativo: preencha o .env.local para usar dados reais.",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);

  async function loadData({ announce = true } = {}) {
    if (!supabase) return;

    if (announce) {
      setStatus("Atualizando dados...");
    }

    const [groupsResult, productsResult, reportResult, salesResult] = await Promise.all([
      supabase.from("groups").select("*").order("name"),
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
        .limit(12),
    ]);

    if (groupsResult.error || productsResult.error || reportResult.error || salesResult.error) {
      setStatus("Não foi possível carregar tudo. Confira as variáveis de ambiente e migrations.");
      return;
    }

    setGroups(groupsResult.data ?? []);
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

    return products.filter((product) =>
      [product.name, product.category, product.group?.name, product.group?.acronym]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term)),
    );
  }, [products, searchTerm]);

  const cartTotal = cart.reduce(
    (total, item) => total + item.quantity * item.product.sale_price,
    0,
  );

  const cartProfit = cart.reduce((total, item) => {
    return total + item.quantity * (item.product.sale_price - item.product.unit_cost);
  }, 0);

  const activeLabel = dashboardViews.find((view) => view.id === activeView)?.label ?? "Caixa";

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

  function updateProductForm(field: keyof typeof initialProductForm, value: string) {
    setProductForm((current) => ({ ...current, [field]: value }));
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = productForm.name.trim();
    const category = productForm.category.trim();
    const groupId = productForm.groupId || groups[0]?.id;
    const salePrice = parseNumber(productForm.salePrice);
    const unitCost = parseNumber(productForm.unitCost);
    const stockQuantity = parseNumber(productForm.stockQuantity);
    const group = groups.find((item) => item.id === groupId);

    if (
      !name ||
      !category ||
      !groupId ||
      !Number.isFinite(salePrice) ||
      !Number.isFinite(unitCost) ||
      !Number.isFinite(stockQuantity)
    ) {
      setStatus("Preencha nome, categoria, grupo, valor de venda, custo para fazer e estoque.");
      return;
    }

    if (salePrice < 0 || unitCost < 0 || stockQuantity < 0) {
      setStatus("Valores de venda, custo e estoque não podem ser negativos.");
      return;
    }

    const productPayload = {
      group_id: groupId,
      name,
      category,
      sale_price: salePrice,
      unit_cost: unitCost,
      stock_quantity: Math.floor(stockQuantity),
      is_active: true,
    };

    if (!isSupabaseConfigured || !supabase) {
      const product: Product = {
        id: crypto.randomUUID(),
        ...productPayload,
        group,
      };

      setProducts((current) => [...current, product].sort((a, b) => a.name.localeCompare(b.name)));
      setProductForm(initialProductForm);
      setStatus("Produto cadastrado no modo demonstrativo.");
      return;
    }

    setIsCreatingProduct(true);
    setStatus("Cadastrando produto...");

    const result = await supabase
      .from("products")
      .insert(productPayload)
      .select("*, group:groups(*)")
      .single();

    setIsCreatingProduct(false);

    if (result.error) {
      setStatus(`Não foi possível cadastrar o produto: ${result.error.message}`);
      return;
    }

    setProducts((current) =>
      [...current, result.data as Product].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setProductForm(initialProductForm);
    setStatus("Produto cadastrado com valor de venda e custo para fazer.");
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

      setRecentSales((current) => [sale, ...current].slice(0, 12));
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
    <main className="min-h-screen bg-[#ececec] text-[#202124] md:flex">
      <aside className="hidden w-[74px] shrink-0 bg-[#064a52] text-white md:flex md:flex-col md:items-center">
        <div className="flex h-[72px] w-full items-center justify-center border-b border-white/10 bg-[#043f47]">
          <BrandMark compact />
        </div>
        <nav className="flex w-full flex-1 flex-col items-center gap-2 py-5" aria-label="Menu lateral">
          {dashboardViews.map((view) => (
            <button
              key={view.id}
              type="button"
              title={view.label}
              onClick={() => setActiveView(view.id)}
              className={`flex h-11 w-11 items-center justify-center border-l-4 transition ${
                activeView === view.id
                  ? "border-[#e73d50] bg-white/14 text-white"
                  : "border-transparent text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              {view.icon}
            </button>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="border-b border-black/10 bg-[#e3e3e3]">
          <div className="flex min-h-[72px] flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
            <div className="flex items-center gap-3">
              <div className="md:hidden">
                <BrandMark compact />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <BrandMark />
                  <div className="hidden h-5 w-px bg-black/15 sm:block" />
                  <p className="hidden text-xs font-semibold uppercase text-[#7b2fc7] sm:block">
                    Arraiá Parafuso Solto - EMC UFG
                  </p>
                </div>
                <p className="mt-1 text-xs text-zinc-600">{status}</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <SearchBox value={searchTerm} onChange={setSearchTerm} placeholder="Buscar" compact />
              <input
                value={cashierName}
                onChange={(event) => setCashierName(event.target.value)}
                className="h-9 border border-black/10 bg-white px-3 text-sm outline-none transition focus:border-[#009a92]"
                aria-label="Nome do caixa"
              />
              <button
                type="button"
                onClick={() => void loadData()}
                className="inline-flex h-9 items-center justify-center gap-2 bg-[#009a92] px-3 text-sm font-semibold text-white transition hover:bg-[#007d7a]"
              >
                <RefreshCw size={15} />
                Atualizar
              </button>
              <div className="hidden h-9 w-9 items-center justify-center rounded-full bg-zinc-300 text-zinc-600 lg:flex">
                <UserRound size={18} />
              </div>
            </div>
          </div>

          <div className="bg-[#007983] px-4 py-3 text-white lg:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-white/70">Módulo ativo</p>
                <h1 className="text-xl font-bold">{activeLabel}</h1>
              </div>
              <div className="h-8 w-28 bg-[#7dbb72]" aria-hidden="true" />
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto bg-white px-4 pt-3 lg:px-6" aria-label="Áreas do sistema">
            {dashboardViews.map((view) => (
              <button
                key={view.id}
                type="button"
                onClick={() => setActiveView(view.id)}
                className={`inline-flex h-10 shrink-0 items-center gap-2 border-t-4 px-4 text-xs font-bold uppercase transition ${
                  activeView === view.id
                    ? "border-[#e73d50] bg-[#009a92] text-white"
                    : "border-transparent bg-[#315b72] text-white hover:bg-[#23485b]"
                }`}
              >
                {view.icon}
                {view.label}
              </button>
            ))}
          </nav>
        </header>

        <div className="px-4 py-5 lg:px-6">
          {activeView === "cashier" && (
            <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
              <section className="space-y-4">
                <SectionHeader title="Venda rápida" />
                <ProductGrid products={filteredProducts} onProductClick={addToCart} mode="sale" />
              </section>
              <CartPanel
                cart={cart}
                cartProfit={cartProfit}
                cartTotal={cartTotal}
                isSaving={isSaving}
                paymentMethod={paymentMethod}
                onChangePayment={setPaymentMethod}
                onChangeQuantity={changeQuantity}
                onFinishSale={finishSale}
              />
            </div>
          )}

          {activeView === "products" && (
            <section className="space-y-4">
              <SectionHeader title="Gerenciar produtos" />
              <ProductForm
                groups={groups}
                isCreatingProduct={isCreatingProduct}
                productForm={productForm}
                onSubmit={createProduct}
                onUpdate={updateProductForm}
              />
              <ProductGrid products={filteredProducts} mode="manage" />
            </section>
          )}

          {activeView === "report" && (
            <section className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric icon={<Banknote size={18} />} label="Receita" value={currency.format(report.gross_revenue)} />
                <Metric icon={<WalletCards size={18} />} label="Custo dos produtos" value={currency.format(report.total_cost)} />
                <Metric icon={<BarChart3 size={18} />} label="Lucro líquido" value={currency.format(report.gross_profit)} />
                <Metric icon={<Ticket size={18} />} label="Itens vendidos" value={String(report.items_sold)} />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Metric icon={<ReceiptText size={18} />} label="Vendas registradas" value={String(report.sales_count)} />
                <Metric
                  icon={<CircleDollarSign size={18} />}
                  label="Ticket médio"
                  value={currency.format(report.sales_count ? report.gross_revenue / report.sales_count : 0)}
                />
                <Metric
                  icon={<BarChart3 size={18} />}
                  label="Lucro médio por item"
                  value={currency.format(report.items_sold ? report.gross_profit / report.items_sold : 0)}
                />
              </div>
            </section>
          )}

          {activeView === "sales" && (
            <section className="space-y-4">
              <SectionHeader
                title="Gerenciar vendas"
                action={
                  <button
                    type="button"
                    onClick={() => void loadData()}
                    className="inline-flex h-9 items-center justify-center gap-2 border border-black/10 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
                  >
                    <RefreshCw size={15} />
                    Atualizar
                  </button>
                }
              />
              <SalesList sales={recentSales} />
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex h-10 w-10 items-center justify-center bg-white text-[#e73d50]">
        <Bolt size={24} fill="currentColor" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center bg-[#e73d50] text-white">
        <Bolt size={21} fill="currentColor" />
      </div>
      <div className="leading-tight">
        <p className="text-lg font-black text-[#064a52]">Parafuso</p>
        <p className="-mt-1 text-xs font-bold uppercase text-[#e73d50]">Solto</p>
      </div>
    </div>
  );
}

function SectionHeader({
  action,
  title,
}: {
  action?: ReactNode;
  title: string;
}) {
  return (
    <div className="flex min-h-12 flex-col gap-3 border-b-2 border-[#009a92] bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-base font-bold text-[#28323a]">{title}</h2>
      {action}
    </div>
  );
}

function SearchBox({
  compact = false,
  onChange,
  placeholder,
  value,
}: {
  compact?: boolean;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className={`flex items-center border border-black/10 bg-white text-sm text-zinc-600 transition focus-within:border-[#009a92] ${compact ? "h-9 sm:w-48" : "h-10 sm:w-80"}`}>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-full w-full bg-transparent px-3 outline-none"
      />
      <span className="flex h-full w-11 items-center justify-center bg-[#009a92] text-white">
        <Search size={15} />
      </span>
    </label>
  );
}

function ProductForm({
  groups,
  isCreatingProduct,
  onSubmit,
  onUpdate,
  productForm,
}: {
  groups: Group[];
  isCreatingProduct: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdate: (field: keyof typeof initialProductForm, value: string) => void;
  productForm: typeof initialProductForm;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-3 bg-white p-4 shadow-md md:grid-cols-2 xl:grid-cols-6">
      <input value={productForm.name} onChange={(event) => onUpdate("name", event.target.value)} placeholder="Produto" className="h-10 border border-black/10 bg-white px-3 text-sm outline-none transition focus:border-[#009a92] xl:col-span-2" />
      <input value={productForm.category} onChange={(event) => onUpdate("category", event.target.value)} placeholder="Categoria" className="h-10 border border-black/10 bg-white px-3 text-sm outline-none transition focus:border-[#009a92]" />
      <select value={productForm.groupId} onChange={(event) => onUpdate("groupId", event.target.value)} className="h-10 border border-black/10 bg-white px-3 text-sm outline-none transition focus:border-[#009a92]">
        <option value="">Grupo</option>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.acronym ? `${group.acronym} - ${group.name}` : group.name}
          </option>
        ))}
      </select>
      <input value={productForm.salePrice} onChange={(event) => onUpdate("salePrice", event.target.value)} placeholder="Valor de venda" inputMode="decimal" className="h-10 border border-black/10 bg-white px-3 text-sm outline-none transition focus:border-[#009a92]" />
      <input value={productForm.unitCost} onChange={(event) => onUpdate("unitCost", event.target.value)} placeholder="Custo para fazer" inputMode="decimal" className="h-10 border border-black/10 bg-white px-3 text-sm outline-none transition focus:border-[#009a92]" />
      <input value={productForm.stockQuantity} onChange={(event) => onUpdate("stockQuantity", event.target.value)} placeholder="Estoque" inputMode="numeric" className="h-10 border border-black/10 bg-white px-3 text-sm outline-none transition focus:border-[#009a92]" />
      <button type="submit" disabled={isCreatingProduct} className="inline-flex h-10 items-center justify-center gap-2 bg-[#009a92] px-4 text-sm font-bold text-white transition hover:bg-[#007d7a] disabled:cursor-not-allowed disabled:bg-zinc-300 xl:col-span-2">
        <Plus size={15} />
        {isCreatingProduct ? "Cadastrando..." : "Cadastrar produto"}
      </button>
    </form>
  );
}

function ProductGrid({
  mode,
  onProductClick,
  products,
}: {
  mode: "sale" | "manage";
  onProductClick?: (product: Product) => void;
  products: Product[];
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {products.map((product, index) => {
        const content = (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-[#27333a]">{product.name}</p>
                <p className="mt-1 text-sm text-zinc-600">
                  {product.category} - {product.group?.acronym ?? product.group?.name ?? "Sem grupo"}
                </p>
              </div>
              <span className="bg-[#efe7ff] px-2 py-1 text-sm font-black text-[#7b2fc7]">
                {currency.format(product.sale_price)}
              </span>
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-zinc-500">Custo</dt>
                <dd className="font-semibold">{currency.format(product.unit_cost)}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Lucro</dt>
                <dd className="font-semibold text-[#009a92]">
                  {currency.format(product.sale_price - product.unit_cost)}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Estoque</dt>
                <dd className="font-semibold">{product.stock_quantity}</dd>
              </div>
            </dl>
          </>
        );

        const stripe = index % 2 === 0 ? "bg-white" : "bg-[#f6f6f6]";

        if (mode === "sale") {
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => onProductClick?.(product)}
              className={`min-h-32 border border-black/5 p-4 text-left shadow-sm transition hover:border-[#009a92] hover:shadow-md ${stripe}`}
            >
              {content}
            </button>
          );
        }

        return (
          <article key={product.id} className={`border border-black/5 p-4 shadow-sm ${stripe}`}>
            {content}
          </article>
        );
      })}
    </div>
  );
}

function CartPanel({
  cart,
  cartProfit,
  cartTotal,
  isSaving,
  onChangePayment,
  onChangeQuantity,
  onFinishSale,
  paymentMethod,
}: {
  cart: SaleItemDraft[];
  cartProfit: number;
  cartTotal: number;
  isSaving: boolean;
  onChangePayment: (value: string) => void;
  onChangeQuantity: (productId: string, delta: number) => void;
  onFinishSale: () => void;
  paymentMethod: string;
}) {
  return (
    <aside className="h-fit bg-white p-4 shadow-md xl:sticky xl:top-5">
      <div className="flex items-center justify-between border-b border-black/10 pb-3">
        <h2 className="text-base font-bold text-[#27333a]">Venda atual</h2>
        <ReceiptText size={20} className="text-[#7b2fc7]" />
      </div>

      <div className="mt-4 space-y-3">
        {cart.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center border border-dashed border-black/15 bg-[#f7f7f7] text-center text-sm text-zinc-500">
            <ShoppingBasket className="mb-2 text-[#009a92]" size={24} />
            Selecione produtos para montar a venda.
          </div>
        ) : (
          cart.map((item) => (
            <div key={item.product.id} className="border border-black/5 bg-[#f6f6f6] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{item.product.name}</p>
                  <p className="text-sm text-zinc-600">
                    {currency.format(item.product.sale_price)} cada
                  </p>
                </div>
                <p className="font-bold">
                  {currency.format(item.product.sale_price * item.quantity)}
                </p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button type="button" aria-label="Diminuir quantidade" onClick={() => onChangeQuantity(item.product.id, -1)} className="flex h-9 w-9 items-center justify-center border border-black/10 bg-white transition hover:border-[#009a92]">
                  <Minus size={16} />
                </button>
                <span className="flex h-9 min-w-12 items-center justify-center bg-white px-3 text-sm font-bold text-[#7b2fc7]">
                  {item.quantity}
                </span>
                <button type="button" aria-label="Aumentar quantidade" onClick={() => onChangeQuantity(item.product.id, 1)} className="flex h-9 w-9 items-center justify-center border border-black/10 bg-white transition hover:border-[#009a92]">
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
            onClick={() => onChangePayment(value)}
            className={`h-9 border text-xs font-bold transition ${
              paymentMethod === value
                ? "border-[#7b2fc7] bg-[#7b2fc7] text-white"
                : "border-black/10 bg-white text-zinc-700 hover:border-[#7b2fc7]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <dl className="mt-5 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-zinc-600">Total</dt>
          <dd className="font-bold">{currency.format(cartTotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-600">Lucro líquido previsto</dt>
          <dd className="font-bold text-[#009a92]">{currency.format(cartProfit)}</dd>
        </div>
      </dl>

      <button
        type="button"
        disabled={!cart.length || isSaving}
        onClick={onFinishSale}
        className="mt-5 flex h-12 w-full items-center justify-center gap-2 bg-[#009a92] px-4 font-bold text-white transition hover:bg-[#007d7a] disabled:cursor-not-allowed disabled:bg-zinc-300"
      >
        <ReceiptText size={18} />
        {isSaving ? "Registrando..." : "Finalizar venda"}
      </button>
    </aside>
  );
}

function SalesList({ sales }: { sales: RecentSale[] }) {
  return (
    <div className="bg-white p-4 shadow-md">
      <div className="divide-y divide-black/5">
        {sales.map((sale, index) => (
          <div key={sale.id} className={`grid gap-3 px-3 py-4 first:pt-3 last:pb-3 sm:grid-cols-[1fr_auto_auto] sm:items-center ${index % 2 === 0 ? "bg-white" : "bg-[#f2f2f2]"}`}>
            <div className="min-w-0">
              <p className="font-medium text-zinc-900">
                {paymentLabels[sale.payment_method] ?? sale.payment_method}
              </p>
              <p className="text-sm text-zinc-600">
                {new Date(sale.created_at).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                - {sale.cashier_name ?? "Sem caixa"}
              </p>
            </div>
            <p className="font-bold">{currency.format(sale.gross_total)}</p>
            <p className="font-semibold text-[#009a92]">+{currency.format(sale.profit_total)}</p>
          </div>
        ))}
      </div>
    </div>
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
    <div className="border border-black/5 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-bold text-[#7b2fc7]">
        {icon}
        {label}
      </div>
      <p className="mt-3 text-2xl font-black tracking-normal text-[#27333a]">{value}</p>
    </div>
  );
}
