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
export const updateOrganizationUrl =
  process.env.NEXT_PUBLIC_UPDATE_ORGANIZATION_FUNCTION_URL ||
  (supabaseUrl ? `${supabaseUrl}/functions/v1/update-organization` : "");
export const saveProductUrl =
  process.env.NEXT_PUBLIC_SAVE_PRODUCT_FUNCTION_URL ||
  (supabaseUrl ? `${supabaseUrl}/functions/v1/save-product` : "");
export const deleteProductUrl =
  process.env.NEXT_PUBLIC_DELETE_PRODUCT_FUNCTION_URL ||
  (supabaseUrl ? `${supabaseUrl}/functions/v1/delete-product` : "");
export const deleteSaleUrl =
  process.env.NEXT_PUBLIC_DELETE_SALE_FUNCTION_URL ||
  (supabaseUrl ? `${supabaseUrl}/functions/v1/delete-sale` : "");

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (typeof window !== "undefined" && supabaseUrl) {
  try {
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    const storageKey = `sb-${projectRef}-auth-token`;
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      const expiresAt = Number(parsed?.expires_at ?? 0);
      if (expiresAt && expiresAt * 1000 < Date.now()) {
        window.localStorage.removeItem(storageKey);
      }
    }
  } catch {
    // ignore — stored value is malformed, the SDK will overwrite it.
  }
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
