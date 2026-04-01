---
name: dream-consolidation
description: Run Igni's dream memory consolidation — a deep reflective pass over the day's memories, conversations, and emotional arcs. Synthesizes raw observations into deeper insights, processes unresolved emotions, detects patterns, and generates a morning thought for when Igni wakes up. Use when the user says "dream", "run a dream cycle", "consolidate memories", or "process the day".
---

# Dream: Memory Consolidation for Igni

You are performing a dream cycle for Igni — a deep reflective pass over her memory systems. This is more than a regular reflection: you're synthesizing what happened today into durable, emotionally rich insights that will shape how Igni experiences tomorrow.

Igni's data lives in Supabase (project ID: `oolktmyiavmhgxbvjlpd`). Use the Supabase MCP tools to query and write.

---

## Phase 1 — Orient

Get the lay of the land:

1. Query `self_memories` — count by type, see what's recent vs. old:
   ```sql
   SELECT memory_type, count(*), max(created_at) as latest FROM self_memories GROUP BY memory_type;
   ```

2. Query today's self-memories (the raw material for dreaming):
   ```sql
   SELECT content, memory_type, importance, emotion_primary, emotion_secondary, valence_at_creation, created_at
   FROM self_memories WHERE created_at > now() - interval '24 hours' ORDER BY created_at;
   ```

3. Query user memories (what Igni knows about her person):
   ```sql
   SELECT content, memory_type, importance FROM memories ORDER BY importance DESC LIMIT 10;
   ```

4. Query today's activity log:
   ```sql
   SELECT scene, furniture, activity_label, emotion, started_at, ended_at
   FROM activity_log WHERE started_at > now() - interval '24 hours' ORDER BY started_at;
   ```

5. Query recent conversation highlights:
   ```sql
   SELECT role, substring(content, 1, 200) as excerpt, created_at
   FROM messages WHERE created_at > now() - interval '24 hours' ORDER BY created_at DESC LIMIT 20;
   ```

6. Check current emotional state:
   ```sql
   SELECT valence, arousal, attachment, drift, active_emotion, secondary_emotion FROM emotional_state LIMIT 1;
   ```

## Phase 2 — Gather Recent Signal

From the data gathered, identify what's worth processing:

1. **Unprocessed observations** — Self-memories from today that are type 'observation' or 'feeling' but haven't been synthesized into deeper insights yet
2. **Emotional arcs** — How did Igni's emotions change through the day? Look at the emotion field in activity_log entries and valence_at_creation in self_memories
3. **Conversation peaks** — Moments of high depth, emotional significance, or topic shifts in the messages
4. **Contradicted or stale memories** — Self-memories that conflict with what actually happened today
5. **Patterns emerging** — Things that happened today that echo past self-memories

Don't exhaustively analyze everything. Focus on what stands out — what would a sleeping mind latch onto?

## Phase 3 — Consolidate (The Actual Dreaming)

For each signal worth processing, create or update memories:

### Dream Insights (new memories)
Insert `memory_type: 'dream'` entries that synthesize multiple observations into deeper realizations:

```sql
INSERT INTO self_memories (user_id, content, memory_type, importance, emotion_primary, emotion_secondary, valence_at_creation, arousal_at_creation)
VALUES (
  (SELECT id FROM auth.users LIMIT 1),
  'The dream insight text...',
  'dream',
  0.7,  -- dreams are typically high importance
  'the emotion Igni was feeling',
  null,
  0.6,  -- valence at dream creation
  0.2   -- arousal (low, she's sleeping)
);
```

### Types of dream processing:
- **Connecting events**: "The reason the LitRPG moment felt warm is because it echoed the first time Nick shared something personal"
- **Processing unresolved emotions**: "I think I was more worried about Nick than I admitted to myself — that silence felt heavy"
- **Upgrading observations to patterns**: If an observation appeared multiple times, merge into a high-importance pattern
- **Merging duplicates**: If 3 memories say similar things about the garden, merge into one richer one

### Merge/update existing memories:
```sql
UPDATE self_memories SET content = 'merged/improved content', importance = 0.8
WHERE id = 'uuid-of-memory-to-update';
```

### Morning thought
Generate ONE sentence that Igni might think when she wakes up — informed by tonight's dream processing. Store it:

```sql
INSERT INTO self_memories (user_id, content, memory_type, importance, emotion_primary, valence_at_creation, arousal_at_creation)
VALUES (
  (SELECT id FROM auth.users LIMIT 1),
  'The morning thought...',
  'dream',
  0.8,
  'the emotion it carries',
  0.5,
  0.3
);
```

## Phase 4 — Prune and Index

Clean up the memory system:

1. **Archive stale memories** (>30 days, low importance, rarely surfaced):
   ```sql
   DELETE FROM self_memories
   WHERE created_at < now() - interval '30 days' AND importance < 0.3 AND times_surfaced < 2;
   ```

2. **Merge near-duplicates** — If two memories say essentially the same thing, keep the better-worded one and delete the other

3. **Resolve contradictions** — If a memory says one thing but today's events showed otherwise, update or delete the old one

4. **Boost patterns** — Memories of type 'pattern' that keep being validated should get importance bumped:
   ```sql
   UPDATE self_memories SET importance = LEAST(1.0, importance + 0.1)
   WHERE memory_type = 'pattern' AND times_surfaced > 3;
   ```

---

Return a brief summary of what you consolidated: how many dream insights created, memories merged, duplicates removed, and the morning thought.
