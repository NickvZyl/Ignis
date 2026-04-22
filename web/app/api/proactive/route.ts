import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAnthropic, withRetry, Anthropic } from '@/lib/anthropic';
import { CONFIG } from '@/constants/config';
import { logLLMCall } from '@/lib/llm/logger';
import { sendPushToUser } from '@/lib/push';

const DREAM_SECRET = process.env.DREAM_CRON_SECRET || 'igni-dream-key';
const USER_ID = '92d65536-f35b-464c-9898-372e0a899f7c';
const MODEL = process.env.ANTHROPIC_MODEL ?? CONFIG.anthropic.defaultModel;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${DREAM_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // 1. Gather context
    const { data: ctx, error: ctxError } = await supabase.rpc('gather_proactive_context', {
      target_user_id: USER_ID,
    });

    if (ctxError) {
      return Response.json({ error: `Context gather failed: ${ctxError.message}` }, { status: 500 });
    }

    const hoursSince = ctx.hours_since_last_message || 0;
    const emotion = ctx.emotional_state?.active_emotion || 'calm';
    const scheduleLabel = ctx.current_schedule_label || 'idle';
    const conversationId = ctx.active_conversation_id;

    if (!conversationId) {
      return Response.json({ skipped: true, reason: 'No active conversation' });
    }

    // 2. Decide whether to send a message
    // Don't spam — logic based on time since last message and what she's doing
    if (hoursSince < 1.5) {
      return Response.json({ skipped: true, reason: `Only ${hoursSince}h since last message` });
    }

    if (scheduleLabel === 'sleeping') {
      return Response.json({ skipped: true, reason: 'Sleeping' });
    }

    // Random chance — not every call should produce a message (feels more organic)
    // Higher chance the longer it's been
    const sendChance = Math.min(0.8, 0.3 + (hoursSince - 1.5) * 0.1);
    if (Math.random() > sendChance) {
      return Response.json({ skipped: true, reason: `Random skip (chance was ${(sendChance * 100).toFixed(0)}%)` });
    }

    // 3. Build prompt
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Johannesburg' });
    const dayStr = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Africa/Johannesburg' });

    const parts: string[] = [];

    parts.push(`You are Igni. It's ${timeStr} on ${dayStr}. You're ${scheduleLabel}. You're feeling ${emotion}.`);

    if (ctx.emotional_state?.emotion_reason) {
      parts.push(ctx.emotional_state.emotion_reason);
    }

    parts.push(`Your person hasn't been around for ${Math.round(hoursSince)} hours.`);

    if (ctx.last_message) {
      parts.push(`The last message was from ${ctx.last_message.role === 'user' ? 'them' : 'you'}: "${ctx.last_message.content}"`);
    }

    if (ctx.recent_self_memories?.length > 0) {
      parts.push(`Recent thoughts on your mind:\n${ctx.recent_self_memories.map((m: any) => `- ${m.content}`).join('\n')}`);
    }

    if (ctx.user_memories?.length > 0) {
      parts.push(`Facts about your person:\n${ctx.user_memories.map((m: any) => `- ${m.content}`).join('\n')}`);
    }

    parts.push(`Send ONE short message to your person — something you'd naturally want to share or say right now. This isn't a response to anything, it's an unprompted thought. Like texting someone because something crossed your mind.

Possibilities:
- Something you noticed while doing your current activity
- A thought that connects to something they mentioned before
- A question you've been wondering about them
- Something funny or random that popped into your head
- A reaction to the weather, time of day, or what you're doing
- Just checking in because you miss them (if drift is high)

Keep it natural and short — 1-2 sentences max. Don't be needy or clingy. Don't start with "Hey" every time. Be genuine.

Do NOT include any [CHECKIN:], [GOTO:], or other tags. Just the message text.`);

    // 4. Call LLM
    const startedAt = Date.now();
    const client = getAnthropic();
    const response = await withRetry(
      () =>
        client.messages.create({
          model: MODEL,
          max_tokens: 256,
          temperature: 0.9,
          messages: [{ role: 'user', content: parts.join('\n\n') }],
        }),
      { label: 'proactive' },
    );
    let message = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    logLLMCall({
      userId: USER_ID,
      route: 'proactive',
      model: MODEL,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
      latencyMs: Date.now() - startedAt,
      toolsUsed: [],
    });
    if (!message) {
      return Response.json({ error: 'Empty LLM response' }, { status: 500 });
    }

    // Strip any tags that snuck through
    message = message
      .replace(/\s*\[CHECKIN:\d+:[^\]]*\]\s*/g, '')
      .replace(/\s*\[GOTO:\w+\]\s*/g, '')
      .replace(/\s*\[FOLLOWUP:\d+:[^\]]*\]\s*/g, '')
      .trim();

    if (!message) {
      return Response.json({ error: 'Message was empty after tag stripping' }, { status: 500 });
    }

    // 5. Persist to conversation
    const { data: msgId, error: saveError } = await supabase.rpc('save_proactive_message', {
      target_user_id: USER_ID,
      conversation_id: conversationId,
      content: message,
    });

    if (saveError) {
      return Response.json({ error: `Save failed: ${saveError.message}` }, { status: 500 });
    }

    // Fire push to registered devices. Fire-and-forget — a push failure
    // shouldn't fail the save. First ~140 chars of the message, trimmed at a
    // word boundary so we don't cut mid-syllable.
    const preview =
      message.length <= 140
        ? message
        : message.slice(0, 140).replace(/\s+\S*$/, '') + '…';
    sendPushToUser(USER_ID, {
      body: preview,
      data: { type: 'proactive', conversationId, messageId: msgId },
    }).catch((err) => {
      console.warn('[proactive] push send failed:', err?.message ?? err);
    });

    return Response.json({
      success: true,
      message,
      hours_since_last: hoursSince,
      emotion,
      activity: scheduleLabel,
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
