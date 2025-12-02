// CRITICAL FIX: Apply exponential backoff to captcha retry
import * as fs from 'fs';

const filePath = 'src/services/CaptchaService.ts';

console.log('🔴 CRITICAL FIX: Applying exponential backoff to captcha retry...');

let content = fs.readFileSync(filePath, 'utf-8');

// Find and replace the fixed 3s delay with exponential backoff
const oldCode = `                logger.warn(\`Retrying captcha solving after 3 seconds... (\${retries + 1}/\${maxRetries})\`);
                await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds before retry`;

const newCode = `                // Calculate delay with exponential backoff and jitter
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

if (content.includes(oldCode)) {
    content = content.replace(oldCode, newCode);
    fs.writeFileSync(filePath, content);
    console.log('✅ FIXED: Exponential backoff applied successfully!');
    console.log('\n📊 Changes:');
    console.log('   - Removed: Fixed 3s delay (PREDICTABLE - BAN RISK!)');
    console.log('   - Added: Exponential backoff 3s → 40s');
    console.log('   - Added: ±30% jitter (ANTI-BAN)');
    console.log('\n🛡️ Ban risk: HIGH → LOW');
} else {
    console.log('⚠️  Pattern not found. Checking if already fixed...');
    if (content.includes('CAPTCHA.BASE_DELAY * Math.pow(CAPTCHA.EXPONENTIAL_BASE, retries)')) {
        console.log('✅ Already fixed! Exponential backoff is in place.');
    } else {
        console.log('❌ ERROR: Could not find the code to fix!');
        process.exit(1);
    }
}
