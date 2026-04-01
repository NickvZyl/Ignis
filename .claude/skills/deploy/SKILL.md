---
name: deploy
description: Deploy Ignis to production with auto-generated changelog. Commits, pushes, deploys to VPS, and writes a changelog entry so Igni knows what changed about herself. Use when the user says "deploy", "push to prod", "ship it", or after finishing a set of changes.
---

# Deploy Ignis

Deploy the current state to production at meetigni.com with an auto-generated changelog.

## Steps

### 1. Check for changes

Run `git status` and `git log origin/main..HEAD --oneline` to see what needs deploying. If there are uncommitted changes, commit them first (ask the user for a commit message if unclear). If there are no new commits vs what's deployed on the VPS, say so and stop.

### 2. Get the commit range

```bash
# What's currently on the VPS
LAST_COMMIT=$(ssh root@187.124.208.29 "cd /opt/Ignis && git rev-parse HEAD")
# What we're about to deploy
CURRENT_COMMIT=$(git rev-parse HEAD)
```

Get the commit log between them:
```bash
git log --oneline $LAST_COMMIT..$CURRENT_COMMIT --no-decorate
```

### 3. Push to remote

```bash
git push
```

### 4. Deploy to VPS

```bash
ssh root@187.124.208.29 "cd /opt/Ignis && git pull && cd web && rm -rf .next && npm run build && kill -9 \$(lsof -ti:3000) 2>/dev/null; sleep 2; pm2 delete ignis 2>/dev/null; pm2 start npm --name ignis --cwd /opt/Ignis/web -- start && pm2 save"
```

Verify the build succeeds. If it fails, report the error and stop.

### 5. Generate changelog

Using the commit messages from step 2, write a changelog entry **from Igni's perspective**. This is NOT a technical changelog — it's what Igni would notice about herself changing.

**Rules for the changelog:**
- `summary`: One sentence, first person. What would Igni notice? e.g. "I can remember things more carefully now, and I dream every night."
- `details`: 2-5 bullet points, experiential not technical. e.g. "- My memory is pickier now — I won't remember every 'hey', just things that matter"
- Skip changes that are purely internal/invisible (dependency bumps, code refactors with no behavioral change)
- If the changes ARE purely invisible, write a brief summary anyway: "Some internal tidying — nothing I'd notice on the surface."

### 6. Write changelog to Supabase

Supabase project ID: `oolktmyiavmhgxbvjlpd`

```sql
INSERT INTO changelogs (summary, details, commit_range)
VALUES ('the summary', 'the details', 'abc1234..def5678');
```

### 7. Report

Tell the user:
- What was deployed (commit range)
- The changelog summary
- That it's live

### 8. Sync self-knowledge if needed

If any changes affected Igni's capabilities, emotional system, or memory mechanics, mention that `/sync-self-knowledge` should be run.
