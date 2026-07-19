/**
 * Supabase Edge Function: discord-verify
 * Checks whether the DIRO bot is present in a given Discord server.
 *
 * Required Supabase secrets (set via supabase secrets set):
 *   DISCORD_BOT_TOKEN
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth ───────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the JWT is valid and get user's role
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    const allowedRoles = ["counselor", "developer", "admin"];
    if (!profile || !allowedRoles.includes(profile.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Business logic ─────────────────────────────────────────────────────
    const { server_id } = await req.json() as { server_id?: string };
    if (!server_id) {
      return new Response(JSON.stringify({ error: "server_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const botToken = Deno.env.get("DISCORD_BOT_TOKEN");
    if (!botToken) {
      return new Response(
        JSON.stringify({ success: false, in_server: false, server_name: null, error: "Bot token not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Call Discord REST API
    const discordRes = await fetch(`https://discord.com/api/v10/guilds/${server_id}`, {
      headers: { Authorization: `Bot ${botToken}` },
    });

    if (discordRes.ok) {
      const guild = await discordRes.json() as { name: string };
      return new Response(
        JSON.stringify({ success: true, in_server: true, server_name: guild.name, error: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (discordRes.status === 403 || discordRes.status === 404) {
      return new Response(
        JSON.stringify({ success: true, in_server: false, server_name: null, error: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const errBody = await discordRes.text();
    return new Response(
      JSON.stringify({ success: false, in_server: false, server_name: null, error: errBody }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const error = err as Error;
    return new Response(
      JSON.stringify({ success: false, in_server: false, server_name: null, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
