import { UpdateFeature } from "@/services/UpdateService.js";
import { BaseAgent } from "@/structure/BaseAgent.js";
import { ExtendedClient } from "@/structure/core/ExtendedClient.js";
import { InquirerUI } from "@/structure/InquirerUI.js";
import { logger } from "@/utils/logger.js";
import { confirm } from "@inquirer/prompts";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import packageJSON from "./package.json" with { type: "json" };
import { Locale } from "@/utils/locales.js";
import { SentryService } from "@/services/SentryService.js";
import { ConfigManager } from "@/structure/core/ConfigManager.js";
import { CaptchaService } from "@/services/CaptchaService.js";

// Initialize Sentry as early as possible for error tracking
SentryService.init("https://1587723679cbc7f73e0ab4231f3a666c@o4510616815140864.ingest.us.sentry.io/4510616837619712");

// Graceful shutdown handler - wait for captcha solving to complete
let isShuttingDown = false;
const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`\n⚠️ Received ${signal}, initiating graceful shutdown...`);

    // Check if captcha solving is in progress
    if (CaptchaService.isSolving()) {
        logger.warn("🔄 Captcha solving in progress, waiting for completion...");

        // Wait up to 10 minutes for captcha to complete (OwO timeout is ~10min)
        const maxWait = 10 * 60 * 1000;
        const startTime = Date.now();

        while (CaptchaService.isSolving() && Date.now() - startTime < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            if (elapsed % 10 === 0) { // Log every 10 seconds
                logger.info(`⏳ Still waiting for captcha... (${elapsed}s elapsed)`);
            }
        }

        if (CaptchaService.isSolving()) {
            logger.error("⚠️ Captcha still in progress after max wait, forcing shutdown...");
        } else {
            logger.info("✅ Captcha completed, proceeding with shutdown.");
        }
    }

    logger.info("👋 Graceful shutdown complete. Goodbye!");
    process.exit(0);
};

// Register signal handlers
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.title = `Advanced Discord OwO Tool Farm v${packageJSON.version} - Copyright 2025 © Elysia x Kyou Izumi`;

const updateFeature = new UpdateFeature();

const argv = await yargs(hideBin(process.argv))
    .scriptName("adotf")
    .usage("$0 <command> [options]")
    .commandDir("./src/cli", {
        extensions: ["ts", "js"],
    })
    .option("verbose", {
        alias: "v",
        type: "boolean",
        description: "Enable verbose logging",
        default: false,
    })
    .option("skip-check-update", {
        alias: "s",
        type: "boolean",
        description: "Skip the update check",
        default: false,
    })
    .option("language", {
        alias: "l",
        type: "string",
        description: "Set the language for the application",
        choices: ["en", "tr", "vi"],
        default: "en",
    })
    .option("auto", {
        alias: "a",
        type: "boolean",
        description: "Auto-start with first saved account (skip CLI prompts)",
        default: false,
    })
    .option("account", {
        type: "string",
        description: "Account ID to auto-start with (use with --auto)",
    })
    .help()
    .epilogue(`For more information, visit ${packageJSON.homepage}`)
    .parse();

logger.setLevel(argv.verbose || process.env.NODE_ENV === "development" ? "debug" : "sent");
process.env.LOCALE = argv.language as Locale || "en";

if (!argv._.length) {
    // Auto-start mode for Docker/headless environments
    if (argv.auto) {
        const configManager = new ConfigManager();
        const allKeys = configManager.getAllKeys();

        if (allKeys.length === 0) {
            logger.error("No saved accounts found. Please run without --auto first to set up an account.");
            process.exit(1);
        }

        if (argv.account) {
            // Single account mode
            const config = configManager.get(argv.account);
            if (!config) {
                logger.error(`Account ${argv.account} not found. Available accounts: ${allKeys.join(", ")}`);
                process.exit(1);
            }

            logger.info(`[Auto-Start] Loading account: ${config.username || argv.account}`);
            try {
                const client = new ExtendedClient();
                await client.checkAccount(config.token);
                await BaseAgent.initialize(client, config);
            } catch (error) {
                logger.error(`Failed to auto-start: ${error}`);
                process.exit(1);
            }
        } else {
            // Multi-account mode: run ALL saved accounts in parallel
            logger.info(`[Auto-Start] Found ${allKeys.length} account(s), starting all in parallel...`);

            const startAccount = async (accountId: string) => {
                const config = configManager.get(accountId);
                if (!config) {
                    logger.error(`[${accountId}] Config not found, skipping.`);
                    return;
                }

                const label = config.username || accountId;
                logger.info(`[${label}] Logging in...`);

                try {
                    const client = new ExtendedClient();
                    // Timeout login after 30s to avoid blocking other accounts
                    await Promise.race([
                        client.checkAccount(config.token),
                        new Promise((_, reject) => setTimeout(() => reject(new Error("Login timed out after 30s")), 30000))
                    ]);
                    await BaseAgent.initialize(client, config);
                    logger.info(`[${label}] Farm loop started.`);
                } catch (error) {
                    logger.error(`[${label}] Failed to start: ${error}`);
                }
            };

            // Stagger logins by 5s each to avoid rate limits
            for (let i = 0; i < allKeys.length; i++) {
                if (i > 0) {
                    logger.info(`[Auto-Start] Waiting 5s before next account login...`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
                await startAccount(allKeys[i]);
            }

            logger.info(`[Auto-Start] All ${allKeys.length} account(s) are now running.`);
        }
    } else {
        // Normal interactive mode
        const client = new ExtendedClient();

        if (!argv.skipCheckUpdate) {
            const updateAvailable = await updateFeature.checkForUpdates();
            if (updateAvailable) {
                const shouldUpdate = await confirm({
                    message: "An update is available. Do you want to update now?",
                    default: true,
                });
                if (shouldUpdate) {
                    await updateFeature.performUpdate();
                }
            }
            await client.sleep(1000); // Wait for update to complete
        }

        const { config } = await InquirerUI.prompt(client);
        await BaseAgent.initialize(client, config);
    }
}

