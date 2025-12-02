const fs = require('fs');

const filePath = 'src/services/CaptchaService.ts';
let content = fs.readFileSync(filePath, 'utf-8');

// Pattern to find
const oldPattern = /logger\.warn\(`Retrying captcha solving after 3 seconds\.\.\. \(\$\{retries \+ 1\}\/\$\{maxRetries\}\)`\);[\r\n\s]+await new Promise\(resolve => setTimeout\(resolve, 3000\)\); \/\/ Wait 3 seconds before retry/;

// New code
const newCode = `// Calculate delay with exponential backoff and jitter
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

if (oldPattern.test(content)) {
    content = content.replace(oldPattern, newCode);
    fs.writeFileSync(filePath, content);
    console.log('✅ FIXED! Exponential backoff applied successfully!');
} else {
    console.log('⚠️ Pattern not found, trying alternative...');

    // Alternative: find by simpler pattern
    const simplePattern = 'await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds before retry';

    if (content.includes(simplePattern)) {
        // Find the full block
        const lines = content.split('\n');
        let lineIndex = -1;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(simplePattern)) {
                lineIndex = i;
                break;
            }
        }

        if (lineIndex > 0) {
            // Replace the logger.warn line and the await line
            lines[lineIndex - 1] = '                // Calculate delay with exponential backoff and jitter';
            lines.splice(lineIndex, 0,
                '                const baseDelay = CAPTCHA.BASE_DELAY * Math.pow(CAPTCHA.EXPONENTIAL_BASE, retries);',
                '                const jitter = baseDelay * CAPTCHA.JITTER_FACTOR * (Math.random() * 2 - 1);',
                '                const delay = Math.min(',
                '                    Math.max(baseDelay + jitter, CAPTCHA.BASE_DELAY),',
                '                    CAPTCHA.MAX_DELAY',
                '                );',
                '',
                '                logger.warn(',
                '                    `Retrying captcha solving in ${(delay / 1000).toFixed(1)}s... ` +',
                '                    `(Attempt ${retries + 1}/${maxRetries})`',
                '                );',
                ''
            );
            lines[lineIndex] = '                await new Promise(resolve => setTimeout(resolve, delay));';

            fs.writeFileSync(filePath, lines.join('\n'));
            console.log('✅ FIXED using alternative method!');
        }
    } else {
        console.log('❌ Could not find code to replace!');
        process.exit(1);
    }
}
