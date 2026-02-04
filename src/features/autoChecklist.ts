import { Schematic } from "@/structure/Schematic.js";
import { logger } from "@/utils/logger.js";
import { ranInt } from "@/utils/math.js";

// Patterns to detect incomplete checklist items from OwO's response
const CHECKLIST_PATTERNS = {
    cookie: /You can still send a cookie/i,
    quest: /You can still claim a quest/i,
    daily: /You haven't claimed your daily/i,
    vote: /You can claim your vote/i,
    // Lootbox and weapon crate are handled by other features (autoHuntbot, autoBattle)
};

export default Schematic.registerFeature({
    name: "autoChecklist",
    cooldown: () => ranInt(30 * 60 * 1000, 45 * 60 * 1000), // 30-45 minutes (more frequent checks)
    condition: async ({ agent: { config } }) => {
        // Reuse autoDaily config since checklist is also daily-ish
        return config.autoDaily === true;
    },
    run: async ({ agent }) => {
        logger.info("[AutoChecklist] Checking checklist status...");

        // 1. Get current checklist status
        const claimMsg = await agent.awaitResponse({
            trigger: () => agent.send("cl"),
            filter: (m) => m.author.id === agent.owoID,
            expectResponse: true,
            time: 15000,
        });

        if (!claimMsg) {
            logger.warn("[AutoChecklist] No response from checklist command");
            return;
        }

        // Parse content from embed or message
        const content = claimMsg.embeds[0]?.description || claimMsg.content || "";
        logger.debug(`[AutoChecklist] Checklist content: ${content.slice(0, 200)}...`);

        // 2. Detect and complete missing tasks
        let tasksTriggered = 0;

        // --- Cookie ---
        if (CHECKLIST_PATTERNS.cookie.test(content)) {
            if (agent.config.adminID) {
                logger.info("[AutoChecklist] Cookie not sent yet, sending now...");
                await agent.client.sleep(ranInt(2000, 5000));
                await agent.send(`cookie <@${agent.config.adminID}>`);
                tasksTriggered++;
            } else {
                logger.warn("[AutoChecklist] Cookie needed but no adminID configured!");
            }
        }

        // --- Quest ---
        if (CHECKLIST_PATTERNS.quest.test(content)) {
            logger.info("[AutoChecklist] Quest not claimed, triggering quest...");
            await agent.client.sleep(ranInt(2000, 5000));
            await agent.send("quest");
            tasksTriggered++;
        }

        // --- Daily ---
        if (CHECKLIST_PATTERNS.daily.test(content)) {
            logger.info("[AutoChecklist] Daily not claimed, claiming now...");
            await agent.client.sleep(ranInt(2000, 5000));
            await agent.send("daily");
            tasksTriggered++;
        }

        // --- Vote (just notify, can't auto-vote) ---
        if (CHECKLIST_PATTERNS.vote.test(content)) {
            logger.info("[AutoChecklist] Vote available! User should vote manually at https://top.gg/bot/408785106942164992/vote");
        }

        // 3. If we triggered tasks, re-check checklist after a delay to claim rewards
        if (tasksTriggered > 0) {
            logger.info(`[AutoChecklist] Triggered ${tasksTriggered} tasks. Rechecking in 10s...`);
            await agent.client.sleep(ranInt(8000, 12000));

            // Final claim attempt
            await agent.awaitResponse({
                trigger: () => agent.send("cl"),
                filter: (m) => m.author.id === agent.owoID,
                expectResponse: true,
                time: 10000,
            });
            logger.info("[AutoChecklist] Checklist re-checked after completing tasks.");
        } else {
            logger.info("[AutoChecklist] All checklist items appear complete or handled by other features.");
        }
    }
});
