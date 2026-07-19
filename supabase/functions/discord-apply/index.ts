/**
 * Supabase Edge Function: discord-apply
 * Applies a server config (roles, categories, channels) to a Discord server.
 *
 * Required Supabase secrets (set via supabase secrets set):
 *   DISCORD_BOT_TOKEN
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ServerConfig {
  server: {
    name: string;
    description?: string | null;
    verification_level?: number;
  };
  categories?: Array<{ id: string; name: string; position: number }>;
  channels?: Array<{
    id: string;
    name: string;
    type: string;
    category_id?: string | null;
    position: number;
    topic?: string | null;
    nsfw?: boolean;
    slow_mode?: number;
  }>;
  roles?: Array<{
    id: string;
    name: string;
    color: string;
    position: number;
    hoist?: boolean;
    mentionable?: boolean;
    permissions?: number;
  }>;
}

const CHANNEL_TYPE: Record<string, number> = {
  text: 0, voice: 2, announcement: 5, stage: 13, forum: 15,
};

async function discordRequest(
  method: string,
  path: string,
  botToken: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

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
    const { order_id, server_id } = await req.json() as { order_id?: string; server_id?: string };
    if (!order_id || !server_id) {
      return new Response(JSON.stringify({ error: "order_id and server_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const botToken = Deno.env.get("DISCORD_BOT_TOKEN");
    if (!botToken) {
      return new Response(
        JSON.stringify({ success: false, applied_items: [], error: "Bot token not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Use service role key to read the project config (bypasses RLS)
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: project } = await admin
      .from("server_projects")
      .select("config_json")
      .eq("order_id", order_id)
      .single();

    if (!project) {
      return new Response(
        JSON.stringify({ success: false, applied_items: [], error: "Project not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let config: ServerConfig;
    try {
      config = JSON.parse(project.config_json);
    } catch {
      return new Response(
        JSON.stringify({ success: false, applied_items: [], error: "Invalid config JSON" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const appliedItems: string[] = [];

    // Update server name/description
    if (config.server.name) {
      await discordRequest("PATCH", `/guilds/${server_id}`, botToken, {
        name: config.server.name,
        description: config.server.description || null,
        verification_level: config.server.verification_level ?? 0,
      });
      appliedItems.push("서버 이름/설명");
    }

    // Create roles (skip @everyone)
    const roleIdMap: Record<string, string> = {};
    for (const role of (config.roles ?? []).filter((r) => r.name !== "@everyone")) {
      try {
        const colorHex = parseInt(role.color.replace("#", ""), 16);
        const created = await discordRequest("POST", `/guilds/${server_id}/roles`, botToken, {
          name: role.name,
          color: colorHex,
          hoist: role.hoist ?? false,
          mentionable: role.mentionable ?? false,
          permissions: String(role.permissions ?? 0),
        }) as { id: string };
        roleIdMap[role.id] = created.id;
        appliedItems.push(`역할: ${role.name}`);
      } catch (e) {
        console.error(`Failed to create role ${role.name}:`, e);
      }
    }

    // Create categories
    const categoryIdMap: Record<string, string> = {};
    for (const cat of (config.categories ?? [])) {
      try {
        const created = await discordRequest("POST", `/guilds/${server_id}/channels`, botToken, {
          name: cat.name,
          type: 4,
          position: cat.position,
        }) as { id: string };
        categoryIdMap[cat.id] = created.id;
        appliedItems.push(`카테고리: ${cat.name}`);
      } catch (e) {
        console.error(`Failed to create category ${cat.name}:`, e);
      }
    }

    // Create channels
    for (const ch of (config.channels ?? [])) {
      try {
        const parentId = ch.category_id ? categoryIdMap[ch.category_id] : undefined;
        await discordRequest("POST", `/guilds/${server_id}/channels`, botToken, {
          name: ch.name,
          type: CHANNEL_TYPE[ch.type] ?? 0,
          parent_id: parentId,
          position: ch.position,
          topic: ch.topic || null,
          nsfw: ch.nsfw ?? false,
          rate_limit_per_user: ch.slow_mode ?? 0,
        });
        appliedItems.push(`채널: ${ch.name}`);
      } catch (e) {
        console.error(`Failed to create channel ${ch.name}:`, e);
      }
    }

    // Mark order as completed
    await admin
      .from("orders")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", order_id);

    return new Response(
      JSON.stringify({ success: true, applied_items: appliedItems, error: null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const error = err as Error;
    return new Response(
      JSON.stringify({ success: false, applied_items: [], error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
