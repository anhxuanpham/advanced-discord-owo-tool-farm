import { Schematic } from "@/structure/Schematic.js";
import { logger } from "@/utils/logger.js";
import { ranInt } from "@/utils/math.js";

export default Schematic.registerFeature({
    name: "autoLootbox",
    cooldown: () => ranInt(2 * 60 * 60 * 1000, 3 * 60 * 60 * 1000), // 2-3 hours
    condition: async ({ agent: { config } }) => {
        return config.autoLootbox === true;
    },
    run: async ({ agent }) => {
        logger.info("[AutoLootbox] Checking inventory for lootboxes...");

        const invMsg = await agent.awaitResponse({
            trigger: () => agent.send("inv"),
            filter: (m) => m.author.id === agent.owoID
                && m.content.includes(agent.client.user?.displayName || "")
                && m.content.includes("Inventory"),
            expectResponse: true,
        });

        if (!invMsg) {
            logger.warn("[AutoLootbox] Could not get inventory");
            return;
        }

        const inventory = invMsg.content.split("`");
        const hasLootbox = inventory.includes("050");
        const hasFabled = inventory.includes("049");

        logger.debug(`[AutoLootbox] Lootbox: ${hasLootbox}, Fabled: ${hasFabled}`);

        if (hasFabled && agent.config.autoFabledLootbox) {
            logger.info("[AutoLootbox] Opening fabled lootbox!");
            await agent.send("lb fabled");
            await agent.client.sleep(ranInt(3000, 5000));
        }

        if (hasLootbox) {
            logger.info("[AutoLootbox] Opening all lootboxes!");
            await agent.send("lb all");
        }

        if (!hasLootbox && !hasFabled) {
            logger.debug("[AutoLootbox] No lootboxes found");
        }
    }
});
