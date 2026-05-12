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
      { error: "Método não permitido." },
      { status: 405, headers: corsHeaders },
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return Response.json(
        { error: "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios." },
        { status: 500, headers: corsHeaders },
      );
    }

    const payload = await request.json();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase.rpc("register_sale", { payload });

    if (error) {
      return Response.json(
        { error: error.message },
        { status: 400, headers: corsHeaders },
      );
    }

    return Response.json({ sale_id: data }, { headers: corsHeaders });
  } catch {
    return Response.json(
      { error: "Payload inválido." },
      { status: 400, headers: corsHeaders },
    );
  }
});
