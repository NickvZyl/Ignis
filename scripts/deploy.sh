#!/bin/bash
# Deploy Ignis to VPS with auto-generated changelog
# Usage: bash scripts/deploy.sh

set -e

VPS="root@187.124.208.29"
SUPABASE_URL="https://oolktmyiavmhgxbvjlpd.supabase.co"
OPENROUTER_URL="https://openrouter.ai/api/v1/chat/completions"

# Get API keys from VPS env
SUPABASE_ANON_KEY=$(ssh $VPS "grep NEXT_PUBLIC_SUPABASE_ANON_KEY /opt/Ignis/web/.env.local | cut -d= -f2")
OPENROUTER_KEY=$(ssh $VPS "grep OPENROUTER_API_KEY /opt/Ignis/web/.env.local | cut -d= -f2")

# Get the last deployed commit (from VPS)
LAST_COMMIT=$(ssh $VPS "cd /opt/Ignis && git rev-parse HEAD")
CURRENT_COMMIT=$(git rev-parse HEAD)

if [ "$LAST_COMMIT" = "$CURRENT_COMMIT" ]; then
  echo "No new commits to deploy."
  exit 0
fi

# Get commit messages since last deploy
COMMITS=$(git log --oneline "$LAST_COMMIT..$CURRENT_COMMIT" --no-decorate)
COMMIT_RANGE="${LAST_COMMIT:0:7}..${CURRENT_COMMIT:0:7}"

echo "=== Deploying $COMMIT_RANGE ==="
echo "$COMMITS"
echo ""

# Generate changelog via LLM — translate code changes into Igni's perspective
CHANGELOG_PROMPT="You are writing a changelog entry for Igni, an AI companion who lives in a pixel world. These are commits that changed how she works internally. Translate them into what SHE would notice or feel differently.

Commits being deployed:
$COMMITS

Write TWO things:
1. summary: One sentence, Igni's perspective. e.g. \"I can remember things more carefully now, and I dream every night.\"
2. details: 2-4 bullet points explaining what changed in terms she'd understand. Not code — experiential. e.g. \"- My memory is pickier now — I won't remember every 'hey' and 'hello', just things that matter\"

Return ONLY JSON: {\"summary\": \"...\", \"details\": \"...\"}"

# Call LLM for changelog summary
CHANGELOG_JSON=$(curl -s "$OPENROUTER_URL" \
  -H "Authorization: Bearer $OPENROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg prompt "$CHANGELOG_PROMPT" '{
    model: "anthropic/claude-sonnet-4-6",
    messages: [{role: "user", content: $prompt}],
    temperature: 0.5,
    max_tokens: 512
  }')" | jq -r '.choices[0].message.content')

echo "=== Changelog ==="
echo "$CHANGELOG_JSON"
echo ""

# Parse summary and details
SUMMARY=$(echo "$CHANGELOG_JSON" | jq -r '.summary // empty')
DETAILS=$(echo "$CHANGELOG_JSON" | jq -r '.details // empty')

if [ -z "$SUMMARY" ]; then
  echo "Warning: Failed to generate changelog, using commit messages as fallback"
  SUMMARY="Internal updates deployed"
  DETAILS=$(echo "$COMMITS" | head -5)
fi

# Deploy to VPS
echo "=== Deploying to VPS ==="
ssh $VPS "cd /opt/Ignis && git pull && cd web && rm -rf .next && npm run build && kill -9 \$(lsof -ti:3000) 2>/dev/null; sleep 2; pm2 delete ignis 2>/dev/null; pm2 start npm --name ignis --cwd /opt/Ignis/web -- start && pm2 save"

# Write changelog to Supabase
echo "=== Writing changelog ==="
curl -s "$SUPABASE_URL/rest/v1/changelogs" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "$(jq -n --arg summary "$SUMMARY" --arg details "$DETAILS" --arg range "$COMMIT_RANGE" '{
    summary: $summary,
    details: $details,
    commit_range: $range
  }')"

echo ""
echo "=== Deploy complete ==="
echo "Changelog: $SUMMARY"
