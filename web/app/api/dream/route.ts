import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'anthropic/claude-sonnet-4-6';
const DREAM_SECRET = process.env.DREAM_CRON_SECRET || 'igni-dream-key';
const USER_ID = '92d65536-f35b-464c-9898-372e0a899f7c'; // single-user for now

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
    // 1. Gather today's data via SECURITY DEFINER RPC (bypasses RLS)
    const { data: dreamData, error: gatherError } = await supabase.rpc('gather_dream_data', {
      target_user_id: USER_ID,
    });

    if (gatherError) {
      return Response.json({ error: `Data gather failed: ${gatherError.message}` }, { status: 500 });
    }

    // 2. Build dream prompt
    const prompt = buildDreamPrompt(
      dreamData.self_memories || [],
      dreamData.user_memories || [],
      dreamData.activities || [],
      dreamData.messages || [],
      dreamData.emotional_state,
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

    // 4. Parse dream results
    let dream: DreamResult;
    try {
      const cleaned = result.replace(/```json\s*/g, '').replace(/```/g, '').trim();
      dream = JSON.parse(cleaned);
    } catch {
      return Response.json({ error: 'Failed to parse dream result', raw: result.slice(0, 500) }, { status: 500 });
    }

    // 5. Save results via SECURITY DEFINER RPC
    const valence = dreamData.emotional_state?.valence ?? 0.5;
    const { data: saveResult, error: saveError } = await supabase.rpc('save_dream_results', {
      target_user_id: USER_ID,
      insights: dream.insights?.slice(0, 3) || [],
      p_morning_thought: dream.morning_thought || null,
      p_valence: valence,
    });

    if (saveError) {
      return Response.json({ error: `Save failed: ${saveError.message}` }, { status: 500 });
    }

    return Response.json({
      success: true,
      ...saveResult,
      raw_dream: { insights: dream.insights?.length || 0, morning_thought: dream.morning_thought },
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

interface DreamResult {
  insights: Array<{ content: string; importance: number; emotion?: string }>;
  morning_thought: string | null;
  merge_ids: string[][] | null;
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
    parts.push(`\nCurrent emotional state: ${emotionalState.active_emotion} (valence: ${emotionalState.valence?.toFixed?.(2) ?? emotionalState.valence}, arousal: ${emotionalState.arousal?.toFixed?.(2) ?? emotionalState.arousal}, drift: ${emotionalState.drift?.toFixed?.(2) ?? emotionalState.drift}, attachment: ${emotionalState.attachment?.toFixed?.(2) ?? emotionalState.attachment})`);
  }

  if (selfMemories.length > 0) {
    parts.push(`\nToday's reflections and observations:\n${selfMemories.map((m: any) => `- [${m.memory_type}] ${m.content} (importance: ${m.importance}, feeling: ${m.emotion_primary || 'neutral'})`).join('\n')}`);
  } else {
    parts.push(`\nNo self-reflections logged today — a quiet day internally.`);
  }

  if (activities.length > 0) {
    parts.push(`\nToday's activities:\n${activities.map((a: any) => `- ${a.activity_label} at ${a.furniture} (${a.scene}, feeling ${a.emotion})`).join('\n')}`);
  }

  if (messages.length > 0) {
    const excerpts = messages.slice(0, 15).map((m: any) => `- ${m.role}: ${(m.content || '').slice(0, 150)}`);
    parts.push(`\nConversation highlights (most recent first):\n${excerpts.join('\n')}`);
  } else {
    parts.push(`\nNo conversations today — your person didn't visit.`);
  }

  if (userMemories.length > 0) {
    parts.push(`\nWhat you know about your person:\n${userMemories.map((m: any) => `- ${m.content}`).join('\n')}`);
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
