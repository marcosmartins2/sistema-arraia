import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return Response.json(
      { error: "Metodo nao permitido." },
      { status: 405, headers: corsHeaders },
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return Response.json(
        { error: "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios." },
        { status: 500, headers: corsHeaders },
      );
    }

    const payload = await request.json();
    const accessCodeRaw = String(payload?.access_code ?? "").trim().toUpperCase();
    const product = payload?.product;

    if (!accessCodeRaw) {
      return Response.json(
        { error: "Codigo de acesso obrigatorio." },
        { status: 401, headers: corsHeaders },
      );
    }

    if (!product || typeof product !== "object") {
      return Response.json(
        { error: "Produto invalido." },
        { status: 400, headers: corsHeaders },
      );
    }

    const name = String(product.name ?? "").trim();
    const category = String(product.category ?? "").trim();
    const responsibleName = String(product.responsible_name ?? "").trim();
    const salePrice = toNumber(product.sale_price);
    const unitCost = toNumber(product.unit_cost);
    const stockQuantity = toNumber(product.stock_quantity);

    if (!name || !category || !responsibleName) {
      return Response.json(
        { error: "Preencha nome, categoria e responsavel." },
        { status: 400, headers: corsHeaders },
      );
    }

    if (salePrice === null || unitCost === null || stockQuantity === null) {
      return Response.json(
        { error: "Valores de venda, custo e estoque sao obrigatorios." },
        { status: 400, headers: corsHeaders },
      );
    }

    if (salePrice < 0 || unitCost < 0 || stockQuantity < 0) {
      return Response.json(
        { error: "Valores nao podem ser negativos." },
        { status: 400, headers: corsHeaders },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: accessCode, error: accessError } = await supabase
      .from("organization_access_codes")
      .select("organization_id")
      .eq("code", accessCodeRaw)
      .eq("is_active", true)
      .single();

    if (accessError || !accessCode) {
      return Response.json(
        { error: "Codigo invalido ou inativo." },
        { status: 401, headers: corsHeaders },
      );
    }

    const organizationId = accessCode.organization_id;

    const { data: existingGroups, error: groupLookupError } = await supabase
      .from("groups")
      .select("*")
      .eq("organization_id", organizationId)
      .ilike("name", responsibleName)
      .limit(1);

    if (groupLookupError) {
      return Response.json(
        { error: groupLookupError.message },
        { status: 400, headers: corsHeaders },
      );
    }

    let group = existingGroups?.[0] ?? null;

    if (!group) {
      const { data: createdGroup, error: groupInsertError } = await supabase
        .from("groups")
        .insert({
          organization_id: organizationId,
          name: responsibleName,
          acronym: null,
          color: "#2563eb",
        })
        .select()
        .single();

      if (groupInsertError) {
        return Response.json(
          { error: `Nao foi possivel salvar o responsavel: ${groupInsertError.message}` },
          { status: 400, headers: corsHeaders },
        );
      }

      group = createdGroup;
    }

    const productPayload = {
      organization_id: organizationId,
      group_id: group.id,
      name,
      category,
      sale_price: salePrice,
      unit_cost: unitCost,
      stock_quantity: Math.floor(stockQuantity),
      original_sale_price: toNumber(product.original_sale_price),
      promo_min_quantity:
        product.promo_min_quantity === null || product.promo_min_quantity === undefined
          ? null
          : Math.floor(Number(product.promo_min_quantity)),
      promo_discount_amount: toNumber(product.promo_discount_amount),
      is_active: true,
    };

    const productId = product.id ? String(product.id) : null;
    let result;

    if (productId) {
      result = await supabase
        .from("products")
        .update(productPayload)
        .eq("id", productId)
        .eq("organization_id", organizationId)
        .select("*, group:groups!products_group_id_fkey(*)")
        .single();
    } else {
      result = await supabase
        .from("products")
        .insert(productPayload)
        .select("*, group:groups!products_group_id_fkey(*)")
        .single();
    }

    if (result.error) {
      return Response.json(
        { error: result.error.message },
        { status: 400, headers: corsHeaders },
      );
    }

    return Response.json(
      { product: result.data, group },
      { headers: corsHeaders },
    );
  } catch {
    return Response.json(
      { error: "Payload invalido." },
      { status: 400, headers: corsHeaders },
    );
  }
});
