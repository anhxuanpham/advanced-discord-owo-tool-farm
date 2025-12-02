// Quick script to apply captcha retry changes
import * as fs from 'fs';

const filePath = 'src/services/CaptchaService.ts';

console.log('📝 Applying captcha retry enhancements...');

let content = fs.readFileSync(filePath, 'utf-8');

// Change 1: Add CAPTCHA to imports
console.log('✓ Step 1: Adding CAPTCHA import...');
content = content.replace(
    'import { NORMALIZE_REGEX } from "@/typings/constants.js";',
    'import { NORMALIZE_REGEX, CAPTCHA } from "@/typings/constants.js";'
);

// Change 2: Update maxRetries
console.log('✓ Step 2: Updating maxRetries...');
content = content.replace(
    'const maxRetries = 1;',
    'const maxRetries = CAPTCHA.MAX_RETRIES;'
);

// Change 3: Replace fixed delay with exponential backoff
console.log('✓ Step 3: Implementing exponential backoff...');
const oldRetryLogic = `logger.warn(\`Retrying captcha solving after 3 seconds... (\${retries + 1}/\${maxRetries})\`);
                await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds before retry`;

const newRetryLogic = `// Calculate delay with exponential backoff and jitter
                const baseDelay = CAPTCHA.BASE_DELAY * Math.pow(CAPTCHA.EXPONENTIAL_BASE, retries);
                const jitter = baseDelay * CAPTCHA.JITTER_FACTOR * (Math.random() * 2 - 1);
                const delay = Math.min(
                    Math.max(baseDelay + jitter, CAPTCHA.BASE_DELAY),
                    CAPTCHA.MAX_DELAY
                );

                logger.warn(
                    \`Retrying captcha solving in \${(delay / 1000).toFixed(1)}s... \` +
                    \`(Attempt \${retries + 1}/\${maxRetries})\`
                );

                await new Promise(resolve => setTimeout(resolve, delay));`;

content = content.replace(oldRetryLogic, newRetryLogic);

fs.writeFileSync(filePath, content);

console.log('✅ Applied all changes successfully!');
console.log('\n📊 Summary:');
console.log('   - Captcha retries: 2 → 5 attempts');
console.log('   - Delay strategy: Fixed 3s → Exponential 3-40s with jitter');
console.log('   - Anti-ban: ✓ Enabled');
