import { Message, MessageActionRow, MessageButton } from "discord.js-selfbot-v13";

import { Schematic } from "@/structure/Schematic.js";
import { logger } from "@/utils/logger.js";
import { ranInt } from "@/utils/math.js";

/**
 * Parse Vietnamese time format like "17 giờ tới", "30 phút tới", "2 ngày tới"
 * Also handles English formats like "17 hours", "30 minutes"
 * @returns time in milliseconds, or null if parsing fails
 */
function parseReplenishTime(text: string): number | null {
    // Vietnamese patterns
    const viPatterns = [
        { regex: /(\d+)\s*giờ/i, multiplier: 60 * 60 * 1000 },        // hours
        { regex: /(\d+)\s*phút/i, multiplier: 60 * 1000 },            // minutes
        { regex: /(\d+)\s*giây/i, multiplier: 1000 },                 // seconds
        { regex: /(\d+)\s*ngày/i, multiplier: 24 * 60 * 60 * 1000 },  // days
    ];

    // English patterns
    const enPatterns = [
        { regex: /(\d+)\s*hour/i, multiplier: 60 * 60 * 1000 },
        { regex: /(\d+)\s*minute/i, multiplier: 60 * 1000 },
        { regex: /(\d+)\s*second/i, multiplier: 1000 },
        { regex: /(\d+)\s*day/i, multiplier: 24 * 60 * 60 * 1000 },
    ];

    const allPatterns = [...viPatterns, ...enPatterns];

    for (const { regex, multiplier } of allPatterns) {
        const match = text.match(regex);
        if (match) {
            const value = parseInt(match[1], 10);
            if (!isNaN(value) && value > 0) {
                // Add a small buffer (1-2 minutes) to ensure ticket is available
                return value * multiplier + ranInt(60000, 120000);
            }
        }
    }

    return null;
}

// Recursive function to find FIGHT button in nested components
function findFightButton(components: any[]): MessageButton | null {
    for (const comp of components) {
        // Direct button with "fight" in customId
        if (comp.type === "BUTTON" && comp.customId?.toLowerCase().includes("fight")) {
            return comp as MessageButton;
        }
        // Nested in ACTION_ROW
        if (comp.type === "ACTION_ROW" && comp.components) {
            const btn = findFightButton(comp.components);
            if (btn) return btn;
        }
        // Nested in CONTAINER (Components V2)
        if (comp.type === "CONTAINER" && comp.components) {
            const btn = findFightButton(comp.components);
            if (btn) return btn;
        }
        // Nested in SECTION (Components V2)
        if (comp.type === "SECTION" && comp.components) {
            const btn = findFightButton(comp.components);
            if (btn) return btn;
        }
        // SECTION may have accessory which is a button
        if (comp.type === "SECTION" && comp.accessory) {
            if (comp.accessory.type === "BUTTON" && comp.accessory.customId?.toLowerCase().includes("fight")) {
                return comp.accessory as MessageButton;
            }
        }
        // Generic: any object with components array
        if (comp.components && Array.isArray(comp.components)) {
            const btn = findFightButton(comp.components);
            if (btn) return btn;
        }
    }
    return null;
}



export default Schematic.registerFeature({
    name: "autoBoss",
    cooldown: () => ranInt(15 * 60 * 1000, 17 * 60 * 1000), // 15-17 minutes
    condition: async () => true,
    run: async ({ agent }) => {
        logger.info("[AutoBoss] Checking for guild boss...");

        // Wait for message with components or ticket error
        const response = await agent.awaitResponse({
            trigger: () => agent.send("boss"),
            filter: msg => msg.author.id === agent.owoID,
            time: 15000
        });

        if (!response) {
            logger.debug("[AutoBoss] No boss message received");
            return;
        }

        const lowerContent = response.content.toLowerCase();

        // Check for "no tickets" message
        if (lowerContent.includes("ran out of boss tickets") || lowerContent.includes("don't have any boss tickets")) {
            const timeMatch = response.content.match(/Replenishes in (.*?)(?:\n|$)/i) ||
                response.content.match(/next ticket in (.*?)(?:\n|$)/i);
            const timeInfo = timeMatch ? timeMatch[1].trim() : null;

            if (timeInfo) {
                const cooldownMs = parseReplenishTime(timeInfo);
                if (cooldownMs) {
                    const hours = Math.floor(cooldownMs / (60 * 60 * 1000));
                    const minutes = Math.floor((cooldownMs % (60 * 60 * 1000)) / (60 * 1000));
                    logger.info(`[AutoBoss] 🎫 Out of boss tickets. Waiting ${hours}h ${minutes}m until replenish.`);
                    return cooldownMs; // Return dynamic cooldown
                }
            }

            logger.info(`[AutoBoss] 🎫 Out of boss tickets. Replenishes in: ${timeInfo || "unknown time"}`);
            // Default to 1 hour if we can't parse the time
            return 60 * 60 * 1000 + ranInt(60000, 300000);
        }

        if (response.components.length === 0) {
            logger.debug("[AutoBoss] Received message without components (and no ticket error)");
            return;
        }

        logger.info(`[AutoBoss] Got response with ${response.components.length} component rows`);

        // Find button recursively
        const button = findFightButton(response.components);

        if (!button || !button.customId) {
            logger.warn("[AutoBoss] Could not find Fight button");
            logger.debug(`[AutoBoss] Components structure: ${JSON.stringify(response.components, null, 2).slice(0, 500)}`);
            return;
        }

        logger.info(`[AutoBoss] Found button: "${button.label}" (${button.customId})`);
        await agent.client.sleep(ranInt(500, 1500));

        try {
            const interactionResponse = await response.clickButton(button.customId);
            logger.info("[AutoBoss] ✅ Clicked Fight button!");

            // Check if the interaction response indicates no tickets (after clicking)
            if (interactionResponse && interactionResponse instanceof Message) {
                const irContent = interactionResponse.content || "";
                const lowerIR = irContent.toLowerCase();

                if (lowerIR.includes("don't have any boss tickets") || lowerIR.includes("ran out of boss tickets")) {
                    const timeMatch = irContent.match(/Replenishes in (.*?)(?:\n|$)/i) ||
                        irContent.match(/next ticket in (.*?)(?:\n|$)/i);
                    const timeInfo = timeMatch ? timeMatch[1].trim() : null;

                    if (timeInfo) {
                        const cooldownMs = parseReplenishTime(timeInfo);
                        if (cooldownMs) {
                            const hours = Math.floor(cooldownMs / (60 * 60 * 1000));
                            const minutes = Math.floor((cooldownMs % (60 * 60 * 1000)) / (60 * 1000));
                            logger.info(`[AutoBoss] 🎫 Out of boss tickets (after click). Waiting ${hours}h ${minutes}m until replenish.`);
                            return cooldownMs; // Return dynamic cooldown
                        }
                    }

                    logger.info(`[AutoBoss] 🎫 Out of boss tickets (after click). Replenishes in: ${timeInfo || "unknown time"}`);
                    return 60 * 60 * 1000 + ranInt(60000, 300000);
                }
            }
        } catch (error) {
            const msg = String(error);
            if (msg.includes("BUTTON_CANNOT_CLICK") || msg.includes("disabled")) {
                logger.debug("[AutoBoss] Button already clicked or disabled (boss may be defeated)");
            } else {
                logger.error(`[AutoBoss] Error clicking button: ${error}`);
            }
        }
    }
});
