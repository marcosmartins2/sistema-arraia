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

    const payload = await request.json();
    const accessCodeRaw = String(payload?.access_code ?? "").trim().toUpperCase();
    const productId = String(payload?.product_id ?? "").trim();

    if (!accessCodeRaw) {
      return Response.json(
        { error: "Codigo de acesso obrigatorio." },
        { status: 401, headers: corsHeaders },
      );
    }

    if (!productId) {
      return Response.json(
        { error: "ID do produto obrigatorio." },
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

    const { error } = await supabase
      .from("products")
      .update({ is_active: false })
      .eq("id", productId)
      .eq("organization_id", accessCode.organization_id);

    if (error) {
      return Response.json(
        { error: error.message },
        { status: 400, headers: corsHeaders },
      );
    }

    return Response.json({ product_id: productId }, { headers: corsHeaders });
  } catch {
    return Response.json(
      { error: "Payload invalido." },
      { status: 400, headers: corsHeaders },
    );
  }
});
