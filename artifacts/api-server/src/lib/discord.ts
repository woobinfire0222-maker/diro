import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { logger } from "./logger.js";
import { supabaseAdmin } from "./supabase.js";

const botToken = process.env.DISCORD_BOT_TOKEN;

let discordClient: Client | null = null;
let discordRest: REST | null = null;
let botInitialized = false;

export function getDiscordClient(): Client {
  if (!discordClient) {
    if (!botToken) {
      throw new Error("DISCORD_BOT_TOKEN is not set");
    }
    discordClient = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
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

/**
 * Send a payment approval DM to bini2222.
 * Looks up bini2222's discord_id from the users table, then sends a DM with approve/reject buttons.
 */
export async function sendApprovalDM(
  paymentId: string,
  orderId: string,
  amount: number,
  serverName: string,
  developerName: string,
): Promise<void> {
  // Find bini2222's discord_id from our users table
  const { data: biniUser } = await supabaseAdmin
    .from("users")
    .select("discord_id, username")
    .eq("username", "bini2222")
    .single();

  if (!biniUser?.discord_id) {
    logger.warn("bini2222 not found in users table or has no discord_id – cannot send DM");
    throw new Error("bini2222 계정을 찾을 수 없습니다. bini2222이 DIRO에 로그인한 적이 있어야 합니다.");
  }

  const client = getDiscordClient();

  // Wait briefly for the client to be ready if it just started
  if (!client.isReady()) {
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 5000);
      client.once("ready", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  const discordUser = await client.users.fetch(biniUser.discord_id);

  const embed = new EmbedBuilder()
    .setTitle("🔔 DIRO 결제 승인 요청")
    .setColor(0x5865F2)
    .setDescription("개발자가 가격을 확정했습니다. 승인하면 신청자에게 송금 알림이 전송됩니다.")
    .addFields(
      { name: "📌 서버명", value: serverName, inline: true },
      { name: "💰 금액", value: `₩${amount.toLocaleString()}`, inline: true },
      { name: "👨‍💻 개발자", value: developerName, inline: true },
      { name: "🏦 토스 계좌", value: `190839534245`, inline: false },
    )
    .setTimestamp()
    .setFooter({ text: `주문 ID: ${orderId.slice(0, 8)}…` });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`approve:${paymentId}`)
      .setLabel("✅ 승인")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`reject:${paymentId}`)
      .setLabel("❌ 거절")
      .setStyle(ButtonStyle.Danger),
  );

  await discordUser.send({ embeds: [embed], components: [row] });
  logger.info({ paymentId, orderId }, "Approval DM sent to bini2222");
}

/**
 * Initialize Discord bot: register InteractionCreate handler for approve/reject buttons.
 * Call once at server startup.
 */
export function initDiscordBot(): void {
  if (botInitialized) return;
  botInitialized = true;

  if (!botToken) {
    logger.warn("DISCORD_BOT_TOKEN not set – Discord bot disabled");
    return;
  }

  const client = getDiscordClient();

  client.once("clientReady", (readyClient) => {
    logger.info({ tag: readyClient.user.tag }, "Discord bot ready");
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const colonIdx = interaction.customId.indexOf(":");
    if (colonIdx === -1) return;

    const action = interaction.customId.slice(0, colonIdx);
    const paymentId = interaction.customId.slice(colonIdx + 1);

    if (action === "approve") {
      try {
        // Update payment to approved
        const { data: payment, error } = await supabaseAdmin
          .from("payment_requests")
          .update({ status: "approved", updated_at: new Date().toISOString() })
          .eq("id", paymentId)
          .select()
          .single();

        if (error || !payment) {
          await interaction.reply({ content: "❌ 오류: 결제 정보를 찾을 수 없습니다.", flags: 64 });
          return;
        }

        // Update order status to payment_pending
        await supabaseAdmin
          .from("orders")
          .update({ status: "payment_pending", updated_at: new Date().toISOString() })
          .eq("id", payment.order_id);

        // Get order info
        const { data: order } = await supabaseAdmin
          .from("orders")
          .select("user_id, order_number, server_name")
          .eq("id", payment.order_id)
          .single();

        if (order) {
          // Send payment message in chat
          await supabaseAdmin.from("order_messages").insert({
            order_id: payment.order_id,
            sender_id: payment.counselor_id,
            content: `₩${Number(payment.amount).toLocaleString()} 송금 요청이 도착했습니다.`,
            type: "payment",
            metadata_json: JSON.stringify({
              amount: payment.amount,
              deeplink: payment.deeplink,
              payment_id: paymentId,
            }),
          });

          // Notify the client user
          await supabaseAdmin.from("notifications").insert({
            user_id: order.user_id,
            type: "payment_request",
            title: `₩${Number(payment.amount).toLocaleString()} 결제 요청`,
            body: "채팅에서 송금하기 버튼을 눌러주세요",
            reference_id: payment.order_id,
          });
        }

        await interaction.reply({
          content: `✅ **승인 완료!** 신청자에게 송금 알림이 전송되었습니다.\n토스 계좌: \`190839534245\``,
          flags: 64,
        });
        logger.info({ paymentId }, "Payment approved via Discord button");
      } catch (err) {
        logger.error({ err }, "Error approving payment via Discord");
        try {
          await interaction.reply({ content: "❌ 처리 중 오류가 발생했습니다.", flags: 64 });
        } catch { /* already replied */ }
      }
    } else if (action === "reject") {
      try {
        await supabaseAdmin
          .from("payment_requests")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", paymentId);

        await interaction.reply({ content: "❌ **거절 완료.** 개발자에게 별도로 알려주세요.", flags: 64 });
        logger.info({ paymentId }, "Payment rejected via Discord button");
      } catch (err) {
        logger.error({ err }, "Error rejecting payment via Discord");
        try {
          await interaction.reply({ content: "❌ 처리 중 오류가 발생했습니다.", flags: 64 });
        } catch { /* already replied */ }
      }
    }
  });

  logger.info("Discord bot initialized and listening for interactions");
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
