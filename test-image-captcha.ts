/**
 * Quick test script to verify image captcha solvers work.
 * Usage: npx tsx test-image-captcha.ts
 * 
 * Uses a sample captcha image from the internet to test both providers.
 */

import { AntiCaptchaTopSolver } from "./src/services/solvers/AntiCaptchaTopSolver.js";
import { TwoCaptchaSolver } from "./src/services/solvers/TwoCaptchaSolver.js";
import axios from "axios";
import fs from "fs";
import path from "path";

// ====== CONFIGURE YOUR API KEYS HERE ======
// Or load from your data.json
const loadConfig = () => {
    try {
        const dataDir = path.join(process.cwd(), "data");
        const files = fs.readdirSync(dataDir).filter(f => f.endsWith(".json"));
        if (files.length === 0) {
            console.error("No config files found in data/");
            process.exit(1);
        }
        const config = JSON.parse(fs.readFileSync(path.join(dataDir, files[0]), "utf-8"));
        return config;
    } catch (e) {
        console.error("Failed to load config:", e);
        process.exit(1);
    }
};

const config = loadConfig();
console.log(`Loaded config from data/ directory`);

// Sample captcha image for testing (a simple text captcha)
const TEST_IMAGE_URL = "https://dummyimage.com/200x80/000/fff&text=TEST";

async function downloadImage(url: string): Promise<Buffer> {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    return Buffer.from(response.data);
}

async function testAntiCaptchaTop() {
    const apiKey = config.imageApiKey;
    if (!apiKey) {
        console.log("❌ [AntiCaptchaTop] No imageApiKey in config, skipping...");
        return;
    }

    console.log("\n🧪 Testing AntiCaptchaTop...");
    const solver = new AntiCaptchaTopSolver(apiKey);

    try {
        // AntiCaptchaTop supports URL directly
        const result = await solver.solveImage(TEST_IMAGE_URL);
        console.log(`✅ [AntiCaptchaTop] Solved: "${result}"`);
    } catch (error) {
        console.log(`❌ [AntiCaptchaTop] Failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function test2Captcha() {
    const apiKey = config.backupImageApiKey || config.apiKey;
    if (!apiKey) {
        console.log("❌ [2Captcha] No backupImageApiKey or apiKey in config, skipping...");
        return;
    }

    console.log("\n🧪 Testing 2Captcha...");
    const solver = new TwoCaptchaSolver(apiKey);

    try {
        const imageBuffer = await downloadImage(TEST_IMAGE_URL);
        console.log(`   Downloaded test image (${imageBuffer.length} bytes)`);
        const result = await solver.solveImage(imageBuffer);
        console.log(`✅ [2Captcha] Solved: "${result}"`);
    } catch (error) {
        console.log(`❌ [2Captcha] Failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function main() {
    console.log("=".repeat(50));
    console.log("  Image Captcha Solver Test");
    console.log("=".repeat(50));
    console.log(`  Image Captcha API: ${config.imageCaptchaAPI || "not set"}`);
    console.log(`  Backup Image API:  ${config.backupImageCaptchaAPI || "not set"}`);
    console.log(`  Test Image URL:    ${TEST_IMAGE_URL}`);
    console.log("=".repeat(50));

    await testAntiCaptchaTop();
    await test2Captcha();

    console.log("\n" + "=".repeat(50));
    console.log("  Test complete!");
    console.log("=".repeat(50));
}

main().catch(console.error);
