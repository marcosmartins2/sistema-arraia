import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AdminPayload =
  | {
      action: "create_user";
      email: string;
      password: string;
      full_name?: string;
      role?: "admin" | "member";
      organization_id?: string;
      organization_role?: "owner" | "manager" | "member";
    }
  | {
      action: "delete_user";
      user_id: string;
    }
  | {
      action: "set_role";
      user_id: string;
      role: "admin" | "member";
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

    const authorization = request.headers.get("Authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "");

    if (!token) {
      return Response.json(
        { error: "Usuario autenticado obrigatorio." },
        { status: 401, headers: corsHeaders },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { data: userResult, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userResult.user) {
      return Response.json(
        { error: "Sessao invalida." },
        { status: 401, headers: corsHeaders },
      );
    }

    const { data: adminProfile, error: adminError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userResult.user.id)
      .single();

    if (adminError || adminProfile?.role !== "admin") {
      return Response.json(
        { error: "Acesso restrito ao administrador." },
        { status: 403, headers: corsHeaders },
      );
    }

    const payload = (await request.json()) as AdminPayload;

    if (payload.action === "create_user") {
      const email = payload.email.trim().toLowerCase();
      const password = payload.password;

      if (!email || !password) {
        return Response.json(
          { error: "Email e senha sao obrigatorios." },
          { status: 400, headers: corsHeaders },
        );
      }

      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: payload.full_name || email,
        },
      });

      if (error || !data.user) {
        return Response.json(
          { error: error?.message ?? "Nao foi possivel criar o usuario." },
          { status: 400, headers: corsHeaders },
        );
      }

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: data.user.id,
        email,
        full_name: payload.full_name || email,
        role: payload.role ?? "member",
      });

      if (profileError) {
        return Response.json(
          { error: profileError.message },
          { status: 400, headers: corsHeaders },
        );
      }

      if (payload.organization_id) {
        const { error: memberError } = await supabase.from("organization_members").upsert({
          organization_id: payload.organization_id,
          user_id: data.user.id,
          role: payload.organization_role ?? "member",
        });

        if (memberError) {
          return Response.json(
            { error: memberError.message },
            { status: 400, headers: corsHeaders },
          );
        }
      }

      return Response.json({ user_id: data.user.id }, { headers: corsHeaders });
    }

    if (payload.action === "delete_user") {
      if (payload.user_id === userResult.user.id) {
        return Response.json(
          { error: "Voce nao pode excluir sua propria conta por aqui." },
          { status: 400, headers: corsHeaders },
        );
      }

      const { error } = await supabase.auth.admin.deleteUser(payload.user_id);

      if (error) {
        return Response.json(
          { error: error.message },
          { status: 400, headers: corsHeaders },
        );
      }

      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    if (payload.action === "set_role") {
      const { error } = await supabase
        .from("profiles")
        .update({ role: payload.role })
        .eq("id", payload.user_id);

      if (error) {
        return Response.json(
          { error: error.message },
          { status: 400, headers: corsHeaders },
        );
      }

      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    return Response.json(
      { error: "Acao invalida." },
      { status: 400, headers: corsHeaders },
    );
  } catch {
    return Response.json(
      { error: "Payload invalido." },
      { status: 400, headers: corsHeaders },
    );
  }
});
