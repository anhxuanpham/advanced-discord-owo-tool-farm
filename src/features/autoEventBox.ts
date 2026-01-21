import { Schematic } from "@/structure/Schematic.js";
import { logger } from "@/utils/logger.js";
import { ranInt } from "@/utils/math.js";

export default Schematic.registerFeature({
    name: "autoEventBox",
    cooldown: () => ranInt(8000, 12000), // 8-12 seconds
    condition: async () => true,
    run: async ({ agent }) => {
        logger.debug("[AutoEventBox] Checking inventory for event boxes...");

        const invMsg = await agent.awaitResponse({
            trigger: () => agent.send("inv"),
            filter: (m) => m.author.id === agent.owoID
                && m.content.includes(agent.client.user?.displayName || "")
                && m.content.includes("Inventory"),
            expectResponse: true,
        });

        if (!invMsg) {
            logger.warn("[AutoEventBox] Could not get inventory");
            return;
        }

        const inventory = invMsg.content.split("`");
        const hasEventBox = inventory.includes("028");

        if (hasEventBox) {
            logger.info("[AutoEventBox] Found event box (028)! Opening...");
            await agent.send("use 28");
        } else {
            logger.debug("[AutoEventBox] No event box (028) found");
        }
    }
});
