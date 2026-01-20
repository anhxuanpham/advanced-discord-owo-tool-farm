import { Schematic } from "@/structure/Schematic.js";
import { logger } from "@/utils/logger.js";
import { ranInt } from "@/utils/math.js";

export default Schematic.registerFeature({
	name: "autoCookie",
	cooldown: () => ranInt(5 * 60 * 60 * 1000, 6 * 60 * 60 * 1000), // 5-6 hours
	condition: async ({ agent, t }) => {
		if (!agent.config.autoCookie) return false;
		if (!agent.config.adminID) {
			logger.warn(t("features.common.errors.noAdminID", { feature: "autoCookie" }));
			return false;
		}

		const admin = agent.client.users.cache.get(agent.config.adminID);
		if (!admin || admin.id === admin.client.user?.id) {
			logger.warn(t("features.common.errors.invalidAdminID", { feature: "autoCookie" }));
			return false;
		}

		return true;
	},
	run: async ({ agent }) => {
		await agent.send(`cookie ${agent.config.adminID}`);
		logger.info(`[AutoCookie] Sent cookie to admin (${agent.config.adminID})`);
	},
});
