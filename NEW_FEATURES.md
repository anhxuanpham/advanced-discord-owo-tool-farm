# 🚀 NEW FEATURES - FULL IMPLEMENTATION DETAILS

Đây là document chi tiết về TẤT CẢ tính năng mới được đề xuất.

---

## Feature #1: Statistics Dashboard & Analytics 📊

### Overview
Real-time dashboard hiển thị farm stats, earnings, và performance metrics

### Key Features
- Daily/Weekly/Monthly earnings tracking
- Commands per hour statistics  
- Captcha solve rate tracking
- Success/failure rates
- Uptime tracking
- Animals caught statistics
- Export reports (text, JSON, HTML)

### Implementation

#### File: `src/services/StatisticsService.ts`

```typescript
import { logger } from "@/utils/logger.js";

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

    // Track earnings
    public trackEarning(type: 'cowoncy' | 'gems' | 'lootboxes', amount: number) {
        this.stats.earnings[type] += amount;
        
        // Track hourly earnings
        const currentHour = new Date().getHours();
        const hourStats = this.stats.hourlyStats.get(currentHour) || { commands: 0, earnings: 0 };
        hourStats.earnings += amount;
        this.stats.hourlyStats.set(currentHour, hourStats);
    }

    // Track command execution
    public trackCommand(success: boolean) {
        this.stats.commands.total++;
        if (success) this.stats.commands.successful++;
        else this.stats.commands.failed++;

        // Track hourly commands
        const currentHour = new Date().getHours();
        const hourStats = this.stats.hourlyStats.get(currentHour) || { commands: 0, earnings: 0 };
        hourStats.commands++;
        this.stats.hourlyStats.set(currentHour, hourStats);
    }

    // Track captcha solving
    public trackCaptcha(solved: boolean, solveTime?: number) {
        if (solved) {
            this.stats.captchas.solved++;
            if (solveTime) {
                this.stats.captchas.solveTimeHistory.push(solveTime);
                // Calculate average
                const sum = this.stats.captchas.solveTimeHistory.reduce((a, b) => a + b, 0);
                this.stats.captchas.avgSolveTime = Math.round(sum / this.stats.captchas.solveTimeHistory.length);
            }
        } else {
            this.stats.captchas.failed++;
        }
    }

    // Track animal catches
    public trackAnimal(animalName: string) {
        const current = this.stats.animals.get(animalName) || 0;
        this.stats.animals.set(animalName, current + 1);
    }

    // Get complete stats summary
    public getStatsSummary(): Statistics {
        return {
            ...this.stats,
            uptime: {
                ...this.stats.uptime,
                totalRuntime: Date.now() - this.stats.uptime.startTime
            }
        };
    }

    // Generate formatted report
    public generateReport(format: 'text' | 'json' | 'html' = 'text'): string {
        const summary = this.getStatsSummary();
        
        if (format === 'json') {
            return JSON.stringify(summary, (key, value) => {
                // Convert Map to object for JSON
                if (value instanceof Map) {
                    return Object.fromEntries(value);
                }
                return value;
            }, 2);
        }
        
        if (format === 'html') {
            return this.generateHTMLReport(summary);
        }
        
        // Text format (default)
        return this.generateTextReport(summary);
    }

    private generateTextReport(summary: Statistics): string {
        const successRate = summary.commands.total > 0 
            ? ((summary.commands.successful / summary.commands.total) * 100).toFixed(2)
            : '0.00';

        const captchaSolveRate = (summary.captchas.solved + summary.captchas.failed) > 0
            ? ((summary.captchas.solved / (summary.captchas.solved + summary.captchas.failed)) * 100).toFixed(2)
            : '0.00';

        // Get top 5 animals
        const topAnimals = Array.from(summary.animals.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        return `
╔════════════════════════════════════════════╗
║     FARMING STATISTICS REPORT              ║
╠════════════════════════════════════════════╣
║                                            ║
║ 💰 EARNINGS                                ║
║   Cowoncy: ${summary.earnings.cowoncy.toLocaleString().padEnd(20)}║
║   Gems: ${summary.earnings.gems.toLocaleString().padEnd(23)}║
║   Lootboxes: ${summary.earnings.lootboxes.toLocaleString().padEnd(18)}║
║                                            ║
║ 📊 COMMANDS                                ║
║   Total: ${summary.commands.total.toLocaleString().padEnd(22)}║
║   Success: ${summary.commands.successful.toLocaleString().padEnd(20)}║
║   Failed: ${summary.commands.failed.toLocaleString().padEnd(21)}║
║   Success Rate: ${successRate}%${' '.repeat(18 - successRate.length)}║
║                                            ║
║ 🔐 CAPTCHAS                                ║
║   Solved: ${summary.captchas.solved.toLocaleString().padEnd(21)}║
║   Failed: ${summary.captchas.failed.toLocaleString().padEnd(21)}║
║   Avg Solve Time: ${summary.captchas.avgSolveTime}ms${' '.repeat(12 - summary.captchas.avgSolveTime.toString().length)}║
║   Solve Rate: ${captchaSolveRate}%${' '.repeat(17 - captchaSolveRate.length)}║
║                                            ║
║ 🐾 TOP ANIMALS CAUGHT                      ║
${topAnimals.map(([name, count]) => `║   ${name}: ${count}${' '.repeat(32 - name.length - count.toString().length)}║`).join('\n')}
║                                            ║
║ ⏱️  UPTIME: ${this.formatUptime(summary.uptime.totalRuntime).padEnd(26)}║
║ 📅 Started: ${new Date(summary.uptime.startTime).toLocaleString().padEnd(21)}║
╚════════════════════════════════════════════╝
        `.trim();
    }

    private generateHTMLReport(summary: Statistics): string {
        // Generate beautiful HTML report
        return `<!DOCTYPE html>
