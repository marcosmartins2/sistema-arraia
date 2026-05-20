import type { Group, Product, RecentSale, SaleReport } from "@/types/database";

export const demoOrganizationId = "evento-demo";

export const demoGroups: Group[] = [
  {
    id: "atletica",
    organization_id: demoOrganizationId,
    name: "Atletica UFG",
    acronym: "AA",
    color: "#2563eb",
  },
  {
    id: "centro-academico",
    organization_id: demoOrganizationId,
    name: "Centro Academico",
    acronym: "CA",
    color: "#1d4ed8",
  },
  {
    id: "empresa-junior",
    organization_id: demoOrganizationId,
    name: "Empresa Junior",
    acronym: "EJ",
    color: "#0b3a75",
  },
];

export const demoProducts: Product[] = [
  {
    id: "caldo",
    organization_id: demoOrganizationId,
    group_id: "atletica",
    name: "Caldo",
    category: "Comida",
    sale_price: 12,
    unit_cost: 5.5,
    stock_quantity: 84,
    is_active: true,
    group: demoGroups[0],
  },
  {
    id: "correio-elegante",
    organization_id: demoOrganizationId,
    group_id: "centro-academico",
    name: "Correio elegante",
    category: "Brincadeira",
    sale_price: 4,
    unit_cost: 0.8,
    stock_quantity: 160,
    is_active: true,
    group: demoGroups[1],
  },
  {
    id: "refrigerante",
    organization_id: demoOrganizationId,
    group_id: "empresa-junior",
    name: "Refrigerante",
    category: "Bebida",
    sale_price: 6,
    unit_cost: 3.2,
    stock_quantity: 120,
    is_active: true,
    group: demoGroups[2],
  },
  {
    id: "ficha-10",
    organization_id: demoOrganizationId,
    group_id: "atletica",
    name: "Ficha R$ 10",
    category: "Ficha",
    sale_price: 10,
    unit_cost: 0,
    stock_quantity: 300,
    is_active: true,
    group: demoGroups[0],
  },
];

export const demoReport: SaleReport = {
  organization_id: demoOrganizationId,
  gross_revenue: 2860,
  total_cost: 1268,
  gross_profit: 1592,
  total_expenses: 320,
  net_profit: 1272,
  sales_count: 148,
  items_sold: 226,
};

export const demoProductSales: Record<string, number> = {
  caldo: 60,
  "correio-elegante": 80,
  refrigerante: 50,
  "ficha-10": 36,
};

export type CashierSalesSummary = {
  count: number;
  revenue: number;
  profit: number;
};

export const demoCashierSales: Record<string, CashierSalesSummary> = {
  "Caixa 1": { count: 78, revenue: 1520, profit: 850 },
  "Caixa 2": { count: 70, revenue: 1340, profit: 742 },
};

export const demoRecentSales: RecentSale[] = [
  {
    id: "demo-1",
    organization_id: demoOrganizationId,
    created_at: new Date().toISOString(),
    cashier_name: "Caixa 1",
    payment_method: "pix",
    gross_total: 28,
    profit_total: 14.7,
  },
  {
    id: "demo-2",
    organization_id: demoOrganizationId,
    created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    cashier_name: "Caixa 2",
    payment_method: "cash",
    gross_total: 16,
    profit_total: 9.2,
  },
];
