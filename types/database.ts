export type AppRole = "admin" | "member";

export type OrganizationRole = "admin" | "owner" | "manager" | "member";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  created_by: string | null;
  event_date?: string | null;
  responsible_group?: string | null;
  cashier_names?: string[];
  is_active?: boolean;
};

export type OrganizationMember = {
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  organization?: Organization;
  profile?: Profile;
};

export type OrganizationAccessCode = {
  id: string;
  organization_id: string;
  code: string;
  label: string | null;
  is_active: boolean;
  organization?: Organization;
};

export type Group = {
  id: string;
  organization_id: string;
  name: string;
  acronym: string | null;
  color: string;
  organization?: Organization;
};

export type Product = {
  id: string;
  organization_id: string;
  group_id: string;
  name: string;
  category: string;
  sale_price: number;
  unit_cost: number;
  stock_quantity: number;
  promo_min_quantity?: number | null;
  promo_discount_amount?: number | null;
  is_active: boolean;
  group?: Group;
};

export type SaleReport = {
  organization_id?: string;
  gross_revenue: number;
  total_cost: number;
  gross_profit: number;
  total_expenses: number;
  net_profit: number;
  sales_count: number;
  items_sold: number;
};

export type RecentSale = {
  id: string;
  organization_id?: string;
  created_at: string;
  cashier_name: string | null;
  payment_method: string;
  gross_total: number;
  profit_total: number;
};

export type SaleItemDraft = {
  product: Product;
  quantity: number;
};
