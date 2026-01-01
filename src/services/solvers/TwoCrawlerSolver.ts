import { CaptchaSolver } from "@/typings/index.js";
import axios, { AxiosInstance } from "axios";
import { logger } from "@/utils/logger.js";

// --- Type Definitions ---
interface TwoCrawlerTaskResponse {
    id: number;
    captcha: string;
    status: "pr" | "su" | "fa"; // pr=processing, su=success, fa=failed
    resolver_solution: string | null;
    created_at: string;
}

interface TwoCrawlerErrorResponse {
    detail: string;
}

// --- Configuration ---
const POLLING_CONFIG = {
    INITIAL_DELAY: 5000,        // First poll after 5s
    MAX_DELAY: 15000,           // Max 15s between polls
    BACKOFF_FACTOR: 1.15,       // Increase delay by 15% each time
    MAX_ATTEMPTS: 60,           // Max 60 attempts (~5-8 minutes)
    TIMEOUT_MS: 480000,         // 8 minutes total timeout
} as const;

// --- Helper Function ---
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- Class Implementation ---
export class TwoCrawlerSolver implements CaptchaSolver {
    private axiosInstance: AxiosInstance;
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        this.axiosInstance = axios.create({
            baseURL: "https://tools.2crawler.rest/api/v1",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "TwoCrawler-Node-Client"
            },
            validateStatus: () => true,
            timeout: 30000,
        });
    }

    private async createTask(sitekey: string, siteurl: string): Promise<number> {
        logger.debug(`[2Crawler] Creating hCaptcha task for ${siteurl}`);

        const response = await this.axiosInstance.post<TwoCrawlerTaskResponse | TwoCrawlerErrorResponse>("/solver/", {
            key: this.apiKey,
            captcha: "hcaptcha",
            solver_url: siteurl,
            site_key: sitekey,
        });

        if (response.status !== 200 && response.status !== 201) {
            const errorData = response.data as TwoCrawlerErrorResponse;
            throw new Error(`[2Crawler] Task creation failed: ${errorData.detail || response.statusText}`);
        }

        const taskData = response.data as TwoCrawlerTaskResponse;
        if (!taskData.id) {
            throw new Error(`[2Crawler] Invalid response: missing task ID`);
        }

        logger.debug(`[2Crawler] Task created: ${taskData.id}`);
        return taskData.id;
    }

    private async pollTaskResult(taskId: number): Promise<string> {
        const startTime = Date.now();
        let attempt = 0;
        let currentDelay: number = POLLING_CONFIG.INITIAL_DELAY;

        logger.debug(`[2Crawler] Starting to poll task ${taskId}`);

        while (attempt < POLLING_CONFIG.MAX_ATTEMPTS) {
            const elapsedTime = Date.now() - startTime;
            if (elapsedTime >= POLLING_CONFIG.TIMEOUT_MS) {
                throw new Error(`[2Crawler] Task ${taskId} timed out after ${(elapsedTime / 1000).toFixed(1)}s`);
            }

            await delay(currentDelay);
            attempt++;

            try {
                const response = await this.axiosInstance.get<TwoCrawlerTaskResponse>(`/solver/${taskId}/`, {
                    headers: {
                        "Authorization": `Token ${this.apiKey}`,
                    },
                });

                logger.debug(`[2Crawler] Poll attempt ${attempt}/${POLLING_CONFIG.MAX_ATTEMPTS}: status=${response.data.status}`);

                if (response.data.status === "su" && response.data.resolver_solution) {
                    logger.info(`[2Crawler] Task ${taskId} completed after ${attempt} attempts (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
                    return response.data.resolver_solution;
                }

                if (response.data.status === "fa") {
                    throw new Error(`[2Crawler] Task ${taskId} failed on server side`);
                }

                // Status is "pr" (processing), increase delay with backoff
                currentDelay = Math.min(
                    currentDelay * POLLING_CONFIG.BACKOFF_FACTOR,
                    POLLING_CONFIG.MAX_DELAY
                );
            } catch (error) {
                logger.warn(`[2Crawler] Poll attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`);

                // If it's a server error, continue retrying
                if (attempt >= POLLING_CONFIG.MAX_ATTEMPTS - 1) {
                    throw new Error(`[2Crawler] Failed to poll task ${taskId} after ${attempt} attempts`);
                }

                currentDelay = Math.min(currentDelay * POLLING_CONFIG.BACKOFF_FACTOR, POLLING_CONFIG.MAX_DELAY);
            }
        }

        throw new Error(`[2Crawler] Max polling attempts (${POLLING_CONFIG.MAX_ATTEMPTS}) reached for task ${taskId}`);
    }

    public async solveImage(imageData: Buffer): Promise<string> {
        // 2Crawler doesn't support image captcha based on the docs
        throw new Error("[2Crawler] Image captcha solving is not supported");
    }

    public async solveHcaptcha(sitekey: string, siteurl: string): Promise<string> {
        logger.debug(`[2Crawler] Starting hCaptcha solve for ${siteurl}`);

        try {
            const taskId = await this.createTask(sitekey, siteurl);
            const solution = await this.pollTaskResult(taskId);

            logger.info("[2Crawler] hCaptcha solved successfully");
            return solution;
        } catch (error) {
            logger.error(`[2Crawler] hCaptcha solve failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
}
