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

        // Send boss command
        const bossMsg = await agent.awaitResponse({
            trigger: () => agent.send("boss"),
            filter: (m) => m.author.id === agent.owoID,
            expectResponse: true,
        });

        if (!bossMsg) {
            logger.warn("[AutoBoss] No response from OwO");
            return;
        }

        // Check if this is a boss message
        const embedTitle = bossMsg.embeds[0]?.title || "";
        const hasBossEmbed = embedTitle.includes("Guild Boss") || embedTitle.includes("Boss");

        if (!hasBossEmbed) {
            logger.debug(`[AutoBoss] Not a boss message: "${embedTitle}"`);
            return;
        }

        logger.info(`[AutoBoss] Found boss embed: "${embedTitle}"`);
        logger.info(`[AutoBoss] Components: ${bossMsg.components.length}`);

        // Wait a moment for message to fully load
        await agent.client.sleep(500);

        // Try to click Fight button
        if (bossMsg.components.length === 0) {
            logger.warn("[AutoBoss] Message has no components/buttons");
            return;
        }

        for (const row of bossMsg.components) {
            if (row.type !== "ACTION_ROW") continue;

            const actionRow = row as MessageActionRow;
            for (const comp of actionRow.components) {
                if (comp.type !== "BUTTON") continue;

                const btn = comp as MessageButton;
                logger.info(`[AutoBoss] Button found: "${btn.label}" (${btn.customId})`);

                if (btn.customId) {
                    await agent.client.sleep(ranInt(500, 1000));
                    await bossMsg.clickButton(btn.customId);
                    logger.info("[AutoBoss] ✅ Clicked Fight button!");
                    return;
                }
            }
        }

        logger.warn("[AutoBoss] Could not find clickable button");
    }
});
