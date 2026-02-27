#!/usr/bin/env bash
set -euo pipefail

# Muse environment setup
# Reads local Supabase config and generates .env files

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Reading Supabase status..."

# Parse supabase status JSON output
JSON=$(supabase status --output json 2>/dev/null) || {
  echo "Error: supabase is not running. Start it with: supabase start"
  exit 1
}

get_json() {
  echo "$JSON" | grep "\"$1\"" | head -1 | sed 's/.*: *"//' | sed 's/".*//'
}

API_URL=$(get_json "API_URL")
ANON_KEY=$(get_json "ANON_KEY")
SERVICE_ROLE_KEY=$(get_json "SERVICE_ROLE_KEY")
JWT_SECRET=$(get_json "JWT_SECRET")

if [ -z "$API_URL" ] || [ -z "$ANON_KEY" ] || [ -z "$SERVICE_ROLE_KEY" ] || [ -z "$JWT_SECRET" ]; then
  echo "Error: Could not parse Supabase status output."
  exit 1
fi

# Generate encryption key
ENCRYPTION_KEY=$(openssl rand -hex 32)

echo "Supabase URL: $API_URL"
echo ""

# Write client/.env.local
cat > "$PROJECT_DIR/client/.env.local" << EOF
VITE_SUPABASE_URL=$API_URL
VITE_SUPABASE_ANON_KEY=$ANON_KEY
EOF
echo "Wrote client/.env.local"

# Write server/.env
cat > "$PROJECT_DIR/server/.env" << EOF
SUPABASE_URL=$API_URL
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET=$JWT_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY
PORT=4444
EOF
echo "Wrote server/.env"

echo ""
echo "Done. Run 'npm run dev' to start."
