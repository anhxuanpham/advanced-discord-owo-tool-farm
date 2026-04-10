# Hướng dẫn triển khai Multi-Account trên 1 Server

## Tổng quan

Thay vì deploy lên 3 server riêng biệt, giờ chỉ cần 1 server duy nhất chạy 1 Docker container.
Tất cả accounts được lưu trong `data/data.json` và tự động chạy song song khi khởi động.

## Yêu cầu

- 1 VPS (Ubuntu/Debian) với Docker + Docker Compose
- SSH access
- Đã cài Git

## Bước 1: Setup accounts trên local

Chạy tool ở chế độ interactive để thêm từng account:

```bash
npm start
```

Mỗi lần chạy, chọn "Add new account" → nhập token → cấu hình → tool sẽ lưu vào `data/data.json`.

Lặp lại cho cả 3 accounts. File `data/data.json` sẽ có dạng:

```json
{
  "user_id_1": { "username": "acc1", "token": "...", ... },
  "user_id_2": { "username": "acc2", "token": "...", ... },
  "user_id_3": { "username": "acc3", "token": "...", ... }
}
```

## Bước 2: Deploy lên server

### Lần đầu tiên

```bash
# SSH vào server
ssh root@<server-ip>

# Clone repo
git clone https://github.com/<your-repo>/advanced-discord-owo-tool-farm.git
cd advanced-discord-owo-tool-farm

# Tạo thư mục data
mkdir -p data logs
```

Copy file `data/data.json` từ local lên server:

```bash
# Chạy từ máy local
scp ./data/data.json root@<server-ip>:~/advanced-discord-owo-tool-farm/data/
```

### Khởi chạy

```bash
docker-compose up -d --build
```

### Kiểm tra logs

```bash
# Xem logs realtime
docker logs -f owo-farm-bot

# Sẽ thấy output kiểu:
# [Auto-Start] Found 3 account(s), starting all in parallel...
# [acc1] Logging in...
# [acc1] Farm loop started.
# [Auto-Start] Waiting 5s before next account login...
# [acc2] Logging in...
# [acc2] Farm loop started.
# [Auto-Start] Waiting 5s before next account login...
# [acc3] Logging in...
# [acc3] Farm loop started.
# [Auto-Start] All 3 account(s) are now running.
```

## Bước 3: Deploy các lần sau

Chạy script deploy từ local:

```bash
bash deploy.sh
```

Hoặc SSH vào server và chạy thủ công:

```bash
ssh root@<server-ip>
cd ~/advanced-discord-owo-tool-farm
git pull origin main
docker-compose up -d --build --force-recreate
```

## Cách hoạt động

- `--auto` flag (trong Dockerfile CMD) bật chế độ auto-start
- Khi không chỉ định `--account`, tool load TẤT CẢ accounts từ `data/data.json`
- Mỗi account tạo riêng 1 Discord client + 1 farm loop, chạy độc lập
- Các account login cách nhau 5 giây để tránh rate limit
- Nếu 1 account lỗi, các account khác vẫn chạy bình thường
- Logic farm (captcha, huntbot, gem, sleep, v.v.) không thay đổi

## Chạy 1 account cụ thể (tùy chọn)

```bash
npm start -- --auto --account <user_id>
```

## Thêm/xóa account

1. Chạy `npm start` ở chế độ interactive (trên local hoặc trực tiếp trên server)
2. Thêm hoặc xóa account
3. Restart container: `docker-compose restart`

## Quản lý

| Lệnh | Mô tả |
|-------|-------|
| `docker-compose up -d` | Khởi chạy |
| `docker-compose down` | Dừng |
| `docker-compose restart` | Restart |
| `docker logs -f owo-farm-bot` | Xem logs |
| `docker-compose up -d --build` | Rebuild + chạy |

## Lưu ý

- File `data/data.json` chứa tokens — KHÔNG commit lên git
- Đảm bảo `.gitignore` có dòng `data/`
- Nếu 1 account bị ban/lỗi token, nó sẽ log error và dừng farm loop riêng, không ảnh hưởng account khác
- Captcha solving: khi 1 account đang solve, account khác sẽ chờ (tránh rate limit API), nhưng mỗi account solve captcha riêng của mình
- Login timeout: mỗi account có 30s để login, nếu quá thời gian sẽ skip và chạy account tiếp theo
- Webhook URL trong `deploy.sh` nên chuyển sang biến môi trường để bảo mật
