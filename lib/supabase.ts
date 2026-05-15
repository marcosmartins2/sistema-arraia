import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const registerSaleUrl =
  process.env.NEXT_PUBLIC_REGISTER_SALE_FUNCTION_URL ||
  (supabaseUrl ? `${supabaseUrl}/functions/v1/register-sale` : "");
export const adminUsersUrl =
  process.env.NEXT_PUBLIC_ADMIN_USERS_FUNCTION_URL ||
  (supabaseUrl ? `${supabaseUrl}/functions/v1/admin-users` : "");
export const dashboardDataUrl =
  process.env.NEXT_PUBLIC_DASHBOARD_DATA_FUNCTION_URL ||
  (supabaseUrl ? `${supabaseUrl}/functions/v1/dashboard-data` : "");

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
