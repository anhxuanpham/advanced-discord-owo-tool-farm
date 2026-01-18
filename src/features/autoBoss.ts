import { MessageActionRow, MessageButton } from "discord.js-selfbot-v13";

import { Schematic } from "@/structure/Schematic.js";
import { logger } from "@/utils/logger.js";
import { ranInt } from "@/utils/math.js";

export default Schematic.registerFeature({
    name: "autoBoss",
    cooldown: () => ranInt(15 * 60 * 1000, 17 * 60 * 1000), // 15-17 minutes
    condition: async () => true,
    run: async ({ agent }) => {
        logger.info("[AutoBoss] Sending boss command...");

        // Simple filter: just OwO messages with components (buttons)
        const bossMsg = await agent.awaitResponse({
            trigger: () => agent.send("boss"),
            filter: (m) => {
                if (m.author.id !== agent.owoID) return false;
                // Match any message with buttons (components)
                return m.components.length > 0;
            },
            expectResponse: true,
            time: 10000,
        });

        if (!bossMsg) {
            logger.debug("[AutoBoss] No boss message received");
            return;
        }

        logger.info(`[AutoBoss] Got message with ${bossMsg.components.length} rows`);

        // Click first button
        try {
            for (const row of bossMsg.components) {
                if (row.type !== "ACTION_ROW") continue;
                const actionRow = row as MessageActionRow;

                for (const comp of actionRow.components) {
                    if (comp.type !== "BUTTON") continue;
                    const btn = comp as MessageButton;

                    logger.info(`[AutoBoss] Clicking: "${btn.label}" (${btn.customId})`);

                    if (btn.customId) {
                        await agent.client.sleep(ranInt(500, 1500));
                        await bossMsg.clickButton(btn.customId);
                        logger.info("[AutoBoss] ✅ Done!");
                        return;
                    }
                }
            }
        } catch (err) {
            logger.error(`[AutoBoss] Error: ${err}`);
        }
    }
});
