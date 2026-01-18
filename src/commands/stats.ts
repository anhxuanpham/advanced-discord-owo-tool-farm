import { Schematic } from "@/structure/Schematic.js";
import { NotificationService } from "@/services/NotificationService.js";
import { logger } from "@/utils/logger.js";

export default Schematic.registerCommand({
    name: "stats",
    description: "commands.stats.description",
    aliases: ["st", "statistics"],
    usage: "stats",
    execute: async (params) => {
        const { agent, message, t } = params;

        try {
            const summary = agent.stats.getStatsSummary();
            const reportText = agent.stats.generateReport('text');
            const embed = agent.stats.generateEmbed(summary);

            // Send to Discord channel as text report (primary response)
            await message.reply("```\n" + reportText + "\n```");

            // If webhook is enabled, send detailed report via webhook
            if (agent.config.wayNotify.includes("webhook") && agent.config.webhookURL) {
                const notificationService = new NotificationService();

                await notificationService.notify(params, {
                    title: "📊 DETAILED STATISTICS REPORT",
                    description: "Requested via command",
                    urgency: "normal",
                    content: `Here is the detailed statistics report for **${agent.client.user.username}**`,
                    fields: embed.fields,
                    footer: embed.footer,
                    timestamp: embed.timestamp
                });

                await message.channel.send("✅ Detailed report has been sent to your webhook!");
            } else {
                await message.channel.send("💡 Tip: Enable `webhook` in your config to receive detailed visual reports!");
            }
        } catch (error) {
            logger.error("Error generating stats report:");
            logger.error(error as Error);
            await message.reply("❌ Failed to generate statistics report.");
        }
    }
});
