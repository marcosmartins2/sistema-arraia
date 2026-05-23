import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    const { access_code } = await request.json();
    const code = String(access_code ?? "").trim().toUpperCase();

    if (!code) {
      return Response.json(
        { error: "Codigo de acesso obrigatorio." },
        { status: 400, headers: corsHeaders },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { data: accessCode, error: accessError } = await supabase
      .from("organization_access_codes")
      .select("organization_id, organization:organizations(*)")
      .eq("code", code)
      .eq("is_active", true)
      .single();

    if (accessError || !accessCode) {
      return Response.json(
        { error: "Codigo invalido ou inativo." },
        { status: 401, headers: corsHeaders },
      );
    }

    const organizationId = accessCode.organization_id;
    const [groupsResult, productsResult, reportResult, salesResult, itemsResult, allSalesResult] = await Promise.all([
      supabase.from("groups").select("*").eq("organization_id", organizationId).order("name"),
      supabase
        .from("products")
        .select("*, group:groups!products_group_id_fkey(*)")
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
        .select("id, organization_id, created_at, cashier_name, payment_method, gross_total, profit_total")
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

    const queryErrors = Object.entries({
      groups: groupsResult.error,
      products: productsResult.error,
      report: reportResult.error,
      sales: salesResult.error,
      saleItems: itemsResult.error,
      cashierSales: allSalesResult.error,
    })
      .filter(([, error]) => error)
      .map(([name, error]) => ({ name, message: error!.message, details: error }));

    if (queryErrors.length > 0) {
      return Response.json(
        {
          error: `Nao foi possivel carregar os dados (${queryErrors.map((q) => q.name).join(", ")}): ${queryErrors[0].message}`,
          failures: queryErrors,
        },
        { status: 400, headers: corsHeaders },
      );
    }

    return Response.json(
      {
        organization: accessCode.organization,
        groups: groupsResult.data ?? [],
        products: productsResult.data ?? [],
        report: reportResult.data,
        recentSales: salesResult.data ?? [],
        saleItems: itemsResult.data ?? [],
        cashierSales: allSalesResult.data ?? [],
      },
      { headers: corsHeaders },
    );
  } catch {
    return Response.json(
      { error: "Payload invalido." },
      { status: 400, headers: corsHeaders },
    );
  }
});
