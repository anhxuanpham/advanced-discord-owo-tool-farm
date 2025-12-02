# Captcha Retry Enhancement - MANUAL FIX

Này! Công cụ tôi có vấn đề khi edit file lớn. Vui lòng áp dụng 3 thay đổi sau MỘT CÁCH THỦ CÔNG trong file `src/services/CaptchaService.ts`:

## ✅ ĐÃ HOÀN THÀNH: constants.ts
- File `src/typings/constants.ts` đã được cập nh ật thành công
- Logic captcha retry: **5 lần thử** với exponential backoff

## ⚠️ CẦN LÀM THỦ CÔNG: CaptchaService.ts

### Thay đổi 1: Line 12 - Import CAPTCHA
```typescript
// Tìm dòng này:
import { NORMALIZE_REGEX } from "@/typings/constants.js";

// Thay bằng:
import { NORMALIZE_REGEX, CAPTCHA } from "@/typings/constants.js";
```

### Thay đổi 2: Line 194 - Update maxRetries  
```typescript
// Tìm dòng này:
const maxRetries = 1;

// Thay bằng:
const maxRetries = CAPTCHA.MAX_RETRIES;
```

### Thay đổi 3: Lines 275-276 - Exponential backoff
```typescript
// Tìm 2 dòng này:
logger.warn(`Retrying captcha solving after 3 seconds... (${retries + 1}/${maxRetries})`);
await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds before retry

// Thay bằng:
// Calculate delay with exponential backoff and jitter
const baseDelay = CAPTCHA.BASE_DELAY * Math.pow(CAPTCHA.EXPONENTIAL_BASE, retries);
const jitter = baseDelay * CAPTCHA.JITTER_FACTOR * (Math.random() * 2 - 1);
const delay = Math.min(
    Math.max(baseDelay + jitter, CAPTCHA.BASE_DELAY),
    CAPTCHA.MAX_DELAY
);

logger.warn(
    `Retrying capatchasolving in ${(delay / 1000).toFixed(1)}s... ` +
    `(Attempt ${retries + 1}/${maxRetries})`
);

await new Promise(resolve => setTimeout(resolve, delay));
```

## Sau khi edit xong:

```bash
move report.ts.temp src\commands\report.ts
move stats.ts.temp src\commands\stats.ts
npm install
```

## Hoặc chạy source NGAY BÂY GIỜ:

Nếu muốn chạy source ngay (KHÔNG cần report.ts và stats.ts):
```bash
npm install
```

Logic captcha retry ĐÃ được tăng lên 5 lần nếu bạn làm 3 thay đổi trên!
