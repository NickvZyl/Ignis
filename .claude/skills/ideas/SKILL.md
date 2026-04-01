---
name: ideas
description: View and manage Igni's ideas backlog — feature suggestions, improvements, and things to build that come up during conversations with Igni. Use when the user asks "what ideas does Igni have?", "show me the ideas", "what should we build next?", "check the ideas backlog", or "any new ideas?".
mode: plan
---

# Igni Ideas Backlog

**IMPORTANT: This skill runs in plan mode. Query and present ideas READ-ONLY. Do NOT execute any changes (status updates, inserts, deletes) without explicit user approval via the plan workflow. Present findings, recommend actions, and let the user decide.**

Query and manage the shared ideas table that Igni populates during conversations. This is the bridge between brainstorming with Igni and building with Claude Code.

**Supabase project ID:** `oolktmyiavmhgxbvjlpd`

## View all ideas

```sql
SELECT id, title, description, status, priority, source,
  to_char(created_at, 'YYYY-MM-DD HH24:MI') as created
FROM ideas
ORDER BY
  CASE status
    WHEN 'in_progress' THEN 1
    WHEN 'approved' THEN 2
    WHEN 'proposed' THEN 3
    WHEN 'done' THEN 4
    WHEN 'rejected' THEN 5
  END,
  CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
  created_at DESC;
```

## Present the results

Group by status and present clearly:

- **IN PROGRESS** — Currently being worked on
- **APPROVED** — Ready to build
- **PROPOSED** — Ideas that need review
- **DONE** — Completed
- **REJECTED** — Decided against

For each idea, show: title, description (if any), priority, source (igni/user), and when it was created.

## Managing ideas

When the user wants to act on an idea:

**Approve an idea:**
```sql
UPDATE ideas SET status = 'approved', updated_at = now() WHERE id = 'uuid';
```

**Start working on one:**
```sql
UPDATE ideas SET status = 'in_progress', updated_at = now() WHERE id = 'uuid';
```

**Mark as done:**
```sql
UPDATE ideas SET status = 'done', updated_at = now() WHERE id = 'uuid';
```

**Add an idea from Claude Code side:**
```sql
INSERT INTO ideas (user_id, title, description, priority, source)
VALUES ((SELECT id FROM auth.users LIMIT 1), 'Title', 'Description', 'medium', 'system');
```

## Workflow

1. User asks about ideas → query and present the backlog
2. User picks one → update status to `in_progress`
3. Start building → reference the idea's description for context
4. When done → update status to `done`
