import type { Group, Product, RecentSale, SaleReport } from "@/types/database";

export const demoGroups: Group[] = [
  { id: "atlética", name: "Atlética UFG", acronym: "AA", color: "#c2410c" },
  { id: "centro-academico", name: "Centro Acadêmico", acronym: "CA", color: "#047857" },
  { id: "empresa-junior", name: "Empresa Júnior", acronym: "EJ", color: "#1d4ed8" },
];

export const demoProducts: Product[] = [
  {
    id: "caldo",
    group_id: "atlética",
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
    group_id: "atlética",
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
  gross_revenue: 2860,
  total_cost: 1268,
  gross_profit: 1592,
  total_expenses: 320,
  net_profit: 1272,
  sales_count: 148,
  items_sold: 226,
};

export const demoRecentSales: RecentSale[] = [
  {
    id: "demo-1",
    created_at: new Date().toISOString(),
    cashier_name: "Caixa 1",
    payment_method: "pix",
    gross_total: 28,
    profit_total: 14.7,
  },
  {
    id: "demo-2",
    created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    cashier_name: "Caixa 2",
    payment_method: "cash",
    gross_total: 16,
    profit_total: 9.2,
  },
];
