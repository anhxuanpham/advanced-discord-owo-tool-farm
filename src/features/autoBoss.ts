import { MessageActionRow, MessageButton } from "discord.js-selfbot-v13";

import { Schematic } from "@/structure/Schematic.js";
import { logger } from "@/utils/logger.js";
import { ranInt } from "@/utils/math.js";

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

export default Schematic.registerFeature({
    name: "autoBoss",
    cooldown: () => ranInt(15 * 60 * 1000, 17 * 60 * 1000), // 15-17 minutes
    condition: async () => true,
    run: async ({ agent }) => {
        logger.info("[AutoBoss] Checking for guild boss...");

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
            // Log structure for debugging
            logger.debug(`[AutoBoss] Components structure: ${JSON.stringify(response.components, null, 2).slice(0, 500)}`);
            return;
        }

        logger.info(`[AutoBoss] Found button: "${button.label}" (${button.customId})`);
        await agent.client.sleep(ranInt(500, 1500));
        await response.clickButton(button.customId);
        logger.info("[AutoBoss] ✅ Clicked Fight button!");
    }
});
