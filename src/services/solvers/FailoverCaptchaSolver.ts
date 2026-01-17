import { CaptchaSolver } from "@/typings/index.js";
import { logger } from "@/utils/logger.js";

/**
 * FailoverCaptchaSolver - Wraps multiple captcha solvers with round-robin failover
 * When one provider fails, automatically switches to the next provider
 */
export class FailoverCaptchaSolver implements CaptchaSolver {
    private solvers: { name: string; solver: CaptchaSolver }[];
    private currentIndex: number = 0;
    private failureCount: Map<string, number> = new Map();
    private maxFailuresBeforeSwitch: number = 1; // Switch immediately after first failure for faster failover

    constructor(solvers: { name: string; solver: CaptchaSolver }[]) {
        if (solvers.length === 0) {
            throw new Error("[FailoverSolver] At least one solver is required");
        }
        this.solvers = solvers;

        // Initialize failure counts
        for (const { name } of solvers) {
            this.failureCount.set(name, 0);
        }

        logger.info(`[FailoverSolver] Initialized with ${solvers.length} providers: ${solvers.map(s => s.name).join(", ")}`);
    }

    /**
     * Get the current active solver
     */
    private getCurrentSolver(): { name: string; solver: CaptchaSolver } {
        return this.solvers[this.currentIndex];
    }

    /**
     * Switch to the next solver in round-robin fashion
     */
    private switchToNextSolver(): void {
        const oldSolver = this.getCurrentSolver();
        this.currentIndex = (this.currentIndex + 1) % this.solvers.length;
        const newSolver = this.getCurrentSolver();

        logger.warn(`[FailoverSolver] Switching from ${oldSolver.name} to ${newSolver.name}`);
    }

    /**
     * Record a failure for the current solver
     * @returns true if should switch to next solver
     */
    private recordFailure(solverName: string): boolean {
        const currentFailures = (this.failureCount.get(solverName) || 0) + 1;
        this.failureCount.set(solverName, currentFailures);

        logger.debug(`[FailoverSolver] ${solverName} failure count: ${currentFailures}/${this.maxFailuresBeforeSwitch}`);

        if (currentFailures >= this.maxFailuresBeforeSwitch) {
            // Reset failure count for this solver
            this.failureCount.set(solverName, 0);
            return true;
        }
        return false;
    }

    /**
     * Record a success and reset failure count
     */
    private recordSuccess(solverName: string): void {
        this.failureCount.set(solverName, 0);
    }

    /**
     * Solve image captcha with failover
     */
    public async solveImage(imageData: Buffer): Promise<string> {
        const startSolverIndex = this.currentIndex;
        let lastError: Error | null = null;
        let attempts = 0;
        const maxAttempts = this.solvers.length * 2; // Try each solver at least twice

        while (attempts < maxAttempts) {
            const { name, solver } = this.getCurrentSolver();
            attempts++;

            try {
                logger.debug(`[FailoverSolver] Trying ${name} for image captcha (attempt ${attempts}/${maxAttempts})`);
                const result = await solver.solveImage(imageData);
                this.recordSuccess(name);
                return result;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                logger.warn(`[FailoverSolver] ${name} failed: ${lastError.message}`);

                const shouldSwitch = this.recordFailure(name);
                if (shouldSwitch) {
                    this.switchToNextSolver();

                    // If we've gone full circle, break to avoid infinite loop
                    if (this.currentIndex === startSolverIndex && attempts >= this.solvers.length) {
                        break;
                    }
                }
            }
        }

        throw new Error(`[FailoverSolver] All providers failed for image captcha. Last error: ${lastError?.message}`);
    }

    /**
     * Solve hCaptcha with failover - keeps trying until success or hard timeout
     * Hard timeout ensures we don't exceed OwO's 10-minute deadline
     */
    /**
     * Solve hCaptcha with failover - DUAL TEST MODE
     * Runs ALL solvers in parallel to verify they work.
     * Returns the first successful result.
     */
    public async solveHcaptcha(sitekey: string, siteurl: string): Promise<string> {
        // DUAL TEST MODE: Execute all solvers
        const promises = this.solvers.map(async ({ name, solver }) => {
            try {
                logger.debug(`[DualTest] Starting ${name}...`);
                const result = await solver.solveHcaptcha(sitekey, siteurl);
                logger.info(`[DualTest] ✅ ${name} SUCCEEDED! (Token len: ${result.length})`);
                return result;
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                logger.warn(`[DualTest] ❌ ${name} FAILED: ${msg}`);
                throw error;
            }
        });

        try {
            // Return the first successful result (fastest wins)
            // This ensures the bot continues without waiting for the slower solver
            const result = await Promise.any(promises);
            return result;
        } catch (error) {
            // AggregateError if all failed
            throw new Error(`[DualTest] All providers failed: ${error}`);
        }
    }

    /**
     * Get current provider name (for logging/debugging)
     */
    public getCurrentProviderName(): string {
        return this.getCurrentSolver().name;
    }

    /**
     * Get all provider names
     */
    public getProviderNames(): string[] {
        return this.solvers.map(s => s.name);
    }
}
