import { CaptchaSolver } from "@/typings/index.js";
import axios, { AxiosInstance } from "axios";
import { logger } from "@/utils/logger.js";

// --- Type Definitions ---
interface CaptchalyResponse {
    time: number;
    duration: number;
    deducted: string;
    token: string;
}

interface CaptchalyErrorResponse {
    error?: string;
    message?: string;
    detail?: string;
}

// --- Configuration ---
const CAPTCHALY_CONFIG = {
    BASE_URL: "https://v1.captchaly.com",
    TIMEOUT_MS: 120000,  // 2 minutes (Captchaly is synchronous, may take time)
} as const;

// --- Class Implementation ---
export class CaptchalySolver implements CaptchaSolver {
    private axiosInstance: AxiosInstance;
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        this.axiosInstance = axios.create({
            baseURL: CAPTCHALY_CONFIG.BASE_URL,
            headers: {
                "Accept": "*/*",
                "Authorization": `Bearer ${apiKey}`,
            },
            validateStatus: () => true,
            timeout: CAPTCHALY_CONFIG.TIMEOUT_MS,
        });
    }

    public async solveImage(_imageData: Buffer): Promise<string> {
        // Captchaly doesn't support image captcha based on their API
        throw new Error("[Captchaly] Image captcha solving is not supported");
    }

    public async solveHcaptcha(sitekey: string, siteurl: string, _onPanic?: () => void): Promise<string> {
        logger.debug(`[Captchaly] Starting hCaptcha solve for ${siteurl}`);
        const startTime = Date.now();

        try {
            const response = await this.axiosInstance.get<CaptchalyResponse | CaptchalyErrorResponse>("/hcaptcha", {
                params: {
                    sitekey: sitekey,
                    url: siteurl,
                },
            });

            const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);

            // Check for HTTP errors
            if (response.status !== 200) {
                const errorData = response.data as CaptchalyErrorResponse;
                const errorMessage = errorData.error || errorData.message || errorData.detail || response.statusText;
                throw new Error(`[Captchaly] API error (${response.status}): ${errorMessage}`);
            }

            const data = response.data as CaptchalyResponse;

            // Validate response
            if (!data.token) {
                throw new Error(`[Captchaly] Invalid response: missing token`);
            }

            logger.info(`[Captchaly] hCaptcha solved in ${elapsedTime}s (API reported: ${data.duration.toFixed(1)}s, cost: ${data.deducted})`);
            return data.token;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.code === "ECONNABORTED") {
                    throw new Error(`[Captchaly] Request timed out after ${CAPTCHALY_CONFIG.TIMEOUT_MS / 1000}s`);
                }
                throw new Error(`[Captchaly] Network error: ${error.message}`);
            }
            throw error;
        }
    }
}
