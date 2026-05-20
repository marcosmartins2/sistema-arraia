"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Image from "next/image";
import {
  Banknote,
  BarChart3,
  Building2,
  ChevronDown,
  CircleDollarSign,
  Copy,
  Eye,
  EyeOff,
  LogOut,
  Mail,
  Minus,
  Package,
  Plus,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  ShoppingBasket,
  Ticket,
  Trash2,
  X,
  UserRound,
  WalletCards,
} from "lucide-react";
import {
  demoCashierSales,
  demoOrganizationId,
  demoGroups,
  demoProducts,
  demoProductSales,
  demoRecentSales,
  demoReport,
} from "@/lib/demo-data";
import type { CashierSalesSummary } from "@/lib/demo-data";
import {
  dashboardDataUrl,
  isSupabaseConfigured,
  registerSaleUrl,
  supabase,
} from "@/lib/supabase";
import type {
  Group,
  Organization,
  OrganizationAccessCode,
  Profile,
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
  credit: "Crédito",
  debit: "Débito",
  card: "Cartão",
  token: "Ficha",
};

const paymentOptions = [
  { value: "pix", label: "Pix" },
  { value: "cash", label: "Dinheiro" },
  { value: "credit", label: "Crédito" },
  { value: "debit", label: "Débito" },
];

const initialProductForm = {
  name: "",
  category: "",
  responsibleName: "",
  salePrice: "",
  unitCost: "",
  stockQuantity: "",
};

const initialAuthForm = {
  email: "",
  password: "",
  fullName: "",
  accessCode: "",
};

const initialOrganizationForm = {
  name: "",
  slug: "",
  eventDate: "",
  responsibleGroup: "",
};

const initialAccessCodeForm = {
  code: "",
  label: "",
  organizationId: "",
};

function aggregateProductSales(
  rows: Array<{ product_id?: string | null; quantity?: number | null }> | null | undefined,
): Record<string, number> {
  const result: Record<string, number> = {};
  if (!rows) return result;
  for (const row of rows) {
    if (!row?.product_id) continue;
    const qty = Number(row.quantity ?? 0);
    if (!Number.isFinite(qty)) continue;
    result[row.product_id] = (result[row.product_id] ?? 0) + qty;
  }
  return result;
}

function aggregateCashierSales(
  rows:
    | Array<{
        cashier_name?: string | null;
        gross_total?: number | null;
        profit_total?: number | null;
      }>
    | null
    | undefined,
): Record<string, CashierSalesSummary> {
  const result: Record<string, CashierSalesSummary> = {};
  if (!rows) return result;
  for (const row of rows) {
    const key = (row?.cashier_name ?? "").trim() || "Sem identificação";
    const revenue = Number(row?.gross_total ?? 0);
    const profit = Number(row?.profit_total ?? 0);
    const existing = result[key] ?? { count: 0, revenue: 0, profit: 0 };
    result[key] = {
      count: existing.count + 1,
      revenue: existing.revenue + (Number.isFinite(revenue) ? revenue : 0),
      profit: existing.profit + (Number.isFinite(profit) ? profit : 0),
    };
  }
  return result;
}

const officialAdmin = {
  id: "official-admin",
  email: "annalimonta@outlook.com",
  password: "Manuela2811@",
  fullName: "Admin oficial",
};

type DashboardView = "cashier" | "products" | "report" | "sales" | "admin";
type AuthMode = "code" | "sign-in";
type AppUser = {
  id: string;
  email?: string;
};
type ProductDraft = {
  name: string;
  category: string;
  responsibleName: string;
  salePrice: string;
  unitCost: string;
  stockQuantity: string;
};
type ProductPromotionDraft = {
  mode: "price" | "discount";
  value: string;
  minQuantity: string;
};
type ProductPromotionUpdate = {
  promo_min_quantity: number | null;
  promo_discount_amount: number | null;
  original_sale_price?: number | null;
};

const ACCESS_CODE_LENGTH = 8;
const ACCESS_CODE_ALLOWED_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;

function getAuthGuidance(mode: AuthMode) {
  return mode === "code"
    ? "Digite o código do evento com 8 caracteres para entrar."
    : "Use o email e a senha do administrador para acessar a gestão completa.";
}

const dashboardViews: Array<{
  id: DashboardView;
  label: string;
  icon: ReactNode;
}> = [
  { id: "cashier", label: "Caixa", icon: <ShoppingBasket size={15} /> },
  { id: "products", label: "Produtos", icon: <Package size={15} /> },
  { id: "report", label: "Relatório", icon: <BarChart3 size={15} /> },
  { id: "sales", label: "Vendas", icon: <ReceiptText size={15} /> },
  { id: "admin", label: "Admin", icon: <ShieldCheck size={15} /> },
];

function parseNumber(value: string) {
  if (!value.trim()) {
    return Number.NaN;
  }

  return Number(value.replace(/\./g, "").replace(",", "."));
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeAccessCodeInput(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-HJ-NP-Z2-9]/g, "")
    .slice(0, ACCESS_CODE_LENGTH);
}

function isAccessCodeFormatValid(value: string) {
  return ACCESS_CODE_ALLOWED_PATTERN.test(value);
}

function normalizeCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  const padded = digits.padStart(3, "0");
  const cents = padded.slice(-2);
  const integerPart = String(Number(padded.slice(0, -2)));

  return `${integerPart},${cents}`;
}

function normalizeIntegerInput(value: string) {
  return value.replace(/\D/g, "");
}

function formatCurrencyInputFromNumber(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function createProductDraft(product: Product): ProductDraft {
  return {
    name: product.name,
    category: product.category,
    responsibleName: product.group?.name ?? "",
    salePrice: formatCurrencyInputFromNumber(product.sale_price),
    unitCost: formatCurrencyInputFromNumber(product.unit_cost),
    stockQuantity: String(product.stock_quantity),
  };
}

function getProductPromotion(product: Product) {
  const minQuantity =
    typeof product.promo_min_quantity === "number" ? Math.floor(product.promo_min_quantity) : 0;
  const discountAmount =
    typeof product.promo_discount_amount === "number" ? product.promo_discount_amount : 0;

  if (minQuantity < 2 || discountAmount <= 0) {
    return null;
  }

  return { minQuantity, discountAmount };
}

function createPromotionDraft(product: Product): ProductPromotionDraft {
  const promotion = getProductPromotion(product);

  if (!promotion) {
    return {
      mode: "discount",
      value: "",
      minQuantity: "",
    };
  }

  return {
    mode: "discount",
    value: formatCurrencyInputFromNumber(product.sale_price * promotion.minQuantity - promotion.discountAmount),
    minQuantity: String(promotion.minQuantity),
  };
}

function getPromotionalPackageTotal(product: Product, promotion: NonNullable<ReturnType<typeof getProductPromotion>>) {
  return Math.max(0, product.sale_price * promotion.minQuantity - promotion.discountAmount);
}

function getProductLineTotal(product: Product, quantity: number) {
  const promotion = getProductPromotion(product);

  if (!promotion || quantity < promotion.minQuantity) {
    return product.sale_price * quantity;
  }

  const promotionalPackages = Math.floor(quantity / promotion.minQuantity);

  return quantity * product.sale_price - promotionalPackages * promotion.discountAmount;
}

function getPromotionSummary(product: Product) {
  const promotion = getProductPromotion(product);

  if (!promotion) {
    return null;
  }

  const promotionalTotal = getPromotionalPackageTotal(product, promotion);

  return `Promoção: ${promotion.minQuantity} por ${currency.format(promotionalTotal)}.`;
}

function getPreferredCashierName(
  organization: Organization | null | undefined,
  currentCashierName = "",
) {
  const cashierNames = organization?.cashier_names?.map((name) => name.trim()).filter(Boolean) ?? [];

  if (cashierNames.includes(currentCashierName)) {
    return currentCashierName;
  }

  return cashierNames[0] ?? "";
}

function generateAccessCode(existingCodes: OrganizationAccessCode[]) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const takenCodes = new Set(existingCodes.map((item) => item.code.toUpperCase()));

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const values = crypto.getRandomValues(new Uint8Array(8));
    const code = Array.from(values, (value) => alphabet[value % alphabet.length]).join("");

    if (!takenCodes.has(code)) {
      return code;
    }
  }

  return crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}

