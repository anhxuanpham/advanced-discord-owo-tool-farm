import { Schematic } from "@/structure/Schematic.js";
import { ranInt } from "@/utils/math.js";
import { logger } from "@/utils/logger.js";


export default Schematic.registerFeature({
    name: "autoDaily",
    cooldown: () => ranInt(10 * 60 * 1000, 30 * 60 * 1000), // Default 10-30 min, will be overridden by response
    condition: async ({ agent: { config } }) => {
        if (!config.autoDaily) return false;
        return true;
    },
    run: async ({ agent }) => {
        const response = await agent.awaitResponse({
            trigger: () => agent.send("daily"),
            filter: (m) => m.author.id === agent.owoID,
            expectResponse: true,
        });

        if (!response) {
            logger.debug("[AutoDaily] No response from OwO bot");
            return 5 * 60 * 1000; // Retry in 5 minutes
        }

        // Parse cooldown từ response: "wait 6H 33M 39S" hoặc "wait 33M 39S" hoặc "wait 39S"
        const content = response.content;

        // Check nếu claim thành công
        if (content.includes("Here is your daily")) {
            logger.info("[AutoDaily] Daily claimed successfully!");
            return 12 * 60 * 60 * 1000 + ranInt(60_000, 300_000); // 12h + random 1-5min
        }

        // Parse cooldown: "wait XH YM ZS"
        const hourMatch = content.match(/(\d+)H/i);
        const minMatch = content.match(/(\d+)M/i);
        const secMatch = content.match(/(\d+)S/i);

        if (hourMatch || minMatch || secMatch) {
            const hours = hourMatch ? parseInt(hourMatch[1]) : 0;
            const minutes = minMatch ? parseInt(minMatch[1]) : 0;
            const seconds = secMatch ? parseInt(secMatch[1]) : 0;
            const cooldownMs = (hours * 3600 + minutes * 60 + seconds) * 1000;

            logger.debug(`[AutoDaily] Cooldown remaining: ${hours}H ${minutes}M ${seconds}S`);
            return cooldownMs + ranInt(60_000, 180_000); // Add 1-3 min buffer
        }

        // Unknown response, retry in 30 min
        logger.debug("[AutoDaily] Unknown response, retrying later");
        return 30 * 60 * 1000;
    }
})
