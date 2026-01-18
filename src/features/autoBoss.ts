import { MessageActionRow, MessageButton } from "discord.js-selfbot-v13";

import { Schematic } from "@/structure/Schematic.js";
import { logger } from "@/utils/logger.js";
import { ranInt } from "@/utils/math.js";

export default Schematic.registerFeature({
    name: "autoBoss",
    cooldown: () => ranInt(15 * 60 * 1000, 17 * 60 * 1000), // 15-17 minutes
    condition: async () => true,
    run: async ({ agent }) => {
        logger.info("[AutoBoss] Checking for guild boss...");

        // Send boss command and wait for embed message
        const bossMsg = await agent.awaitResponse({
            trigger: () => agent.send("boss"),
            filter: (m) => {
                // Must be from OwO and have an embed
                if (m.author.id !== agent.owoID) return false;
                if (m.embeds.length === 0) return false;

                // Log embed structure for debugging
                const embed = m.embeds[0];
                logger.debug(`[AutoBoss] Embed: title="${embed.title}", author="${embed.author?.name}", desc="${embed.description?.slice(0, 50)}..."`);

                // Check if any embed field contains boss-related text
                const embedText = [
                    embed.title || "",
                    embed.description || "",
                    embed.author?.name || "",
                ].join(" ").toLowerCase();

                const isBossMessage = embedText.includes("guild boss") ||
                    embedText.includes("boss appeared") ||
                    embedText.includes("a guild boss");

                return isBossMessage;
            },
            expectResponse: true,
            time: 15000, // Wait up to 15 seconds
        });

        if (!bossMsg) {
            logger.debug("[AutoBoss] No boss available or on cooldown");
            return;
        }

        logger.info(`[AutoBoss] Got boss message, components: ${bossMsg.components.length}`);

        // Click Fight button
        if (bossMsg.components.length === 0) {
            logger.warn("[AutoBoss] Boss message has no buttons");
            return;
        }

        try {
            for (const row of bossMsg.components) {
                if (row.type !== "ACTION_ROW") continue;

                const actionRow = row as MessageActionRow;
                for (const comp of actionRow.components) {
                    if (comp.type !== "BUTTON") continue;

                    const btn = comp as MessageButton;
                    logger.info(`[AutoBoss] Found button: "${btn.label}" (${btn.customId})`);

                    if (btn.customId) {
                        await agent.client.sleep(ranInt(500, 1500));
                        await bossMsg.clickButton(btn.customId);
                        logger.info("[AutoBoss] ✅ Clicked Fight button!");
                        return;
                    }
                }
            }
            logger.warn("[AutoBoss] No clickable button found");
        } catch (error) {
            logger.error(`[AutoBoss] Error: ${error}`);
        }
    }
});
