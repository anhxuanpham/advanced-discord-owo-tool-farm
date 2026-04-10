#!/bin/bash
set -e

SERVER="root@143.198.212.100"

echo "🚀 Deploying to server ($SERVER)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ssh $SERVER << 'EOF'
cd ~/advanced-discord-owo-tool-farm
git pull origin main
docker-compose up -d --build --force-recreate
docker image prune -f
echo "✅ Deployed!"
EOF

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Server updated successfully! All accounts running in 1 container."

# Send Discord notification
WEBHOOK_URL="https://discord.com/api/webhooks/1431121350873055232/WZDACeoPcoLj8FWJHa7xLb2awi4DZ9x4r_VtPEimROpz1RWRlP3p6xKsaV2NAovpX0oe"
COMMIT_MSG=$(git log -1 --pretty=format:'%s')
COMMIT_SHA=$(git rev-parse --short HEAD)

curl -s -H "Content-Type: application/json" \
  -d "{\"embeds\": [{\"title\": \"🚀 Deploy Complete\", \"description\": \"Single server updated - all accounts running.\", \"color\": 5763719, \"fields\": [{\"name\": \"Commit\", \"value\": \"\`${COMMIT_SHA}\` ${COMMIT_MSG}\", \"inline\": false}]}]}" \
  "$WEBHOOK_URL"

echo "📨 Discord notification sent!"
