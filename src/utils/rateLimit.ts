import { RATE_LIMIT } from "@/typings/constants.js";
import { logger } from "@/utils/logger.js";

/**
 * Rate limiter using token bucket algorithm
 */
export class RateLimiter {
    private queue: Array<{
        fn: () => Promise<any>;
        resolve: (value: any) => void;
        reject: (error: any) => void;
    }> = [];

    private processing = false;
    private lastRequest = 0;
    private tokens: number;
    private lastRefill: number;

    constructor(
        private minInterval: number = RATE_LIMIT.MIN_INTERVAL,
        private burstSize: number = RATE_LIMIT.BURST_SIZE,
        private refillRate: number = RATE_LIMIT.REFILL_RATE
    ) {
        this.tokens = burstSize;
        this.lastRefill = Date.now();
    }

    /**
     * Execute a function with rate limiting
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject });
            this.processQueue();
        });
    }

    private refillTokens() {
        const now = Date.now();
        const timePassed = now - this.lastRefill;
        const tokensToAdd = Math.floor(timePassed / this.refillRate);

        if (tokensToAdd > 0) {
            this.tokens = Math.min(this.burstSize, this.tokens + tokensToAdd);
            this.lastRefill = now;
        }
    }

    private async processQueue() {
        if (this.processing || this.queue.length === 0) return;

        this.processing = true;

        while (this.queue.length > 0) {
            this.refillTokens();

            // Wait if no tokens available
            if (this.tokens < 1) {
                await new Promise(resolve => setTimeout(resolve, this.refillRate));
                this.refillTokens();
                continue;
            }

            // Check minimum interval
            const now = Date.now();
            const timeSinceLastRequest = now - this.lastRequest;

            if (timeSinceLastRequest < this.minInterval) {
                await new Promise(resolve =>
                    setTimeout(resolve, this.minInterval - timeSinceLastRequest)
                );
            }

            const item = this.queue.shift();
            if (!item) continue;

            this.tokens--;
            this.lastRequest = Date.now();

            try {
                const result = await item.fn();
                item.resolve(result);
            } catch (error) {
                item.reject(error);
            }
        }

        this.processing = false;
    }

    /**
     * Get current rate limiter status
     */
    getStatus() {
        this.refillTokens();
        return {
            tokens: this.tokens,
            queueSize: this.queue.length,
            lastRequest: this.lastRequest
        };
    }

    /**
     * Clear the queue
     */
    clear() {
        this.queue = [];
        logger.debug('Rate limiter queue cleared');
    }
}
