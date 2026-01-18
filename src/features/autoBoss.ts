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

        // Filter: OwO message with components
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

        // Log component structure for debugging
        const row = response.components[0];
        logger.debug(`[AutoBoss] Row type: ${row?.type} (${typeof row?.type})`);

        // Cast to MessageActionRow and get first button
        const actionRow = row as MessageActionRow;
        if (!actionRow?.components?.length) {
            logger.warn("[AutoBoss] No components in action row");
            return;
        }

        const firstComp = actionRow.components[0];
        logger.debug(`[AutoBoss] Component type: ${firstComp?.type} (${typeof firstComp?.type})`);

        // Cast to button and click
        const button = firstComp as MessageButton;
        logger.info(`[AutoBoss] Button: label="${button.label}", customId="${button.customId}", style="${button.style}"`);

        if (!button.customId) {
            logger.warn("[AutoBoss] Button has no customId");
            return;
        }

        await agent.client.sleep(ranInt(500, 1500));
        await response.clickButton(button.customId);
        logger.info("[AutoBoss] ✅ Clicked Fight button!");
    }
});
