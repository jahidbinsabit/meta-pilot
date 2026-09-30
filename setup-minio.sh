#!/bin/bash
# Quick setup script for MinIO local S3 storage

set -e

echo "🚀 Setting up MinIO for local development..."

# Start MinIO
echo "📦 Starting MinIO container..."
docker compose up -d minio

# Wait for MinIO to be healthy
echo "⏳ Waiting for MinIO to be ready..."
timeout=30
elapsed=0
while ! docker exec genmetaai-minio curl -sf http://localhost:9000/minio/health/live > /dev/null 2>&1; do
  if [ $elapsed -ge $timeout ]; then
    echo "❌ Timeout waiting for MinIO to start"
    exit 1
  fi
  sleep 1
  elapsed=$((elapsed + 1))
done

# Create bucket
echo "🪣 Creating 'stockforge-ai' bucket..."
docker run --rm --network host minio/mc sh -c "
  mc alias set local http://localhost:9000 minioadmin minioadmin123 &&
  mc mb --ignore-existing local/stockforge-ai &&
  mc anonymous set download local/stockforge-ai
" || {
  echo "⚠️  Bucket creation failed, but MinIO is running. You can create it manually:"
  echo "   1. Open http://localhost:9001"
  echo "   2. Login: minioadmin / minioadmin123"
  echo "   3. Create bucket: stockforge-ai"
  exit 0
}

echo "✅ MinIO setup complete!"
echo ""
echo "📝 MinIO Console: http://localhost:9001"
echo "   Username: minioadmin"
echo "   Password: minioadmin123"
echo ""
echo "🔗 S3 Endpoint: http://localhost:9000"
echo "📦 Bucket: stockforge-ai"
echo ""
echo "Your .env is already configured to use MinIO!"
