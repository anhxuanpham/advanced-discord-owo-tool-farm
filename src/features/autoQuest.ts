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

// Quests that cannot be auto-completed (need other players)
const UNCOMPLETABLE_QUESTS = ["battlePlayer", "cookie", "pray"];

const GAMBLING_BET = 1000; // Bet amount for gambling quests

// Action commands for action quests (will be sent to adminID)
const ACTION_COMMANDS = ["hug", "pat", "kiss", "cuddle", "poke", "slap", "bite", "lick", "nom", "punch", "wave", "wink"];

// Track reroll usage (1 per day)
let lastRerollDate = "";
let rerollUsed = false;

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
    cooldown: () => ranInt(3 * 60 * 1000, 4 * 60 * 1000), // 3-4 phút
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

        // Reset reroll flag at new day
        const today = new Date().toDateString();
        if (lastRerollDate !== today) {
            lastRerollDate = today;
            rerollUsed = false;
        }

        // Check for uncompletable quests and reroll (1-indexed for OwO)
        if (!rerollUsed) {
            for (let i = 0; i < quests.length; i++) {
                const quest = quests[i];
                if (UNCOMPLETABLE_QUESTS.includes(quest.type) && quest.progress === 0) {
                    const questNum = i + 1; // OwO uses 1-indexed
                    logger.info(`[AutoQuest] Quest ${questNum} "${quest.type}" cannot be auto-completed, rerolling...`);

                    await agent.awaitResponse({
                        trigger: () => agent.send(`quest rr ${questNum}`),
                        filter: (m) => m.author.id === agent.owoID,
                        expectResponse: true,
                    });

                    rerollUsed = true;
                    logger.info(`[AutoQuest] Rerolled quest ${questNum}!`);

                    // Return to re-check quests next cycle
                    return;
                }
            }
        }

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
                case "battlePlayer":
                    // These quests are auto-rerolled if detected at 0 progress
                    // If still here, means progress > 0 or already used reroll today
                    logger.debug(`[AutoQuest] ${quest.type}: ${quest.progress}/${quest.target} - cannot auto-complete`);
                    break;

                case "gambling":
                    // Gamble using coinflip or slots (3 min cooldown)
                    const gambleCommands = ["coinflip", "slots"];
                    const gambleCmd = gambleCommands[Math.floor(Math.random() * gambleCommands.length)];
                    // Only 1 gamble per quest check, 3 min cooldown between checks
                    await agent.send(`${gambleCmd} ${GAMBLING_BET}`);
                    logger.info(`[AutoQuest] Gambling: ${gambleCmd} ${GAMBLING_BET}`);
                    break;

                case "action":
                    // Send action command to adminID
                    if (!agent.config.adminID) {
                        logger.warn("[AutoQuest] Action quest detected but no adminID configured - cannot auto-complete");
                        break;
                    }

                    // Do up to remaining actions (max 3 per cycle to avoid spam)
                    const actionsThisCycle = Math.min(remaining, 3);
                    for (let i = 0; i < actionsThisCycle; i++) {
                        const actionCmd = ACTION_COMMANDS[Math.floor(Math.random() * ACTION_COMMANDS.length)];
                        await agent.send(`${actionCmd} <@${agent.config.adminID}>`);
                        logger.info(`[AutoQuest] Action: ${actionCmd} <@${agent.config.adminID}> (${quest.progress + i + 1}/${quest.target})`);
                        await agent.client.sleep(ranInt(3 * 60 * 1000, 4 * 60 * 1000)); // Delay 3-4 minutes between actions
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
