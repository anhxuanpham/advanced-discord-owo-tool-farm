import * as Sentry from "@sentry/node";
import { logger } from "@/utils/logger.js";
import packageJSON from "../../package.json" with { type: "json" };

/**
 * SentryService - Centralized error tracking and monitoring
 * Integrates with Sentry.io for real-time error alerts and performance monitoring
 */
export class SentryService {
    private static initialized = false;
    private static dsn: string | undefined;

    /**
     * Initialize Sentry with the provided DSN
     * Should be called as early as possible in the application lifecycle
     */
    public static init(dsn?: string): void {
        if (this.initialized) {
            logger.debug("[Sentry] Already initialized, skipping...");
            return;
        }

        // Use provided DSN or fall back to environment variable
        this.dsn = dsn || process.env.SENTRY_DSN;

        if (!this.dsn) {
            logger.debug("[Sentry] No DSN provided, Sentry disabled");
            return;
        }

        try {
            Sentry.init({
                dsn: this.dsn,
                environment: process.env.NODE_ENV || "production",
                release: `adotf@${packageJSON.version}`,

                // Performance monitoring - sample 10% of transactions
                tracesSampleRate: 0.1,

                // Error filtering
                beforeSend(event, hint) {
                    // Filter out expected errors
                    const error = hint.originalException as Error;
                    if (error?.message) {
                        // Don't report rate limit errors (expected behavior)
                        if (error.message.includes('密钥错误') ||
                            error.message.includes('Rate limit')) {
                            return null;
                        }
                    }
                    return event;
                },

                // Integrations
                integrations: [
                    Sentry.consoleIntegration(),
                ],
            });

            this.initialized = true;
            logger.info("[Sentry] Initialized successfully");
        } catch (error) {
            logger.error(`[Sentry] Failed to initialize: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Check if Sentry is enabled
     */
    public static isEnabled(): boolean {
        return this.initialized;
    }

    /**
     * Capture an exception and send to Sentry
     */
    public static captureException(error: Error, context?: Record<string, unknown>): string | undefined {
        if (!this.initialized) return undefined;

        return Sentry.captureException(error, {
            extra: context,
        });
    }

    /**
     * Capture a message (for non-error events like warnings)
     */
    public static captureMessage(message: string, level: Sentry.SeverityLevel = "info", context?: Record<string, unknown>): string | undefined {
        if (!this.initialized) return undefined;

        return Sentry.captureMessage(message, {
            level,
            extra: context,
        });
    }

    /**
     * Set user context for error tracking
     */
    public static setUser(userId: string, username?: string): void {
        if (!this.initialized) return;

        Sentry.setUser({
            id: userId,
            username: username,
        });
    }

    /**
     * Set additional context tags
     */
    public static setTag(key: string, value: string): void {
        if (!this.initialized) return;
        Sentry.setTag(key, value);
    }

    /**
     * Set multiple tags at once
     */
    public static setTags(tags: Record<string, string>): void {
        if (!this.initialized) return;
        Sentry.setTags(tags);
    }

    /**
     * Add breadcrumb for debugging context
     */
    public static addBreadcrumb(message: string, category: string = "default", level: Sentry.SeverityLevel = "info"): void {
        if (!this.initialized) return;

        Sentry.addBreadcrumb({
            message,
            category,
            level,
            timestamp: Date.now() / 1000,
        });
    }

    /**
     * Start a new span for performance monitoring
     */
    public static startSpan<T>(name: string, op: string, callback: () => T): T {
        if (!this.initialized) {
            return callback();
        }

        return Sentry.startSpan({ name, op }, callback);
    }

    /**
     * Flush all pending events before shutdown
     */
    public static async flush(timeout: number = 2000): Promise<boolean> {
        if (!this.initialized) return true;
        return Sentry.flush(timeout);
    }
}
