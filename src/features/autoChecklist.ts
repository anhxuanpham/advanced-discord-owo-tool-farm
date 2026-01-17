import { Schematic } from "@/structure/Schematic.js";
import { logger } from "@/utils/logger.js";
import { ranInt } from "@/utils/math.js";

export default Schematic.registerFeature({
    name: "autoChecklist",
    cooldown: () => ranInt(8 * 60 * 60 * 1000, 9 * 60 * 60 * 1000), // 8-9 hours (3 times per day)
    condition: async ({ agent: { config } }) => {
        // Reuse autoDaily config since checklist is also daily
        return config.autoDaily === true;
    },
    run: async ({ agent }) => {
        logger.info("[AutoChecklist] Claiming checklist rewards...");

        // Just send "cl" to claim all available checklist rewards
        const claimMsg = await agent.awaitResponse({
            trigger: () => agent.send("cl"),
            filter: (m) => m.author.id === agent.owoID,
            expectResponse: true,
        });

        if (claimMsg) {
            logger.info("[AutoChecklist] Checklist claimed!");
        } else {
            logger.warn("[AutoChecklist] No response from checklist command");
        }
    }
});
