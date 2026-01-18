import { Configuration } from "@/schemas/ConfigSchema.js";
import { BaseParams, CaptchaSolver } from "@/typings/index.js";
import { TwoCaptchaSolver } from "@/services/solvers/TwoCaptchaSolver.js";
import { YesCaptchaSolver } from "@/services/solvers/YesCaptchaSolver.js";
import { TwoCrawlerSolver } from "@/services/solvers/TwoCrawlerSolver.js";
import { FailoverCaptchaSolver } from "@/services/solvers/FailoverCaptchaSolver.js";
import { downloadAttachment } from "@/utils/download.js";
import { logger } from "@/utils/logger.js";
import { ranInt } from "@/utils/math.js";
import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import os from "node:os";
import { Message, MessageActionRow, MessageButton } from "discord.js-selfbot-v13";
import { NORMALIZE_REGEX, CAPTCHA } from "@/typings/constants.js";
import { NotificationService } from "./NotificationService.js";

interface CaptchaServiceOptions {
    provider?: Configuration["captchaAPI"];
    apiKey?: string;
    backupProvider?: Configuration["backupCaptchaAPI"];
    backupApiKey?: string;
}

/**
 * Maps Node.js os.platform() output to sec-ch-ua-platform values.
 */
const getPlatformForHeader = (): string => {
    switch (os.platform()) {
        case "win32":
            return "Windows";
        case "darwin":
            return "macOS";
        case "linux":
            return "Linux";
        default:
            // A sensible default for other platforms like FreeBSD, etc.
            return "Unknown";
    }
};

const createSingleSolver = (provider: Configuration["captchaAPI"], apiKey: string): CaptchaSolver | undefined => {
    switch (provider) {
        case "yescaptcha":
            return new YesCaptchaSolver(apiKey);
        case "2captcha":
            return new TwoCaptchaSolver(apiKey);
        case "2crawler":
            return new TwoCrawlerSolver(apiKey);
        default:
            logger.error(`Unknown captcha provider: ${provider}`);
            return undefined;
    }
}

/**
 * Creates a solver with optional failover support
 */
const createSolver = (options: CaptchaServiceOptions): CaptchaSolver | undefined => {
    const { provider, apiKey, backupProvider, backupApiKey } = options;

    if (!provider || !apiKey) {
        return undefined;
    }

    const primarySolver = createSingleSolver(provider, apiKey);
    if (!primarySolver) {
        return undefined;
    }

    // If backup provider is configured, create failover solver
    if (backupProvider && backupApiKey) {
        const backupSolver = createSingleSolver(backupProvider, backupApiKey);
        if (backupSolver) {
            logger.info(`[CaptchaService] Failover enabled: ${provider} → ${backupProvider}`);
            return new FailoverCaptchaSolver([
                { name: provider, solver: primarySolver },
                { name: backupProvider, solver: backupSolver },
            ]);
        }
    }

    // No backup, use primary only
    return primarySolver;
}

export class CaptchaService {
    private solver: CaptchaSolver | undefined;

