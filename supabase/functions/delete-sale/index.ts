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
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const authorization = request.headers.get("Authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    let actorUserId: string | null = null;

    if (token) {
      const { data: userResult, error: userError } = await supabase.auth.getUser(token);

      if (userError || !userResult.user) {
        return Response.json(
          { error: "Sessao invalida." },
          { status: 401, headers: corsHeaders },
        );
      }

      actorUserId = userResult.user.id;
    } else if (!payload.access_code) {
      return Response.json(
        { error: "Codigo de acesso ou sessao autenticada obrigatoria." },
        { status: 401, headers: corsHeaders },
      );
    }

    const { data, error } = await supabase.rpc("delete_sale", {
      payload: {
        ...payload,
        actor_user_id: actorUserId,
      },
    });

    if (error) {
      return Response.json(
        { error: error.message },
        { status: 400, headers: corsHeaders },
      );
    }

    return Response.json({ sale_id: data }, { headers: corsHeaders });
  } catch {
    return Response.json(
      { error: "Payload invalido." },
      { status: 400, headers: corsHeaders },
    );
  }
});
