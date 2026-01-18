import { MessageActionRow, MessageButton } from "discord.js-selfbot-v13";

import { Schematic } from "@/structure/Schematic.js";
import { logger } from "@/utils/logger.js";
import { ranInt } from "@/utils/math.js";
import { NotificationService } from "@/services/NotificationService.js";

// Recursive function to find FIGHT button in nested components
function findFightButton(components: any[]): MessageButton | null {
    for (const comp of components) {
        // Direct button with "fight" in customId
        if (comp.type === "BUTTON" && comp.customId?.toLowerCase().includes("fight")) {
            return comp as MessageButton;
        }
        // Nested in ACTION_ROW
        if (comp.type === "ACTION_ROW" && comp.components) {
            const btn = findFightButton(comp.components);
            if (btn) return btn;
        }
        // Nested in CONTAINER (Components V2)
        if (comp.type === "CONTAINER" && comp.components) {
            const btn = findFightButton(comp.components);
            if (btn) return btn;
        }
        // Nested in SECTION (Components V2)
        if (comp.type === "SECTION" && comp.components) {
            const btn = findFightButton(comp.components);
            if (btn) return btn;
        }
        // SECTION may have accessory which is a button
        if (comp.type === "SECTION" && comp.accessory) {
            if (comp.accessory.type === "BUTTON" && comp.accessory.customId?.toLowerCase().includes("fight")) {
                return comp.accessory as MessageButton;
            }
        }
        // Generic: any object with components array
        if (comp.components && Array.isArray(comp.components)) {
            const btn = findFightButton(comp.components);
            if (btn) return btn;
        }
    }
    return null;
}

// Extract boss info from embed
function extractBossInfo(embeds: any[]): { title: string; monsters: string } {
    if (!embeds || embeds.length === 0) {
        return { title: "Guild Boss", monsters: "Unknown" };
    }

    const embed = embeds[0];
    const title = embed.title || embed.author?.name || "Guild Boss";

    // Try to extract monster names from fields or description
    let monsters = "Unknown";
    if (embed.fields && embed.fields.length > 0) {
        monsters = embed.fields.map((f: any) => f.name).join(", ");
    } else if (embed.description) {
        monsters = embed.description.slice(0, 100);
    }

    return { title, monsters };
}

export default Schematic.registerFeature({
    name: "autoBoss",
    cooldown: () => ranInt(15 * 60 * 1000, 17 * 60 * 1000), // 15-17 minutes
    condition: async () => true,
    run: async (params) => {
        const { agent } = params;
        logger.info("[AutoBoss] Checking for guild boss...");
        const notificationService = new NotificationService();

        // Wait for message with components
        const response = await agent.awaitResponse({
            trigger: () => agent.send("boss"),
            filter: msg => msg.author.id === agent.owoID && msg.components.length > 0,
            time: 15000
        });

        if (!response) {
            logger.debug("[AutoBoss] No boss message received");
            return;
        }

        logger.info(`[AutoBoss] Got response with ${response.components.length} component rows`);

        // Find button recursively
        const button = findFightButton(response.components);

        if (!button || !button.customId) {
            logger.warn("[AutoBoss] Could not find Fight button");
            logger.debug(`[AutoBoss] Components structure: ${JSON.stringify(response.components, null, 2).slice(0, 500)}`);
            return;
        }

        logger.info(`[AutoBoss] Found button: "${button.label}" (${button.customId})`);
        await agent.client.sleep(ranInt(500, 1500));

        try {
            await response.clickButton(button.customId);
            logger.info("[AutoBoss] ✅ Clicked Fight button!");

            // Extract boss info for notification
            const { title, monsters } = extractBossInfo(response.embeds);

            // Send webhook notification
            await notificationService.notify(params, {
                title: "⚔️ GUILD BOSS FIGHT",
                description: "Status: ✅ FIGHTING",
                urgency: "normal",
                content: `${agent.config.adminID ? `<@${agent.config.adminID}> ` : ""}Guild boss in channel: <#${response.channel.id}>`,
                sourceUrl: response.url,
                fields: [
                    {
                        name: "Boss",
                        value: title,
                        inline: true
                    },
                    {
                        name: "Account",
                        value: agent.client.user?.username || "Unknown",
                        inline: true
                    },
                    {
                        name: "Time",
                        value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                        inline: true
                    }
                ]
            });
        } catch (error) {
            const msg = String(error);
            if (msg.includes("BUTTON_CANNOT_CLICK") || msg.includes("disabled")) {
                logger.debug("[AutoBoss] Button already clicked or disabled (boss may be defeated)");
            } else {
                logger.error(`[AutoBoss] Error clicking button: ${error}`);
            }
        }
    }
});
