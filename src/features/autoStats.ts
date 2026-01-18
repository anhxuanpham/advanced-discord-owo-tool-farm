import { Schematic } from "@/structure/Schematic.js";
import { NotificationService } from "@/services/NotificationService.js";
import { logger } from "@/utils/logger.js";

export default Schematic.registerFeature({
    name: "autoStats",
    cooldown: () => 12 * 60 * 60 * 1000, // 12 hours
    condition: async ({ agent }) => {
        // Only run if webhook is configured
        return agent.config.wayNotify.includes("webhook") && !!agent.config.webhookURL;
    },
    run: async (params) => {
        const { agent } = params;

        try {
            const summary = agent.stats.getStatsSummary();
            const embed = agent.stats.generateEmbed(summary);

            const notificationService = new NotificationService();

            await notificationService.notify(params, {
                title: "📊 AUTO STATS REPORT",
                description: `Periodic statistics update for **${agent.client.user?.username || "Bot"}**`,
                urgency: "normal",
                content: "",
                fields: embed.fields,
                footer: embed.footer,
                timestamp: embed.timestamp
            });

            logger.info("[AutoStats] Stats report sent to webhook");
        } catch (error) {
            logger.error("[AutoStats] Failed to send stats report:");
            logger.error(error as Error);
        }
    }
});
