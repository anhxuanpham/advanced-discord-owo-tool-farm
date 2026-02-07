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
     * Run a promise with a timeout
     */
    private async runWithTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
        let timer: NodeJS.Timeout;
        const timeoutPromise = new Promise<T>((_, reject) => {
            timer = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
        });

        return Promise.race([
            promise.then(result => {
                clearTimeout(timer);
                return result;
            }),
            timeoutPromise
        ]);
    }

    /**
     * Solve hCaptcha with failover - keeps trying until success or hard timeout
     * Hard timeout ensures we don't exceed OwO's 10-minute deadline
     */
    public async solveHcaptcha(sitekey: string, siteurl: string, onPanic?: () => void): Promise<string> {
        const startTime = Date.now();
        // Aggressive settings for faster failover
        const PROVIDER_TIMEOUT_MS = 69 * 1000; // 69s per provider max
        const PANIC_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes: Start parallel solving
        const HARD_TIMEOUT_MS = 9 * 60 * 1000; // 9 minutes: Hard limit
        const RETRY_DELAY_MS = 5000; // 5 seconds between rounds

        let panicTriggered = false;
        let lastError: Error | null = null;
        let totalAttempts = 0;

        while (Date.now() - startTime < HARD_TIMEOUT_MS) {
            const elapsedTime = Date.now() - startTime;

            // --- PANIC MODE: Parallel Solving ---
            if (elapsedTime >= PANIC_THRESHOLD_MS) {
                if (!panicTriggered) {
                    panicTriggered = true;
                    if (onPanic) onPanic();
                }
                logger.alert(`[PanicMode] Captcha taking too long (${Math.floor(elapsedTime / 1000)}s). Running ALL solvers in parallel!`);

                try {
                    // Create promises for all solvers starting at once
                    const parallelPromises = this.solvers.map(async ({ name, solver }) => {
                        try {
                            // Give parallel solvers a bit more time
                            const result = await this.runWithTimeout(
                                solver.solveHcaptcha(sitekey, siteurl),
                                120000,
                                `Parallel solve timed out after 120s`
                            );
                            this.recordSuccess(name);
                            logger.info(`[PanicMode] ${name} succeeded in parallel!`);
                            return result;
                        } catch (err) {
                            const error = err instanceof Error ? err : new Error(String(err));
                            logger.warn(`[PanicMode] ${name} failed in parallel: ${error.message}`);
                            throw error;
                        }
                    });

                    // Wait for the first success
                    return await Promise.any(parallelPromises);
                } catch (error) {
                    // AggregateError if all failed
                    const err = error instanceof Error ? error : new Error(String(error));
                    logger.error(`[PanicMode] All parallel solvers failed: ${err.message}`);
                    lastError = err;

                    // Small delay before trying the panic mode again if time permits
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    continue;
                }
            }

            // --- NORMAL MODE: Sequential Failover ---
            const startSolverIndex = this.currentIndex;
            let roundAttempts = 0;
            const maxRoundAttempts = this.solvers.length * 2; // Each round tries each solver twice

            while (roundAttempts < maxRoundAttempts) {
                const currentElapsed = Date.now() - startTime;
                // Break to re-enter the outer loop if panic threshold reached or hard timeout near
                if (currentElapsed >= PANIC_THRESHOLD_MS || currentElapsed >= HARD_TIMEOUT_MS) {
                    break;
                }

                const { name, solver } = this.getCurrentSolver();
                roundAttempts++;
                totalAttempts++;

                try {
                    const elapsedSec = Math.floor(currentElapsed / 1000);
                    logger.info(`[FailoverSolver] Trying ${name} for hCaptcha (attempt ${totalAttempts}, ${elapsedSec}s elapsed)`);

                    // Enforce timeout
                    const result = await this.runWithTimeout(
                        solver.solveHcaptcha(sitekey, siteurl),
                        PROVIDER_TIMEOUT_MS,
                        `Timeout after ${PROVIDER_TIMEOUT_MS / 1000}s`
                    );

                    this.recordSuccess(name);
                    logger.info(`[FailoverSolver] ${name} succeeded!`);
                    return result;
                } catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));
                    logger.warn(`[FailoverSolver] ${name} failed: ${lastError.message}`);

                    const shouldSwitch = this.recordFailure(name);
                    if (shouldSwitch) {
                        this.switchToNextSolver();

                        if (this.currentIndex === startSolverIndex) {
                            logger.warn(`[FailoverSolver] All providers failed once, will retry...`);
                        }
                    }

                    // Small delay before trying next provider - very short to keep moving
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            // All providers exhausted in this round, wait and retry if time permits
            const remainingTime = HARD_TIMEOUT_MS - (Date.now() - startTime);
            if (remainingTime > RETRY_DELAY_MS && remainingTime > (PANIC_THRESHOLD_MS - (Date.now() - startTime))) {
                logger.warn(`[FailoverSolver] Round complete, waiting ${RETRY_DELAY_MS / 1000}s before retry...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            } else if (remainingTime > 2000) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        throw new Error(`[FailoverSolver] Hard timeout reached after ${totalAttempts} attempts. Last error: ${lastError?.message}`);
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
