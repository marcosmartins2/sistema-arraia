"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Image from "next/image";
import {
  Banknote,
  BarChart3,
  Building2,
  CircleDollarSign,
  LogOut,
  Mail,
  Minus,
  Package,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBasket,
  Ticket,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";
import {
  demoOrganizationId,
  demoGroups,
  demoProducts,
  demoRecentSales,
  demoReport,
} from "@/lib/demo-data";
import {
  adminUsersUrl,
  dashboardDataUrl,
  isSupabaseConfigured,
  registerSaleUrl,
  supabase,
} from "@/lib/supabase";
import type {
  Group,
  Organization,
  OrganizationAccessCode,
  OrganizationMember,
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

const initialAuthForm = {
  email: "",
  password: "",
  fullName: "",
  accessCode: "",
};

const initialOrganizationForm = {
  name: "",
  slug: "",
};

const initialMemberForm = {
  email: "",
  organizationId: "",
  role: "member",
};

const initialGroupForm = {
  name: "",
  acronym: "",
};

const initialAccessCodeForm = {
  code: "",
  label: "",
  organizationId: "",
};

type DashboardView = "cashier" | "products" | "report" | "sales" | "admin";
type AuthMode = "code" | "sign-in";
type AppUser = {
  id: string;
  email?: string;
};

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
  return Number(value.replace(",", "."));
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

export default function ArraiaDashboard() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [memberships, setMemberships] = useState<OrganizationMember[]>([]);
  const [accessCodes, setAccessCodes] = useState<OrganizationAccessCode[]>([]);
  const [adminProfiles, setAdminProfiles] = useState<Profile[]>([]);
  const [authMode, setAuthMode] = useState<AuthMode>("code");
  const [authForm, setAuthForm] = useState(initialAuthForm);
  const [accessCode, setAccessCode] = useState("");
  const [organizationForm, setOrganizationForm] = useState(initialOrganizationForm);
  const [memberForm, setMemberForm] = useState(initialMemberForm);
  const [groupForm, setGroupForm] = useState(initialGroupForm);
  const [accessCodeForm, setAccessCodeForm] = useState(initialAccessCodeForm);
  const [groups, setGroups] = useState<Group[]>(demoGroups);
  const [products, setProducts] = useState<Product[]>(demoProducts);
  const [report, setReport] = useState<SaleReport>(demoReport);
  const [recentSales, setRecentSales] = useState<RecentSale[]>(demoRecentSales);
  const [cart, setCart] = useState<SaleItemDraft[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [cashierName, setCashierName] = useState("Caixa 1");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeView, setActiveView] = useState<DashboardView>("cashier");
  const [activeOrganizationId, setActiveOrganizationId] = useState(demoOrganizationId);
  const [productForm, setProductForm] = useState(initialProductForm);
  const [status, setStatus] = useState(
    isSupabaseConfigured
      ? "Conectando ao Supabase..."
      : "Modo demonstrativo: preencha o .env.local para usar dados reais.",
  );
  const [isAuthReady, setIsAuthReady] = useState(!isSupabaseConfigured);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [isCreatingOrganization, setIsCreatingOrganization] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isCreatingAccessCode, setIsCreatingAccessCode] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  async function loadData({ announce = true } = {}) {
    if (accessCode) {
      await loadDataByAccessCode(accessCode, { announce });
      return;
    }

    if (!supabase) return;

    if (announce) {
      setStatus("Atualizando dados...");
    }

    const [profileResult, organizationsResult, membershipsResult] = await Promise.all([
      supabase.from("profiles").select("*").maybeSingle(),
      supabase.from("organizations").select("*").order("name"),
      supabase
        .from("organization_members")
        .select("*, organization:organizations(*), profile:profiles(*)")
        .order("created_at", { ascending: false }),
    ]);

    if (profileResult.error || organizationsResult.error || membershipsResult.error) {
      setStatus("Nao foi possivel carregar as organizacoes. Confira as migrations e o login.");
      return;
    }

    const nextProfile = profileResult.data as Profile | null;
    const nextOrganizations = (organizationsResult.data ?? []) as Organization[];
    const nextMemberships = (membershipsResult.data ?? []) as OrganizationMember[];
    const organizationId =
      nextOrganizations.find((organization) => organization.id === activeOrganizationId)?.id ??
      nextOrganizations[0]?.id;

    if (!organizationId) {
      setStatus("Nenhuma organizacao disponivel para este usuario.");
      setOrganizations([]);
      setMemberships([]);
      setGroups([]);
      setProducts([]);
      return;
    }

    setProfile(nextProfile);
    setOrganizations(nextOrganizations);
    setMemberships(nextMemberships);
    setActiveOrganizationId(organizationId);
    setMemberForm((current) => ({
      ...current,
      organizationId: current.organizationId || organizationId,
    }));
    setAccessCodeForm((current) => ({
      ...current,
      organizationId: current.organizationId || organizationId,
    }));

    if (nextProfile?.role === "admin") {
      const [profilesResult, codesResult] = await Promise.all([
        supabase.from("profiles").select("*").order("email"),
        supabase
          .from("organization_access_codes")
          .select("*, organization:organizations(*)")
          .order("created_at", { ascending: false }),
      ]);
      if (!profilesResult.error) {
        setAdminProfiles((profilesResult.data ?? []) as Profile[]);
      }
      if (!codesResult.error) {
        setAccessCodes((codesResult.data ?? []) as OrganizationAccessCode[]);
      }
    } else {
      setAdminProfiles([]);
      setAccessCodes([]);
    }

    const [groupsResult, productsResult, reportResult, salesResult] = await Promise.all([
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
    ]);

    if (groupsResult.error || productsResult.error || reportResult.error || salesResult.error) {
      setStatus("Não foi possível carregar tudo. Confira as variáveis de ambiente e migrations.");
      return;
    }

    setGroups(groupsResult.data ?? []);
    setProducts(productsResult.data ?? []);
    setReport((reportResult.data as SaleReport | null) ?? { ...demoReport, organization_id: organizationId });
    setRecentSales((salesResult.data ?? []) as RecentSale[]);
    setStatus("Dados sincronizados com Supabase.");
  }

  async function loadDataByAccessCode(code: string, { announce = true } = {}) {
    const normalizedCode = code.trim().toUpperCase();

    if (!normalizedCode) return;

    if (announce) {
      setStatus("Atualizando dados...");
    }

    if (!dashboardDataUrl) {
      setStatus("Modo demonstrativo sincronizado localmente.");
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
      setStatus(payload?.error ?? "Nao foi possivel carregar os dados do codigo.");
      return;
    }

    const organization = payload.organization as Organization;
    setOrganizations([organization]);
    setActiveOrganizationId(organization.id);
    setGroups((payload.groups ?? []) as Group[]);
    setProducts((payload.products ?? []) as Product[]);
    setReport((payload.report as SaleReport | null) ?? { ...demoReport, organization_id: organization.id });
    setRecentSales((payload.recentSales ?? []) as RecentSale[]);
    setStatus("Dados sincronizados pelo codigo.");
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
        setMemberships([]);
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

    queueMicrotask(() => {
      void loadData({ announce: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, activeOrganizationId]);

  useEffect(() => {
    if (!accessCode && !user) return;

    const interval = window.setInterval(() => {
      void loadData({ announce: false });
    }, 5000);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessCode, user?.id, activeOrganizationId]);

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

  const visibleDashboardViews = dashboardViews.filter(
    (view) => view.id !== "admin" || profile?.role === "admin",
  );
  const activeLabel = visibleDashboardViews.find((view) => view.id === activeView)?.label ?? "Caixa";
  const activeOrganization = organizations.find((organization) => organization.id === activeOrganizationId);

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
      organization_id: activeOrganizationId,
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

    if (!isSupabaseConfigured || !registerSaleUrl || !supabase) {
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

    const sessionResult = await supabase.auth.getSession();
    const accessToken = sessionResult.data.session?.access_token;

    if (!accessToken && !accessCode) {
      setIsSaving(false);
      setStatus("Entre com o codigo da festa para registrar vendas.");
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

    if (authMode === "code") {
      const code = authForm.accessCode.trim().toUpperCase();

      if (!code) {
        setStatus("Informe o codigo da festa.");
        return;
      }

      if (!dashboardDataUrl) {
        setAccessCode(code);
        setUser({ id: `code-${code}`, email: `${code}@acesso.local` });
        setProfile({ id: `code-${code}`, email: null, full_name: "Equipe de vendas", role: "member" });
        setOrganizations([
          {
            id: demoOrganizationId,
            name: "Arraia Parafuso Solto",
            slug: "arraia-parafuso-solto",
            created_by: null,
          },
        ]);
        setActiveOrganizationId(demoOrganizationId);
        setAuthForm(initialAuthForm);
        setStatus("Codigo aceito no modo demonstrativo.");
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
        setStatus(payload?.error ?? "Codigo invalido.");
        return;
      }

      const organization = payload.organization as Organization;
      setAccessCode(code);
      setUser({ id: `code-${code}`, email: `${code}@acesso.local` });
      setProfile({ id: `code-${code}`, email: null, full_name: "Equipe de vendas", role: "member" });
      setOrganizations([organization]);
      setActiveOrganizationId(organization.id);
      setGroups((payload.groups ?? []) as Group[]);
      setProducts((payload.products ?? []) as Product[]);
      setReport((payload.report as SaleReport | null) ?? { ...demoReport, organization_id: organization.id });
      setRecentSales((payload.recentSales ?? []) as RecentSale[]);
      setAuthForm(initialAuthForm);
      setStatus("Codigo aceito. Dados sincronizados.");
      return;
    }

    if (!supabase) {
      setStatus("Login admin real precisa do Supabase configurado.");
      return;
    }

    const email = authForm.email.trim();
    const password = authForm.password;

    if (!email || !password) {
      setStatus("Informe email e senha.");
      return;
    }

    setIsSubmittingAuth(true);
    setStatus(authMode === "sign-in" ? "Entrando..." : "Criando conta...");

    const result = await supabase.auth.signInWithPassword({ email, password });

    setIsSubmittingAuth(false);

    if (result.error) {
      setStatus(result.error.message);
      return;
    }

    setAuthForm(initialAuthForm);
    setStatus("Login realizado.");
  }

  async function signOut() {
    setAuthMode("sign-in");
    setAuthForm(initialAuthForm);
    setAccessCode("");

    if (supabase) {
      await supabase.auth.signOut();
    }

    setUser(null);
    setProfile(null);
    setOrganizations([]);
    setMemberships([]);
    setProducts(demoProducts);
    setGroups(demoGroups);
    setReport(demoReport);
    setRecentSales(demoRecentSales);
    setActiveView("cashier");
    setIsAuthReady(true);
    setStatus("Sessao encerrada.");
  }

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (profile?.role !== "admin") return;

    const name = organizationForm.name.trim();
    const slug = slugify(organizationForm.slug || name);

    if (!name || !slug) {
      setStatus("Informe nome e identificador da organizacao.");
      return;
    }

    if (!supabase) {
      const organization: Organization = {
        id: crypto.randomUUID(),
        name,
        slug,
        created_by: user?.id ?? null,
      };
      setOrganizations((current) => [...current, organization].sort((a, b) => a.name.localeCompare(b.name)));
      setOrganizationForm(initialOrganizationForm);
      setActiveOrganizationId(organization.id);
      setMemberForm((current) => ({ ...current, organizationId: organization.id }));
      setAccessCodeForm((current) => ({ ...current, organizationId: organization.id }));
      setStatus("Organizacao criada no modo demonstrativo.");
      return;
    }

    setIsCreatingOrganization(true);
    const result = await supabase
      .from("organizations")
      .insert({ name, slug, created_by: user?.id ?? null })
      .select()
      .single();
    setIsCreatingOrganization(false);

    if (result.error) {
      setStatus(result.error.message);
      return;
    }

    setOrganizationForm(initialOrganizationForm);
    setActiveOrganizationId((result.data as Organization).id);
    await loadData();
    setStatus("Organizacao criada.");
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (profile?.role !== "admin") return;

    const email = memberForm.email.trim().toLowerCase();
    const organizationId = memberForm.organizationId || activeOrganizationId;
    const role = memberForm.role as OrganizationMember["role"];

    if (!email || !organizationId) {
      setStatus("Informe email e organizacao.");
      return;
    }

    const targetProfile = adminProfiles.find((item) => item.email?.toLowerCase() === email);

    if (!targetProfile) {
      setStatus("Usuario nao encontrado. Ele precisa criar a conta antes de virar membro.");
      return;
    }

    if (!supabase) {
      const organization = organizations.find((item) => item.id === organizationId);
      setMemberships((current) => [
        {
          organization_id: organizationId,
          user_id: targetProfile.id,
          role,
          organization,
          profile: targetProfile,
        },
        ...current.filter(
          (item) => !(item.organization_id === organizationId && item.user_id === targetProfile.id),
        ),
      ]);
      setMemberForm((current) => ({ ...initialMemberForm, organizationId: current.organizationId }));
      setStatus("Membro vinculado no modo demonstrativo.");
      return;
    }

    setIsAddingMember(true);
    const result = await supabase
      .from("organization_members")
      .upsert({ organization_id: organizationId, user_id: targetProfile.id, role });
    setIsAddingMember(false);

    if (result.error) {
      setStatus(result.error.message);
      return;
    }

    setMemberForm((current) => ({ ...initialMemberForm, organizationId: current.organizationId }));
    await loadData();
    setStatus("Membro vinculado a organizacao.");
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = groupForm.name.trim();
    const acronym = groupForm.acronym.trim().toUpperCase();

    if (!name) {
      setStatus("Informe o nome do grupo.");
      return;
    }

    if (!supabase) {
      const group: Group = {
        id: crypto.randomUUID(),
        organization_id: activeOrganizationId,
        name,
        acronym: acronym || null,
        color: "#2563eb",
      };
      setGroups((current) => [...current, group].sort((a, b) => a.name.localeCompare(b.name)));
      setGroupForm(initialGroupForm);
      setStatus("Grupo criado no modo demonstrativo.");
      return;
    }

    setIsCreatingGroup(true);
    const result = await supabase
      .from("groups")
      .insert({
        organization_id: activeOrganizationId,
        name,
        acronym: acronym || null,
        color: "#2563eb",
      });
    setIsCreatingGroup(false);

    if (result.error) {
      setStatus(result.error.message);
      return;
    }

    setGroupForm(initialGroupForm);
    await loadData();
    setStatus("Grupo criado na organizacao.");
  }

  async function createAccessCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (profile?.role !== "admin") return;

    const code = accessCodeForm.code.trim().toUpperCase();
    const organizationId = accessCodeForm.organizationId || activeOrganizationId;

    if (!code || !organizationId) {
      setStatus("Informe o codigo e a organizacao.");
      return;
    }

    if (!supabase) {
      const organization = organizations.find((item) => item.id === organizationId);
      setAccessCodes((current) => [
        {
          id: crypto.randomUUID(),
          organization_id: organizationId,
          code,
          label: accessCodeForm.label.trim() || null,
          is_active: true,
          organization,
        },
        ...current.filter((item) => item.code !== code),
      ]);
      setAccessCodeForm((current) => ({ ...initialAccessCodeForm, organizationId: current.organizationId }));
      setStatus("Codigo criado no modo demonstrativo.");
      return;
    }

    setIsCreatingAccessCode(true);
    const result = await supabase.from("organization_access_codes").upsert({
      organization_id: organizationId,
      code,
      label: accessCodeForm.label.trim() || null,
      is_active: true,
      created_by: user?.id ?? null,
    });
    setIsCreatingAccessCode(false);

    if (result.error) {
      setStatus(result.error.message);
      return;
    }

    setAccessCodeForm((current) => ({ ...initialAccessCodeForm, organizationId: current.organizationId }));
    await loadData();
    setStatus("Codigo de acesso criado.");
  }

  async function callAdminUsers(payload: Record<string, unknown>) {
    if (!supabase || !adminUsersUrl) {
      throw new Error("Funcao admin-users nao configurada.");
    }

    const sessionResult = await supabase.auth.getSession();
    const accessToken = sessionResult.data.session?.access_token;

    if (!accessToken) {
      throw new Error("Faca login novamente para continuar.");
    }

    const response = await fetch(adminUsersUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(result?.error ?? "Falha na operacao administrativa.");
    }

    return result;
  }

  async function deleteAccount(userId: string) {
    if (profile?.role !== "admin") return;

    if (!supabase) {
      if (userId === user?.id) {
        setStatus("Voce nao pode excluir sua propria conta por aqui.");
        return;
      }

      setAdminProfiles((current) => current.filter((item) => item.id !== userId));
      setMemberships((current) => current.filter((item) => item.user_id !== userId));
      setStatus("Conta excluida no modo demonstrativo.");
      return;
    }

    setDeletingUserId(userId);
    setStatus("Excluindo conta...");

    try {
      await callAdminUsers({
        action: "delete_user",
        user_id: userId,
      });
      await loadData();
      setStatus("Conta excluida.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao excluir conta.");
    } finally {
      setDeletingUserId(null);
    }
  }

  if (isSupabaseConfigured && !isAuthReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f8ff] px-4 text-[#10233f]">
        <div className="rounded-md border border-[#d7e3f8] bg-white px-5 py-4 text-sm font-semibold text-slate-600 shadow-sm shadow-[#0b3a75]/5">
          Carregando sessao...
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        authForm={authForm}
        authMode={authMode}
        isSubmitting={isSubmittingAuth}
        status={status}
        onChangeForm={(field, value) => setAuthForm((current) => ({ ...current, [field]: value }))}
        onChangeMode={setAuthMode}
        onSubmit={submitAuth}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f8ff] text-[#10233f] md:flex">
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
          <div className="flex min-h-[72px] flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
            <div className="flex items-center gap-3">
              <div className="md:hidden">
                <BrandMark compact />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <BrandMark />
                  <p className="sr-only">
                    Arraiá Parafuso Solto - EMC UFG
                  </p>
                </div>
                <p className="mt-1 text-xs text-slate-500">{status}</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {organizations.length > 0 && (
                <select
                  value={activeOrganizationId}
                  onChange={(event) => setActiveOrganizationId(event.target.value)}
                  className="h-9 rounded-md border border-[#d7e3f8] bg-[#f8fbff] px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
                  aria-label="Organizacao ativa"
                >
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
              )}
              <SearchBox value={searchTerm} onChange={setSearchTerm} placeholder="Buscar" compact />
              <input
                value={cashierName}
                onChange={(event) => setCashierName(event.target.value)}
                className="h-9 rounded-md border border-[#d7e3f8] bg-[#f8fbff] px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
                aria-label="Nome do caixa"
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

          <div className="bg-[#0b3a75] px-4 py-3 text-white lg:px-6">
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

          <nav className="flex gap-1 overflow-x-auto bg-white px-4 pt-3 lg:px-6" aria-label="Áreas do sistema">
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
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#d7e3f8] bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-[#f0f6ff]"
                  >
                    <RefreshCw size={15} />
                    Atualizar
                  </button>
                }
              />
              <SalesList sales={recentSales} />
            </section>
          )}

          {activeView === "admin" && profile?.role === "admin" && (
              <AdminPanel
              accessCodeForm={accessCodeForm}
              accessCodes={accessCodes}
              activeOrganizationId={activeOrganizationId}
              currentUserId={user?.id ?? ""}
              deletingUserId={deletingUserId}
              groupForm={groupForm}
              isAddingMember={isAddingMember}
              isCreatingAccessCode={isCreatingAccessCode}
              isCreatingGroup={isCreatingGroup}
              isCreatingOrganization={isCreatingOrganization}
              memberForm={memberForm}
              memberships={memberships}
              organizationForm={organizationForm}
              organizations={organizations}
              profiles={adminProfiles}
              onAddMember={addMember}
              onChangeAccessCodeForm={(field, value) => setAccessCodeForm((current) => ({ ...current, [field]: value }))}
              onChangeGroupForm={(field, value) => setGroupForm((current) => ({ ...current, [field]: value }))}
              onChangeMemberForm={(field, value) => setMemberForm((current) => ({ ...current, [field]: value }))}
              onChangeOrganizationForm={(field, value) =>
                setOrganizationForm((current) => ({ ...current, [field]: value }))
              }
              onCreateAccessCode={createAccessCode}
              onCreateGroup={createGroup}
              onCreateOrganization={createOrganization}
              onDeleteAccount={deleteAccount}
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
        Arraia Parafuso Solto
      </p>
    </div>
  );
}

function AuthScreen({
  authForm,
  authMode,
  isSubmitting,
  onChangeForm,
  onChangeMode,
  onSubmit,
  status,
}: {
  authForm: typeof initialAuthForm;
  authMode: AuthMode;
  isSubmitting: boolean;
  onChangeForm: (field: keyof typeof initialAuthForm, value: string) => void;
  onChangeMode: (mode: AuthMode) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  status: string;
}) {
  const isCodeMode = authMode === "code";

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
      <div className="absolute inset-0 bg-[#050b1f]/28" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,11,31,0.08)_0%,rgba(5,11,31,0.22)_36%,rgba(5,11,31,0.84)_62%,#050b1f_100%)]" />

      <section className="relative z-10 flex min-h-screen items-center px-4 py-8 sm:px-8 lg:px-12">
        <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
          <div className="hidden max-w-2xl lg:block">
            <p className="text-sm font-bold uppercase tracking-normal text-[#93c5fd]">
              Gestao de vendas
            </p>
            <h1 className="mt-3 max-w-xl text-5xl font-black leading-tight tracking-normal text-white">
              Gerencie vendas, produtos e relatorios.
            </h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-blue-100/72">
              Acompanhe o caixa em tempo real, organize produtos por grupo e consulte os resultados da festa em um painel unico.
            </p>
          </div>
          <div className="w-full rounded-md border border-white/16 bg-white/10 p-5 shadow-2xl shadow-black/25 backdrop-blur-xl">
            <div className="flex items-center gap-3 border-b border-white/12 pb-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#7c3aed] text-white shadow-lg shadow-[#7c3aed]/30">
                <ShoppingBasket size={23} strokeWidth={2.4} />
              </div>
              <div>
                <p className="text-sm font-black uppercase tracking-normal text-white">
                  Arraia Parafuso Solto
                </p>
                <p className="mt-1 text-sm text-blue-100/70">{status}</p>
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
            Codigo
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

        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          {isCodeMode ? (
            <input
              value={authForm.accessCode}
              onChange={(event) => onChangeForm("accessCode", event.target.value)}
              placeholder="Codigo da festa"
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
              <input
                value={authForm.password}
                onChange={(event) => onChangeForm("password", event.target.value)}
                placeholder="Senha"
                type="password"
                className="h-11 w-full rounded-md border border-white/12 bg-white/10 px-3 text-sm text-white outline-none transition placeholder:text-blue-100/45 focus:border-[#a78bfa] focus:ring-2 focus:ring-[#a78bfa]/20"
              />
            </>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-12 w-full items-center justify-center rounded-md bg-[#7c3aed] px-4 text-sm font-bold text-white shadow-lg shadow-[#7c3aed]/25 transition hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:bg-slate-500"
          >
            {isSubmitting ? "Aguarde..." : isCodeMode ? "Entrar com codigo" : "Entrar como admin"}
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
  currentUserId,
  deletingUserId,
  groupForm,
  isAddingMember,
  isCreatingAccessCode,
  isCreatingGroup,
  isCreatingOrganization,
  memberForm,
  memberships,
  onAddMember,
  onChangeAccessCodeForm,
  onChangeGroupForm,
  onChangeMemberForm,
  onChangeOrganizationForm,
  onCreateAccessCode,
  onCreateGroup,
  onCreateOrganization,
  onDeleteAccount,
  organizationForm,
  organizations,
  profiles,
}: {
  accessCodeForm: typeof initialAccessCodeForm;
  accessCodes: OrganizationAccessCode[];
  activeOrganizationId: string;
  currentUserId: string;
  deletingUserId: string | null;
  groupForm: typeof initialGroupForm;
  isAddingMember: boolean;
  isCreatingAccessCode: boolean;
  isCreatingGroup: boolean;
  isCreatingOrganization: boolean;
  memberForm: typeof initialMemberForm;
  memberships: OrganizationMember[];
  onAddMember: (event: FormEvent<HTMLFormElement>) => void;
  onChangeAccessCodeForm: (field: keyof typeof initialAccessCodeForm, value: string) => void;
  onChangeGroupForm: (field: keyof typeof initialGroupForm, value: string) => void;
  onChangeMemberForm: (field: keyof typeof initialMemberForm, value: string) => void;
  onChangeOrganizationForm: (field: keyof typeof initialOrganizationForm, value: string) => void;
  onCreateAccessCode: (event: FormEvent<HTMLFormElement>) => void;
  onCreateGroup: (event: FormEvent<HTMLFormElement>) => void;
  onCreateOrganization: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteAccount: (userId: string) => void;
  organizationForm: typeof initialOrganizationForm;
  organizations: Organization[];
  profiles: Profile[];
}) {
  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-4">
        <form onSubmit={onCreateAccessCode} className="rounded-md border border-[#d7e3f8] bg-white p-4 shadow-sm shadow-[#0b3a75]/5">
          <div className="flex items-center gap-2 text-sm font-bold text-[#2563eb]">
            <ShieldCheck size={17} />
            Codigos de acesso
          </div>
          <div className="mt-4 space-y-3">
            <input
              value={accessCodeForm.code}
              onChange={(event) => onChangeAccessCodeForm("code", event.target.value)}
              placeholder="Codigo da festa"
              className="h-10 w-full rounded-md border border-[#d7e3f8] bg-[#f8fbff] px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
            />
            <input
              value={accessCodeForm.label}
              onChange={(event) => onChangeAccessCodeForm("label", event.target.value)}
              placeholder="Descricao"
              className="h-10 w-full rounded-md border border-[#d7e3f8] bg-[#f8fbff] px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
            />
            <select
              value={accessCodeForm.organizationId || activeOrganizationId}
              onChange={(event) => onChangeAccessCodeForm("organizationId", event.target.value)}
              className="h-10 w-full rounded-md border border-[#d7e3f8] bg-[#f8fbff] px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={isCreatingAccessCode}
              className="h-10 w-full rounded-md bg-[#2563eb] text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isCreatingAccessCode ? "Criando..." : "Criar codigo"}
            </button>
          </div>
        </form>

        <form onSubmit={onCreateOrganization} className="rounded-md border border-[#d7e3f8] bg-white p-4 shadow-sm shadow-[#0b3a75]/5">
          <div className="flex items-center gap-2 text-sm font-bold text-[#2563eb]">
            <Building2 size={17} />
            Organizacoes
          </div>
          <div className="mt-4 space-y-3">
            <input
              value={organizationForm.name}
              onChange={(event) => onChangeOrganizationForm("name", event.target.value)}
              placeholder="Nome da organizacao"
              className="h-10 w-full rounded-md border border-[#d7e3f8] bg-[#f8fbff] px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
            />
            <input
              value={organizationForm.slug}
              onChange={(event) => onChangeOrganizationForm("slug", event.target.value)}
              placeholder="identificador"
              className="h-10 w-full rounded-md border border-[#d7e3f8] bg-[#f8fbff] px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
            />
            <button
              type="submit"
              disabled={isCreatingOrganization}
              className="h-10 w-full rounded-md bg-[#2563eb] text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isCreatingOrganization ? "Criando..." : "Criar organizacao"}
            </button>
          </div>
        </form>

        <form onSubmit={onAddMember} className="rounded-md border border-[#d7e3f8] bg-white p-4 shadow-sm shadow-[#0b3a75]/5">
          <div className="flex items-center gap-2 text-sm font-bold text-[#2563eb]">
            <Users size={17} />
            Membros
          </div>
          <div className="mt-4 space-y-3">
            <input
              value={memberForm.email}
              onChange={(event) => onChangeMemberForm("email", event.target.value)}
              placeholder="Email do usuario"
              className="h-10 w-full rounded-md border border-[#d7e3f8] bg-[#f8fbff] px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
              list="profile-emails"
            />
            <datalist id="profile-emails">
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.email ?? ""} />
              ))}
            </datalist>
            <select
              value={memberForm.organizationId || activeOrganizationId}
              onChange={(event) => onChangeMemberForm("organizationId", event.target.value)}
              className="h-10 w-full rounded-md border border-[#d7e3f8] bg-[#f8fbff] px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
            <select
              value={memberForm.role}
              onChange={(event) => onChangeMemberForm("role", event.target.value)}
              className="h-10 w-full rounded-md border border-[#d7e3f8] bg-[#f8fbff] px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
            >
              <option value="member">Membro</option>
              <option value="manager">Gerente</option>
              <option value="owner">Responsavel</option>
            </select>
            <button
              type="submit"
              disabled={isAddingMember}
              className="h-10 w-full rounded-md bg-[#2563eb] text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isAddingMember ? "Vinculando..." : "Adicionar membro"}
            </button>
          </div>
        </form>

        <form onSubmit={onCreateGroup} className="rounded-md border border-[#d7e3f8] bg-white p-4 shadow-sm shadow-[#0b3a75]/5">
          <div className="flex items-center gap-2 text-sm font-bold text-[#2563eb]">
            <Package size={17} />
            Grupos da organizacao
          </div>
          <div className="mt-4 space-y-3">
            <input
              value={groupForm.name}
              onChange={(event) => onChangeGroupForm("name", event.target.value)}
              placeholder="Nome do grupo"
              className="h-10 w-full rounded-md border border-[#d7e3f8] bg-[#f8fbff] px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
            />
            <input
              value={groupForm.acronym}
              onChange={(event) => onChangeGroupForm("acronym", event.target.value)}
              placeholder="Sigla"
              className="h-10 w-full rounded-md border border-[#d7e3f8] bg-[#f8fbff] px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
            />
            <button
              type="submit"
              disabled={isCreatingGroup}
              className="h-10 w-full rounded-md bg-[#2563eb] text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isCreatingGroup ? "Criando..." : "Criar grupo"}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-md border border-[#d7e3f8] bg-white p-4 shadow-sm shadow-[#0b3a75]/5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-[#10233f]">Codigos ativos</h2>
          <span className="text-sm font-semibold text-slate-500">{accessCodes.length}</span>
        </div>
        <div className="mt-3 divide-y divide-[#dfe8f7]">
          {accessCodes.map((item) => (
            <div key={item.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
              <div>
                <p className="font-semibold text-[#10233f]">{item.code}</p>
                <p className="text-sm text-slate-500">{item.label ?? "Sem descricao"}</p>
              </div>
              <p className="text-sm text-slate-500">
                {item.organization?.name ?? item.organization_id}
              </p>
              <span className="w-fit rounded bg-[#eaf3ff] px-2 py-1 text-xs font-bold uppercase text-[#1d4ed8]">
                {item.is_active ? "ativo" : "inativo"}
              </span>
            </div>
          ))}
          {accessCodes.length === 0 && (
            <p className="py-4 text-sm text-slate-500">Nenhum codigo criado ainda.</p>
          )}
        </div>
      </div>

      <div className="rounded-md border border-[#d7e3f8] bg-white p-4 shadow-sm shadow-[#0b3a75]/5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-[#10233f]">Contas do sistema</h2>
          <span className="text-sm font-semibold text-slate-500">{profiles.length}</span>
        </div>
        <div className="mt-3 divide-y divide-[#dfe8f7]">
          {profiles.map((profile) => (
            <div key={profile.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
              <div className="min-w-0">
                <p className="truncate font-semibold text-[#10233f]">
                  {profile.full_name || profile.email || profile.id}
                </p>
                <p className="truncate text-sm text-slate-500">{profile.email ?? profile.id}</p>
              </div>
              <span className="w-fit rounded bg-[#eaf3ff] px-2 py-1 text-xs font-bold uppercase text-[#1d4ed8]">
                {profile.role}
              </span>
              <button
                type="button"
                disabled={profile.id === currentUserId || deletingUserId === profile.id}
                onClick={() => onDeleteAccount(profile.id)}
                className="h-9 rounded-md border border-red-200 px-3 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
              >
                {deletingUserId === profile.id ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          ))}
          {profiles.length === 0 && (
            <p className="py-4 text-sm text-slate-500">Nenhuma conta carregada.</p>
          )}
        </div>
      </div>

      <div className="rounded-md border border-[#d7e3f8] bg-white p-4 shadow-sm shadow-[#0b3a75]/5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-[#10233f]">Membros vinculados</h2>
          <span className="text-sm font-semibold text-slate-500">{memberships.length}</span>
        </div>
        <div className="mt-3 divide-y divide-[#dfe8f7]">
          {memberships.map((membership) => (
            <div key={`${membership.organization_id}-${membership.user_id}`} className="grid gap-2 py-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
              <p className="font-semibold text-[#10233f]">
                {membership.profile?.email ?? membership.user_id}
              </p>
              <p className="text-sm text-slate-500">
                {membership.organization?.name ?? membership.organization_id}
              </p>
              <span className="rounded bg-[#eaf3ff] px-2 py-1 text-xs font-bold uppercase text-[#1d4ed8]">
                {membership.role}
              </span>
            </div>
          ))}
          {memberships.length === 0 && (
            <p className="py-4 text-sm text-slate-500">Nenhum membro vinculado ainda.</p>
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
    <label className={`flex items-center rounded-md border border-[#d7e3f8] bg-[#f8fbff] text-sm text-slate-600 transition focus-within:border-[#2563eb] focus-within:ring-2 focus-within:ring-[#2563eb]/15 ${compact ? "h-9 sm:w-48" : "h-10 sm:w-80"}`}>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-full w-full bg-transparent px-3 outline-none"
      />
      <span className="flex h-full w-11 items-center justify-center rounded-r-md bg-[#2563eb] text-white">
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
    <form onSubmit={onSubmit} className="grid gap-3 rounded-md border border-[#d7e3f8] bg-white p-4 shadow-md shadow-[#0b3a75]/5 md:grid-cols-2 xl:grid-cols-6">
      <input value={productForm.name} onChange={(event) => onUpdate("name", event.target.value)} placeholder="Produto" className="h-10 rounded-md border border-[#d7e3f8] bg-white px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15 xl:col-span-2" />
      <input value={productForm.category} onChange={(event) => onUpdate("category", event.target.value)} placeholder="Categoria" className="h-10 rounded-md border border-[#d7e3f8] bg-white px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15" />
      <select value={productForm.groupId} onChange={(event) => onUpdate("groupId", event.target.value)} className="h-10 rounded-md border border-[#d7e3f8] bg-white px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15">
        <option value="">Grupo</option>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.acronym ? `${group.acronym} - ${group.name}` : group.name}
          </option>
        ))}
      </select>
      <input value={productForm.salePrice} onChange={(event) => onUpdate("salePrice", event.target.value)} placeholder="Valor de venda" inputMode="decimal" className="h-10 rounded-md border border-[#d7e3f8] bg-white px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15" />
      <input value={productForm.unitCost} onChange={(event) => onUpdate("unitCost", event.target.value)} placeholder="Custo para fazer" inputMode="decimal" className="h-10 rounded-md border border-[#d7e3f8] bg-white px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15" />
      <input value={productForm.stockQuantity} onChange={(event) => onUpdate("stockQuantity", event.target.value)} placeholder="Estoque" inputMode="numeric" className="h-10 rounded-md border border-[#d7e3f8] bg-white px-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15" />
      <button type="submit" disabled={isCreatingProduct} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#2563eb] px-4 text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-slate-300 xl:col-span-2">
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
                <p className="font-bold text-[#10233f]">{product.name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {product.category} - {product.group?.acronym ?? product.group?.name ?? "Sem grupo"}
                </p>
              </div>
              <span className="rounded bg-[#eaf3ff] px-2 py-1 text-sm font-black text-[#1d4ed8]">
                {currency.format(product.sale_price)}
              </span>
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-slate-500">Custo</dt>
                <dd className="font-semibold">{currency.format(product.unit_cost)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Lucro</dt>
                <dd className="font-semibold text-[#2563eb]">
                  {currency.format(product.sale_price - product.unit_cost)}
                </dd>
              </div>
              <div>
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
          cart.map((item) => (
            <div key={item.product.id} className="rounded-md border border-[#d7e3f8] bg-[#f8fbff] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{item.product.name}</p>
                  <p className="text-sm text-slate-500">
                    {currency.format(item.product.sale_price)} cada
                  </p>
                </div>
                <p className="font-bold">
                  {currency.format(item.product.sale_price * item.quantity)}
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
          ))
        )}
      </div>

      <div className="mt-5 grid grid-cols-4 gap-2">
        {Object.entries(paymentLabels).map(([value, label]) => (
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
        <div className="flex justify-between">
          <dt className="text-slate-500">Total</dt>
          <dd className="font-bold">{currency.format(cartTotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Lucro líquido previsto</dt>
          <dd className="font-bold text-[#2563eb]">{currency.format(cartProfit)}</dd>
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
    <div className="rounded-md border border-[#d7e3f8] bg-white p-4 shadow-md shadow-[#0b3a75]/5">
      <div className="divide-y divide-[#dfe8f7]">
        {sales.map((sale, index) => (
          <div key={sale.id} className={`grid gap-3 rounded-md px-3 py-4 first:pt-3 last:pb-3 sm:grid-cols-[1fr_auto_auto] sm:items-center ${index % 2 === 0 ? "bg-white" : "bg-[#f8fbff]"}`}>
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
            <p className="font-bold">{currency.format(sale.gross_total)}</p>
            <p className="font-semibold text-[#2563eb]">+{currency.format(sale.profit_total)}</p>
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
    <div className="rounded-md border border-[#d7e3f8] bg-white p-4 shadow-sm shadow-[#0b3a75]/5">
      <div className="flex items-center gap-2 text-sm font-bold text-[#2563eb]">
        {icon}
        {label}
      </div>
      <p className="mt-3 text-2xl font-black tracking-normal text-[#10233f]">{value}</p>
    </div>
  );
}

