import { Schematic } from "@/structure/Schematic.js";
import { logger } from "@/utils/logger.js";
import { ranInt } from "@/utils/math.js";

export default Schematic.registerFeature({
    name: "autoChecklist",
    cooldown: () => {
        // Run once per day, at a random time after midnight UTC
        const now = new Date();
        const nextDay = new Date(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() + 1,
            ranInt(0, 5),
            ranInt(0, 59),
            ranInt(0, 59)
        );
        return nextDay.getTime() - now.getTime();
    },
    condition: async ({ agent: { config } }) => {
        // Reuse autoDaily config since checklist is also daily
        return config.autoDaily === true;
    },
    run: async ({ agent }) => {
        logger.info("[AutoChecklist] Checking and claiming checklist rewards...");

        // Get checklist status
        const checklistMsg = await agent.awaitResponse({
            trigger: () => agent.send("checklist"),
            filter: (m) => m.author.id === agent.owoID &&
                (m.content.includes("Checklist") || m.embeds.length > 0),
            expectResponse: true,
        });

        if (!checklistMsg) {
            logger.warn("[AutoChecklist] Could not get checklist info");
            return;
        }

        // Try to claim all available rewards (1-8)
        // OwO checklist has 8 tasks, each can be claimed with "owo claim <number>"
        for (let i = 1; i <= 8; i++) {
            await agent.client.sleep(ranInt(2000, 4000));

            const claimMsg = await agent.awaitResponse({
                trigger: () => agent.send(`cl claim ${i}`),
                filter: (m) => m.author.id === agent.owoID,
                expectResponse: true,
            });

            if (claimMsg) {
                const content = claimMsg.content.toLowerCase();
                if (content.includes("claimed") || content.includes("reward")) {
                    logger.info(`[AutoChecklist] Claimed reward #${i}!`);
                } else if (content.includes("already") || content.includes("complete")) {
                    logger.debug(`[AutoChecklist] Reward #${i} already claimed or not completed`);
                }
            }
        }

        logger.info("[AutoChecklist] Finished checking checklist");
    }
});