export default function ArraiaDashboard() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [accessCodes, setAccessCodes] = useState<OrganizationAccessCode[]>([]);
  const [authMode, setAuthMode] = useState<AuthMode>("code");
  const [authForm, setAuthForm] = useState(initialAuthForm);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [organizationForm, setOrganizationForm] = useState(initialOrganizationForm);
  const [organizationCashiers, setOrganizationCashiers] = useState([""]);
  const [accessCodeForm, setAccessCodeForm] = useState(initialAccessCodeForm);
  const [lastGeneratedAccessCode, setLastGeneratedAccessCode] = useState<{
    code: string;
    organizationId: string;
  } | null>(null);
  const [groups, setGroups] = useState<Group[]>(demoGroups);
  const [products, setProducts] = useState<Product[]>(demoProducts);
  const [report, setReport] = useState<SaleReport>(demoReport);
  const [recentSales, setRecentSales] = useState<RecentSale[]>(demoRecentSales);
  const [productSalesByOrg, setProductSalesByOrg] = useState<Record<string, Record<string, number>>>({
    [demoOrganizationId]: demoProductSales,
  });
  const [cashierSalesByOrg, setCashierSalesByOrg] = useState<Record<string, Record<string, CashierSalesSummary>>>({
    [demoOrganizationId]: demoCashierSales,
  });
  const [isItemsBreakdownOpen, setIsItemsBreakdownOpen] = useState(false);
  const [isCashierBreakdownOpen, setIsCashierBreakdownOpen] = useState(false);
  const [cart, setCart] = useState<SaleItemDraft[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [cashierName, setCashierName] = useState("");
  const [activeView, setActiveView] = useState<DashboardView>("cashier");
  const [activeOrganizationId, setActiveOrganizationId] = useState(demoOrganizationId);
  const [productForm, setProductForm] = useState(initialProductForm);
  const [productDrafts, setProductDrafts] = useState<Record<string, ProductDraft>>({});
  const [status, setStatus] = useState(
    isSupabaseConfigured
      ? "Conectando ao Supabase..."
      : getAuthGuidance("code"),
  );
  const [isAuthReady, setIsAuthReady] = useState(!isSupabaseConfigured);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [isCreatingOrganization, setIsCreatingOrganization] = useState(false);
  const [isCreatingAccessCode, setIsCreatingAccessCode] = useState(false);
  const isOfficialAdminSession = user?.id === officialAdmin.id;
  const isLocalOnlySession =
    isOfficialAdminSession || Boolean(accessCode) || !isSupabaseConfigured || !supabase;

  async function loadData({ announce = true } = {}) {
    if (isOfficialAdminSession) {
      if (announce) {
        setStatus("Admin oficial conectado. Dados locais prontos para gerenciamento.");
      }
      return;
    }

    if (accessCode) {
      await loadDataByAccessCode(accessCode, { announce });
      return;
    }

    if (!supabase) return;

    if (announce) {
      setStatus("Atualizando dados...");
    }

    const [profileResult, organizationsResult] = await Promise.all([
      supabase.from("profiles").select("*").maybeSingle(),
      supabase.from("organizations").select("*").order("name"),
    ]);

    if (profileResult.error || organizationsResult.error) {
      setStatus("Não foi possível carregar as organizações. Confira as migrations e o login.");
      return;
    }

    const nextProfile = profileResult.data as Profile | null;
    const nextOrganizations = (organizationsResult.data ?? []) as Organization[];
    const organizationId =
      nextOrganizations.find((organization) => organization.id === activeOrganizationId)?.id ??
      nextOrganizations[0]?.id;

    setProfile(nextProfile);
    setOrganizations(nextOrganizations);

    if (!organizationId) {
      setActiveOrganizationId("");
      setCashierName("");
      setGroups([]);
      setProducts([]);
      if (nextProfile?.role === "admin") {
        const codesResult = await supabase
          .from("organization_access_codes")
          .select("*, organization:organizations(*)")
          .order("created_at", { ascending: false });
        if (!codesResult.error) {
          setAccessCodes((codesResult.data ?? []) as OrganizationAccessCode[]);
        }
        setStatus("Nenhuma organização ainda. Crie o primeiro evento na aba Admin.");
      } else {
        setStatus("Nenhuma organização disponível para este usuário.");
      }
      return;
    }

    setActiveOrganizationId(organizationId);
    setCashierName((current) =>
      getPreferredCashierName(
        nextOrganizations.find((organization) => organization.id === organizationId),
        current,
      ),
    );
    setAccessCodeForm((current) => ({
      ...current,
      organizationId: current.organizationId || organizationId,
    }));

    if (nextProfile?.role === "admin") {
      const codesResult = await supabase
        .from("organization_access_codes")
        .select("*, organization:organizations(*)")
        .order("created_at", { ascending: false });
      if (!codesResult.error) {
        setAccessCodes((codesResult.data ?? []) as OrganizationAccessCode[]);
      }
    } else {
      setAccessCodes([]);
    }

    const [groupsResult, productsResult, reportResult, salesResult, itemsResult, allSalesResult] = await Promise.all([
      supabase.from("groups").select("*").eq("organization_id", organizationId).order("name"),
      supabase
        .from("products")
        .select("*, group:groups(*)")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("event_profit_report")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle(),
      supabase
        .from("sales")
        .select("id, created_at, cashier_name, payment_method, gross_total, profit_total")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("sale_items")
        .select("product_id, quantity, sales!inner(organization_id)")
        .eq("sales.organization_id", organizationId),
      supabase
        .from("sales")
        .select("cashier_name, gross_total, profit_total")
        .eq("organization_id", organizationId),
    ]);

    if (groupsResult.error || productsResult.error || reportResult.error || salesResult.error) {
      setStatus("Não foi possível carregar tudo. Confira as variáveis de ambiente e migrations.");
      return;
    }

    setGroups(groupsResult.data ?? []);
    setProducts(productsResult.data ?? []);
    setReport((reportResult.data as SaleReport | null) ?? { ...demoReport, organization_id: organizationId });
    setRecentSales((salesResult.data ?? []) as RecentSale[]);
    setProductSalesByOrg((current) => ({
      ...current,
      [organizationId]: aggregateProductSales(itemsResult.data),
    }));
    setCashierSalesByOrg((current) => ({
      ...current,
      [organizationId]: aggregateCashierSales(allSalesResult.data),
    }));
    setStatus("Dados sincronizados com Supabase.");
  }

  async function loadDataByAccessCode(code: string, { announce = true } = {}) {
    const normalizedCode = normalizeAccessCodeInput(code.trim());

    if (!normalizedCode) return;

    const localCode = accessCodes.find(
      (item) => item.code.toUpperCase() === normalizedCode && item.is_active,
    );

    if (localCode) {
      const organization =
        organizations.find((item) => item.id === localCode.organization_id) ??
        localCode.organization;

      if (organization) {
        setOrganizations((current) =>
          current.some((item) => item.id === organization.id) ? current : [organization, ...current],
        );
        setActiveOrganizationId(organization.id);
        setCashierName((current) => getPreferredCashierName(organization, current));
      }

      setStatus("Dados sincronizados pelo código local.");
      return;
    }

    if (announce) {
      setStatus("Atualizando dados...");
    }

    if (!dashboardDataUrl) {
      setStatus("Esse código não está cadastrado entre os acessos ativos.");
      return;
    }

    const response = await fetch(dashboardDataUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ access_code: normalizedCode }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setStatus(payload?.error ?? "Não foi possível carregar os dados do código.");
      return;
    }

    const organization = payload.organization as Organization;
    setOrganizations([organization]);
    setActiveOrganizationId(organization.id);
    setCashierName((current) => getPreferredCashierName(organization, current));
    setGroups((payload.groups ?? []) as Group[]);
    setProducts((payload.products ?? []) as Product[]);
    setReport((payload.report as SaleReport | null) ?? { ...demoReport, organization_id: organization.id });
    setRecentSales((payload.recentSales ?? []) as RecentSale[]);
    setProductSalesByOrg((current) => ({
      ...current,
      [organization.id]: aggregateProductSales(payload.saleItems),
    }));
    setCashierSalesByOrg((current) => ({
      ...current,
      [organization.id]: aggregateCashierSales(payload.cashierSales),
    }));
    setStatus("Dados sincronizados pelo código.");
  }

  useEffect(() => {
    if (!supabase) return;

    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setUser(data.session?.user ?? null);
      setIsAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setProfile(null);
        setOrganizations([]);
        setActiveView("cashier");
      }
      setIsAuthReady(true);
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!user) return;
    if (user.id === officialAdmin.id) return;

    queueMicrotask(() => {
      void loadData({ announce: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, activeOrganizationId]);

  useEffect(() => {
    if (!accessCode && !user) return;
    if (user?.id === officialAdmin.id) return;

    const interval = window.setInterval(() => {
      void loadData({ announce: false });
    }, 5000);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessCode, user?.id, activeOrganizationId]);

  const activeProducts = useMemo(() => {
    if (!activeOrganizationId) return [];
    return products.filter((product) => product.organization_id === activeOrganizationId);
  }, [activeOrganizationId, products]);

  const activeRecentSales = useMemo(() => {
    if (!activeOrganizationId) return [];
    return recentSales.filter((sale) => sale.organization_id === activeOrganizationId);
  }, [activeOrganizationId, recentSales]);

  const activeReport =
    report.organization_id === activeOrganizationId
      ? report
      : {
          ...demoReport,
          organization_id: activeOrganizationId,
          gross_revenue: 0,
          total_cost: 0,
          gross_profit: 0,
          total_expenses: 0,
          net_profit: 0,
          sales_count: 0,
          items_sold: 0,
        };

  const activeProductSales = productSalesByOrg[activeOrganizationId] ?? {};
  const productSalesBreakdown = useMemo(() => {
    return activeProducts
      .map((product) => ({
        product,
        quantity: activeProductSales[product.id] ?? 0,
      }))
      .sort((a, b) => b.quantity - a.quantity || a.product.name.localeCompare(b.product.name));
  }, [activeProducts, activeProductSales]);

  const activeCashierSales = cashierSalesByOrg[activeOrganizationId] ?? {};
  const cashierSalesBreakdown = useMemo(() => {
    return Object.entries(activeCashierSales)
      .map(([name, summary]) => ({ name, ...summary }))
      .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
  }, [activeCashierSales]);

  const cartTotal = cart.reduce((total, item) => {
    return total + getProductLineTotal(item.product, item.quantity);
  }, 0);

  const cartProfit = cart.reduce((total, item) => {
    return total + getProductLineTotal(item.product, item.quantity) - item.quantity * item.product.unit_cost;
  }, 0);

  const visibleDashboardViews = dashboardViews.filter(
    (view) => view.id !== "admin" || profile?.role === "admin",
  );
  const activeLabel = visibleDashboardViews.find((view) => view.id === activeView)?.label ?? "Caixa";
  const activeOrganization = organizations.find((organization) => organization.id === activeOrganizationId);
  const activeCashierNames = useMemo(
    () => activeOrganization?.cashier_names?.map((name) => name.trim()).filter(Boolean) ?? [],
    [activeOrganization],
  );
  const activeGroups = useMemo(
    () => groups.filter((group) => group.organization_id === activeOrganizationId),
    [activeOrganizationId, groups],
  );

  function changeActiveOrganization(organizationId: string) {
    setActiveOrganizationId(organizationId);
    setCart([]);
    setAccessCodeForm((current) => ({ ...current, organizationId }));
    const organization = organizations.find((item) => item.id === organizationId);
    setCashierName((current) => getPreferredCashierName(organization, current));
    setStatus(
      organization
        ? `Visualizando dados do evento: ${organization.name}.`
        : "Selecione um evento para visualizar os dados.",
    );
  }

  async function updateOrganizationStatus(organizationId: string, isActive: boolean) {
    if (!isLocalOnlySession && supabase) {
      const orgResult = await supabase
        .from("organizations")
        .update({ is_active: isActive })
        .eq("id", organizationId);
      if (orgResult.error) {
        setStatus(`Não foi possível atualizar a festa: ${orgResult.error.message}`);
        return;
      }
      const codesResult = await supabase
        .from("organization_access_codes")
        .update({ is_active: isActive })
        .eq("organization_id", organizationId);
      if (codesResult.error) {
        setStatus(`Festa atualizada, mas falhou nos códigos: ${codesResult.error.message}`);
        return;
      }
    }

    setOrganizations((current) =>
      current.map((organization) =>
        organization.id === organizationId ? { ...organization, is_active: isActive } : organization,
      ),
    );
    setAccessCodes((current) =>
      current.map((code) =>
        code.organization_id === organizationId ? { ...code, is_active: isActive } : code,
      ),
    );
    if (!isActive && activeOrganizationId === organizationId) {
      const nextActiveOrganization = organizations.find(
        (organization) => organization.id !== organizationId && organization.is_active !== false,
      );
      setActiveOrganizationId(nextActiveOrganization?.id ?? "");
      setCashierName(getPreferredCashierName(nextActiveOrganization));
      setCart([]);
    }
    setStatus(isActive ? "Festa ativada." : "Festa inativada.");
  }

  async function deleteOrganization(organizationId: string) {
    const target = organizations.find((organization) => organization.id === organizationId);
    if (!target) return;

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        `Excluir a festa "${target.name}"? Isso apaga produtos, vendas e códigos de acesso vinculados.`,
      );
      if (!confirmed) return;
    }

    if (!isLocalOnlySession && supabase) {
      setStatus("Excluindo festa...");
      const result = await supabase.from("organizations").delete().eq("id", organizationId);
      if (result.error) {
        setStatus(`Não foi possível excluir a festa: ${result.error.message}`);
        return;
      }
    }

    const nextOrganizations = organizations.filter((organization) => organization.id !== organizationId);
    setOrganizations(nextOrganizations);
    setAccessCodes((current) => current.filter((code) => code.organization_id !== organizationId));
    setProducts((current) => current.filter((product) => product.organization_id !== organizationId));
    setRecentSales((current) => current.filter((sale) => sale.organization_id !== organizationId));
    setLastGeneratedAccessCode((current) =>
      current?.organizationId === organizationId ? null : current,
    );

    if (activeOrganizationId === organizationId) {
      const nextActiveOrganization = nextOrganizations.find(
        (organization) => organization.is_active !== false,
      ) ?? nextOrganizations[0];
      setActiveOrganizationId(nextActiveOrganization?.id ?? "");
      setCashierName(getPreferredCashierName(nextActiveOrganization));
      setCart([]);
    }

    setStatus("Festa excluída.");
  }

  function deleteAccessCode(codeId: string) {
    const deletedCode = accessCodes.find((code) => code.id === codeId);
    setAccessCodes((current) => current.filter((code) => code.id !== codeId));
    setLastGeneratedAccessCode((current) =>
      deletedCode && current?.code === deletedCode.code ? null : current,
    );
    setStatus("Código excluído.");
  }

  function deleteSystemAccount(accountId: string) {
    if (accountId === officialAdmin.id) {
      setStatus("A conta admin principal não pode ser excluída.");
      return;
    }

    const organizationId = accountId.replace(/^group-/, "");
    setOrganizations((current) =>
      current.map((organization) =>
        organization.id === organizationId
          ? { ...organization, responsible_group: null }
          : organization,
      ),
    );
    setStatus("Conta de grupo removida.");
  }

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
    const nextValue =
      field === "salePrice" || field === "unitCost"
        ? normalizeCurrencyInput(value)
        : field === "stockQuantity"
          ? normalizeIntegerInput(value)
          : value;

    setProductForm((current) => ({ ...current, [field]: nextValue }));
  }

  function updateProductDraft(product: Product, field: keyof ProductDraft, value: string) {
    const nextValue =
      field === "salePrice" || field === "unitCost"
        ? normalizeCurrencyInput(value)
        : field === "stockQuantity"
          ? normalizeIntegerInput(value)
          : value;

    setProductDrafts((current) => ({
      ...current,
      [product.id]: {
        ...(current[product.id] ?? createProductDraft(product)),
        [field]: nextValue,
      },
    }));
  }

  async function ensureResponsibleGroup(responsibleName: string) {
    const normalizedResponsibleName = responsibleName.trim();

    if (!normalizedResponsibleName) {
      setStatus("Informe quem é o responsável por fazer e vender esse produto.");
      return null;
    }

    const existingGroup =
      activeGroups.find(
        (item) => item.name.trim().toLowerCase() === normalizedResponsibleName.toLowerCase(),
      ) ?? null;

    if (existingGroup) {
      return existingGroup;
    }

    if (isLocalOnlySession) {
      const createdGroup: Group = {
        id: crypto.randomUUID(),
        organization_id: activeOrganizationId,
        name: normalizedResponsibleName,
        acronym: null,
        color: "#2563eb",
      };

      setGroups((current) =>
        [...current, createdGroup].sort((a, b) => a.name.localeCompare(b.name)),
      );
      return createdGroup;
    }

    if (!supabase) return null;

    const groupResult = await supabase
      .from("groups")
      .insert({
        organization_id: activeOrganizationId,
        name: normalizedResponsibleName,
        acronym: null,
        color: "#2563eb",
      })
      .select()
      .single();

    if (groupResult.error) {
      setStatus(`Não foi possível salvar o responsável: ${groupResult.error.message}`);
      return null;
    }

    const createdGroup = groupResult.data as Group;
    setGroups((current) =>
      [...current, createdGroup].sort((a, b) => a.name.localeCompare(b.name)),
    );
    return createdGroup;
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = productForm.name.trim();
    const category = productForm.category.trim();
    const responsibleName = productForm.responsibleName.trim();
    const salePrice = parseNumber(productForm.salePrice);
    const unitCost = parseNumber(productForm.unitCost);
    const stockQuantity = parseNumber(productForm.stockQuantity);

    if (
      !name ||
      !category ||
      !responsibleName ||
      !Number.isFinite(salePrice) ||
      !Number.isFinite(unitCost) ||
      !Number.isFinite(stockQuantity)
    ) {
      setStatus("Preencha nome, categoria, responsável, valor de venda, custo e estoque.");
      return;
    }

    if (salePrice < 0 || unitCost < 0 || stockQuantity < 0) {
      setStatus("Valores de venda, custo e estoque não podem ser negativos.");
      return;
    }

    if (!activeOrganizationId) {
      setStatus("Selecione ou crie uma organização antes de cadastrar produtos.");
      return;
    }

    const responsibleGroup = await ensureResponsibleGroup(responsibleName);

    if (!responsibleGroup) {
      return;
    }

    const productPayload = {
      organization_id: activeOrganizationId,
      group_id: responsibleGroup.id,
      name,
      category,
      sale_price: salePrice,
      original_sale_price: null,
      unit_cost: unitCost,
      stock_quantity: Math.floor(stockQuantity),
      is_active: true,
    };

    if (isLocalOnlySession) {
      const product: Product = {
        id: crypto.randomUUID(),
        ...productPayload,
        group: responsibleGroup,
      };

      setProducts((current) => [...current, product].sort((a, b) => a.name.localeCompare(b.name)));
      setProductForm(initialProductForm);
      setStatus("Produto cadastrado e disponível no caixa.");
      return;
    }

    if (!supabase) return;

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
    setStatus("Produto cadastrado e disponível no caixa.");
  }

  function resetProductDraft(productId: string) {
    setProductDrafts((current) => {
      const nextDrafts = { ...current };
      delete nextDrafts[productId];
      return nextDrafts;
    });
  }

  async function saveProductChanges(
    productId: string,
    draftOverride?: ProductDraft,
    promotionOverride?: ProductPromotionUpdate,
  ) {
    const product = products.find((item) => item.id === productId);

    if (!product) {
      return;
    }

    const draft = draftOverride ?? productDrafts[productId] ?? createProductDraft(product);
    const name = draft.name.trim();
    const category = draft.category.trim();
    const responsibleName = draft.responsibleName.trim();
    const salePrice = parseNumber(draft.salePrice);
    const unitCost = parseNumber(draft.unitCost);
    const stockQuantity = parseNumber(draft.stockQuantity);

    if (
      !name ||
      !category ||
      !responsibleName ||
      !Number.isFinite(salePrice) ||
      !Number.isFinite(unitCost) ||
      !Number.isFinite(stockQuantity)
    ) {
      setStatus("Preencha nome, categoria, responsável, valor de venda, custo e estoque antes de salvar.");
      return;
    }

    if (salePrice < 0 || unitCost < 0 || stockQuantity < 0) {
      setStatus("Valores de venda, custo e estoque não podem ser negativos.");
      return;
    }

    const responsibleGroup = await ensureResponsibleGroup(responsibleName);

    if (!responsibleGroup) {
      return;
    }

    const productPromotion = promotionOverride ?? {
      promo_min_quantity: product.promo_min_quantity ?? null,
      promo_discount_amount: product.promo_discount_amount ?? null,
      original_sale_price: product.original_sale_price ?? null,
    };
    const productPayload = {
      organization_id: activeOrganizationId,
      group_id: responsibleGroup.id,
      name,
      category,
      sale_price: salePrice,
      original_sale_price: productPromotion.original_sale_price ?? null,
      unit_cost: unitCost,
      stock_quantity: Math.floor(stockQuantity),
      promo_min_quantity: productPromotion.promo_min_quantity,
      promo_discount_amount: productPromotion.promo_discount_amount,
      is_active: true,
    };

    if (isLocalOnlySession) {
      setProducts((current) =>
        current
          .map((item) =>
            item.id === productId
              ? { ...item, ...productPayload, group: responsibleGroup }
              : item,
          )
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      resetProductDraft(productId);
      setStatus("Produto atualizado e pronto para vender no caixa.");
      return;
    }

    if (!supabase) return;

    setSavingProductId(productId);
    const result = await supabase
      .from("products")
      .update(productPayload)
      .eq("id", productId)
      .eq("organization_id", activeOrganizationId)
      .select("*, group:groups(*)")
      .single();
    setSavingProductId(null);

    if (result.error) {
      setStatus(`Não foi possível atualizar o produto: ${result.error.message}`);
      return;
    }

    setProducts((current) =>
      current
        .map((item) => (item.id === productId ? (result.data as Product) : item))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    resetProductDraft(productId);
    setStatus("Produto atualizado e pronto para vender no caixa.");
  }

  async function finishSale() {
    if (!cart.length) return;

    if (!cashierName) {
      setStatus("Selecione o vendedor do caixa antes de registrar a venda.");
      return;
    }

    if (isOfficialAdminSession || !isSupabaseConfigured || !registerSaleUrl || !supabase) {
      const sale: RecentSale = {
        id: crypto.randomUUID(),
        organization_id: activeOrganizationId,
        created_at: new Date().toISOString(),
        cashier_name: cashierName,
        payment_method: paymentMethod,
        gross_total: cartTotal,
        profit_total: cartProfit,
      };

      setRecentSales((current) => [sale, ...current].slice(0, 12));
      setReport((current) => {
        const base =
          current.organization_id === activeOrganizationId
            ? current
            : {
                ...demoReport,
                organization_id: activeOrganizationId,
                gross_revenue: 0,
                total_cost: 0,
                gross_profit: 0,
                total_expenses: 0,
                net_profit: 0,
                sales_count: 0,
                items_sold: 0,
              };

        return {
          organization_id: activeOrganizationId,
          gross_revenue: base.gross_revenue + cartTotal,
          total_cost: base.total_cost + (cartTotal - cartProfit),
          gross_profit: base.gross_profit + cartProfit,
          total_expenses: base.total_expenses,
          net_profit: base.net_profit + cartProfit,
          sales_count: base.sales_count + 1,
          items_sold: base.items_sold + cart.reduce((sum, item) => sum + item.quantity, 0),
        };
      });
      setProducts((current) =>
        current.map((product) => {
          const item = cart.find((draft) => draft.product.id === product.id);
          return item
            ? { ...product, stock_quantity: product.stock_quantity - item.quantity }
            : product;
        }),
      );
      setProductSalesByOrg((current) => {
        const orgSales = { ...(current[activeOrganizationId] ?? {}) };
        for (const item of cart) {
          orgSales[item.product.id] = (orgSales[item.product.id] ?? 0) + item.quantity;
        }
        return { ...current, [activeOrganizationId]: orgSales };
      });
      setCashierSalesByOrg((current) => {
        const orgCashiers = { ...(current[activeOrganizationId] ?? {}) };
        const key = cashierName || "Sem identificação";
        const existing = orgCashiers[key] ?? { count: 0, revenue: 0, profit: 0 };
        orgCashiers[key] = {
          count: existing.count + 1,
          revenue: existing.revenue + cartTotal,
          profit: existing.profit + cartProfit,
        };
        return { ...current, [activeOrganizationId]: orgCashiers };
      });
      setCart([]);
      setStatus("Venda registrada no modo demonstrativo.");
      return;
    }

    setIsSaving(true);
    setStatus("Registrando venda e dando baixa no estoque...");

    const sessionResult = await supabase.auth.getSession();
    const accessToken = sessionResult.data.session?.access_token;

    if (!accessToken && !accessCode) {
      setIsSaving(false);
      setStatus("Entre com o código do evento para registrar vendas.");
      return;
    }

    const response = await fetch(registerSaleUrl, {
      method: "POST",
      headers: accessToken
        ? {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          }
        : {
            "Content-Type": "application/json",
          },
      body: JSON.stringify({
        cashier_name: cashierName,
        payment_method: paymentMethod,
        organization_id: activeOrganizationId,
        access_code: accessCode || undefined,
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

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthMessage(null);

    if (authMode === "code") {
      const code = normalizeAccessCodeInput(authForm.accessCode.trim());

      if (!code) {
        const message = "Digite o código do evento para eu localizar o acesso.";
        setAuthMessage(message);
        setStatus(message);
        return;
      }

      if (code.length !== ACCESS_CODE_LENGTH || !isAccessCodeFormatValid(code)) {
        const message = "Código inválido. Tente novamente.";
        setAuthMessage(message);
        setStatus(message);
        return;
      }

      if (!dashboardDataUrl) {
        const localCode = accessCodes.find(
          (item) => item.code.toUpperCase() === code && item.is_active,
        );
        const organization = localCode?.organization;

        if (!localCode || !organization) {
          const message = "Não encontrei esse código. Tente novamente.";
          setAuthMessage(message);
          setStatus(message);
          return;
        }

        setAccessCode(code);
        setUser({ id: `code-${code}`, email: `${code}@acesso.local` });
        setProfile({ id: `code-${code}`, email: null, full_name: "Equipe de vendas", role: "member" });
        setOrganizations([organization]);
        setActiveOrganizationId(organization.id);
        setCashierName(getPreferredCashierName(organization));
        setAuthForm(initialAuthForm);
        setAuthMessage(null);
        setStatus("Código aceito no modo demonstrativo.");
        return;
      }

      setIsSubmittingAuth(true);
      const response = await fetch(dashboardDataUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ access_code: code }),
      });
      const payload = await response.json().catch(() => null);
      setIsSubmittingAuth(false);

      if (!response.ok) {
        const message =
          response.status >= 500
            ? "Não consegui validar esse código agora. Tente novamente em instantes."
            : "Não encontrei esse código de evento. Confira os caracteres e tente de novo.";
        setAuthMessage(message);
        setStatus(message);
        return;
      }

      const organization = payload.organization as Organization;
      setAuthMessage(null);
      setAccessCode(code);
      setUser({ id: `code-${code}`, email: `${code}@acesso.local` });
      setProfile({ id: `code-${code}`, email: null, full_name: "Equipe de vendas", role: "member" });
      setOrganizations([organization]);
      setActiveOrganizationId(organization.id);
      setCashierName(getPreferredCashierName(organization));
      setGroups((payload.groups ?? []) as Group[]);
      setProducts((payload.products ?? []) as Product[]);
      setReport((payload.report as SaleReport | null) ?? { ...demoReport, organization_id: organization.id });
      setRecentSales((payload.recentSales ?? []) as RecentSale[]);
      setProductSalesByOrg((current) => ({
        ...current,
        [organization.id]: aggregateProductSales(payload.saleItems),
      }));
      setCashierSalesByOrg((current) => ({
        ...current,
        [organization.id]: aggregateCashierSales(payload.cashierSales),
      }));
      setAuthForm(initialAuthForm);
      setStatus("Código aceito. Dados sincronizados.");
      return;
    }

    const email = authForm.email.trim();
    const password = authForm.password;
    const normalizedEmail = email.toLowerCase();
    const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);

    if (!email && !password) {
      const message = "Preencha o email e a senha do administrador para continuar.";
      setAuthMessage(message);
      setStatus(message);
      return;
    }

    if (!email) {
      const message = "Digite o email do administrador para eu conferir o acesso.";
      setAuthMessage(message);
      setStatus(message);
      return;
    }

    if (!emailLooksValid) {
      const message = "E-mail inválido.";
      setAuthMessage(message);
      setStatus(message);
      return;
    }

    if (!password) {
      const message = "Faltou a senha do administrador. Preencha e tente novamente.";
      setAuthMessage(message);
      setStatus(message);
      return;
    }

    if (normalizedEmail !== officialAdmin.email) {
      const message = "E-mail inválido.";
      setAuthMessage(message);
      setStatus(message);
      return;
    }

    if (password !== officialAdmin.password) {
      const message = "Senha Incorreta.";
      setAuthMessage(message);
      setStatus(message);
      return;
    }

    setIsSubmittingAuth(true);
    setStatus("Entrando como admin oficial...");

    if (supabase) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: officialAdmin.email,
        password: officialAdmin.password,
      });
      setIsSubmittingAuth(false);

      if (signInError) {
        const message = `Não consegui entrar: ${signInError.message}`;
        setAuthMessage(message);
        setStatus(message);
        return;
      }

      setAuthMessage(null);
      setAccessCode("");
      setAuthForm(initialAuthForm);
      setActiveView("admin");
      setStatus("Admin oficial conectado. Carregando dados...");
      return;
    }

    const adminProfile: Profile = {
      id: officialAdmin.id,
      email: officialAdmin.email,
      full_name: officialAdmin.fullName,
      role: "admin",
    };

    setIsSubmittingAuth(false);
    setAuthMessage(null);
    setAccessCode("");
    setUser({ id: officialAdmin.id, email: officialAdmin.email });
    setProfile(adminProfile);
    setOrganizations([]);
    setAccessCodes([]);
    setActiveOrganizationId("");
    setCashierName("");
    setAccessCodeForm((current) => ({ ...current, organizationId: "" }));
    setGroups((current) => (current.length ? current : demoGroups));
    setProducts((current) => (current.length ? current : demoProducts));
    setReport((current) => current ?? demoReport);
    setRecentSales((current) => (current.length ? current : demoRecentSales));
    setActiveView("admin");
    setAuthForm(initialAuthForm);
    setStatus("Admin oficial conectado. Crie um evento para começar e depois selecione-o no cabeçalho.");
  }

  async function signOut() {
    setAuthMode("sign-in");
    setAuthForm(initialAuthForm);
    setAuthMessage(null);
    setAccessCode("");
    setOrganizationCashiers([""]);

    if (supabase) {
      await supabase.auth.signOut();
    }

    setUser(null);
    setProfile(null);
    setOrganizations([]);
    setProducts(demoProducts);
    setGroups(demoGroups);
    setReport(demoReport);
    setRecentSales(demoRecentSales);
    setCashierName("");
    setActiveView("cashier");
    setIsAuthReady(true);
    setStatus("Sessão encerrada.");
  }

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (profile?.role !== "admin") return;

    const name = organizationForm.name.trim();
    const slug = slugify(organizationForm.slug || name);
    const eventDate = organizationForm.eventDate || null;
    const responsibleGroup = organizationForm.responsibleGroup.trim() || null;
    const cashierNames = organizationCashiers.map((item) => item.trim()).filter(Boolean);

    if (!name || !slug) {
      setStatus("Informe nome e sigla do evento.");
      return;
    }

    if (!eventDate || !responsibleGroup || cashierNames.length === 0) {
      setStatus("Informe data, responsáveis e pelo menos um vendedor do caixa.");
      return;
    }

    if (isOfficialAdminSession || !supabase) {
      const organization: Organization = {
        id: crypto.randomUUID(),
        name,
        slug,
        created_by: user?.id ?? null,
        event_date: eventDate,
        responsible_group: responsibleGroup,
        cashier_names: cashierNames,
        is_active: true,
      };
      setOrganizations((current) => [...current, organization].sort((a, b) => a.name.localeCompare(b.name)));
      setOrganizationForm(initialOrganizationForm);
      setOrganizationCashiers([""]);
      setActiveOrganizationId(organization.id);
      setCashierName(getPreferredCashierName(organization));
      setAccessCodeForm((current) => ({ ...current, organizationId: organization.id }));
      setStatus("Organização criada no modo demonstrativo.");
      return;
    }

    setIsCreatingOrganization(true);
    const result = await supabase
      .from("organizations")
      .insert({
        name,
        slug,
        created_by: user?.id ?? null,
        event_date: eventDate,
        responsible_group: responsibleGroup,
        cashier_names: cashierNames,
        is_active: true,
      })
      .select()
      .single();
    setIsCreatingOrganization(false);

    if (result.error) {
      setStatus(result.error.message);
      return;
    }

    setOrganizationForm(initialOrganizationForm);
    setOrganizationCashiers([""]);
    setActiveOrganizationId((result.data as Organization).id);
    await loadData();
    setStatus("Organização criada.");
  }

  async function createAccessCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (profile?.role !== "admin") return;

    const organizationId = accessCodeForm.organizationId || activeOrganizationId;
    const organization = organizations.find((item) => item.id === organizationId);
    const existingCodeForOrganization = accessCodes.find(
      (item) => item.organization_id === organizationId && item.is_active,
    );

    if (!organizationId || !organization) {
      setStatus("Selecione o evento para gerar o código.");
      return;
    }

    if (existingCodeForOrganization) {
      setLastGeneratedAccessCode({
        code: existingCodeForOrganization.code,
        organizationId,
      });
      setStatus(`Este evento já tem um código ativo: ${existingCodeForOrganization.code}.`);
      return;
    }

    const code = generateAccessCode(accessCodes);
    const label = organization.slug.toUpperCase();

    if (isOfficialAdminSession || !supabase) {
      setAccessCodes((current) => [
        {
          id: crypto.randomUUID(),
          organization_id: organizationId,
          code,
          label,
          is_active: true,
          organization,
        },
        ...current,
      ]);
      setLastGeneratedAccessCode({ code, organizationId });
      setAccessCodeForm(initialAccessCodeForm);
      setStatus(`Código único gerado para ${organization.name}: ${code}.`);
      return;
    }

    setIsCreatingAccessCode(true);
    const result = await supabase.from("organization_access_codes").upsert({
      organization_id: organizationId,
      code,
      label,
      is_active: true,
      created_by: user?.id ?? null,
    });
    setIsCreatingAccessCode(false);

    if (result.error) {
      setStatus(result.error.message);
      return;
    }

    setAccessCodeForm(initialAccessCodeForm);
    setLastGeneratedAccessCode({ code, organizationId });
    await loadData();
    setStatus(`Código único gerado para ${organization.name}: ${code}.`);
  }

  if (isSupabaseConfigured && !isAuthReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f8ff] px-4 text-[#10233f]">
        <div className="rounded-md border border-[#d7e3f8] bg-white px-5 py-4 text-sm font-semibold text-slate-600 shadow-sm shadow-[#0b3a75]/5">
          Carregando sessão...
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        authForm={authForm}
        authMode={authMode}
        authMessage={authMessage}
        isSubmitting={isSubmittingAuth}
        status={status}
        onChangeForm={(field, value) => {
          setAuthMessage(null);
          setStatus(getAuthGuidance(authMode));
          setAuthForm((current) => ({
            ...current,
            [field]: field === "accessCode" ? normalizeAccessCodeInput(value) : value,
          }));
        }}
        onChangeMode={(mode) => {
          setAuthMessage(null);
          setStatus(getAuthGuidance(mode));
          setAuthMode(mode);
        }}
        onSubmit={submitAuth}
      />
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f5f8ff] text-[#10233f] md:flex">
      <aside className="hidden w-[74px] shrink-0 bg-[#071a36] text-white md:flex md:flex-col md:items-center">
        <div className="flex h-[72px] w-full items-center justify-center border-b border-white/10 bg-[#05142b]">
          <BrandMark compact />
        </div>
        <nav className="flex w-full flex-1 flex-col items-center gap-2 py-5" aria-label="Menu lateral">
          {visibleDashboardViews.map((view) => (
            <button
              key={view.id}
              type="button"
              title={view.label}
              onClick={() => setActiveView(view.id)}
              className={`flex h-11 w-11 items-center justify-center border-l-4 transition ${
                activeView === view.id
                  ? "border-[#60a5fa] bg-white/14 text-white"
                  : "border-transparent text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              {view.icon}
            </button>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="border-b border-[#d7e3f8] bg-white">
          <div className="flex min-h-[72px] flex-col gap-3 px-3 py-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between lg:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="md:hidden">
                <BrandMark compact />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <BrandMark />
                  <p className="sr-only">
                    Gestão de Eventos
                  </p>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500 sm:line-clamp-none">
                  {activeOrganization ? activeOrganization.name : status}
                </p>
              </div>
            </div>
            <div className="grid w-full grid-cols-[1fr_auto] gap-2 sm:flex sm:flex-wrap sm:items-center lg:w-auto lg:justify-end">
              <OrganizationSwitcher
                activeOrganizationId={activeOrganizationId}
                organizations={organizations}
                onChange={changeActiveOrganization}
              />
              <CashierSwitcher
                cashierName={cashierName}
                cashierNames={activeCashierNames}
                onChange={setCashierName}
              />
              <button
                type="button"
                onClick={() => void loadData()}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#2563eb] px-3 text-sm font-semibold text-white transition hover:bg-[#1d4ed8]"
              >
                <RefreshCw size={15} />
                Atualizar
              </button>
              <div className="hidden h-9 w-9 items-center justify-center rounded-full bg-[#eaf3ff] text-[#1d4ed8] lg:flex">
                <UserRound size={18} />
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#d7e3f8] bg-white text-slate-600 transition hover:bg-[#f0f6ff] hover:text-[#0b3a75]"
                aria-label="Sair"
                title="Sair"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>

          <div className="bg-[#0b3a75] px-3 py-3 text-white sm:px-4 lg:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-white/70">Módulo ativo</p>
                <h1 className="text-xl font-bold">{activeLabel}</h1>
                {activeOrganization && (
                  <p className="mt-1 text-sm text-white/70">{activeOrganization.name}</p>
                )}
              </div>
              <div className="h-1.5 w-28 rounded-full bg-[#93c5fd]" aria-hidden="true" />
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto bg-white px-3 pt-3 sm:px-4 lg:px-6" aria-label="Áreas do sistema">
            {visibleDashboardViews.map((view) => (
              <button
                key={view.id}
                type="button"
                onClick={() => setActiveView(view.id)}
                className={`inline-flex h-10 shrink-0 items-center gap-2 border-t-4 px-4 text-xs font-bold uppercase transition ${
                  activeView === view.id
                    ? "border-[#2563eb] bg-[#eaf3ff] text-[#0b3a75]"
                    : "border-transparent bg-transparent text-slate-600 hover:bg-[#f0f6ff] hover:text-[#0b3a75]"
                }`}
              >
                {view.icon}
                {view.label}
              </button>
            ))}
          </nav>
        </header>

        <div className="px-3 py-4 sm:px-4 sm:py-5 lg:px-6">
          {activeView === "cashier" && (
            <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
              <section className="space-y-4">
                <SectionHeader title="Venda rápida" />
                <ProductGrid products={activeProducts} onProductClick={addToCart} mode="sale" />
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
                isCreatingProduct={isCreatingProduct}
                productForm={productForm}
                onSubmit={createProduct}
                onUpdate={updateProductForm}
              />
              <EditableProductList
                products={activeProducts}
                productDrafts={productDrafts}
                savingProductId={savingProductId}
                onChangeDraft={updateProductDraft}
                onSave={saveProductChanges}
                onResetDraft={resetProductDraft}
                onStatusChange={setStatus}
              />
            </section>
          )}

          {activeView === "report" && (
            <section className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Metric icon={<Banknote size={18} />} label="Receita" value={currency.format(activeReport.gross_revenue)} />
                <Metric icon={<WalletCards size={18} />} label="Custo dos produtos" value={currency.format(activeReport.total_cost)} />
                <Metric icon={<BarChart3 size={18} />} label="Lucro líquido" value={currency.format(activeReport.gross_profit)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                  icon={<Ticket size={18} />}
                  label="Itens vendidos"
                  value={String(activeReport.items_sold)}
                  onClick={() => setIsItemsBreakdownOpen(true)}
                />
                <Metric
                  icon={<ReceiptText size={18} />}
                  label="Vendas registradas"
                  value={String(activeReport.sales_count)}
                  onClick={() => setIsCashierBreakdownOpen(true)}
                />
                <Metric
                  icon={<CircleDollarSign size={18} />}
                  label="Ticket médio"
                  value={currency.format(activeReport.sales_count ? activeReport.gross_revenue / activeReport.sales_count : 0)}
                />
                <Metric
                  icon={<BarChart3 size={18} />}
                  label="Lucro médio por item"
                  value={currency.format(activeReport.items_sold ? activeReport.gross_profit / activeReport.items_sold : 0)}
                />
              </div>
              {isItemsBreakdownOpen && (
                <ItemsBreakdownModal
                  breakdown={productSalesBreakdown}
                  totalItems={activeReport.items_sold}
                  onClose={() => setIsItemsBreakdownOpen(false)}
                />
              )}
              {isCashierBreakdownOpen && (
                <CashierBreakdownModal
                  breakdown={cashierSalesBreakdown}
                  totalSales={activeReport.sales_count}
                  totalRevenue={activeReport.gross_revenue}
                  onClose={() => setIsCashierBreakdownOpen(false)}
                />
              )}
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
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#d7e3f8] bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-[#f0f6ff]"
                  >
                    <RefreshCw size={15} />
                    Atualizar
                  </button>
                }
              />
              <SalesList sales={activeRecentSales} />
            </section>
          )}

          {activeView === "admin" && profile?.role === "admin" && (
              <AdminPanel
              accessCodeForm={accessCodeForm}
              accessCodes={accessCodes}
              activeOrganizationId={activeOrganizationId}
              isCreatingAccessCode={isCreatingAccessCode}
              isCreatingOrganization={isCreatingOrganization}
              lastGeneratedAccessCode={lastGeneratedAccessCode}
              organizationCashiers={organizationCashiers}
              organizationForm={organizationForm}
              organizations={organizations}
              onChangeAccessCodeForm={(field, value) => setAccessCodeForm((current) => ({ ...current, [field]: value }))}
              onChangeOrganizationForm={(field, value) =>
                setOrganizationForm((current) => ({ ...current, [field]: value }))
              }
              onAddOrganizationCashier={() => setOrganizationCashiers((current) => [...current, ""])}
              onChangeOrganizationCashier={(index, value) =>
                setOrganizationCashiers((current) =>
                  current.map((item, itemIndex) => (itemIndex === index ? value : item)),
                )
              }
              onCreateAccessCode={createAccessCode}
              onCreateOrganization={createOrganization}
              onDeleteAccessCode={deleteAccessCode}
              onDeleteOrganization={deleteOrganization}
              onDeleteSystemAccount={deleteSystemAccount}
              onUpdateOrganizationStatus={updateOrganizationStatus}
              onRemoveOrganizationCashier={(index) =>
                setOrganizationCashiers((current) =>
                  current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index),
                )
              }
            />
          )}
        </div>
      </div>
    </main>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#2563eb] text-white shadow-sm shadow-black/15">
        <ShoppingBasket size={22} strokeWidth={2.4} />
      </div>
    );
  }

  return (
    <div className="flex items-center">
      <p className="text-sm font-black uppercase tracking-normal text-[#0b3a75] sm:text-base">
        Gestão de Eventos
      </p>
    </div>
  );
}

function AuthScreen({
  authForm,
  authMode,
  authMessage,
  isSubmitting,
  onChangeForm,
  onChangeMode,
  onSubmit,
  status,
}: {
  authForm: typeof initialAuthForm;
  authMode: AuthMode;
  authMessage: string | null;
  isSubmitting: boolean;
  onChangeForm: (field: keyof typeof initialAuthForm, value: string) => void;
  onChangeMode: (mode: AuthMode) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  status: string;
}) {
  const isCodeMode = authMode === "code";
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050b1f] text-white">
      <Image
        src="/images/login-tech-hero.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-left opacity-82 lg:-translate-x-[34%] lg:-translate-y-[4%] lg:scale-125"
      />
      <div className="absolute inset-0 bg-[#050b1f]/48 lg:bg-[#050b1f]/28" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,11,31,0.22)_0%,rgba(5,11,31,0.82)_58%,#050b1f_100%)] lg:bg-[linear-gradient(90deg,rgba(5,11,31,0.08)_0%,rgba(5,11,31,0.22)_36%,rgba(5,11,31,0.84)_62%,#050b1f_100%)]" />

      <section className="relative z-10 flex min-h-screen items-center px-3 py-6 sm:px-8 lg:px-12">
        <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[1fr_minmax(360px,420px)] lg:items-center">
          <div className="hidden max-w-2xl lg:block">
            <p className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-normal text-[#93c5fd]">
              Gestão de vendas
            </p>
            <h1 className="mt-3 max-w-xl font-[family-name:var(--font-display)] text-4xl font-extrabold leading-[1.18] tracking-normal text-white xl:text-5xl">
              O controle total do seu evento na palma da mão.
            </h1>
            <p className="mt-5 max-w-xl font-[family-name:var(--font-display)] text-base font-medium leading-8 text-blue-100/78">
              Monitore o caixa em tempo real, gerencie estoques e tenha relatórios precisos sem complicação. Transforme a gestão do seu evento em uma experiência profissional.
            </p>
          </div>
          <div className="w-full rounded-md border border-white/16 bg-white/10 p-4 shadow-2xl shadow-black/25 backdrop-blur-xl sm:p-5">
            <div className="flex min-w-0 items-center gap-3 border-b border-white/12 pb-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#7c3aed] text-white shadow-lg shadow-[#7c3aed]/30">
                <ShoppingBasket size={23} strokeWidth={2.4} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black uppercase tracking-normal text-white">
                  Gestão de Eventos
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-blue-100/70">{status}</p>
              </div>
            </div>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-md bg-white/8 p-1 ring-1 ring-white/10">
          <button
            type="button"
            onClick={() => onChangeMode("code")}
            className={`h-9 rounded text-sm font-bold transition ${
              isCodeMode ? "bg-white text-[#172554] shadow-sm" : "text-blue-100/70 hover:text-white"
            }`}
          >
            Código
          </button>
          <button
            type="button"
            onClick={() => onChangeMode("sign-in")}
            className={`h-9 rounded text-sm font-bold transition ${
              !isCodeMode ? "bg-white text-[#172554] shadow-sm" : "text-blue-100/70 hover:text-white"
            }`}
          >
            Admin
          </button>
        </div>

        <form onSubmit={onSubmit} noValidate className="mt-5 space-y-3">
          {isCodeMode ? (
            <input
              value={authForm.accessCode}
              onChange={(event) => onChangeForm("accessCode", event.target.value)}
              placeholder="Código do evento"
              maxLength={ACCESS_CODE_LENGTH}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="h-11 w-full rounded-md border border-white/12 bg-white/10 px-3 text-sm text-white outline-none transition placeholder:text-blue-100/45 focus:border-[#a78bfa] focus:ring-2 focus:ring-[#a78bfa]/20"
            />
          ) : (
            <>
              <label className="flex h-11 items-center rounded-md border border-white/12 bg-white/10 text-blue-100/60 transition focus-within:border-[#60a5fa] focus-within:ring-2 focus-within:ring-[#60a5fa]/20">
                <span className="flex h-full w-10 items-center justify-center">
                  <Mail size={15} />
                </span>
                <input
                  value={authForm.email}
                  onChange={(event) => onChangeForm("email", event.target.value)}
                  placeholder="Email admin"
                  type="email"
                  className="h-full min-w-0 flex-1 bg-transparent pr-3 text-sm text-white outline-none placeholder:text-blue-100/45"
                />
              </label>
              <label className="flex h-11 items-center rounded-md border border-white/12 bg-white/10 text-blue-100/60 transition focus-within:border-[#a78bfa] focus-within:ring-2 focus-within:ring-[#a78bfa]/20">
                <input
                  value={authForm.password}
                  onChange={(event) => onChangeForm("password", event.target.value)}
                  placeholder="Senha"
                  type={showPassword ? "text" : "password"}
                  className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-blue-100/45"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="flex h-full w-11 items-center justify-center rounded-r-md text-blue-100/70 transition hover:bg-white/10 hover:text-white"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </label>
            </>
          )}
          {authMessage && (
            <div
              role="alert"
              aria-live="polite"
              className="rounded-md border border-rose-300/35 bg-rose-500/12 px-3 py-2 text-sm leading-6 text-rose-100"
            >
              {authMessage}
            </div>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-12 w-full items-center justify-center rounded-md bg-[#7c3aed] px-4 text-sm font-bold text-white shadow-lg shadow-[#7c3aed]/25 transition hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:bg-slate-500"
          >
            {isSubmitting ? "Aguarde..." : isCodeMode ? "Entrar com código" : "Entrar como admin"}
          </button>
        </form>
      </div>
        </div>
      </section>
    </main>
  );
}

function AdminPanel({
  accessCodeForm,
  accessCodes,
  activeOrganizationId,
  isCreatingAccessCode,
  isCreatingOrganization,
  lastGeneratedAccessCode,
  organizationCashiers,
  onAddOrganizationCashier,
  onChangeAccessCodeForm,
  onChangeOrganizationCashier,
  onChangeOrganizationForm,
  onCreateAccessCode,
  onCreateOrganization,
  onDeleteAccessCode,
  onDeleteOrganization,
  onDeleteSystemAccount,
  onUpdateOrganizationStatus,
  onRemoveOrganizationCashier,
  organizationForm,
  organizations,
}: {
  accessCodeForm: typeof initialAccessCodeForm;
  accessCodes: OrganizationAccessCode[];
  activeOrganizationId: string;
  isCreatingAccessCode: boolean;
  isCreatingOrganization: boolean;
  lastGeneratedAccessCode: { code: string; organizationId: string } | null;
  organizationCashiers: string[];
  onAddOrganizationCashier: () => void;
  onChangeAccessCodeForm: (field: keyof typeof initialAccessCodeForm, value: string) => void;
  onChangeOrganizationCashier: (index: number, value: string) => void;
  onChangeOrganizationForm: (field: keyof typeof initialOrganizationForm, value: string) => void;
  onCreateAccessCode: (event: FormEvent<HTMLFormElement>) => void;
  onCreateOrganization: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteAccessCode: (codeId: string) => void;
  onDeleteOrganization: (organizationId: string) => void | Promise<void>;
  onDeleteSystemAccount: (accountId: string) => void;
  onUpdateOrganizationStatus: (organizationId: string, isActive: boolean) => void | Promise<void>;
  onRemoveOrganizationCashier: (index: number) => void;
  organizationForm: typeof initialOrganizationForm;
  organizations: Organization[];
}) {
  const [copiedAccessCode, setCopiedAccessCode] = useState(false);
  const selectedAccessCodeOrganization = organizations.find(
    (organization) => organization.id === (accessCodeForm.organizationId || activeOrganizationId),
  );
  const selectedExistingAccessCode = accessCodes.find(
    (item) => item.organization_id === selectedAccessCodeOrganization?.id && item.is_active,
  );
  const organizationsWithoutAccessCode = organizations.filter(
    (organization) =>
      organization.is_active !== false &&
      !accessCodes.some((item) => item.organization_id === organization.id && item.is_active),
  );
  const visibleAccessCode =
    lastGeneratedAccessCode && lastGeneratedAccessCode.organizationId === selectedAccessCodeOrganization?.id
      ? lastGeneratedAccessCode.code
      : selectedExistingAccessCode?.code;
  const systemAccounts = [
    {
      id: officialAdmin.id,
      name: "Anna Carolina Limonta",
      detail: officialAdmin.email,
      role: "Admin / Owner",
      isActive: true,
    },
    ...organizations
      .filter((organization) => organization.responsible_group?.trim())
      .map((organization) => ({
        id: `group-${organization.id}`,
        name: organization.name,
        detail: organization.name,
        role: organization.responsible_group!,
        isActive:
          organization.is_active !== false &&
          accessCodes.some((code) => code.organization_id === organization.id && code.is_active),
      })),
  ];

  async function copyAccessCode() {
    if (!visibleAccessCode) return;

    await navigator.clipboard.writeText(visibleAccessCode);
    setCopiedAccessCode(true);
    window.setTimeout(() => setCopiedAccessCode(false), 1600);
  }

  async function copyCodeValue(code: string) {
    await navigator.clipboard.writeText(code);
    setCopiedAccessCode(true);
    window.setTimeout(() => setCopiedAccessCode(false), 1600);
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,0.9fr)]">
        <form onSubmit={onCreateOrganization} className="rounded-md border border-[#d7e3f8] bg-white p-4 shadow-sm shadow-[#0b3a75]/5">
          <div className="flex items-center gap-2 text-sm font-bold text-[#2563eb]">
            <Building2 size={17} />
            Criar evento
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              value={organizationForm.name}
              onChange={(event) => onChangeOrganizationForm("name", event.target.value)}
              placeholder="Nome do evento"
              className="h-10 w-full rounded-md border border-[#d7e3f8] bg-[#f8fbff] px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
            />
            <input
              value={organizationForm.eventDate}
              onChange={(event) => onChangeOrganizationForm("eventDate", event.target.value)}
              type="date"
              className="h-10 w-full rounded-md border border-[#d7e3f8] bg-[#f8fbff] px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
              aria-label="Data do evento"
            />
            <input
              value={organizationForm.slug}
              onChange={(event) =>
                onChangeOrganizationForm("slug", event.target.value.toUpperCase().slice(0, 3))
              }
              placeholder="Sigla do evento"
              maxLength={3}
              className="h-10 w-full rounded-md border border-[#d7e3f8] bg-[#f8fbff] px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
            />
            <input
              value={organizationForm.responsibleGroup}
              onChange={(event) => onChangeOrganizationForm("responsibleGroup", event.target.value)}
              placeholder="Responsáveis pelo evento"
              className="h-10 w-full rounded-md border border-[#d7e3f8] bg-[#f8fbff] px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
            />
          </div>
          <div className="mt-4 rounded-md border border-[#d7e3f8] bg-[#f8fbff] p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-[#10233f]">Caixas do evento</p>
                <p className="mt-1 text-xs text-slate-500">Adicione os vendedores que vão operar cada caixa.</p>
              </div>
              <button
                type="button"
                onClick={onAddOrganizationCashier}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#2563eb] text-white transition hover:bg-[#1d4ed8]"
                aria-label="Adicionar caixa"
                title="Adicionar caixa"
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {organizationCashiers.map((cashier, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    value={cashier}
                    onChange={(event) => onChangeOrganizationCashier(index, event.target.value)}
                    placeholder={`Vendedor do caixa ${index + 1}`}
                    className="h-10 min-w-0 flex-1 rounded-md border border-[#d7e3f8] bg-white px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveOrganizationCashier(index)}
                    disabled={organizationCashiers.length === 1}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#d7e3f8] bg-white text-slate-600 transition hover:border-[#2563eb] disabled:cursor-not-allowed disabled:text-slate-300"
                    aria-label={`Remover caixa ${index + 1}`}
                    title="Remover caixa"
                  >
                    <Minus size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3">
            <button
              type="submit"
              disabled={isCreatingOrganization}
              className="h-10 w-full rounded-md bg-[#2563eb] text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isCreatingOrganization ? "Criando..." : "Criar evento"}
            </button>
          </div>
        </form>

        <form onSubmit={onCreateAccessCode} className="h-fit overflow-hidden rounded-md border border-[#bfdbfe] bg-white shadow-sm shadow-[#0b3a75]/5">
          <div className="border-b border-[#d7e3f8] bg-[#eaf3ff] px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-bold text-[#1d4ed8]">
              <ShieldCheck size={17} />
              Gerar código único
            </div>
            <p className="mt-1 text-xs leading-5 text-[#3f5f8f]">
              Libera o acesso da equipe para o evento selecionado.
            </p>
          </div>
          <div className="space-y-3 p-4">
            <select
              value={accessCodeForm.organizationId || activeOrganizationId}
              onChange={(event) => onChangeAccessCodeForm("organizationId", event.target.value)}
              className="h-10 w-full rounded-md border border-[#d7e3f8] bg-[#f8fbff] px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
            >
              <option value="">Selecione o evento</option>
              {organizationsWithoutAccessCode.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
            <p className="text-xs leading-5 text-slate-500">
              O código será gerado automaticamente com 8 letras e números. Cada evento pode ter apenas um código ativo.
            </p>
            <div className="rounded-md border border-dashed border-[#bfdbfe] bg-[#f8fbff] px-3 py-3">
              <p className="text-center text-xs font-bold uppercase text-slate-400">
                {visibleAccessCode ? "Código do evento" : "Código ainda não gerado"}
              </p>
              <div className="mt-2 flex items-center justify-center gap-2">
                <p className="min-h-7 font-mono text-lg font-black tracking-[0.16em] text-[#1d4ed8]">
                  {visibleAccessCode ?? "--------"}
                </p>
                <button
                  type="button"
                  onClick={() => void copyAccessCode()}
                  disabled={!visibleAccessCode}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#bfdbfe] bg-white text-[#1d4ed8] transition hover:bg-[#eaf3ff] disabled:cursor-not-allowed disabled:text-slate-300"
                  aria-label="Copiar código"
                  title="Copiar código"
                >
                  <Copy size={15} />
                </button>
              </div>
              {copiedAccessCode && (
                <p className="mt-2 text-center text-xs font-semibold text-emerald-700">
                  Código copiado.
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={isCreatingAccessCode || !selectedAccessCodeOrganization}
              className="h-10 w-full rounded-md bg-[#2563eb] text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isCreatingAccessCode ? "Gerando..." : "Gerar código"}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-md border border-[#d7e3f8] bg-white p-4 shadow-sm shadow-[#0b3a75]/5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-[#10233f]">Festas criadas</h2>
          <span className="text-sm font-semibold text-slate-500">{organizations.length}</span>
        </div>
        <div className="mt-3 divide-y divide-[#dfe8f7]">
          {organizations.map((organization) => (
            <div key={organization.id} className="grid gap-3 py-3 lg:grid-cols-[1.2fr_1fr_1.4fr_auto] lg:items-start">
              <div className="min-w-0">
                <p className="break-words font-semibold text-[#10233f]">{organization.name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {organization.event_date
                    ? new Date(`${organization.event_date}T00:00:00`).toLocaleDateString("pt-BR")
                    : "Data não informada"}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase text-slate-400">Responsáveis</p>
                <p className="mt-1 break-words text-sm text-slate-600">
                  {organization.responsible_group ?? "Não informado"}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase text-slate-400">Caixas</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(organization.cashier_names?.length ? organization.cashier_names : ["Não informado"]).map(
                    (cashier, index) => (
                      <span
                        key={`${organization.id}-${cashier}-${index}`}
                        className="rounded bg-[#eaf3ff] px-2 py-1 text-xs font-bold text-[#1d4ed8]"
                      >
                        {cashier}
                      </span>
                    ),
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <button
                  type="button"
                  onClick={() => void onUpdateOrganizationStatus(organization.id, true)}
                  className={`h-7 rounded px-2 text-[11px] font-semibold uppercase transition ${
                    organization.is_active === false
                      ? "border border-[#d7e3f8] bg-white text-slate-400 hover:bg-[#f0f6ff] hover:text-slate-600"
                      : "bg-emerald-50/70 text-emerald-700"
                  }`}
                >
                  Ativa
                </button>
                <button
                  type="button"
                  onClick={() => void onUpdateOrganizationStatus(organization.id, false)}
                  className={`h-7 rounded px-2 text-[11px] font-semibold uppercase transition ${
                    organization.is_active === false
                      ? "bg-red-50/70 text-red-700"
                      : "border border-[#d7e3f8] bg-white text-slate-400 hover:bg-red-50 hover:text-red-600"
                  }`}
                >
                  Inativa
                </button>
                <button
                  type="button"
                  onClick={() => void onDeleteOrganization(organization.id)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-100 bg-white text-red-500 transition hover:bg-red-50 hover:text-red-700"
                  aria-label={`Excluir evento ${organization.name}`}
                  title="Excluir"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
          {organizations.length === 0 && (
            <p className="py-4 text-sm text-slate-500">Nenhum evento criado ainda.</p>
          )}
        </div>
      </div>

      <div className="rounded-md border border-[#d7e3f8] bg-white p-4 shadow-sm shadow-[#0b3a75]/5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-[#10233f]">Códigos ativos</h2>
          <span className="text-sm font-semibold text-slate-500">{accessCodes.length}</span>
        </div>
        <div className="mt-3 divide-y divide-[#dfe8f7]">
          {accessCodes.map((item) => (
            <div key={item.id} className="grid min-w-0 gap-2 py-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="break-words font-semibold text-[#10233f]">{item.code}</p>
                  <button
                    type="button"
                    onClick={() => void copyCodeValue(item.code)}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#bfdbfe] bg-white text-[#1d4ed8] transition hover:bg-[#eaf3ff]"
                    aria-label={`Copiar código ${item.code}`}
                    title="Copiar código"
                  >
                    <Copy size={14} />
                  </button>
                </div>
                <p className="break-words text-sm text-slate-500">{item.label ?? "Sem descrição"}</p>
              </div>
              <p className="break-words text-sm text-slate-500">
                {item.organization?.name ?? item.organization_id}
              </p>
              <span className="w-fit rounded bg-[#eaf3ff] px-2 py-1 text-xs font-bold uppercase text-[#1d4ed8]">
                {item.is_active ? "ativo" : "inativo"}
              </span>
              <button
                type="button"
                onClick={() => onDeleteAccessCode(item.id)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-100 bg-white text-red-500 transition hover:bg-red-50 hover:text-red-700"
                aria-label={`Excluir código ${item.code}`}
                title="Excluir"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {accessCodes.length === 0 && (
            <p className="py-4 text-sm text-slate-500">Nenhum código criado ainda.</p>
          )}
        </div>
      </div>

      <div className="rounded-md border border-[#d7e3f8] bg-white p-4 shadow-sm shadow-[#0b3a75]/5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-[#10233f]">Contas do sistema</h2>
          <span className="text-sm font-semibold text-slate-500">{systemAccounts.length}</span>
        </div>
        <div className="mt-3 divide-y divide-[#dfe8f7]">
          {systemAccounts.map((account) => (
            <div key={account.id} className="grid min-w-0 gap-2 py-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
              <div className="min-w-0">
                <p className="truncate font-semibold text-[#10233f]">
                  {account.name}
                </p>
                <p className="truncate text-sm text-slate-500">{account.detail}</p>
              </div>
              <span className="w-fit rounded bg-[#eaf3ff] px-2 py-1 text-xs font-bold uppercase text-[#1d4ed8]">
                {account.role}
              </span>
              <span
                className={`w-fit rounded px-2 py-1 text-xs font-bold uppercase ${
                  account.isActive
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {account.isActive ? "ativo" : "inativo"}
              </span>
              <button
                type="button"
                disabled={account.id === officialAdmin.id}
                onClick={() => onDeleteSystemAccount(account.id)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-100 bg-white text-red-500 transition hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                aria-label={`Excluir conta ${account.name}`}
                title="Excluir"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {systemAccounts.length === 0 && (
            <p className="py-4 text-sm text-slate-500">Nenhuma conta carregada.</p>
          )}
        </div>
      </div>
    </section>
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
    <div className="flex min-h-12 flex-col gap-3 rounded-md border border-[#d7e3f8] border-l-4 border-l-[#2563eb] bg-white px-4 py-3 shadow-sm shadow-[#0b3a75]/5 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-base font-bold text-[#10233f]">{title}</h2>
      {action}
    </div>
  );
}

function OrganizationSwitcher({
  activeOrganizationId,
  onChange,
  organizations,
}: {
  activeOrganizationId: string;
  onChange: (organizationId: string) => void;
  organizations: Organization[];
}) {
  const availableOrganizations = organizations.filter((organization) => organization.is_active !== false);
  const hasOrganizations = availableOrganizations.length > 0;

  return (
    <label className="relative col-span-2 flex h-9 min-w-0 items-center rounded-md border border-[#d7e3f8] bg-[#f8fbff] text-sm text-slate-600 transition focus-within:border-[#2563eb] focus-within:ring-2 focus-within:ring-[#2563eb]/15 sm:w-64">
      <select
        value={activeOrganizationId}
        onChange={(event) => onChange(event.target.value)}
        disabled={!hasOrganizations}
        className="h-full w-full appearance-none bg-transparent px-3 pr-9 text-[#10233f] outline-none disabled:cursor-not-allowed disabled:text-slate-400"
        aria-label="Festa selecionada"
      >
        <option value="">{hasOrganizations ? "Selecione o evento" : "Nenhum evento criado"}</option>
        {availableOrganizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[#5b7db2]">
        <ChevronDown size={16} />
      </span>
    </label>
  );
}

function CashierSwitcher({
  cashierName,
  cashierNames,
  onChange,
}: {
  cashierName: string;
  cashierNames: string[];
  onChange: (cashierName: string) => void;
}) {
  const hasCashiers = cashierNames.length > 0;

  return (
    <label className="relative flex h-9 min-w-0 items-center rounded-md border border-[#d7e3f8] bg-[#f8fbff] text-sm text-slate-600 transition focus-within:border-[#2563eb] focus-within:ring-2 focus-within:ring-[#2563eb]/15 sm:w-44">
      <select
        value={cashierName}
        onChange={(event) => onChange(event.target.value)}
        disabled={!hasCashiers}
        className="h-full w-full appearance-none bg-transparent px-3 pr-9 text-[#10233f] outline-none disabled:cursor-not-allowed disabled:text-slate-400"
        aria-label="Vendedor do caixa"
      >
        <option value="">{hasCashiers ? "Selecione o vendedor" : "Sem vendedores"}</option>
        {cashierNames.map((cashier) => (
          <option key={cashier} value={cashier}>
            {cashier}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[#5b7db2]">
        <ChevronDown size={16} />
      </span>
    </label>
  );
}

function ProductForm({
  isCreatingProduct,
  onSubmit,
  onUpdate,
  productForm,
}: {
  isCreatingProduct: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdate: (field: keyof typeof initialProductForm, value: string) => void;
  productForm: typeof initialProductForm;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-md border border-[#d7e3f8] bg-white p-4 shadow-md shadow-[#0b3a75]/5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <input value={productForm.name} onChange={(event) => onUpdate("name", event.target.value)} placeholder="Produto" className="h-10 min-w-0 rounded-md border border-[#d7e3f8] bg-white px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15 xl:col-span-2" />
      <input value={productForm.category} onChange={(event) => onUpdate("category", event.target.value)} placeholder="Categoria" className="h-10 min-w-0 rounded-md border border-[#d7e3f8] bg-white px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15" />
      <input value={productForm.responsibleName} onChange={(event) => onUpdate("responsibleName", event.target.value)} placeholder="Responsável" className="h-10 min-w-0 rounded-md border border-[#d7e3f8] bg-white px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15" />
      <label className="flex h-10 min-w-0 items-center rounded-md border border-[#d7e3f8] bg-white text-sm transition focus-within:border-[#2563eb] focus-within:ring-2 focus-within:ring-[#2563eb]/15">
        <span className="px-3 font-semibold text-slate-500">R$</span>
        <input value={productForm.salePrice} onChange={(event) => onUpdate("salePrice", event.target.value)} placeholder="Valor de venda" inputMode="numeric" className="h-full min-w-0 flex-1 bg-transparent pr-3 outline-none" />
      </label>
      <label className="flex h-10 min-w-0 items-center rounded-md border border-[#d7e3f8] bg-white text-sm transition focus-within:border-[#2563eb] focus-within:ring-2 focus-within:ring-[#2563eb]/15">
        <span className="px-3 font-semibold text-slate-500">R$</span>
        <input value={productForm.unitCost} onChange={(event) => onUpdate("unitCost", event.target.value)} placeholder="Custo" inputMode="numeric" className="h-full min-w-0 flex-1 bg-transparent pr-3 outline-none" />
      </label>
      <input value={productForm.stockQuantity} onChange={(event) => onUpdate("stockQuantity", event.target.value)} placeholder="Estoque" inputMode="numeric" pattern="[0-9]*" className="h-10 min-w-0 rounded-md border border-[#d7e3f8] bg-white px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15" />
      <button type="submit" disabled={isCreatingProduct} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#2563eb] px-4 text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-slate-300 xl:col-span-2">
        <Plus size={15} />
        {isCreatingProduct ? "Cadastrando..." : "Cadastrar produto"}
      </button>
    </form>
  );
}

function EditableProductList({
  onChangeDraft,
  onResetDraft,
  onSave,
  onStatusChange,
  productDrafts,
  products,
  savingProductId,
}: {
  onChangeDraft: (product: Product, field: keyof ProductDraft, value: string) => void;
  onResetDraft: (productId: string) => void;
  onSave: (
    productId: string,
    draftOverride?: ProductDraft,
    promotionOverride?: ProductPromotionUpdate,
  ) => Promise<void>;
  onStatusChange: (message: string) => void;
  productDrafts: Record<string, ProductDraft>;
  products: Product[];
  savingProductId: string | null;
}) {
  const [openPanels, setOpenPanels] = useState<Record<string, "edit" | "promo" | undefined>>({});
  const [promoDrafts, setPromoDrafts] = useState<Record<string, ProductPromotionDraft>>({});

  if (!products.length) {
    return (
      <div className="rounded-md border border-dashed border-[#bfd4f2] bg-white px-4 py-5 text-sm text-slate-500">
        Os produtos cadastrados vão aparecer aqui para edição rápida.
      </div>
    );
  }

  function togglePanel(productId: string, panel: "edit" | "promo") {
    setOpenPanels((current) => ({
      ...current,
      [productId]: current[productId] === panel ? undefined : panel,
    }));
  }

  function updatePromoDraft(product: Product, field: keyof ProductPromotionDraft, value: string) {
    setPromoDrafts((current) => ({
      ...current,
      [product.id]: {
        ...(current[product.id] ?? createPromotionDraft(product)),
        [field]:
          field === "value"
            ? normalizeCurrencyInput(value)
            : field === "minQuantity"
              ? normalizeIntegerInput(value)
              : value,
      },
    }));
  }

  async function savePromotion(product: Product) {
    const promoDraft = promoDrafts[product.id] ?? createPromotionDraft(product);
    const promoValue = parseNumber(promoDraft.value);

    if (!Number.isFinite(promoValue) || promoValue < 0) {
      onStatusChange("Informe um valor válido para a promoção.");
      return;
    }

    const baseDraft = productDrafts[product.id] ?? createProductDraft(product);

    if (promoDraft.mode === "discount") {
      const minQuantity = Number.parseInt(promoDraft.minQuantity, 10);
      const currentSalePrice = parseNumber(baseDraft.salePrice);

      if (!Number.isInteger(minQuantity) || minQuantity < 2) {
        onStatusChange("Informe a partir de quantas unidades o desconto vai valer.");
        return;
      }

      if (!Number.isFinite(promoValue) || promoValue <= 0) {
        onStatusChange("Informe o valor promocional para essa quantidade.");
        return;
      }

      if (!Number.isFinite(currentSalePrice)) {
        onStatusChange("Não consegui aplicar a promoção porque o valor de venda atual está inválido.");
        return;
      }

      const regularTotal = currentSalePrice * minQuantity;

      if (promoValue >= regularTotal) {
        onStatusChange("O valor promocional precisa ser menor que o total sem desconto.");
        return;
      }

      const discountAmount = regularTotal - promoValue;

      await onSave(product.id, baseDraft, {
        promo_min_quantity: minQuantity,
        promo_discount_amount: discountAmount,
        original_sale_price: product.original_sale_price ?? null,
      });
      setPromoDrafts((current) => {
        const next = { ...current };
        delete next[product.id];
        return next;
      });
      setOpenPanels((current) => ({ ...current, [product.id]: undefined }));
      return;
    }

    const nextDraft: ProductDraft = {
      ...baseDraft,
      salePrice: formatCurrencyInputFromNumber(promoValue),
    };

    await onSave(product.id, nextDraft, {
      promo_min_quantity: null,
      promo_discount_amount: null,
      original_sale_price: product.original_sale_price ?? product.sale_price,
    });
    setPromoDrafts((current) => {
      const next = { ...current };
      delete next[product.id];
      return next;
    });
    setOpenPanels((current) => ({ ...current, [product.id]: undefined }));
  }

  async function removePromotion(product: Product) {
    const baseDraft = productDrafts[product.id] ?? createProductDraft(product);

    await onSave(product.id, baseDraft, {
      promo_min_quantity: null,
      promo_discount_amount: null,
      original_sale_price: product.original_sale_price ?? null,
    });
    setPromoDrafts((current) => {
      const next = { ...current };
      delete next[product.id];
      return next;
    });
    setOpenPanels((current) => ({ ...current, [product.id]: undefined }));
  }

  async function removePriceChange(product: Product) {
    if (typeof product.original_sale_price !== "number") {
      return;
    }

    const baseDraft = productDrafts[product.id] ?? createProductDraft(product);
    const nextDraft: ProductDraft = {
      ...baseDraft,
      salePrice: formatCurrencyInputFromNumber(product.original_sale_price),
    };

    await onSave(product.id, nextDraft, {
      promo_min_quantity: product.promo_min_quantity ?? null,
      promo_discount_amount: product.promo_discount_amount ?? null,
      original_sale_price: null,
    });
    setPromoDrafts((current) => {
      const next = { ...current };
      delete next[product.id];
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <SectionHeader title="Produtos salvos" />
      <div className="grid gap-3">
        {products.map((product) => {
          const draft = productDrafts[product.id] ?? createProductDraft(product);
          const openPanel = openPanels[product.id];
          const promoDraft = promoDrafts[product.id] ?? createPromotionDraft(product);
          const promotion = getProductPromotion(product);
          const promotionSummary = getPromotionSummary(product);
          const promotionalTotal = promotion ? getPromotionalPackageTotal(product, promotion) : 0;
          const originalSalePrice =
            typeof product.original_sale_price === "number" ? product.original_sale_price : null;
          const hasPriceChange = originalSalePrice !== null && originalSalePrice !== product.sale_price;

          return (
            <article
              key={product.id}
              className="rounded-md border border-[#d7e3f8] bg-white p-4 shadow-sm shadow-[#0b3a75]/5"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="break-words text-base font-bold text-[#10233f]">{product.name}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {product.category} - Responsável: {product.group?.name ?? "Sem responsável"}
                  </p>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-5">
                  <div className="rounded-md bg-[#f8fbff] px-3 py-2 text-sm">
                    <p className="text-slate-500">Venda</p>
                    <p className={`font-bold text-[#1d4ed8] ${hasPriceChange ? "line-through" : ""}`}>
                      {currency.format(hasPriceChange ? originalSalePrice : product.sale_price)}
                    </p>
                  </div>
                  {hasPriceChange && (
                    <div className="relative rounded-md border border-[#2563eb] bg-[#2563eb] px-3 py-2 pr-8 text-sm text-white">
                      <p className="text-white/80">Novo valor</p>
                      <p className="font-black">{currency.format(product.sale_price)}</p>
                      <button
                        type="button"
                        aria-label="Remover novo valor"
                        onClick={() => void removePriceChange(product)}
                        disabled={savingProductId === product.id}
                        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded border border-white/25 text-xs font-black text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        x
                      </button>
                    </div>
                  )}
                  {promotion && (
                    <div className="relative rounded-md border border-[#2563eb] bg-[#2563eb] px-3 py-2 pr-8 text-sm text-white">
                      <p className="text-white/80">Promoção</p>
                      <p className="font-black">
                        {promotion.minQuantity} por {currency.format(promotionalTotal)}
                      </p>
                      <button
                        type="button"
                        aria-label="Remover promoção"
                        onClick={() => void removePromotion(product)}
                        disabled={savingProductId === product.id}
                        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded border border-white/25 text-xs font-black text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        x
                      </button>
                    </div>
                  )}
                  <div className="rounded-md bg-[#f8fbff] px-3 py-2 text-sm">
                    <p className="text-slate-500">Custo</p>
                    <p className="font-semibold">{currency.format(product.unit_cost)}</p>
                  </div>
                  <div className="rounded-md bg-[#f8fbff] px-3 py-2 text-sm">
                    <p className="text-slate-500">Estoque</p>
                    <p className="font-semibold">{product.stock_quantity}</p>
                  </div>
                  <div className="rounded-md bg-[#f8fbff] px-3 py-2 text-sm">
                    <p className="text-slate-500">Lucro</p>
                    <p className="font-semibold text-[#2563eb]">
                      {currency.format(product.sale_price - product.unit_cost)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => togglePanel(product.id, "edit")}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-[#d7e3f8] bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-[#2563eb] hover:text-[#1d4ed8]"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => togglePanel(product.id, "promo")}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-[#d7e3f8] bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-[#2563eb] hover:text-[#1d4ed8]"
                >
                  Promoção
                </button>
              </div>

              {openPanel === "edit" && (
                <div className="mt-4 space-y-3 rounded-md border border-[#d7e3f8] bg-[#f8fbff] p-3">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_1fr_120px_auto]">
                    <input
                      value={draft.name}
                      onChange={(event) => onChangeDraft(product, "name", event.target.value)}
                      placeholder="Produto"
                      className="h-10 min-w-0 rounded-md border border-[#d7e3f8] bg-white px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
                    />
                    <input
                      value={draft.category}
                      onChange={(event) => onChangeDraft(product, "category", event.target.value)}
                      placeholder="Categoria"
                      className="h-10 min-w-0 rounded-md border border-[#d7e3f8] bg-white px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
                    />
                    <input
                      value={draft.responsibleName}
                      onChange={(event) => onChangeDraft(product, "responsibleName", event.target.value)}
                      placeholder="Responsável"
                      className="h-10 min-w-0 rounded-md border border-[#d7e3f8] bg-white px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
                    />
                    <label className="flex h-10 min-w-0 items-center rounded-md border border-[#d7e3f8] bg-white text-sm transition focus-within:border-[#2563eb] focus-within:ring-2 focus-within:ring-[#2563eb]/15">
                      <span className="px-3 font-semibold text-slate-500">R$</span>
                      <input
                        value={draft.salePrice}
                        onChange={(event) => onChangeDraft(product, "salePrice", event.target.value)}
                        placeholder="Valor de venda"
                        inputMode="numeric"
                        className="h-full min-w-0 flex-1 bg-transparent pr-3 outline-none"
                      />
                    </label>
                    <label className="flex h-10 min-w-0 items-center rounded-md border border-[#d7e3f8] bg-white text-sm transition focus-within:border-[#2563eb] focus-within:ring-2 focus-within:ring-[#2563eb]/15">
                      <span className="px-3 font-semibold text-slate-500">R$</span>
                      <input
                        value={draft.unitCost}
                        onChange={(event) => onChangeDraft(product, "unitCost", event.target.value)}
                        placeholder="Custo"
                        inputMode="numeric"
                        className="h-full min-w-0 flex-1 bg-transparent pr-3 outline-none"
                      />
                    </label>
                    <input
                      value={draft.stockQuantity}
                      onChange={(event) => onChangeDraft(product, "stockQuantity", event.target.value)}
                      placeholder="Estoque"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="h-10 min-w-0 rounded-md border border-[#d7e3f8] bg-white px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">
                      Salve aqui para atualizar o produto no caixa também.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onResetDraft(product.id);
                          setOpenPanels((current) => ({ ...current, [product.id]: undefined }));
                        }}
                        className="inline-flex h-10 items-center justify-center rounded-md border border-[#d7e3f8] bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-[#f0f6ff]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void (async () => {
                            await onSave(product.id);
                            setOpenPanels((current) => ({ ...current, [product.id]: undefined }));
                          })()
                        }
                        disabled={savingProductId === product.id}
                        className="inline-flex h-10 items-center justify-center rounded-md bg-[#2563eb] px-4 text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {savingProductId === product.id ? "Salvando..." : "Salvar alterações"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {openPanel === "promo" && (
                <div className="mt-4 space-y-3 rounded-md border border-[#d7e3f8] bg-[#f8fbff] p-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => updatePromoDraft(product, "mode", "price")}
                      className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-bold transition ${
                        promoDraft.mode === "price"
                          ? "border-[#2563eb] bg-[#2563eb] text-white"
                          : "border-[#d7e3f8] bg-white text-slate-700 hover:border-[#2563eb]"
                      }`}
                    >
                      Novo valor
                    </button>
                    <button
                      type="button"
                      onClick={() => updatePromoDraft(product, "mode", "discount")}
                      className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-bold transition ${
                        promoDraft.mode === "discount"
                          ? "border-[#2563eb] bg-[#2563eb] text-white"
                          : "border-[#d7e3f8] bg-white text-slate-700 hover:border-[#2563eb]"
                      }`}
                    >
                      Desconto
                    </button>
                  </div>
                  {promoDraft.mode === "discount" && (
                    <input
                      value={promoDraft.minQuantity}
                      onChange={(event) => updatePromoDraft(product, "minQuantity", event.target.value)}
                      placeholder="Quantidade da promoção"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="h-10 max-w-xs min-w-0 rounded-md border border-[#d7e3f8] bg-white px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
                    />
                  )}
                  <label className="flex h-10 max-w-xs min-w-0 items-center rounded-md border border-[#d7e3f8] bg-white text-sm transition focus-within:border-[#2563eb] focus-within:ring-2 focus-within:ring-[#2563eb]/15">
                    <span className="px-3 font-semibold text-slate-500">R$</span>
                    <input
                      value={promoDraft.value}
                      onChange={(event) => updatePromoDraft(product, "value", event.target.value)}
                      placeholder={
                        promoDraft.mode === "price" ? "Novo valor" : "Valor promocional do pacote"
                      }
                      inputMode="numeric"
                      className="h-full min-w-0 flex-1 bg-transparent pr-3 outline-none"
                    />
                  </label>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">
                      {promoDraft.mode === "price"
                        ? "O novo valor substitui o preço normal do produto."
                        : "Use como pacote promocional: por exemplo, 2 unidades por R$ 10,00."}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPromoDrafts((current) => {
                            const next = { ...current };
                            delete next[product.id];
                            return next;
                          });
                          setOpenPanels((current) => ({ ...current, [product.id]: undefined }));
                        }}
                        className="inline-flex h-10 items-center justify-center rounded-md border border-[#d7e3f8] bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-[#f0f6ff]"
                      >
                        Cancelar
                      </button>
                      {promotionSummary && (
                        <button
                          type="button"
                          onClick={() => void removePromotion(product)}
                          disabled={savingProductId === product.id}
                          className="inline-flex h-10 items-center justify-center rounded-md border border-red-200 bg-white px-4 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                        >
                          Remover promoção
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void savePromotion(product)}
                        disabled={savingProductId === product.id}
                        className="inline-flex h-10 items-center justify-center rounded-md bg-[#2563eb] px-4 text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {savingProductId === product.id ? "Salvando..." : "Salvar promoção"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
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
        const promotionSummary = getPromotionSummary(product);
        const originalSalePrice =
          typeof product.original_sale_price === "number" ? product.original_sale_price : null;
        const hasPriceChange = originalSalePrice !== null && originalSalePrice !== product.sale_price;
        const content = (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="break-words font-bold text-[#10233f]">{product.name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {product.category} - Responsável: {product.group?.name ?? "Sem responsável"}
                </p>
                {promotionSummary && (
                  <p className="mt-2 text-xs font-semibold text-[#2563eb]">{promotionSummary}</p>
                )}
              </div>
              <div className="flex w-fit shrink-0 flex-wrap items-center justify-end gap-2">
                {hasPriceChange && (
                  <span className="rounded bg-[#f1f5f9] px-2 py-1 text-sm font-bold text-slate-400 line-through">
                    {currency.format(originalSalePrice)}
                  </span>
                )}
                <span className="rounded bg-[#eaf3ff] px-2 py-1 text-sm font-black text-[#1d4ed8]">
                  {currency.format(product.sale_price)}
                </span>
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-1 gap-2 text-sm min-[420px]:grid-cols-3">
              <div className="min-w-0">
                <dt className="text-slate-500">Custo</dt>
                <dd className="break-words font-semibold">{currency.format(product.unit_cost)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-slate-500">Lucro</dt>
                <dd className="break-words font-semibold text-[#2563eb]">
                  {currency.format(product.sale_price - product.unit_cost)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-slate-500">Estoque</dt>
                <dd className="font-semibold">{product.stock_quantity}</dd>
              </div>
            </dl>
          </>
        );

        const stripe = index % 2 === 0 ? "bg-white" : "bg-[#f8fbff]";

        if (mode === "sale") {
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => onProductClick?.(product)}
              className={`min-h-32 rounded-md border border-[#d7e3f8] p-4 text-left shadow-sm shadow-[#0b3a75]/5 transition hover:border-[#2563eb] hover:shadow-md hover:shadow-[#0b3a75]/10 ${stripe}`}
            >
              {content}
            </button>
          );
        }

        return (
          <article key={product.id} className={`rounded-md border border-[#d7e3f8] p-4 shadow-sm shadow-[#0b3a75]/5 ${stripe}`}>
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
    <aside className="h-fit rounded-md border border-[#d7e3f8] bg-white p-4 shadow-md shadow-[#0b3a75]/5 xl:sticky xl:top-5">
      <div className="flex items-center justify-between border-b border-[#d7e3f8] pb-3">
        <h2 className="text-base font-bold text-[#10233f]">Venda atual</h2>
        <ReceiptText size={20} className="text-[#2563eb]" />
      </div>

      <div className="mt-4 space-y-3">
        {cart.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center rounded-md border border-dashed border-[#bfd4f2] bg-[#f8fbff] text-center text-sm text-slate-500">
            <ShoppingBasket className="mb-2 text-[#2563eb]" size={24} />
            Selecione produtos para montar a venda.
          </div>
        ) : (
          cart.map((item) => {
            const lineTotal = getProductLineTotal(item.product, item.quantity);
            const promotion = getProductPromotion(item.product);
            const promotionReached = Boolean(
              promotion && item.quantity >= promotion.minQuantity,
            );
            const promotionalTotal = promotion ? getPromotionalPackageTotal(item.product, promotion) : 0;
            const promotionalPackages = promotion ? Math.floor(item.quantity / promotion.minQuantity) : 0;
            const regularUnits = promotion ? item.quantity % promotion.minQuantity : item.quantity;
            const originalSalePrice =
              typeof item.product.original_sale_price === "number"
                ? item.product.original_sale_price
                : null;
            const hasPriceChange =
              originalSalePrice !== null && originalSalePrice !== item.product.sale_price;

            return (
              <div key={item.product.id} className="rounded-md border border-[#d7e3f8] bg-[#f8fbff] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{item.product.name}</p>
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      {hasPriceChange && (
                        <span className="text-slate-400 line-through">
                          {currency.format(originalSalePrice)} cada
                        </span>
                      )}
                      <span className={hasPriceChange ? "font-bold text-[#1d4ed8]" : "text-slate-500"}>
                        {currency.format(item.product.sale_price)} cada
                      </span>
                    </p>
                    {promotion && (
                      <p className="mt-1 text-xs font-medium text-[#2563eb]">
                        {promotionReached
                          ? `Promoção ativa: ${promotionalPackages}x ${promotion.minQuantity} por ${currency.format(
                              promotionalTotal,
                            )}${regularUnits ? ` + ${regularUnits} no valor normal` : ""}`
                          : `A partir de ${promotion.minQuantity} unidades: ${promotion.minQuantity} por ${currency.format(
                              promotionalTotal,
                            )}`}
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 font-bold">
                    {currency.format(lineTotal)}
                  </p>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button type="button" aria-label="Diminuir quantidade" onClick={() => onChangeQuantity(item.product.id, -1)} className="flex h-9 w-9 items-center justify-center rounded-md border border-[#d7e3f8] bg-white transition hover:border-[#2563eb]">
                    <Minus size={16} />
                  </button>
                  <span className="flex h-9 min-w-12 items-center justify-center rounded-md bg-white px-3 text-sm font-bold text-[#1d4ed8]">
                    {item.quantity}
                  </span>
                  <button type="button" aria-label="Aumentar quantidade" onClick={() => onChangeQuantity(item.product.id, 1)} className="flex h-9 w-9 items-center justify-center rounded-md border border-[#d7e3f8] bg-white transition hover:border-[#2563eb]">
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 min-[420px]:grid-cols-4">
        {paymentOptions.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => onChangePayment(value)}
            className={`h-9 rounded-md border text-xs font-bold transition ${
              paymentMethod === value
                ? "border-[#2563eb] bg-[#2563eb] text-white"
                : "border-[#d7e3f8] bg-white text-slate-700 hover:border-[#2563eb]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <dl className="mt-5 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Total</dt>
          <dd className="text-right font-bold">{currency.format(cartTotal)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Lucro líquido previsto</dt>
          <dd className="text-right font-bold text-[#2563eb]">{currency.format(cartProfit)}</dd>
        </div>
      </dl>

      <button
        type="button"
        disabled={!cart.length || isSaving}
        onClick={onFinishSale}
        className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#2563eb] px-4 font-bold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <ReceiptText size={18} />
        {isSaving ? "Registrando..." : "Finalizar venda"}
      </button>
    </aside>
  );
}

function SalesList({ sales }: { sales: RecentSale[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-[#d7e3f8] bg-white p-3 shadow-md shadow-[#0b3a75]/5 sm:p-4">
      <div className="divide-y divide-[#dfe8f7]">
        {sales.map((sale, index) => (
          <div key={sale.id} className={`grid min-w-0 gap-2 rounded-md px-2 py-4 first:pt-3 last:pb-3 min-[420px]:grid-cols-[1fr_auto_auto] min-[420px]:items-center sm:gap-3 sm:px-3 ${index % 2 === 0 ? "bg-white" : "bg-[#f8fbff]"}`}>
            <div className="min-w-0">
              <p className="font-medium text-[#10233f]">
                {paymentLabels[sale.payment_method] ?? sale.payment_method}
              </p>
              <p className="text-sm text-slate-500">
                {new Date(sale.created_at).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                - {sale.cashier_name ?? "Sem caixa"}
              </p>
            </div>
            <p className="font-bold min-[420px]:text-right">{currency.format(sale.gross_total)}</p>
            <p className="font-semibold text-[#2563eb] min-[420px]:text-right">+{currency.format(sale.profit_total)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ItemsBreakdownModal({
  breakdown,
  totalItems,
  onClose,
}: {
  breakdown: Array<{ product: Product; quantity: number }>;
  totalItems: number;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="items-breakdown-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b3a75]/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-md border border-[#d7e3f8] bg-white shadow-xl shadow-[#0b3a75]/15"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#d7e3f8] p-4 sm:p-5">
          <div>
            <h2 id="items-breakdown-title" className="text-lg font-black text-[#10233f]">
              Itens vendidos por produto
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Total no evento: <strong className="text-[#10233f]">{totalItems}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#d7e3f8] text-slate-600 transition hover:bg-[#f0f6ff]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4 sm:p-5">
          {breakdown.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum produto cadastrado para esta organização.</p>
          ) : (
            <ul className="divide-y divide-[#e3ecfb]">
              {breakdown.map(({ product, quantity }) => (
                <li key={product.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#10233f]">{product.name}</p>
                    {product.category && (
                      <p className="truncate text-xs text-slate-500">{product.category}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-md bg-[#f0f6ff] px-2.5 py-1 text-sm font-bold text-[#2563eb]">
                    {quantity}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function CashierBreakdownModal({
  breakdown,
  totalSales,
  totalRevenue,
  onClose,
}: {
  breakdown: Array<{ name: string; count: number; revenue: number; profit: number }>;
  totalSales: number;
  totalRevenue: number;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cashier-breakdown-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b3a75]/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-md border border-[#d7e3f8] bg-white shadow-xl shadow-[#0b3a75]/15"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#d7e3f8] p-4 sm:p-5">
          <div>
            <h2 id="cashier-breakdown-title" className="text-lg font-black text-[#10233f]">
              Vendas por vendedor
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {totalSales} {totalSales === 1 ? "venda" : "vendas"} •{" "}
              <strong className="text-[#10233f]">{currency.format(totalRevenue)}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#d7e3f8] text-slate-600 transition hover:bg-[#f0f6ff]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4 sm:p-5">
          {breakdown.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma venda registrada até agora.</p>
          ) : (
            <ul className="divide-y divide-[#e3ecfb]">
              {breakdown.map(({ name, count, revenue, profit }) => (
                <li key={name} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#10233f]">{name}</p>
                    <p className="text-xs text-slate-500">
                      {count} {count === 1 ? "venda" : "vendas"} • Lucro {currency.format(profit)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-[#f0f6ff] px-2.5 py-1 text-sm font-bold text-[#2563eb]">
                    {currency.format(revenue)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="flex items-center gap-2 text-sm font-bold text-[#2563eb]">
        {icon}
        {label}
      </div>
      <p className="mt-3 break-words text-xl font-black tracking-normal text-[#10233f] sm:text-2xl">{value}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="min-w-0 rounded-md border border-[#d7e3f8] bg-white p-4 text-left shadow-sm shadow-[#0b3a75]/5 transition hover:border-[#2563eb] hover:bg-[#f0f6ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="min-w-0 rounded-md border border-[#d7e3f8] bg-white p-4 shadow-sm shadow-[#0b3a75]/5">
      {content}
    </div>
  );
}

