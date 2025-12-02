import { BOT_IDS, RETRY, DELAYS } from "@/typings/constants.js";
import { logger } from "@/utils/logger.js";

/**
 * Utility function to retry an async operation with exponential backoff
 * 
 * @param fn - The async function to retry
 * @param maxRetries - Maximum number of retry attempts
 * @param operationName - Name of the operation for logging
 * @returns Promise that resolves to the function result
 * @throws Error if all retry attempts fail
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = RETRY.MAX_ATTEMPTS,
    operationName: string = 'operation'
): Promise<T> {
    let lastError: Error | unknown;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (attempt < maxRetries - 1) {
                const backoffTime = Math.min(
                    Math.pow(RETRY.EXPONENTIAL_BASE, attempt) * 1000,
                    RETRY.MAX_BACKOFF
                );

                logger.warn(
                    `${operationName} failed (attempt ${attempt + 1}/${maxRetries}), ` +
                    `retrying in ${backoffTime}ms...`
                );

                await new Promise(resolve => setTimeout(resolve, backoffTime));
            }
        }
    }

    throw new Error(
        `${operationName} failed after ${maxRetries} attempts: ${lastError}`
    );
}

/**
 * Utility function to add delay with jitter
 * 
 * @param min - Minimum delay in milliseconds
 * @param max - Maximum delay in milliseconds
 * @returns Promise that resolves after the delay
 */
export async function delayWithJitter(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}
