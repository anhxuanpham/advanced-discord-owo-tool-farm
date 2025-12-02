import { logger } from "@/utils/logger.js";
import { STATS } from "@/typings/constants.js";
import fs from 'fs/promises';
import path from 'path';

export interface Statistics {
    earnings: {
        cowoncy: number;
        gems: number;
        lootboxes: number;
    };
    commands: {
        total: number;
        successful: number;
        failed: number;
    };
    captchas: {
        solved: number;
        failed: number;
        avgSolveTime: number;
        solveTimeHistory: number[];
    };
    uptime: {
        startTime: number;
        totalRuntime: number;
    };
    animals: Map<string, number>;
    hourlyStats: Map<number, { commands: number; earnings: number }>;
}

export class StatisticsService {
    private stats: Statistics = {
        earnings: {
            cowoncy: 0,
            gems: 0,
            lootboxes: 0
        },
        commands: {
            total: 0,
            successful: 0,
            failed: 0
        },
        captchas: {
            solved: 0,
            failed: 0,
            avgSolveTime: 0,
            solveTimeHistory: []
        },
        uptime: {
            startTime: Date.now(),
            totalRuntime: 0
        },
        animals: new Map<string, number>(),
        hourlyStats: new Map<number, { commands: number; earnings: number }>()
    };

    private autoSaveInterval?: NodeJS.Timeout;

    /**
     * Start auto-saving stats
     */
    public startAutoSave(interval: number = STATS.AUTO_SAVE_INTERVAL) {
        this.autoSaveInterval = setInterval(() => {
            this.saveToFile().catch(error => {
                logger.error('Failed to auto-save stats: ' + error);
            });
        }, interval);
        logger.debug(`Stats auto-save enabled (every ${interval}ms)`);
    }

