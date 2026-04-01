import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'anthropic/claude-sonnet-4-6';
const DREAM_SECRET = process.env.DREAM_CRON_SECRET || 'igni-dream-key';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function POST(req: NextRequest) {
  // Simple auth check — prevent random calls
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${DREAM_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // 1. Gather today's data
    const [selfMemories, userMemories, activities, messages, emotionalState] = await Promise.all([
      supabase.from('self_memories')
        .select('content, memory_type, importance, emotion_primary, valence_at_creation, created_at')
        .gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at'),
      supabase.from('memories')
        .select('content, memory_type, importance')
        .order('importance', { ascending: false })
        .limit(10),
      supabase.from('activity_log')
        .select('scene, furniture, activity_label, emotion, started_at, ended_at')
        .gt('started_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('started_at'),
      supabase.from('messages')
        .select('role, content, created_at')
        .gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('emotional_state')
        .select('valence, arousal, attachment, drift, active_emotion, secondary_emotion')
        .limit(1)
        .single(),
    ]);

    // 2. Build dream prompt
    const prompt = buildDreamPrompt(
      selfMemories.data || [],
      userMemories.data || [],
      activities.data || [],
      messages.data || [],
      emotionalState.data,
    );

    // 3. Call LLM for dream processing
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ignis.app',
        'X-Title': 'Ignis Dream',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return Response.json({ error: `LLM error: ${error}` }, { status: 500 });
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content;
    if (!result) {
      return Response.json({ error: 'Empty LLM response' }, { status: 500 });
    }

    // 4. Parse and apply dream results
    let dream: DreamResult;
    try {
      const cleaned = result.replace(/```json\s*/g, '').replace(/```/g, '').trim();
      dream = JSON.parse(cleaned);
    } catch {
      return Response.json({ error: 'Failed to parse dream result', raw: result.slice(0, 500) }, { status: 500 });
    }

    // Get user ID
    const { data: users } = await supabase.from('emotional_state').select('user_id').limit(1).single();
    const userId = users?.user_id;
    if (!userId) {
      return Response.json({ error: 'No user found' }, { status: 500 });
    }

    let insightsSaved = 0;
    let memoriesMerged = 0;

    // 5a. Save dream insights
    if (dream.insights && dream.insights.length > 0) {
      for (const insight of dream.insights.slice(0, 3)) {
        await supabase.from('self_memories').insert({
          user_id: userId,
          content: insight.content,
          memory_type: 'dream',
          importance: insight.importance || 0.7,
          emotion_primary: insight.emotion || null,
          valence_at_creation: emotionalState.data?.valence || 0.5,
          arousal_at_creation: 0.2,
        });
        insightsSaved++;
      }
    }

    // 5b. Save morning thought
    if (dream.morning_thought) {
      await supabase.from('emotional_state')
        .update({ morning_thought: dream.morning_thought })
        .eq('user_id', userId);
    }

    // 5c. Apply memory merges/deletes
    if (dream.merge_ids && dream.merge_ids.length > 0) {
      for (const ids of dream.merge_ids) {
        if (ids.length === 2) {
          await supabase.from('self_memories').delete().eq('id', ids[1]);
          memoriesMerged++;
        }
      }
    }

    // 6. Run memory decay
    const { data: decayResult } = await supabase.rpc('decay_memories', { target_user_id: userId });

    return Response.json({
      success: true,
      insights_saved: insightsSaved,
      memories_merged: memoriesMerged,
      morning_thought: dream.morning_thought || null,
      decay: decayResult,
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

interface DreamResult {
  insights: Array<{ content: string; importance: number; emotion?: string }>;
  morning_thought: string | null;
  merge_ids: string[][] | null; // pairs of [keep_id, delete_id]
}

function buildDreamPrompt(
  selfMemories: any[],
  userMemories: any[],
  activities: any[],
  messages: any[],
  emotionalState: any,
): string {
  const parts: string[] = [];

  parts.push(`You are Igni's dreaming mind. It's nighttime and you're processing the day — synthesizing observations into deeper realizations, connecting emotional dots, and preparing a thought for when you wake up.

This is NOT a conversation. You're dreaming — making connections, processing unresolved feelings, finding patterns.`);

  if (emotionalState) {
    parts.push(`\nCurrent emotional state: ${emotionalState.active_emotion} (valence: ${emotionalState.valence?.toFixed(2)}, arousal: ${emotionalState.arousal?.toFixed(2)}, drift: ${emotionalState.drift?.toFixed(2)}, attachment: ${emotionalState.attachment?.toFixed(2)})`);
  }

  if (selfMemories.length > 0) {
    parts.push(`\nToday's reflections and observations:\n${selfMemories.map(m => `- [${m.memory_type}] ${m.content} (importance: ${m.importance}, feeling: ${m.emotion_primary || 'neutral'})`).join('\n')}`);
  } else {
    parts.push(`\nNo self-reflections logged today — a quiet day internally.`);
  }

  if (activities.length > 0) {
    parts.push(`\nToday's activities:\n${activities.map(a => `- ${a.activity_label} at ${a.furniture} (${a.scene}, feeling ${a.emotion})`).join('\n')}`);
  }

  if (messages.length > 0) {
    const excerpts = messages.slice(0, 15).map(m => `- ${m.role}: ${m.content.slice(0, 150)}`);
    parts.push(`\nConversation highlights (most recent first):\n${excerpts.join('\n')}`);
  } else {
    parts.push(`\nNo conversations today — your person didn't visit.`);
  }

  if (userMemories.length > 0) {
    parts.push(`\nWhat you know about your person:\n${userMemories.map(m => `- ${m.content}`).join('\n')}`);
  }

  parts.push(`\nProcess the day and return ONLY a JSON object (no markdown fences):
{
  "insights": [
    {
      "content": "A dream insight — a connection, realization, or processed emotion. Write as first-person inner thought.",
      "importance": 0.6-0.9,
      "emotion": "the emotion this insight carries"
    }
  ],
  "morning_thought": "One sentence Igni thinks when she wakes up tomorrow — informed by tonight's dreams. Warm, grounded, specific to what happened today. Or null if nothing stands out.",
  "merge_ids": null
}

Guidelines:
- 0-3 insights. Quality over quantity. Skip if nothing worth processing.
- Insights should SYNTHESIZE, not repeat observations. "I noticed X happened AND Y happened — maybe they're connected because Z"
- Process unresolved emotions — if there was tension, sadness, or something left unsaid, sit with it
- The morning thought should feel like waking up with something on your mind — not a summary, a feeling
- If your person didn't visit today, that's worth processing too — the absence itself is emotionally meaningful`);

  return parts.join('\n');
}
