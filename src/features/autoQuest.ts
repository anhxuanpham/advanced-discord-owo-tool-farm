import { Schematic } from "@/structure/Schematic.js";
import { logger } from "@/utils/logger.js";
import { ranInt } from "@/utils/math.js";

interface QuestInfo {
    type: string;
    progress: number;
    target: number;
    reward: string;
}

const QUEST_PATTERNS = {
    sayOwo: /say\s+['"]?owo['"]?\s+(\d+)\s*\/\s*(\d+)/i,
    huntXp: /earn\s+(\d+)\s*\/\s*(\d+)\s+xp.*hunt/i,
    battleXp: /earn\s+(\d+)\s*\/\s*(\d+)\s+xp.*battle/i,
    animals: /catch\s+(\d+)\s*\/\s*(\d+).*(common|uncommon|rare|epic|mythical|legendary|fabled)/i,
    cookie: /receive\s+(\d+)\s*\/\s*(\d+)\s+cookie/i,
    pray: /receive\s+(\d+)\s*\/\s*(\d+)\s+(pray|curse)/i,
    action: /(hug|pat|kiss|slap|punch|bite|lick|nom|poke|cuddle|wave|wink)\s+.*(\d+)\s*\/\s*(\d+)/i,
    battlePlayer: /battle\s+.*player.*(\d+)\s*\/\s*(\d+)/i,
};

const parseQuests = (content: string): QuestInfo[] => {
    const quests: QuestInfo[] = [];

    // Parse quest content - adjust based on actual OwO format
    for (const [type, pattern] of Object.entries(QUEST_PATTERNS)) {
        const match = content.match(pattern);
        if (match) {
            quests.push({
                type,
                progress: parseInt(match[1]),
                target: parseInt(match[2]),
                reward: "unknown"
            });
        }
    }

    return quests;
};

export default Schematic.registerFeature({
    name: "autoQuest",
    cooldown: () => ranInt(30 * 60 * 1000, 45 * 60 * 1000), // 30-45 phút
    condition: async ({ agent: { config } }) => {
        if (!config.autoQuest) return false;
        return true;
    },
    run: async ({ agent, t }) => {
        logger.info("[AutoQuest] Checking quests...");

        // 1. Get current quests
        const questMsg = await agent.awaitResponse({
            trigger: () => agent.send("quest"),
            filter: (m) => m.author.id === agent.owoID &&
                (m.content.includes("Quest") || m.embeds.length > 0),
            expectResponse: true,
        });

        if (!questMsg) {
            logger.warn("[AutoQuest] Could not get quest info");
            return;
        }

        // Parse quest content (from message or embed)
        const content = questMsg.embeds[0]?.description || questMsg.content;
        const quests = parseQuests(content);

        logger.info(`[AutoQuest] Found ${quests.length} active quests`);

        for (const quest of quests) {
            if (quest.progress >= quest.target) {
                logger.info(`[AutoQuest] Quest "${quest.type}" already completed!`);
                continue;
            }

            const remaining = quest.target - quest.progress;

            switch (quest.type) {
                case "sayOwo":
                    // Say owo (will be done periodically in autoQuote)
                    logger.debug(`[AutoQuest] sayOwo: ${quest.progress}/${quest.target}`);
                    break;

                case "cookie":
                case "pray":
                    // Request from admin - gửi tin nhắn reminder
                    if (agent.config.adminID) {
                        logger.info(`[AutoQuest] Need ${remaining} ${quest.type} from admin`);
                        // Admin sẽ gửi cookie/pray khi thấy notification
                    }
                    break;

                case "action":
                    // Do action on admin
                    if (agent.config.adminID) {
                        const actions = ["hug", "pat", "cuddle"];
                        const action = actions[Math.floor(Math.random() * actions.length)];
                        await agent.send(`${action} <@${agent.config.adminID}>`);
                        logger.info(`[AutoQuest] Sent ${action} to admin`);
                    }
                    break;

                case "battlePlayer":
                    // Battle with admin
                    if (agent.config.adminID) {
                        await agent.send(`battle <@${agent.config.adminID}>`);
                        logger.info(`[AutoQuest] Challenged admin to battle`);
                    }
                    break;

                default:
                    // huntXp, battleXp, animals are handled by existing features
                    logger.debug(`[AutoQuest] ${quest.type}: ${quest.progress}/${quest.target} - handled by other features`);
            }
        }

        // 2. Check if any quest completed - try to claim
        // OwO usually auto-claims, but we can recheck
        await agent.client.sleep(ranInt(2000, 5000));
    }
});