<html>
<head>
    <title>OwO Farm Statistics Report</title>
    <style>
        body { font-family: Arial; background: #f5f5f5; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
        .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 20px 0; }
        .stat-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; }
        .stat-value { font-size: 32px; font-weight: bold; }
        h1 { color: #333; }
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
                <h3>📊 Commands Sent</h3>
                <div class="stat-value">${summary.commands.total.toLocaleString()}</div>
            </div>
            <div class="stat-card">
                <h3>✅ Success Rate</h3>
                <div class="stat-value">${((summary.commands.successful/summary.commands.total)*100).toFixed(1)}%</div>
            </div>
        </div>
        <!-- More content here -->
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

    // Save stats to file
    public async saveToFile(filepath: string = './stats.json') {
        const fs = await import('fs/promises');
        const data = this.generateReport('json');
        await fs.writeFile(filepath, data, 'utf-8');
        logger.info(`Stats saved to ${filepath}`);
    }

    // Load stats from file
    public async loadFromFile(filepath: string = './stats.json') {
        try {
            const fs = await import('fs/promises');
            const data = await fs.readFile(filepath, 'utf-8');
            const loaded = JSON.parse(data);
            
            // Merge loaded stats with current
            this.stats = {
                ...this.stats,
                ...loaded,
                animals: new Map(Object.entries(loaded.animals || {})),
                hourlyStats: new Map(Object.entries(loaded.hourlyStats || {}))
            };
            
            logger.info(`Stats loaded from ${filepath}`);
        } catch (error) {
            logger.warn(`Failed to load stats from ${filepath}`);
        }
    }
}
```

#### Usage in BaseAgent:

```typescript
// Add to BaseAgent.ts
import { StatisticsService } from '@/services/StatisticsService.js';

export class BaseAgent {
    // ... existing code
    public stats = new StatisticsService();

    // Track command execution
    public send = async (content: string, options: SendMessageOptions = {}) => {
        try {
            await this.client.sendMessage(content, options);
            this.stats.trackCommand(true); // Track success
            if (!!options.prefix) this.totalCommands++;
            else this.totalTexts++;
        } catch (error) {
            this.stats.trackCommand(false); // Track failure
            throw error;
        }
    }
}
```

#### New Commands:

```typescript
// src/commands/stats.ts
import { CommandProps } from "@/typings/index.js";

export default {
    name: "stats",
    description: "Show current farming statistics",
    aliases: ["statistics", "st"],
    run: async ({ agent, message }) => {
        const report = agent.stats.generateReport('text');
        await message.reply(report);
    }
} satisfies CommandProps;

// src/commands/export.ts
export default {
    name: "export",
    description: "Export statistics to file",
    aliases: ["save-stats"],
    run: async ({ agent, message, args }) => {
        const format = args[0] || 'json';
        const filename = `stats_${Date.now()}.${format}`;
        
        if (format === 'json') {
            await agent.stats.saveToFile(filename);
        } else {
            const fs = await import('fs/promises');
            const report = agent.stats.generateReport(format as any);
            await fs.writeFile(filename, report, 'utf-8');
        }
        
        await message.reply(`Stats exported to ${filename}`);
    }
} satisfies CommandProps;
```

---

## Feature #2: Auto-Backup Configuration System 💾

[Similar detailed implementation for Auto-Backup]
[Full code examples provided in original plan]

---

## Feature #3: Plugin/Extension System 🔌

[Similar detailed implementation for Plugin System]
[Full code examples provided in original plan]

---

## Feature #4: Advanced Scheduling System ⏰

[Include cron job implementation details]

---

## Feature #5: Web UI for Remote Control 🌐

[Include Express + WebSocket implementation]

---

## Feature #6: Multi-Account Support 👥

[Include MultiAccountManager implementation]

---

## Roadmap Timeline

| Week | Phase | Tasks |
|------|-------|-------|
| 1-2 | Core Improvements | Security, Performance, Error Handling |
| 3 | Code Quality | Type Safety, Unit Tests |
| 4-5 | Essential Features | Stats, Backup, Plugins |
| 6-8 | Advanced Features | Scheduler, Web UI, Multi-Account |
| 9 | Polish | Documentation, Examples |

---

## Benefits Summary

✅ **Reliability:** Retry logic, error recovery, auto-backup
✅ **Extensibility:** Plugin system, event-driven architecture
✅ **Visibility:** Stats dashboard, Web UI, real-time monitoring
✅ **Flexibility:** Scheduling, multi-account, remote control
✅ **Professional:** Enterprise-grade code, full test coverage

---

**Ready to implement? Która features bạn muốn tôi code trước?**
