#!/bin/bash
set -e

echo "🚀 Starting deployment to all servers (minimal downtime)..."

# Server 1: root@143.198.212.100 (direct root access)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Deploying to Server 1 (143.198.212.100)..."
ssh root@143.198.212.100 << 'EOF'
cd ~/advanced-discord-owo-tool-farm
git pull origin main
docker-compose up -d --build --force-recreate
docker image prune -f  # Clean up dangling images
echo "✅ Server 1 deployed!"
EOF

# Server 2: William@34.158.63.223 (needs sudo, folder in /root/)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Deploying to Server 2 (34.158.63.223)..."
ssh William@34.158.63.223 << 'EOF'
sudo bash -c 'cd /root/advanced-discord-owo-tool-farm && git pull origin main && docker-compose up -d --build --force-recreate && docker image prune -f'
echo "✅ Server 2 deployed!"
EOF

# Server 3: William@34.126.130.69 (needs sudo, folder in /root/)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Deploying to Server 3 (34.126.130.69)..."
ssh William@34.126.130.69 << 'EOF'
sudo bash -c 'cd /root/advanced-discord-owo-tool-farm && git pull origin main && docker-compose up -d --build --force-recreate && docker image prune -f'
echo "✅ Server 3 deployed!"
EOF

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 All servers updated successfully!"
