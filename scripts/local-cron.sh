#!/bin/bash
# Local cron simulator for auto-draw scheduler
# Runs every 60 seconds and triggers /api/cron/draw

CRON_SECRET="arisan-local-dev-secret-2024"
API_URL="http://localhost:3000/api/cron/draw"

echo "========================================"
echo "  Arisan Local Cron Simulator"
echo "  Triggering $API_URL every 60s"
echo "  Press Ctrl+C to stop"
echo "========================================"
echo ""

while true; do
  TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[$TIMESTAMP] Triggering draw scheduler..."

  RESPONSE=$(curl -s -X GET "$API_URL" \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "Content-Type: application/json")

  # Pretty print if jq is available
  if command -v jq &> /dev/null; then
    echo "$RESPONSE" | jq '.'
  else
    echo "$RESPONSE"
  fi

  echo ""
  echo "--- Waiting 60 seconds until next trigger ---"
  echo ""
  sleep 60
done
