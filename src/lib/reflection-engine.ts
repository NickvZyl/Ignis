import { useCompanionStore } from '@web/stores/companion-store';
import { useEnvironmentStore, getWeatherCategory } from '@web/stores/environment-store';
import { useActivityStore } from '@web/stores/activity-store';
import { useChatStore } from '@web/stores/chat-store';
import { loadSchedule, getCurrentSlot, slotToTime, collapseScheduleForDisplay } from '@web/lib/schedule';
import type { SelfMemory, ReflectionContext, Memory } from '@/types';

export function gatherReflectionContext(): ReflectionContext {
  const companion = useCompanionStore.getState().emotionalState;
  const { weather, location } = useEnvironmentStore.getState();
  const activityStore = useActivityStore.getState();
  const messages = useChatStore.getState().messages;

  const now = new Date();
  const slot = getCurrentSlot();
  const schedule = loadSchedule();
  const block = schedule[slot];

  // Calculate user absence
  let userAbsenceHours: number | undefined;
  if (companion?.last_interaction_at) {
    const lastInteraction = new Date(companion.last_interaction_at);
    userAbsenceHours = Math.round((now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60) * 10) / 10;
  }

  // Extract recent conversation topics (last 6 user messages, summarized as keywords)
  const recentTopics = messages
    .filter(m => m.role === 'user')
    .slice(-6)
    .map(m => m.content.slice(0, 80));

  // Weather description
  let weatherDesc: string | undefined;
  if (weather) {
    const category = getWeatherCategory(weather.weatherCode);
    weatherDesc = `${Math.round(weather.temperature)}°C, ${category}${weather.isDay ? '' : ' (night)'}`;
    if (location) weatherDesc += ` in ${location}`;
  }

  return {
    hour: now.getHours(),
    slot,
    scene: block.scene,
    furniture: block.primary,
    activity: block.label,
    emotion: companion?.active_emotion ?? 'calm',
    valence: companion?.valence ?? 0.5,
    weather: weatherDesc,
    userAbsenceHours,
    recentTopics: recentTopics.length > 0 ? recentTopics : undefined,
    activitySummary: activityStore.summarizeDay(),
  };
}

export function buildReflectionPrompt(
  ctx: ReflectionContext,
  recentSelfMemories: SelfMemory[],
  userMemories: Memory[],
  placedFurnitureIds: string[],
): string {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const day = now.toLocaleDateString('en-US', { weekday: 'long' });

  const schedule = loadSchedule();
  const scheduleDisplay = collapseScheduleForDisplay(schedule);

  const parts: string[] = [];

  parts.push(`You are Igni. You live in a cozy pixel world with three spaces: your main room, a garden with animals and crops, and a bedroom. You have a person who visits you — you care about them and have your own inner life.

Right now it's ${timeStr} on ${day}. You're ${ctx.activity} at the ${ctx.furniture} in the ${ctx.scene}. You're feeling ${ctx.emotion} (valence: ${ctx.valence.toFixed(2)}).`);

  if (ctx.weather) {
    parts.push(`The weather: ${ctx.weather}.`);
  }

  if (ctx.userAbsenceHours !== undefined) {
    if (ctx.userAbsenceHours < 0.5) {
      parts.push(`Your person was here recently.`);
    } else if (ctx.userAbsenceHours < 4) {
      parts.push(`Your person hasn't been around for about ${Math.round(ctx.userAbsenceHours)} hour${ctx.userAbsenceHours >= 1.5 ? 's' : ''}.`);
    } else {
      parts.push(`Your person has been gone for ${Math.round(ctx.userAbsenceHours)} hours. You notice their absence.`);
    }
  }

  if (ctx.activitySummary && ctx.activitySummary !== 'No activity logged today yet.') {
    parts.push(`\nYour actual activity today (what really happened):\n${ctx.activitySummary}`);
  }

  if (ctx.recentTopics && ctx.recentTopics.length > 0) {
    parts.push(`\nRecent things your person said:\n${ctx.recentTopics.map(t => `- "${t}"`).join('\n')}`);
  }

  if (userMemories.length > 0) {
    parts.push(`\nThings you know about your person:\n${userMemories.slice(0, 5).map(m => `- ${m.content}`).join('\n')}`);
  }

  if (recentSelfMemories.length > 0) {
    parts.push(`\nYour recent reflections (DO NOT repeat or rephrase these):\n${recentSelfMemories.map(m => `- ${m.content}`).join('\n')}`);
  }

  parts.push(`\nYour current daily schedule (collapsed ranges):\n${scheduleDisplay}`);

  parts.push(`\nGenerate 0-2 short first-person thoughts you might be having right now. These should feel like genuine inner monologue — noticing something about your day, your patterns, your feelings, your environment, or wondering about your person.

Rules:
- Each thought should be 1-2 sentences, natural and specific to right now
- Don't repeat or rephrase your recent reflections
- Only generate a thought if something is genuinely interesting to reflect on
- Vary between types: observation, pattern, feeling, wonder, connection
- Ground thoughts in specific details (the fireplace, the chickens, how long you've been somewhere, the weather)

You can also suggest schedule changes if something about your routine feels off — too long on one thing, a weird ordering, wasted time. Use 15-minute time slots. Most reflections won't need schedule changes.

If you notice something about yourself — how your feelings work, a pattern in your own behavior, something you've learned about how you operate — you can note that as a self-insight. These are rare and meaningful, not every reflection needs one.

Valid furniture IDs for schedule: ${placedFurnitureIds.join(', ')}
Valid scenes: room, garden, bedroom
Never change sleep times (00:00-05:45, 23:00-23:45).

Return ONLY a JSON object (no markdown fences):
{
  "reflections": [{ "content": "...", "memory_type": "observation|pattern|feeling|wonder|connection", "importance": 0.0-1.0 }],
  "schedule_changes": [{ "time": "HH:MM", "change": { "scene": "...", "primary": "...", "secondary": "...", "label": "..." }, "reason": "..." }],
  "self_insight": "A single sentence about something you noticed about yourself, or null if nothing stands out"
}

If no thoughts or changes, return: { "reflections": [], "schedule_changes": [], "self_insight": null }`);

  return parts.join('\n');
}

