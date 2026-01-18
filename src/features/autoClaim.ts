import { Schematic } from "@/structure/Schematic.js";
import { logger } from "@/utils/logger.js";
import { ranInt } from "@/utils/math.js";

export default Schematic.registerFeature({
    name: "autoClaim",
    cooldown: () => ranInt(12 * 60 * 60 * 1000, 24 * 60 * 60 * 1000), // 12-24 hours
    condition: async ({ agent: { config } }) => {
        return config.autoDaily; // Reuse autoDaily config for claiming rewards
    },
    run: async ({ agent }) => {
        logger.info("[AutoClaim] Sending claim command...");
        await agent.send("claim");
    },
});
