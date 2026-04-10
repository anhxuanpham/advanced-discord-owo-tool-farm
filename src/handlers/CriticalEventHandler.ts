import { NotificationService } from "@/services/NotificationService.js";
import { FeatureFnParams } from "@/typings/index.js";
import { t } from "@/utils/locales.js";
import { logger } from "@/utils/logger.js";

export class CriticalEventHandler {
    private static initialized = false;

    public static handleRejection(params: FeatureFnParams) {
        // Only register global process handlers once (multi-account safe)
        if (CriticalEventHandler.initialized) return;
        CriticalEventHandler.initialized = true;

        process.on("unhandledRejection", (reason, promise) => {
            logger.runtime("Unhandled Rejection at:");
            logger.runtime(`Promise: ${promise}`);
            logger.runtime(`Reason: ${reason}`);
        });

        process.on("uncaughtException", (error) => {
            logger.error("Uncaught Exception:");
            logger.error(error)
        });

        // SIGINT/SIGTERM are handled by graceful shutdown in index.ts
        // Do NOT register them here to avoid bypassing captcha-aware shutdown
    }

    public static handleBan(params: FeatureFnParams) {
        const { agent, t } = params;
        const label = agent.config.username || agent.client.user?.id || "unknown";
        logger.alert(`[${label}] ${t("status.states.banned")}, ${t("status.states.stop")}`);
        // Stop only this account's farm loop, not the entire process
        agent.farmLoopPaused = true;
        agent.client.destroy();
        NotificationService.consoleNotify(params);
    }

    public static async handleNoMoney(params: FeatureFnParams) {
        const { agent, t } = params;
        const label = agent.config.username || agent.client.user?.id || "unknown";
        if (agent.config.autoSell) {
            logger.warn(`[${label}] ${t("handlers.criticalEvent.noMoney.attemptingSell")}`);

            const sellResponse = await agent.awaitResponse({
                trigger: () => agent.send("sell all"),
                filter: (msg) => msg.author.id === agent.owoID && msg.content.includes(msg.guild?.members.me?.displayName!)
                    && (/sold.*for a total of/.test(msg.content) || msg.content.includes("You don't have enough animals!")),
            })

            if (!sellResponse) {
                logger.error(`[${label}] Failed to sell items. No response received.`);
                return;
            }

            if (/sold.*for a total of/.test(sellResponse.content)) {
                logger.data(sellResponse.content.replace(/<a?:(\w+):\d+>/g, '$1').replace("**", "")); // Replace emojis with their names
            } else {
                logger.warn(`[${label}] ${t("handlers.criticalEvent.noMoney.noItems")}`);
                NotificationService.consoleNotify(params);
                // Stop only this account's farm loop, not the entire process
                agent.farmLoopPaused = true;
            }
        } else {
            logger.warn(`[${label}] ${t("handlers.criticalEvent.noMoney.autoSellDisabled")}`);
            NotificationService.consoleNotify(params);
            // Stop only this account's farm loop, not the entire process
            agent.farmLoopPaused = true;
        }
    }
}