    /**
     * Stop auto-saving stats
     */
    public stopAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = undefined;
            logger.debug('Stats auto-save disabled');
        }
    }

    /**
     * Track earnings
     */
    public trackEarning(type: 'cowoncy' | 'gems' | 'lootboxes', amount: number) {
        this.stats.earnings[type] += amount;

        const currentHour = new Date().getHours();
        const hourStats = this.stats.hourlyStats.get(currentHour) || { commands: 0, earnings: 0 };
        hourStats.earnings += amount;
        this.stats.hourlyStats.set(currentHour, hourStats);
    }

    /**
     * Track command execution
     */
    public trackCommand(success: boolean) {
        this.stats.commands.total++;
        if (success) this.stats.commands.successful++;
        else this.stats.commands.failed++;

        const currentHour = new Date().getHours();
        const hourStats = this.stats.hourlyStats.get(currentHour) || { commands: 0, earnings: 0 };
        hourStats.commands++;
        this.stats.hourlyStats.set(currentHour, hourStats);
    }

    /**
     * Track captcha solving
     */
    public trackCaptcha(solved: boolean, solveTime?: number) {
        if (solved) {
            this.stats.captchas.solved++;
            if (solveTime) {
                this.stats.captchas.solveTimeHistory.push(solveTime);

                // Keep only last N solve times
                if (this.stats.captchas.solveTimeHistory.length > STATS.MAX_SOLVE_TIME_HISTORY) {
                    this.stats.captchas.solveTimeHistory.shift();
                }

                // Calculate average
                const sum = this.stats.captchas.solveTimeHistory.reduce((a, b) => a + b, 0);
                this.stats.captchas.avgSolveTime = Math.round(sum / this.stats.captchas.solveTimeHistory.length);
            }
        } else {
            this.stats.captchas.failed++;
        }
    }

    /**
     * Track animal catches
     */
    public trackAnimal(animalName: string) {
        const current = this.stats.animals.get(animalName) || 0;
        this.stats.animals.set(animalName, current + 1);
    }

    /**
     * Get complete stats summary
     */
    public getStatsSummary(): Statistics {
        return {
            ...this.stats,
            uptime: {
                ...this.stats.uptime,
                totalRuntime: Date.now() - this.stats.uptime.startTime
            }
        };
    }

    /**
     * Generate formatted report
     */
    public generateReport(format: 'text' | 'json' | 'html' = 'text'): string {
        const summary = this.getStatsSummary();

        if (format === 'json') {
            return JSON.stringify(summary, (key, value) => {
                if (value instanceof Map) {
                    return Object.fromEntries(value);
                }
                return value;
            }, 2);
        }

        if (format === 'html') {
            return this.generateHTMLReport(summary);
        }

        return this.generateTextReport(summary);
    }

    private generateTextReport(summary: Statistics): string {
        const successRate = summary.commands.total > 0
            ? ((summary.commands.successful / summary.commands.total) * 100).toFixed(2)
            : '0.00';

        const captchaSolveRate = (summary.captchas.solved + summary.captchas.failed) > 0
            ? ((summary.captchas.solved / (summary.captchas.solved + summary.captchas.failed)) * 100).toFixed(2)
            : '0.00';

        const topAnimals = Array.from(summary.animals.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        return `
╔════════════════════════════════════════════╗
║     FARMING STATISTICS REPORT              ║
╠════════════════════════════════════════════╣
║                                            ║
║ 💰 EARNINGS                                ║
║   Cowoncy: ${summary.earnings.cowoncy.toLocaleString().padEnd(28)}║
║   Gems: ${summary.earnings.gems.toLocaleString().padEnd(31)}║
║   Lootboxes: ${summary.earnings.lootboxes.toLocaleString().padEnd(26)}║
║                                            ║
║ 📊 COMMANDS                                ║
║   Total: ${summary.commands.total.toLocaleString().padEnd(30)}║
║   Success: ${summary.commands.successful.toLocaleString().padEnd(28)}║
║   Failed: ${summary.commands.failed.toLocaleString().padEnd(29)}║
║   Success Rate: ${successRate}%${' '.repeat(22 - successRate.length)}║
║                                            ║
║ 🔐 CAPTCHAS                                ║
║   Solved: ${summary.captchas.solved.toLocaleString().padEnd(29)}║
║   Failed: ${summary.captchas.failed.toLocaleString().padEnd(29)}║
║   Avg Time: ${summary.captchas.avgSolveTime}ms${' '.repeat(24 - summary.captchas.avgSolveTime.toString().length)}║
║   Solve Rate: ${captchaSolveRate}%${' '.repeat(21 - captchaSolveRate.length)}║
║                                            ║
║ 🐾 TOP ANIMALS CAUGHT                      ║
${topAnimals.length > 0 ? topAnimals.map(([name, count]) => {
            const entry = `   ${name}: ${count}`;
            return `║${entry.padEnd(44)}║`;
        }).join('\n') : '║   No animals caught yet                    ║'}
║                                            ║
║ ⏱️  UPTIME: ${this.formatUptime(summary.uptime.totalRuntime).padEnd(30)}║
║ 📅 Started: ${new Date(summary.uptime.startTime).toLocaleString().padEnd(27)}║
╚════════════════════════════════════════════╝
        `.trim();
    }

    private generateHTMLReport(summary: Statistics): string {
        const successRate = summary.commands.total > 0
            ? ((summary.commands.successful / summary.commands.total) * 100).toFixed(1)
            : '0.0';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OwO Farm Statistics Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 40px; border-radius: 15px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); }
        h1 { color: #333; margin-bottom: 30px; text-align: center; }
        .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 30px 0; }
        .stat-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .stat-card h3 { font-size: 14px; margin-bottom: 10px; opacity: 0.9; }
        .stat-value { font-size: 36px; font-weight: bold; }
        .timestamp { text-align: center; color: #666; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Farming Statistics Report</h1>
        <div class="stat-grid">
            <div class="stat-card">
                <h3>💰 Total Cowoncy</h3>
                <div class="stat-value">${summary.earnings.cowoncy.toLocaleString()}</div>
            </div>
            <div class="stat-card">
                <h3>💎 Total Gems</h3>
                <div class="stat-value">${summary.earnings.gems.toLocaleString()}</div>
            </div>
            <div class="stat-card">
                <h3>📦 Lootboxes</h3>
                <div class="stat-value">${summary.earnings.lootboxes.toLocaleString()}</div>
            </div>
            <div class="stat-card">
                <h3>📊 Commands Sent</h3>
                <div class="stat-value">${summary.commands.total.toLocaleString()}</div>
            </div>
            <div class="stat-card">
                <h3>✅ Success Rate</h3>
                <div class="stat-value">${successRate}%</div>
            </div>
            <div class="stat-card">
                <h3>🔐 Captchas Solved</h3>
                <div class="stat-value">${summary.captchas.solved}</div>
            </div>
            <div class="stat-card">
                <h3>⏱️ Uptime</h3>
                <div class="stat-value" style="font-size: 24px;">${this.formatUptime(summary.uptime.totalRuntime)}</div>
            </div>
            <div class="stat-card">
                <h3>🐾 Animals Caught</h3>
                <div class="stat-value">${Array.from(summary.animals.values()).reduce((a, b) => a + b, 0)}</div>
            </div>
        </div>
        <p class="timestamp">Generated: ${new Date().toLocaleString()}</p>
    </div>
</body>
</html>`;
    }

    private formatUptime(ms: number): string {
        const days = Math.floor(ms / 86400000);
        const hours = Math.floor((ms % 86400000) / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);

        if (days > 0) return `${days}d ${hours}h ${minutes}m`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    }

    /**
     * Save stats to file
     */
    public async saveToFile(filepath: string = './stats.json'): Promise<void> {
        const data = this.generateReport('json');
        await fs.writeFile(filepath, data, 'utf-8');
        logger.debug(`Stats saved to ${filepath}`);
    }

    /**
     * Load stats from file
     */
    public async loadFromFile(filepath: string = './stats.json'): Promise<void> {
        try {
            const data = await fs.readFile(filepath, 'utf-8');
            const loaded = JSON.parse(data);

            this.stats = {
                ...this.stats,
                ...loaded,
                animals: new Map(Object.entries(loaded.animals || {})),
                hourlyStats: new Map(Object.entries(loaded.hourlyStats || {})),
                captchas: {
                    ...loaded.captchas,
                    solveTimeHistory: loaded.captchas?.solveTimeHistory || []
                }
            };

            logger.info(`Stats loaded from ${filepath}`);
        } catch (error) {
            logger.warn(`Failed to load stats from ${filepath}`);
        }
    }

    /**
     * Reset all stats
     */
    public reset() {
        this.stats = {
            earnings: { cowoncy: 0, gems: 0, lootboxes: 0 },
            commands: { total: 0, successful: 0, failed: 0 },
            captchas: { solved: 0, failed: 0, avgSolveTime: 0, solveTimeHistory: [] },
            uptime: { startTime: Date.now(), totalRuntime: 0 },
            animals: new Map(),
            hourlyStats: new Map()
        };
        logger.info('Statistics reset');
    }
}
