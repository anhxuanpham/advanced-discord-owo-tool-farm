export const NORMALIZE_REGEX = /[\p{Cf}\p{Cc}\p{Zl}\p{Zp}\p{Cn}]/gu;

/**
 * HTTP Headers - Unified across all requests for consistent fingerprinting
 */
export const HTTP_HEADERS = {
    USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
} as const;

export const COLOR = {
    CRITICAL: "#FF0000",
    NORMAL: "#FFFF00",
    LOW: "#00FF00",
}

/**
 * Bot and service IDs
 */
export const BOT_IDS = {
    OWO: "408785106942164992",
    MIRAI: "1205422490969579530",
} as const;

/**
 * Timeout configurations (in milliseconds)
 */
export const TIMEOUTS = {
    DEFAULT_RESPONSE: 30_000,
    CAPTCHA_SOLVE: 60_000,
    RETRY_DELAY: 3_000,
    COLLECTOR_DEFAULT: 30_000,
    SLASH_RESPONSE: 30_000,
} as const;

/**
 * Threshold configurations
 */
export const THRESHOLDS = {
    INVALID_RESPONSE: 5,
    MIN_CHANNEL_CHANGE: 17,
    MAX_CHANNEL_CHANGE: 56,
    MIN_AUTO_SLEEP: 32,
    MAX_AUTO_SLEEP: 600,
    MAX_BACKUPS: 7,
} as const;

/**
 * Delay configurations (in milliseconds)
 */
export const DELAYS = {
    MIN_TYPING: 500,
    MAX_TYPING: 1000,
    MIN_COMMAND: 1000,
    MAX_COMMAND: 7500,
    MIN_FEATURE: 500,
    MAX_FEATURE: 4600,
    CAPTCHA_RETRY: 3000,
    RATE_LIMIT_MIN: 1000,
} as const;

/**
 * Retry configurations
 */
export const RETRY = {
    MAX_ATTEMPTS: 3,
    EXPONENTIAL_BASE: 2,
    MAX_BACKOFF: 30_000,
} as const;

/**
 * Captcha configurations
 */
export const CAPTCHA = {
    MAX_RETRIES: 4,              // Total 5 attempts (initial + 4 retries)
    BASE_DELAY: 3000,            // Base delay in milliseconds
    MAX_DELAY: 40000,            // Maximum delay (40 seconds)
    JITTER_FACTOR: 0.3,          // ±30% randomization
    EXPONENTIAL_BASE: 2,         // Double delay each retry
    REPEAT_THRESHOLD: 5 * 60 * 1000,      // 5 minutes - if new captcha within this time, it's suspicious
    PROGRESS_START_TIME: 3 * 60 * 1000,   // Start progress notifications after 3 min
    PROGRESS_INTERVAL: 2 * 60 * 1000,     // Send progress notification every 2 min
    TOTAL_TIMEOUT: 10 * 60 * 1000,        // OwO's 10 minute timeout
} as const;

/**
 * Rate limiting configurations
 */
export const RATE_LIMIT = {
    MIN_INTERVAL: 1000,
    BURST_SIZE: 5,
    REFILL_RATE: 1000,
} as const;

/**
 * Stats and backup configurations
 */
export const STATS = {
    AUTO_SAVE_INTERVAL: 300_000, // 5 minutes
    MAX_SOLVE_TIME_HISTORY: 100,
} as const;

export const BACKUP = {
    AUTO_INTERVAL: 86_400_000, // 24 hours
    MAX_BACKUPS: 7,
    BACKUP_DIR: 'backups',
} as const;

/**
 * Web UI configurations
 */
export const WEB_UI = {
    DEFAULT_PORT: 3000,
    STATS_UPDATE_INTERVAL: 5000,
} as const;