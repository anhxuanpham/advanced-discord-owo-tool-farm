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
    INITIAL_DELAY: 3000,        // First poll after 3s
    MAX_DELAY: 10000,           // Max 10s between polls
    BACKOFF_FACTOR: 1.2,        // Increase delay by 20% each time
    MAX_ATTEMPTS: 40,           // Max 40 attempts (~2 minutes)
    TIMEOUT_MS: 120000,         // 2 minutes total timeout
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

    private async pollTaskResult(taskId: string): Promise<TaskResultResponse> {
        const startTime = Date.now();
        let attempt = 0;
        let currentDelay = POLLING_CONFIG.INITIAL_DELAY;

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
                    throw new Error(
                        `[YesCaptcha] Task error: ${response.data.errorDescription || 'Unknown error'}`
                    );
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

    public async solveHcaptcha(sitekey: string, siteurl: string): Promise<string> {
        logger.debug(`[YesCaptcha] Starting hCaptcha solve for ${siteurl}`);

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
}
