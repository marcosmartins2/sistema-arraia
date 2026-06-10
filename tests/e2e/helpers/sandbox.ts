import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "node:path";
import WebSocket from "ws";

dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
}

export const adminClient: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
});

const ACCESS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomAccessCode(): string {
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += ACCESS_CODE_ALPHABET[Math.floor(Math.random() * ACCESS_CODE_ALPHABET.length)];
  }
  return code;
}

export type SandboxContext = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  accessCode: string;
  groupId: string;
  cashierName: string;
  productIds: string[];
};

export async function createSandbox(): Promise<SandboxContext> {
  const stamp = Date.now();
  const suffix = Math.random().toString(36).slice(2, 8);
  const organizationName = `E2E Sandbox ${stamp}`;
  const organizationSlug = `e2e-${stamp}-${suffix}`;
  const cashierName = "E2E Caixa";

  const orgInsert = await adminClient
    .from("organizations")
    .insert({
      name: organizationName,
      slug: organizationSlug,
      event_date: new Date().toISOString().slice(0, 10),
      responsible_group: "E2E Sandbox",
      cashier_names: [cashierName, "E2E Caixa 2"],
      is_active: true,
    })
    .select()
    .single();

  if (orgInsert.error || !orgInsert.data) {
    throw new Error(`Failed to create sandbox org: ${orgInsert.error?.message}`);
  }
  const organizationId = orgInsert.data.id as string;

  const groupInsert = await adminClient
    .from("groups")
    .insert({
      organization_id: organizationId,
      name: "E2E Responsavel",
      acronym: "E2E",
      color: "#2563eb",
    })
    .select()
    .single();

  if (groupInsert.error || !groupInsert.data) {
    throw new Error(`Failed to create sandbox group: ${groupInsert.error?.message}`);
  }
  const groupId = groupInsert.data.id as string;

  const productsInsert = await adminClient
    .from("products")
    .insert([
      {
        organization_id: organizationId,
        group_id: groupId,
        name: "E2E Refrigerante",
        category: "Bebida",
        sale_price: 5,
        unit_cost: 2,
        stock_quantity: 50,
        is_active: true,
      },
      {
        organization_id: organizationId,
        group_id: groupId,
        name: "E2E Salgado",
        category: "Comida",
        sale_price: 8,
        unit_cost: 3,
        stock_quantity: 30,
        is_active: true,
      },
    ])
    .select();

  if (productsInsert.error || !productsInsert.data) {
    throw new Error(`Failed to create sandbox products: ${productsInsert.error?.message}`);
  }
  const productIds = productsInsert.data.map((p) => p.id as string);

  const accessCode = randomAccessCode();
  const codeInsert = await adminClient.from("organization_access_codes").insert({
    organization_id: organizationId,
    code: accessCode,
    label: organizationSlug.toUpperCase(),
    is_active: true,
  });

  if (codeInsert.error) {
    throw new Error(`Failed to create access code: ${codeInsert.error.message}`);
  }

  return {
    organizationId,
    organizationName,
    organizationSlug,
    accessCode,
    groupId,
    cashierName,
    productIds,
  };
}

export async function teardownSandbox(ctx: SandboxContext): Promise<void> {
  await adminClient.from("sale_items").delete().in("product_id", ctx.productIds);
  await adminClient.from("sales").delete().eq("organization_id", ctx.organizationId);
  await adminClient.from("organization_access_codes").delete().eq("organization_id", ctx.organizationId);
  await adminClient.from("products").delete().eq("organization_id", ctx.organizationId);
  await adminClient.from("groups").delete().eq("organization_id", ctx.organizationId);
  await adminClient.from("organizations").delete().eq("id", ctx.organizationId);
}

export async function getProductStock(productId: string): Promise<number | null> {
  const result = await adminClient
    .from("products")
    .select("stock_quantity")
    .eq("id", productId)
    .maybeSingle();
  if (result.error || !result.data) return null;
  return Number(result.data.stock_quantity);
}

export async function listSalesFor(organizationId: string) {
  const result = await adminClient
    .from("sales")
    .select("id, gross_total, profit_total, cashier_name, payment_method")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (result.error) {
    throw new Error(`Failed listing sales: ${result.error.message}`);
  }
  return result.data ?? [];
}

export async function listProductsFor(organizationId: string) {
  const result = await adminClient
    .from("products")
    .select("id, name, sale_price, unit_cost, stock_quantity, is_active")
    .eq("organization_id", organizationId)
    .order("name");
  if (result.error) {
    throw new Error(`Failed listing products: ${result.error.message}`);
  }
  return result.data ?? [];
}
