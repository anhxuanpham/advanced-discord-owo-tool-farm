import { Schematic } from "@/structure/Schematic.js";
import { logger } from "@/utils/logger.js";
import { ranInt } from "@/utils/math.js";

export default Schematic.registerFeature({
	name: "autoCookie",
	cooldown: () => ranInt(12 * 60 * 60 * 1000, 13 * 60 * 60 * 1000), // 12-13 hours (once per day, with buffer)
	condition: async ({ agent, t }) => {
		if (!agent.config.autoCookie) return false;
		if (!agent.config.adminID) {
			logger.warn(t("features.common.errors.noAdminID", { feature: "autoCookie" }));
			return false;
		}

		// Validate adminID is a valid Discord snowflake (17-19 digits)
		if (!/^\d{17,19}$/.test(agent.config.adminID)) {
			logger.warn(`[AutoCookie] Invalid adminID format: ${agent.config.adminID}`);
			return false;
		}

		return true;
	},
	run: async ({ agent }) => {
		logger.info(`[AutoCookie] Sending daily cookie to admin (${agent.config.adminID})...`);

		// Send cookie and wait for response
		const response = await agent.awaitResponse({
			trigger: () => agent.send(`cookie <@${agent.config.adminID}>`),
			filter: (m) => m.author.id === agent.owoID &&
				(m.content.includes("cookie") || m.content.includes("already sent") || m.content.includes("🍪")),
			expectResponse: true,
			time: 15000,
		});

		if (response) {
			const content = response.content.toLowerCase();
			if (content.includes("already sent") || content.includes("cooldown")) {
				logger.info("[AutoCookie] Cookie already sent today.");
			} else {
				logger.info("[AutoCookie] Cookie sent successfully!");
			}
		} else {
			logger.warn("[AutoCookie] No response received from cookie command.");
		}
	},
});
