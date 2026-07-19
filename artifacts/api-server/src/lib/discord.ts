import { Client, GatewayIntentBits, REST, Routes } from "discord.js";
import { logger } from "./logger.js";

const botToken = process.env.DISCORD_BOT_TOKEN;

let discordClient: Client | null = null;
let discordRest: REST | null = null;

export function getDiscordClient(): Client {
  if (!discordClient) {
    if (!botToken) {
      throw new Error("DISCORD_BOT_TOKEN is not set");
    }
    discordClient = new Client({
      intents: [GatewayIntentBits.Guilds],
    });
    discordClient.login(botToken).catch((err) => {
      logger.error({ err }, "Failed to login Discord bot");
    });
  }
  return discordClient;
}

export function getDiscordRest(): REST {
  if (!discordRest) {
    if (!botToken) {
      throw new Error("DISCORD_BOT_TOKEN is not set");
    }
    discordRest = new REST({ version: "10" }).setToken(botToken);
  }
  return discordRest;
}

export async function verifyBotInServer(serverId: string): Promise<{ inServer: boolean; serverName: string | null }> {
  try {
    const rest = getDiscordRest();
    const guild = await rest.get(Routes.guild(serverId)) as { name: string };
    return { inServer: true, serverName: guild.name };
  } catch (err: unknown) {
    const error = err as { status?: number };
    if (error.status === 403 || error.status === 404) {
      return { inServer: false, serverName: null };
    }
    throw err;
  }
}

export interface ServerConfig {
  server: {
    name: string;
    icon?: string | null;
    banner?: string | null;
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

export async function applyServerConfig(
  serverId: string,
  config: ServerConfig,
): Promise<{ success: boolean; appliedItems: string[]; error: string | null }> {
  const appliedItems: string[] = [];

  try {
    const rest = getDiscordRest();

    // Update server name
    if (config.server.name) {
      await rest.patch(Routes.guild(serverId), {
        body: {
          name: config.server.name,
          description: config.server.description || null,
          verification_level: config.server.verification_level ?? 0,
        },
      });
      appliedItems.push("서버 이름/설명");
    }

    // Create roles (skip @everyone)
    const roleIdMap: Record<string, string> = {};
    if (config.roles) {
      for (const role of config.roles.filter((r) => r.name !== "@everyone")) {
        try {
          const colorHex = parseInt(role.color.replace("#", ""), 16);
          const created = await rest.post(Routes.guildRoles(serverId), {
            body: {
              name: role.name,
              color: colorHex,
              hoist: role.hoist ?? false,
              mentionable: role.mentionable ?? false,
              permissions: String(role.permissions ?? 0),
            },
          }) as { id: string };
          roleIdMap[role.id] = created.id;
          appliedItems.push(`역할: ${role.name}`);
        } catch (e) {
          logger.error({ e }, `Failed to create role ${role.name}`);
        }
      }
    }

    // Create categories
    const categoryIdMap: Record<string, string> = {};
    if (config.categories) {
      for (const category of config.categories) {
        try {
          const created = await rest.post(Routes.guildChannels(serverId), {
            body: {
              name: category.name,
              type: 4, // Category
              position: category.position,
            },
          }) as { id: string };
          categoryIdMap[category.id] = created.id;
          appliedItems.push(`카테고리: ${category.name}`);
        } catch (e) {
          logger.error({ e }, `Failed to create category ${category.name}`);
        }
      }
    }

    // Create channels
    const channelTypeMap: Record<string, number> = {
      text: 0,
      voice: 2,
      announcement: 5,
      stage: 13,
      forum: 15,
    };

    if (config.channels) {
      for (const channel of config.channels) {
        try {
          const channelType = channelTypeMap[channel.type] ?? 0;
          const parentId = channel.category_id
            ? categoryIdMap[channel.category_id]
            : undefined;

          await rest.post(Routes.guildChannels(serverId), {
            body: {
              name: channel.name,
              type: channelType,
              parent_id: parentId,
              position: channel.position,
              topic: channel.topic || null,
              nsfw: channel.nsfw ?? false,
              rate_limit_per_user: channel.slow_mode ?? 0,
            },
          });
          appliedItems.push(`채널: ${channel.name}`);
        } catch (e) {
          logger.error({ e }, `Failed to create channel ${channel.name}`);
        }
      }
    }

    return { success: true, appliedItems, error: null };
  } catch (err: unknown) {
    const error = err as Error;
    return {
      success: false,
      appliedItems,
      error: error.message || "Discord API error",
    };
  }
}
