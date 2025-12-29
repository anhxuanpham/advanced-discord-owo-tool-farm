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

// Initialize Sentry as early as possible for error tracking
SentryService.init("https://1587723679cbc7f73e0ab4231f3a666c@o4510616815140864.ingest.us.sentry.io/4510616837619712");

process.title = `Advanced Discord OwO Tool Farm v${packageJSON.version} - Copyright 2025 © Elysia x Kyou Izumi`;
console.clear();

const updateFeature = new UpdateFeature();
const client = new ExtendedClient();

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
    .help()
    .epilogue(`For more information, visit ${packageJSON.homepage}`)
    .parse();

logger.setLevel(argv.verbose || process.env.NODE_ENV === "development" ? "debug" : "sent");
process.env.LOCALE = argv.language as Locale || "en";

if (!argv._.length) {
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
