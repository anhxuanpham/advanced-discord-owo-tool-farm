import { MessageActionRow, MessageButton } from "discord.js-selfbot-v13";

import { Schematic } from "@/structure/Schematic.js";
import { logger } from "@/utils/logger.js";
import { ranInt } from "@/utils/math.js";

export default Schematic.registerFeature({
    name: "autoBoss",
    cooldown: () => ranInt(15 * 60 * 1000, 17 * 60 * 1000), // 15-17 minutes
    condition: async ({ agent: { config } }) => {
        // Reuse autoDaily config or add separate autoBoss config if needed
        return config.autoDaily === true;
    },
    run: async ({ agent }) => {
        logger.info("[AutoBoss] Checking for guild boss...");

        // Send boss command
        const bossMsg = await agent.awaitResponse({
            trigger: () => agent.send("boss"),
            filter: (m) => m.author.id === agent.owoID &&
                (m.embeds.length > 0 && m.embeds[0].title?.includes("Guild Boss")) ||
                m.content.includes("boss") ||
                m.components.length > 0,
            expectResponse: true,
        });

        if (!bossMsg) {
            logger.warn("[AutoBoss] Could not get boss info");
            return;
        }

        // Check if there's a Fight button
        if (bossMsg.components.length > 0) {
            try {
                const actionRow = bossMsg.components.find(
                    (c) => c.type === "ACTION_ROW"
                ) as MessageActionRow | undefined;

                if (actionRow) {
                    const fightButton = actionRow.components.find(
                        (c) => c.type === "BUTTON" &&
                            ((c as MessageButton).label?.toLowerCase().includes("fight") ||
                                (c as MessageButton).customId?.toLowerCase().includes("fight"))
                    ) as MessageButton | undefined;

                    if (fightButton && fightButton.customId) {
                        logger.info("[AutoBoss] Found Fight button, clicking...");
                        await agent.client.sleep(ranInt(1000, 2000));
                        await bossMsg.clickButton(fightButton.customId);
                        logger.info("[AutoBoss] Clicked Fight button!");
                    } else {
                        logger.debug("[AutoBoss] No Fight button found in message");
                    }
                }
            } catch (error) {
                logger.error(`[AutoBoss] Error clicking button: ${error}`);
            }
        } else {
            // Check message content for cooldown or no boss
            if (bossMsg.content.includes("cooldown") || bossMsg.content.includes("wait")) {
                logger.debug("[AutoBoss] Boss is on cooldown");
            } else if (bossMsg.content.includes("no boss") || bossMsg.content.includes("defeated")) {
                logger.debug("[AutoBoss] No boss available");
            } else {
                logger.debug("[AutoBoss] Boss message has no buttons");
            }
        }
    }
});