    private axiosInstance = wrapper(axios.create({
        jar: new CookieJar(),
        timeout: 30000,
        headers: {
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache",
            "Sec-Ch-Ua": `"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"`,
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": `"${getPlatformForHeader()}"`,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        }
    }))

    constructor(options: CaptchaServiceOptions) {
        const { provider, apiKey } = options;
        if (provider && apiKey) {
            this.solver = createSolver(options);
        } else {
            logger.warn("Captcha API or API key not configured. Captcha handling will be disabled.");
        }
    }

    public solveImageCaptcha = async (attachmentUrl: string): Promise<string> => {
        if (!this.solver) {
            throw new Error("Captcha solver is not configured.");
        }

        logger.debug(`Downloading captcha image from ${attachmentUrl}`);
        const imageBuffer = await downloadAttachment(attachmentUrl);

        const solution = await this.solver.solveImage(imageBuffer);
        logger.debug(`Captcha solution: ${solution}`);

        return solution;
    }

    public solveHcaptcha = async (
        location: string,
        onPanic?: () => void,
        sitekey: string = "a6a1d5ce-612d-472d-8e37-7601408fbc09",
        siteurl: string = "https://owobot.com"
    ): Promise<void> => {
        if (!this.solver) {
            throw new Error("Captcha solver is not configured.");
        }

        logger.info(`[Captcha] Starting hCaptcha solving process for: ${location}`);

        // Step 1: Follow the OAuth redirect chain (this establishes the session)
        logger.info("[Captcha] Step 1: Following OAuth redirect chain...");
        const oauthResponse = await this.axiosInstance.get(location, {
            headers: {
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                "Referer": "https://discord.com/",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "cross-site",
                "Sec-Fetch-User": "?1",
                "Upgrade-Insecure-Requests": "1",
                "Priority": "u=0, i"
            },
            maxRedirects: 10,
            validateStatus: (status) => status < 400 // Accept redirects
        });
        logger.info(`[Captcha] OAuth response status: ${oauthResponse.status}`);

        // Step 2: Visit the captcha page explicitly
        logger.info("[Captcha] Step 2: Visiting captcha page...");
        try {
            await this.axiosInstance.get("https://owobot.com/captcha", {
                headers: {
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    "Referer": "https://owobot.com/",
                    "Sec-Fetch-Dest": "document",
                    "Sec-Fetch-Mode": "navigate",
                    "Sec-Fetch-Site": "same-origin",
                    "Sec-Fetch-User": "?1",
                    "Upgrade-Insecure-Requests": "1",
                    "Priority": "u=0, i"
                }
            });
        } catch (error) {
            logger.warn(`Captcha page visit failed: ${error}`);
        }

        // Step 3: Check authentication status
        logger.info("[Captcha] Step 3: Checking authentication status...");
        const accountResponse = await this.axiosInstance.get("https://owobot.com/api/auth", {
            headers: {
                "Accept": "application/json, text/plain, */*",
                "Origin": "https://owobot.com",
                "Referer": "https://owobot.com/captcha",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin",
                "Priority": "u=1, i"
            }
        });

        logger.info(`[Captcha] Auth status - Banned: ${accountResponse.data?.banned || false}, Captcha Active: ${accountResponse.data?.captcha?.active || false}`);

        if (accountResponse.data?.banned) {
            throw new Error("Account is banned.");
        }

        // If captcha is not active, it was already solved (manually or by another process)
        if (!accountResponse.data?.captcha?.active) {
            logger.info("[Captcha] Captcha is no longer active - already solved!");
            return; // Success - captcha was resolved
        }

        // Step 4: Solve the hCaptcha
        logger.info(`[Captcha] Step 4: Solving hCaptcha with sitekey: ${sitekey}`);
        const solution = await this.solver.solveHcaptcha(sitekey, siteurl, onPanic);
        logger.info(`[Captcha] hCaptcha token received (length: ${solution.length})`);

        // Step 5: Submit the verification (matching your successful browser request exactly)
        logger.info("[Captcha] Step 5: Submitting captcha verification...");
        const verificationResponse = await this.axiosInstance.post("https://owobot.com/api/captcha/verify", {
            token: solution // Using "code" as per your successful browser request
        }, {
            headers: {
                "Accept": "application/json, text/plain, */*",
                "Content-Type": "application/json",
                "Origin": "https://owobot.com",
                "Referer": "https://owobot.com/captcha",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin",
                "Priority": "u=1, i"
            }
        });

        if (verificationResponse.status !== 200) {
            const errorData = verificationResponse.data;
            logger.error(`Verification response: ${JSON.stringify(errorData, null, 2)}`);
            throw new Error(`Failed to verify captcha: ${verificationResponse.status} - ${verificationResponse.statusText} - ${JSON.stringify(errorData)}`);
        }

        logger.info("✅ hCaptcha verification successful!");
    }

    // Singleton lock to prevent parallel captcha solve attempts (prevents YesCaptcha rate limiting)
    private static solvingInProgress = false;
    private static lastSolveTime = 0;
    private static captchaStartTime = 0;
    private static lastProgressNotifyTime = 0;
    private static lastSolveProvider = "unknown";
    private static solveDuration = 0;

    // Check if captcha solving is in progress (for graceful shutdown)
    public static isSolving(): boolean {
        return CaptchaService.solvingInProgress;
    }

    public static async handleCaptcha(params: BaseParams, message: Message, retries: number = 0): Promise<void> {
        const { agent } = params;
        const normalizedContent = message.content.normalize("NFC").replace(NORMALIZE_REGEX, "");
        const maxRetries = CAPTCHA.MAX_RETRIES;

        // Check if another instance already solved recently (within 10 seconds)
        if (Date.now() - CaptchaService.lastSolveTime < 10000) {
            logger.debug('Captcha was recently solved, skipping this attempt...');
            // Reset captchaDetected since the captcha was already handled
            agent.captchaDetected = false;
            return;
        }

        // Wait if another solve is in progress (max 60 seconds to stay within 10min timeout)
        if (CaptchaService.solvingInProgress && retries === 0) {
            logger.debug('Captcha solving already in progress, waiting...');
            let waitCount = 0;
            while (CaptchaService.solvingInProgress && waitCount < 60) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                waitCount++;
            }
            if (Date.now() - CaptchaService.lastSolveTime < 10000) {
                logger.debug('Captcha was solved while waiting, skipping...');
                // Reset captchaDetected since the captcha was already handled
                agent.captchaDetected = false;
                return;
            }
        }

        // Set lock
        CaptchaService.solvingInProgress = true;

        const captchaService = new CaptchaService({
            provider: agent.config.captchaAPI,
            apiKey: agent.config.apiKey,
            backupProvider: agent.config.backupCaptchaAPI,
            backupApiKey: agent.config.backupApiKey,
        });
        const notificationService = new NotificationService();

        // Track start time for progress notifications (only on first attempt)
        if (retries === 0) {
            CaptchaService.captchaStartTime = Date.now();
            CaptchaService.lastProgressNotifyTime = 0;
        }

        // Check if this is a repeat captcha (within 5 minutes of last solve)
        const timeSinceLastSolve = Date.now() - CaptchaService.lastSolveTime;
        const isRepeatCaptcha = CaptchaService.lastSolveTime > 0 && timeSinceLastSolve < CAPTCHA.REPEAT_THRESHOLD;

        // Only notify on first attempt
        if (retries === 0) {
            NotificationService.consoleNotify(params);

            // Send warning if this is a repeat captcha
            if (isRepeatCaptcha) {
                logger.alert(`⚠️ REPEAT CAPTCHA! New captcha appeared ${Math.floor(timeSinceLastSolve / 1000)}s after last solve!`);
                await notificationService.notify(params, {
                    title: "⚠️ REPEAT CAPTCHA",
                    description: `Status: 🔄 **NEW CAPTCHA** appeared ${Math.floor(timeSinceLastSolve / 1000)}s after last solve!`,
                    urgency: "critical",
                    content: `${agent.config.adminID ? `<@${agent.config.adminID}> ` : ""}⚠️ Suspicious! New captcha in channel: <#${message.channel.id}>`,
                    sourceUrl: message.url,
                    fields: [
                        { name: "Time Since Last Solve", value: `${Math.floor(timeSinceLastSolve / 1000)}s`, inline: true },
                        { name: "Action Required", value: "Monitor closely - may need manual intervention", inline: true },
                    ]
                });
            }
        }

        try {
            // Anti-detection: Human reaction time (3-8s) before starting to solve
            if (retries === 0) {
                const reactionTime = ranInt(3000, 8000);
                logger.info(`[Captcha] Waiting ${(reactionTime / 1000).toFixed(1)}s (simulating human reaction)...`);
                await new Promise(resolve => setTimeout(resolve, reactionTime));
            }

            const attachmentUrl = message.attachments.first()?.url;
            if (attachmentUrl) {
                logger.info(`[Captcha] Image captcha detected, attempting to solve... (Attempt ${retries + 1}/${maxRetries + 1})`);
                const solution = await captchaService.solveImageCaptcha(attachmentUrl);

                logger.debug(`Attempting reach OwO bot...`);
                const owo = await agent.client.users.fetch(agent.owoID);

                const dms = await owo.createDM();
                logger.info(`[Captcha] DM channel created, sending solution: ${solution}`);

                const captchaResponse = await agent.awaitResponse({
                    channel: dms,
                    filter: (msg) => msg.author.id == agent.owoID && /verified that you are.{1,3}human!/igm.test(msg.content),
                    trigger: async () => dms.send(solution),
                    time: 30_000
                });

                if (!captchaResponse) {
                    throw new Error("No response from OwO bot after sending captcha solution.");
                }
            } else if (
                /(https?:\/\/[^\s]+)/g.test(normalizedContent)
                || (
                    message.components.length > 0 && message.components[0].type == "ACTION_ROW"
                    && (message.components[0] as MessageActionRow).components[0].type == "BUTTON"
                    && /(https?:\/\/[^\s]+)/g.test(((message.components[0] as MessageActionRow).components[0] as MessageButton).url || "")
                )
            ) {
                logger.info(`[Captcha] Link captcha detected, attempting to solve... (Attempt ${retries + 1}/${maxRetries + 1})`);
                const { location } = await agent.client.authorizeURL("https://discord.com/oauth2/authorize?response_type=code&redirect_uri=https%3A%2F%2Fowobot.com%2Fapi%2Fauth%2Fdiscord%2Fredirect&scope=identify%20guilds%20email%20guilds.members.read&client_id=408785106942164992")
                await captchaService.solveHcaptcha(location, async () => {
                    logger.alert("🚨 PANIC MODE ACTIVATED! Sending critical alert.");
                    await notificationService.notify(params, {
                        title: "🚨 CAPTCHA PANIC MODE",
                        description: "Status: 🔄 **PARALLEL SOLVING** (7m elapsed)",
                        urgency: "critical",
                        content: `${agent.config.adminID ? `<@${agent.config.adminID}> ` : ""}Captcha taking too long! Bot is now running all solvers in parallel.`,
                        sourceUrl: message.url,
                        fields: [
                            { name: "Time Elapsed", value: `${Math.floor((Date.now() - CaptchaService.captchaStartTime) / 1000)}s`, inline: true },
                            { name: "Timeout Limit", value: "10:00 (Ban Avoidance)", inline: true },
                            { name: "Action", value: "Manual intervention recommended if not solved soon", inline: false }
                        ]
                    });
                });
            }

            // If we reach here, captcha was solved successfully
            agent.totalCaptchaSolved++;
            CaptchaService.solveDuration = Math.round((Date.now() - CaptchaService.captchaStartTime) / 1000);

            // Get provider name from solver
            if (captchaService.solver && 'getCurrentProviderName' in captchaService.solver) {
                CaptchaService.lastSolveProvider = (captchaService.solver as any).getCurrentProviderName();
            } else {
                CaptchaService.lastSolveProvider = agent.config.captchaAPI || "unknown";
            }

            logger.info(`Captcha solved by ${CaptchaService.lastSolveProvider} in ${CaptchaService.solveDuration}s (attempt ${retries + 1})!`);

            // Add delay after solving to prevent immediate captcha respawn
            // Longer delay if this was a repeat captcha
            const postSolveDelay = isRepeatCaptcha
                ? 30000 + Math.random() * 30000  // 30-60 seconds after repeat captcha
                : 15000 + Math.random() * 10000; // 15-25 seconds normal
            logger.info(`Waiting ${(postSolveDelay / 1000).toFixed(1)}s before resuming${isRepeatCaptcha ? ' (extended delay - repeat captcha)' : ''}...`);
            await new Promise(resolve => setTimeout(resolve, postSolveDelay));

            // Only notify on successful resolution
            await notificationService.notify(params, {
                title: "CAPTCHA DETECTED",
                description: "Status: ✅ RESOLVED",
                urgency: "normal",
                content: `${agent.config.adminID ? `<@${agent.config.adminID}> ` : ""}Captcha detected in channel: <#${message.channel.id}>`,
                sourceUrl: message.url,
                imageUrl: attachmentUrl,
                fields: [
                    {
                        name: "Captcha Type",
                        value: attachmentUrl
                            ? `[Image Captcha](${attachmentUrl})`
                            : "[Link Captcha](https://owobot.com/captcha)",
                        inline: true
                    },
                    {
                        name: "Attempt",
                        value: `${retries + 1}/${maxRetries + 1}`,
                        inline: true
                    },
                    {
                        name: "Provider",
                        value: CaptchaService.lastSolveProvider,
                        inline: true
                    },
                    {
                        name: "Solve Time",
                        value: `${CaptchaService.solveDuration}s`,
                        inline: true
                    }
                ]
            });

            // Mark solving complete and record time
            CaptchaService.solvingInProgress = false;
            CaptchaService.lastSolveTime = Date.now();

            // Reset captcha flag and resume farming AFTER the delay
            agent.captchaDetected = false;
            if (agent.config.autoResume) {
                agent.farmLoop();
            }
        } catch (error) {
            const errorMessage = (error as Error).message;
            logger.error(`Failed to solve captcha on attempt ${retries + 1}:`);
            logger.error(error as Error);

            // Detect rate limiting (disguised as key error from YesCaptcha)
            const isRateLimited = errorMessage.includes('密钥错误') ||
                errorMessage.includes('屏蔽') ||
                errorMessage.includes('blocked');

            // Retry logic
            if (retries < maxRetries) {
                let delay: number;

                if (isRateLimited) {
                    // Rate limited - wait 15-25 seconds (safer for 10min timeout)
                    delay = 15000 + Math.random() * 10000;
                    logger.warn(`[YesCaptcha] Rate limit detected, waiting ${(delay / 1000).toFixed(1)}s before retry...`);
                } else {
                    // Normal error - use exponential backoff
                    const baseDelay = CAPTCHA.BASE_DELAY * Math.pow(CAPTCHA.EXPONENTIAL_BASE, retries);
                    const jitter = baseDelay * CAPTCHA.JITTER_FACTOR * (Math.random() * 2 - 1);
                    delay = Math.min(
                        Math.max(baseDelay + jitter, CAPTCHA.BASE_DELAY),
                        CAPTCHA.MAX_DELAY
                    );
                }

                logger.warn(
                    `Retrying captcha solving in ${(delay / 1000).toFixed(1)}s... ` +
                    `(Attempt ${retries + 1}/${maxRetries})`
                );

                // Send progress notification if solving takes too long
                const elapsedTime = Date.now() - CaptchaService.captchaStartTime;
                const shouldSendProgress = elapsedTime > CAPTCHA.PROGRESS_START_TIME &&
                    Date.now() - CaptchaService.lastProgressNotifyTime > CAPTCHA.PROGRESS_INTERVAL;

                if (shouldSendProgress) {
                    CaptchaService.lastProgressNotifyTime = Date.now();
                    const timeRemaining = Math.floor((CAPTCHA.TOTAL_TIMEOUT - elapsedTime) / 1000);
                    logger.warn(`⏳ Captcha solving taking long: ${Math.floor(elapsedTime / 60000)}m elapsed, ~${Math.floor(timeRemaining / 60)}m remaining`);

                    await notificationService.notify(params, {
                        title: "⏳ CAPTCHA STILL TRYING",
                        description: `Status: 🔄 **IN PROGRESS** (${Math.floor(elapsedTime / 60000)}m elapsed)`,
                        urgency: "critical",
                        content: `${agent.config.adminID ? `<@${agent.config.adminID}> ` : ""}Still trying to solve captcha in <#${message.channel.id}>`,
                        sourceUrl: message.url,
                        fields: [
                            { name: "Attempt", value: `${retries + 1}/${maxRetries + 1}`, inline: true },
                            { name: "Time Remaining", value: `~${Math.floor(timeRemaining / 60)}m ${timeRemaining % 60}s`, inline: true },
                            { name: "Last Error", value: `\`${errorMessage.slice(0, 100)}\``, inline: false }
                        ]
                    });
                }

                await new Promise(resolve => setTimeout(resolve, delay));
                return CaptchaService.handleCaptcha(params, message, retries + 1);
            }

            // Release lock on failure
            CaptchaService.solvingInProgress = false;

            // Max retries reached, give up - only notify on complete failure
            logger.alert(`All ${maxRetries + 1} attempts to solve captcha failed, waiting for manual resolution.`);
            logger.info(`WAITING FOR THE CAPTCHA TO BE RESOLVED TO ${agent.config.autoResume ? "RESTART" : "STOP"}...`);

            agent.totalCaptchaFailed++;
            await notificationService.notify(params, {
                title: "CAPTCHA DETECTED",
                description: `Status: ❌ **UNRESOLVED**`,
                urgency: "critical",
                content: `${agent.config.adminID ? `<@${agent.config.adminID}> ` : ""}Captcha detected in channel: <#${message.channel.id}>`,
                sourceUrl: message.url,
                imageUrl: message.attachments.first()?.url,
                fields: [
                    {
                        name: "Captcha Type",
                        value: message.attachments.first()
                            ? `[Image Captcha](${message.attachments.first()?.url})`
                            : "[Link Captcha](https://owobot.com/captcha)",
                        inline: true
                    },
                    {
                        name: "Failed Attempts",
                        value: `${maxRetries + 1}/${maxRetries + 1}`,
                        inline: true
                    },
                    {
                        name: "Last Error",
                        value: `\`${error instanceof Error ? error.message : String(error)}\``,
                    },
                    {
                        name: "Please resolve the captcha manually before",
                        value: `<t:${Math.floor(message.createdTimestamp / 1000 + 600)}:f>`,
                    },
                ]
            });
        }
    }
}