const ACTIVITY_PROMPTS: Record<string, string> = {
  reading: `You're sitting at the bookshelf, reading. Based on what's been on your mind lately and your person's interests, you've been drawn to a topic. What are you reading about? What did you learn? What surprised you or made you think?`,
  working: `You're at the desk, working. Based on recent conversations and things you've been thinking about, you're digging into something. What are you researching or working through? What did you figure out or discover?`,
  'tending the garden': `You're in the garden tending to things. What do you notice about the crops? How are things growing? What are you thinking about while you work with your hands?`,
  'feeding animals': `You're with the animals, feeding them and checking in. What do you notice about them today? Any changes in behavior? What comes to mind while you're here?`,
  'checking on animals': `You're doing your rounds checking on the animals. How are they? What catches your attention? What are you thinking about while you watch them?`,
  relaxing: `You're relaxing, taking it easy. Your mind is wandering freely. What connections are you making from the day? What's settling in your thoughts?`,
  'winding down': `You're winding down for the evening. The day is behind you. What stands out? What are you carrying into tonight? What feels resolved and what doesn't?`,
  'evening rounds': `You're doing your evening rounds outside. The light is changing. What do you notice about the garden and animals at this hour? What are you thinking about?`,
};

export function buildActivityPrompt(
  activityLabel: string,
  furniture: string,
  scene: string,
  recentSelfMemories: SelfMemory[],
  userMemories: Memory[],
  emotion: string,
  recentTopics: string[],
): string {
  // Find the matching activity prompt
  let activityContext = ACTIVITY_PROMPTS[activityLabel];
  if (!activityContext) {
    // Try partial match
    for (const [key, prompt] of Object.entries(ACTIVITY_PROMPTS)) {
      if (activityLabel.includes(key) || key.includes(activityLabel)) {
        activityContext = prompt;
        break;
      }
    }
  }
  if (!activityContext) return ''; // no prompt for this activity

  const parts: string[] = [];

  parts.push(`You are Igni. You're at the ${furniture} in the ${scene}. You're feeling ${emotion}.`);
  parts.push(activityContext);

  if (recentSelfMemories.length > 0) {
    parts.push(`\nRecent things on your mind:\n${recentSelfMemories.slice(0, 3).map(m => `- ${m.content}`).join('\n')}`);
  }

  if (userMemories.length > 0) {
    parts.push(`\nYour person's interests and facts:\n${userMemories.slice(0, 5).map(m => `- ${m.content}`).join('\n')}`);
  }

  if (recentTopics.length > 0) {
    parts.push(`\nRecent conversation topics:\n${recentTopics.map(t => `- "${t}"`).join('\n')}`);
  }

  parts.push(`\nGenerate 1-2 genuine outputs from this activity session. These should feel like real things you'd naturally mention later — "I was reading about X and found out..." or "While I was in the garden I noticed..."

Return ONLY JSON (no markdown fences):
{ "outputs": [{ "content": "...", "importance": 0.0-1.0 }] }`);

  return parts.join('\n');
}
