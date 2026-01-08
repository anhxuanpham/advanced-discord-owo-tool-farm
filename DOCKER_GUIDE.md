# 🐳 Hướng Dẫn Docker Deployment

## Cấu Trúc Thư Mục

```
/root/advanced-discord-owo-tool-farm/
├── config.json          # Config chính (mount read-only)
├── data/
│   └── data.json        # Data persist (accounts, stats)
├── logs/
│   └── *.log            # Log files
├── Dockerfile
├── docker-compose.yml
└── ... (source code)
```

---

## ⚡ Auto-Start Mode (MỚI)

Bot giờ hỗ trợ **auto-start** không cần tương tác CLI!

### Cách hoạt động

1. **Lần đầu**: Chạy thủ công để setup account
   ```bash
   docker exec -it owo-farm-bot npm start
   ```

2. **Các lần sau**: Bot tự động load account đã lưu
   ```bash
   # Dockerfile đã được config với --auto flag
   docker-compose restart
   ```

### CLI Flags

| Flag | Mô tả |
|------|-------|
| `--auto` | Tự động load account đầu tiên, skip CLI |
| `--account <id>` | Chỉ định account ID để load |
| `--skip-check-update` | Bỏ qua kiểm tra update |

---

## 🚀 Lần Đầu Deploy

```bash
# 1. Clone repo
git clone https://github.com/your-repo/advanced-discord-owo-tool-farm.git
cd advanced-discord-owo-tool-farm

# 2. Tạo thư mục data
mkdir -p data logs

# 3. Tạo config.json (nếu chưa có)
cp config.example.json config.json
nano config.json  # Chỉnh sửa config

# 4. Build và chạy
docker-compose up -d --build

# 5. Xem logs
docker-compose logs -f
```

---

## 🔄 Rebuild Không Mất Data

```bash
# Bước 1: Backup data từ container (nếu cần)
docker cp owo-farm-bot:/root/b2ki-ados/data.json ./data/

# Bước 2: Pull code mới
git pull

# Bước 3: Rebuild
docker-compose down && docker-compose up -d --build

# Bước 4: Xem logs
docker-compose logs -f
```

### ⚡ Shortcut (1 lệnh)

```bash
docker cp owo-farm-bot:/root/b2ki-ados/data.json ./data/ 2>/dev/null; \
git pull && docker-compose down && docker-compose up -d --build && docker-compose logs -f
```

---

## 📋 Các Lệnh Thường Dùng

| Lệnh | Mô tả |
|------|-------|
| `docker-compose up -d` | Khởi động container |
| `docker-compose down` | Dừng container |
| `docker-compose restart` | Restart container |
| `docker-compose logs -f` | Xem logs realtime |
| `docker-compose logs --tail 100` | Xem 100 dòng log cuối |
| `docker exec -it owo-farm-bot sh` | Vào shell container |

---

## ⚠️ Lưu Ý Quan Trọng

### Data Persistence

Data được lưu ở 2 nơi (tùy phiên bản code):

| Phiên bản | Đường dẫn trong container | Volume mount cần thiết |
|-----------|---------------------------|------------------------|
| **Cũ** | `/root/b2ki-ados/data.json` | `./data:/root/b2ki-ados` |
| **Mới** | `/app/data/data.json` | `./data:/app/data` |

### docker-compose.yml Đề Xuất

```yaml
version: '3.8'

services:
  owo-farm:
    build: .
    container_name: owo-farm-bot
    restart: unless-stopped
    volumes:
      - ./config.json:/app/config.json:ro
      - ./logs:/app/logs
      - ./data:/app/data
      - ./data:/root/b2ki-ados    # Hỗ trợ code cũ
    environment:
      - NODE_ENV=production
      - TZ=Asia/Ho_Chi_Minh
    stdin_open: true
    tty: true
```

---

## 🔧 Troubleshooting

### Container không đọc được data.json

```bash
# Kiểm tra file có trong container không
docker exec owo-farm-bot ls -la /app/data/
docker exec owo-farm-bot ls -la /root/b2ki-ados/

# Kiểm tra nội dung
docker exec owo-farm-bot cat /app/data/data.json
```

### Mất config sau rebuild

```bash
# Backup trước khi down
docker cp owo-farm-bot:/root/b2ki-ados/data.json ./data/

# Sau đó mới rebuild
docker-compose down && docker-compose up -d --build
```

### Xem logs lỗi

```bash
# Logs container
docker-compose logs --tail 200

# Logs trong thư mục
cat logs/combined.log | tail -100
```

---

## 📦 Backup & Restore

### Backup

```bash
# Backup tất cả data
tar -czvf backup-$(date +%Y%m%d).tar.gz data/ logs/ config.json
```

### Restore

```bash
# Restore từ backup
tar -xzvf backup-20260104.tar.gz
docker-compose restart
```
