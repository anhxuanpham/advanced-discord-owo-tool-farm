import { CaptchaSolver } from "@/typings/index.js";
import axios, { AxiosInstance } from "axios";
import { logger } from "@/utils/logger.js";

// --- Type Definitions ---
interface AntiCaptchaTopResponse {
    status: number;
    request?: string;
    text?: string;
    error?: string;
    // Adapt based on actual response if different
}

export class AntiCaptchaTopSolver implements CaptchaSolver {
    private axiosInstance: AxiosInstance;
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        this.axiosInstance = axios.create({
            baseURL: "https://anticaptcha.top/api",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "AntiCaptchaTop-Node-Client"
            },
            validateStatus: () => true, // Handle all status codes
            timeout: 60000, // 60s timeout
        });
    }

    public async solveImage(imageData: Buffer | string): Promise<string> {
        // The user specifically requested sending the URL. 
        // We expect imageData to be a URL string in this case.
        // If it's a buffer, we might need to error out or convert (but user logic suggests URL)

        let imageUrl: string;

        if (Buffer.isBuffer(imageData)) {
            // If we receive a buffer, it means CaptchaService downloaded it.
            // But this API prefers URL according to the cURL.
            // We can try to convert buffer to base64 if the API supports it, but the cURL says "img": "url"
            // For now, let's assume if it's a buffer we can't use this specific URL-based endpoint efficiently 
            // without uploading it somewhere else first. 
            // However, to prevent breaking, let's throw or warn.
            // BUT: CaptchaService calls downloadAttachment. We will modify CaptchaService to pass URL.
            throw new Error("[AntiCaptchaTop] Buffer input not supported yet, please provides URL");
        } else {
            imageUrl = imageData;
        }

        logger.debug(`[AntiCaptchaTop] Solving image captcha from URL: ${imageUrl}`);

        try {
            const response = await this.axiosInstance.post("/captcha", {
                apikey: this.apiKey,
                img: imageUrl,
                type: 0 // As per user cURL
            });

            // Log full response for debugging since we don't have the docs
            logger.debug(`[AntiCaptchaTop] Response: ${JSON.stringify(response.data)}`);

            if (response.status !== 200 || !response.data) {
                throw new Error(`[AntiCaptchaTop] API failed: ${response.status} ${response.statusText}`);
            }

            // Assume the API returns { text: "..." } or similar based on standard patterns or user cURL implication
            // The cURL output wasn't shown, so we assume a standard JSON response with 'text' or 'code'
            // Let's safe check fields.
            const data = response.data as any;

            // Common variations checks since we don't have docs
            const solution = data.text || data.code || data.captcha || data.solution;

            if (!solution && typeof solution !== 'string') {
                throw new Error(`[AntiCaptchaTop] No solution found in response: ${JSON.stringify(data)}`);
            }

            logger.info(`[AntiCaptchaTop] Solved: ${solution}`);
            return solution;

        } catch (error) {
            logger.error(`[AntiCaptchaTop] Solve failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    public async solveHcaptcha(sitekey: string, siteurl: string, _onPanic?: () => void): Promise<string> {
        throw new Error("[AntiCaptchaTop] hCaptcha solving not implemented for this provider");
    }
}
