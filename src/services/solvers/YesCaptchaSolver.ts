import { CaptchaSolver } from "@/typings/index.js";
import axios, { AxiosInstance } from "axios";
import { logger } from "@/utils/logger.js";

// --- Type Definitions ---
type ImageToTextTask = {
    type: "ImageToTextTaskMuggle" | "ImageToTextTaskM1";
    body: string; // Base64 encoded image data
};

type HCaptchaTask = {
    type: "HCaptchaTaskProxyless";
    websiteURL: string;
    websiteKey: string;
    userAgent?: string;
    isInvisible?: boolean;
    rqdata?: string;
};

type TaskCreatedResponse = {
    errorId: 0 | 1;
    errorCode?: string;
    errorDescription?: string;
    taskId: string;
};

type ImageToTextResponse = {
    errorId: 0 | 1;
    errorCode?: string;
    errorDescription?: string;
    solution: {
        text: string;
    };
};

type TaskResultResponse = {
    errorId: 0 | 1;
    errorCode?: string;
    errorDescription?: string;
    status: "ready" | "processing";
    solution?: {
        gRecaptchaResponse: string;
        userAgent: string;
        respKey?: string;
    };
};

// --- Configuration ---
const POLLING_CONFIG = {
    INITIAL_DELAY: 5000,        // First poll after 5s (hCaptcha needs time to process)
    MAX_DELAY: 15000,           // Max 15s between polls
    BACKOFF_FACTOR: 1.12,       // Increase delay by 12% each time (slower backoff)
    MAX_ATTEMPTS: 30,           // Max 30 attempts (~3 minutes with backoff)
    TIMEOUT_MS: 180000,         // 3 minutes timeout (faster failover to backup provider)
    SERVER_TIMEOUT_RETRY: 2,    // Retry 2 times if YesCaptcha server times out, then failover
} as const;

// --- Helper Function ---
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- Class Implementation ---
export class YesCaptchaSolver implements CaptchaSolver {
    private axiosInstance: AxiosInstance;

    constructor(private apiKey: string) {
        this.axiosInstance = axios.create({
            baseURL: "https://api.yescaptcha.com",
            headers: { "User-Agent": "YesCaptcha-Node-Client" },
            validateStatus: () => true, // Handle all status codes in the response
            timeout: 30000, // 30s timeout per request
        });
    }

    // Overloaded method to create different captcha tasks
    public createTask(options: ImageToTextTask): Promise<{ data: ImageToTextResponse }>;
    public createTask(options: HCaptchaTask): Promise<{ data: TaskCreatedResponse }>;
    public createTask(options: ImageToTextTask | HCaptchaTask): Promise<{ data: ImageToTextResponse | TaskCreatedResponse }> {
        return this.axiosInstance.post("/createTask", {
            clientKey: this.apiKey,
            task: options,
        });
    }

