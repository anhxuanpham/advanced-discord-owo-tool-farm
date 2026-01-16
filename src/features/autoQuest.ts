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
    // Format: "Quest description" followed by "Progress: [X/Y]"
    sayOwo: /say\s+['"]?owo['"]?.*?Progress:\s*\[(\d+)\/(\d+)\]/is,
    huntXp: /earn.*?xp.*?hunt.*?Progress:\s*\[(\d+)\/(\d+)\]/is,
    battleXp: /earn.*?xp.*?battle.*?Progress:\s*\[(\d+)\/(\d+)\]/is,
    animals: /catch.*?(common|uncommon|rare|epic|mythical|legendary|fabled).*?Progress:\s*\[(\d+)\/(\d+)\]/is,
    cookie: /receive.*?cookie.*?Progress:\s*\[(\d+)\/(\d+)\]/is,
    pray: /receive.*?(pray|curse).*?Progress:\s*\[(\d+)\/(\d+)\]/is,
    action: /(hug|pat|kiss|slap|punch|bite|lick|nom|poke|cuddle|wave|wink).*?Progress:\s*\[(\d+)\/(\d+)\]/is,
    battlePlayer: /battle.*?(friend|player).*?Progress:\s*\[(\d+)\/(\d+)\]/is,
    gambling: /gamble\s+(\d+)\s+times.*?Progress:\s*\[(\d+)\/(\d+)\]/is,
};

const GAMBLING_BET = 1000; // Bet amount for gambling quests

const parseQuests = (content: string): QuestInfo[] => {
    const quests: QuestInfo[] = [];

    // Parse quest content - format: "Quest X times! ... Progress: [current/target]"
    for (const [type, pattern] of Object.entries(QUEST_PATTERNS)) {
        const match = content.match(pattern);
        if (match) {
            // Progress and target are always the last two capture groups [current/target]
            const groups = match.filter(g => g && /^\d+$/.test(g));
            if (groups.length >= 2) {
                quests.push({
                    type,
                    progress: parseInt(groups[groups.length - 2]),
                    target: parseInt(groups[groups.length - 1]),
                    reward: "unknown"
                });
            }
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

                case "gambling":
                    // Gamble using coinflip or slots (respect OwO rate limit)
                    const gambleCommands = ["coinflip", "slots"];
                    const gambleCmd = gambleCommands[Math.floor(Math.random() * gambleCommands.length)];
                    const gambleCount = Math.min(remaining, 2); // Max 2 gambles per check to avoid spam
                    for (let i = 0; i < gambleCount; i++) {
                        await agent.send(`${gambleCmd} ${GAMBLING_BET}`);
                        logger.info(`[AutoQuest] Gambling: ${gambleCmd} ${GAMBLING_BET} (${i + 1}/${gambleCount})`);
                        if (i < gambleCount - 1) {
                            await agent.client.sleep(ranInt(10000, 15000)); // 10-15s delay to avoid rate limit
                        }
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