    private async pollTaskResult(taskId: string): Promise<TaskResultResponse | null> {
        const startTime = Date.now();
        let attempt = 0;
        let currentDelay: number = POLLING_CONFIG.INITIAL_DELAY;

        logger.debug(`[YesCaptcha] Starting to poll task ${taskId}`);

        while (attempt < POLLING_CONFIG.MAX_ATTEMPTS) {
            // Check total timeout
            const elapsedTime = Date.now() - startTime;
            if (elapsedTime >= POLLING_CONFIG.TIMEOUT_MS) {
                throw new Error(
                    `[YesCaptcha] Task ${taskId} timed out after ${(elapsedTime / 1000).toFixed(1)}s ` +
                    `(${attempt} attempts)`
                );
            }

            await delay(currentDelay);
            attempt++;

            try {
                const response = await this.axiosInstance.post<TaskResultResponse>("/getTaskResult", {
                    clientKey: this.apiKey,
                    taskId: taskId,
                });

                logger.debug(
                    `[YesCaptcha] Poll attempt ${attempt}/${POLLING_CONFIG.MAX_ATTEMPTS}: ` +
                    `status=${response.data.status}`
                );

                if (response.data.errorId !== 0) {
                    const errorDesc = response.data.errorDescription || 'Unknown error';

                    // Check for YesCaptcha server timeout (Chinese: "任务已超时" = "Task timed out")
                    // This means YesCaptcha's worker failed, we should create a new task
                    if (errorDesc.includes('任务已超时') || errorDesc.includes('Task timed out') || errorDesc.includes('timeout')) {
                        logger.warn(`[YesCaptcha] Server-side timeout detected for task ${taskId}, will retry with new task`);
                        return null; // Signal to caller to create a new task
                    }

                    throw new Error(`[YesCaptcha] Task error: ${errorDesc}`);
                }

                if (response.data.status === "ready") {
                    logger.info(
                        `[YesCaptcha] Task ${taskId} completed after ${attempt} attempts ` +
                        `(${((Date.now() - startTime) / 1000).toFixed(1)}s)`
                    );
                    return response.data;
                }

                // Status is "processing", increase delay with backoff
                currentDelay = Math.min(
                    currentDelay * POLLING_CONFIG.BACKOFF_FACTOR,
                    POLLING_CONFIG.MAX_DELAY
                );

            } catch (error) {
                // Network or API error
                logger.warn(
                    `[YesCaptcha] Poll attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`
                );

                // If this is a YesCaptcha server timeout, return null to trigger new task creation
                if (error instanceof Error && (
                    error.message.includes('任务已超时') ||
                    error.message.includes('Task timed out') ||
                    error.message.includes('timeout')
                )) {
                    logger.warn(`[YesCaptcha] Server-side timeout detected, will retry with new task`);
                    return null;
                }

                // If this is a critical error (not just network timeout), throw immediately
                if (error instanceof Error && error.message.includes('Task error')) {
                    throw error;
                }

                // Otherwise, retry with increased delay
                currentDelay = Math.min(
                    currentDelay * POLLING_CONFIG.BACKOFF_FACTOR,
                    POLLING_CONFIG.MAX_DELAY
                );

                // If we've exhausted attempts, throw
                if (attempt >= POLLING_CONFIG.MAX_ATTEMPTS - 1) {
                    throw new Error(
                        `[YesCaptcha] Failed to poll task ${taskId} after ${attempt} attempts: ${error instanceof Error ? error.message : String(error)}`
                    );
                }
            }
        }

        throw new Error(
            `[YesCaptcha] Max polling attempts (${POLLING_CONFIG.MAX_ATTEMPTS}) reached for task ${taskId}`
        );
    }

    public async solveImage(imageData: Buffer): Promise<string> {
        logger.debug('[YesCaptcha] Starting image captcha solve');

        try {
            const { data } = await this.createTask({
                type: "ImageToTextTaskM1",
                body: imageData.toString("base64"),
            });

            if (data.errorId !== 0) {
                throw new Error(`[YesCaptcha] Image-to-text task failed: ${data.errorDescription}`);
            }

            logger.info(`[YesCaptcha] Image captcha solved: ${data.solution.text}`);
            return data.solution.text;
        } catch (error) {
            logger.error(`[YesCaptcha] Image solve failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    public async solveHcaptcha(sitekey: string, siteurl: string, _onPanic?: () => void): Promise<string> {
        logger.debug(`[YesCaptcha] Starting hCaptcha solve for ${siteurl}`);

        let serverTimeoutRetries = 0;
        const maxServerRetries = POLLING_CONFIG.SERVER_TIMEOUT_RETRY;

        while (serverTimeoutRetries < maxServerRetries) {
            try {
                const { data: createTaskData } = await this.createTask({
                    type: "HCaptchaTaskProxyless",
                    websiteKey: sitekey,
                    websiteURL: siteurl,
                });

                if (createTaskData.errorId !== 0) {
                    throw new Error(`[YesCaptcha] HCaptcha task creation failed: ${createTaskData.errorDescription}`);
                }

                logger.debug(`[YesCaptcha] Task created: ${createTaskData.taskId}`);

                const resultData = await this.pollTaskResult(createTaskData.taskId);

                // If pollTaskResult returns null, it means YesCaptcha server timed out
                // We should create a new task and try again
                if (resultData === null) {
                    serverTimeoutRetries++;
                    logger.warn(
                        `[YesCaptcha] Server timeout, creating new task... ` +
                        `(Retry ${serverTimeoutRetries}/${maxServerRetries})`
                    );

                    // Small delay before creating new task to avoid hammering the API
                    await delay(2000);
                    continue;
                }

                if (resultData.errorId !== 0 || !resultData.solution) {
                    throw new Error(`[YesCaptcha] HCaptcha solution failed: ${resultData.errorDescription}`);
                }

                logger.info('[YesCaptcha] hCaptcha solved successfully');
                return resultData.solution.gRecaptchaResponse;
            } catch (error) {
                logger.error(`[YesCaptcha] hCaptcha solve failed: ${error instanceof Error ? error.message : String(error)}`);
                throw error;
            }
        }

        throw new Error(
            `[YesCaptcha] hCaptcha solve failed after ${maxServerRetries} server timeout retries`
        );
    }
}
