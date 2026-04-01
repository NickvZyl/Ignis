import { create } from 'zustand';
import { supabase } from '@web/lib/supabase';
import { api } from '@web/lib/api';
import { buildSystemPrompt, buildMemoryExtractionPrompt } from '@/prompts/system';
import type { ScheduleContext } from '@/prompts/system';
import { loadSchedule, getCurrentSlot } from '@web/lib/schedule';
import { useCompanionStore } from './companion-store';
import { useEnvironmentStore, getWeatherCategory } from './environment-store';
import type { Message, Memory, ChatCompletionMessage, SelfMemory } from '@/types';

const STREAMING_ID = '__streaming__';
const MEMORY_FALLBACK_INTERVAL = 4; // extract every N exchanges if nothing triggered

function formatMessageForApi(m: Message): ChatCompletionMessage {
  const ts = new Date(m.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return { role: m.role as 'user' | 'assistant', content: `[${ts}] ${m.content}` };
}

function getScheduleContext(messages?: Message[]): ScheduleContext {
  const schedule = loadSchedule();
  const block = schedule[getCurrentSlot()];
  const ctx: ScheduleContext = {
    label: block.label,
    isSleeping: block.label === 'sleeping',
  };
  // Add conversation duration if messages available
  if (messages && messages.length > 0) {
    ctx.conversationMinutes = Math.round((Date.now() - new Date(messages[0].created_at).getTime()) / (1000 * 60));
    ctx.messageCount = messages.length;
  }
  return ctx;
}

// Patterns that signal memory-worthy content
const MEMORY_TRIGGERS = [
  // Identity & personal facts
  /\b(my name is|i'm called|call me|i am)\b/i,
  /\b(i work|my job|i'm a|my career|i do)\b/i,
  /\b(i live|i'm from|i moved|my home)\b/i,
  /\b(my (wife|husband|partner|girlfriend|boyfriend|kid|child|son|daughter|mom|dad|mother|father|brother|sister|friend|dog|cat|pet))\b/i,
  // Preferences & opinions
  /\b(i (love|hate|prefer|can't stand|always|never|really like|really hate|enjoy|dislike))\b/i,
  /\b(my favo[u]?rite|i'm into|i'm passionate about|i'm obsessed with)\b/i,
  // Life events
  /\b(i (just|recently) (got|started|finished|quit|lost|found|moved|married|divorced|graduated))\b/i,
  /\b(i'm (getting|going to|about to|planning to))\b/i,
  /\b(birthday|anniversary|passed away|diagnosed|pregnant)\b/i,
  // Emotional disclosures
  /\b(i've been (feeling|struggling|dealing|going through))\b/i,
  /\b(i'm (scared|afraid|worried|anxious|depressed|lonely) (about|of|that))\b/i,
  // Explicit memory requests
  /\b(remember (that|this)|don't forget|keep in mind)\b/i,
  // Activities & experiences
  /\b(watching|watched|playing|played|reading|read|listening|listened)\b/i,
  /\b(went to|going to|came from|been to|visited)\b/i,
  /\b(bought|made|cooked|built|fixed|broke)\b/i,
  // People & relationships (third person)
  /\b(tanya|wife|husband|partner|brother|sister|mom|dad|friend)\b/i,
  // Plans & schedules
  /\b(tomorrow|this weekend|next week|tonight|later today)\b/i,
  /\b(need to|have to|want to|going to|plan to|thinking about)\b/i,
  // Opinions & reactions
  /\b(it was|that was|so good|amazing|terrible|annoying|funny|weird|cool|boring)\b/i,
  // Context sharing
  /\b(at work|at home|in town|outside|in the garden)\b/i,
  /\b(episode|season|chapter|level|game|movie|show|book|song)\b/i,
];

function isMemoryWorthy(message: string): boolean {
  return MEMORY_TRIGGERS.some((pattern) => pattern.test(message));
}

function getWeatherContext() {
  const { weather, location } = useEnvironmentStore.getState();
  if (!weather) return null;
  return {
    temperature: weather.temperature,
    condition: getWeatherCategory(weather.weatherCode),
    isDay: weather.isDay,
    location: location || undefined,
  };
}

const FURNITURE_LABELS: Record<string, string> = {
  desk: 'desk with the computer',
  bookshelf: 'bookshelf',
  couch: 'couch by the TV',
  fireplace: 'fireplace',
  clock_table: 'clock table',
  kitchen: 'kitchen counter',
  fridge: 'fridge',
  plant: 'potted plant',
  tall_plant: 'tall plant',
  succulent: 'succulent',
  floor_lamp: 'floor lamp',
  wall_sconce: 'wall sconce',
  front_door: 'front door',
  window: 'window',
  // Garden
  garden_gate: 'garden gate',
  farm_patch: 'farm patch',
  chicken_coop: 'chicken coop',
  cow_pen: 'cow pen',
  sheep_pen: 'sheep pen',
  // Bedroom
  hallway_door: 'hallway door',
  bedroom_door: 'bedroom door',
  bed: 'bed',
  nightstand: 'nightstand',
  wardrobe: 'wardrobe',
  bedroom_window: 'bedroom window',
};

function getRoomContext() {
  const currentLocation = useChatStore.getState().currentLocation;
  // Determine which scene is active
  // Report Ignis's actual scene (not necessarily what the user is viewing)
  let activeScene: 'room' | 'garden' | 'bedroom' = 'room';
  try {
    const raw = localStorage.getItem('ignis_scene');
    if (raw === 'garden' || raw === 'bedroom') activeScene = raw;
  } catch {}
  // Load placed furniture for the active scene
  const storageKeyMap: Record<string, string> = {
    room: 'ignis_room_layout',
    garden: 'ignis_garden_layout',
    bedroom: 'ignis_bedroom_layout',
  };
  const storageKey = storageKeyMap[activeScene];
  let placedFurniture: string[] | undefined;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const layout = JSON.parse(raw);
      placedFurniture = layout.furniture?.map((f: any) => f.id) ?? undefined;
    }
  } catch {}
  return {
    activeScene,
    currentFurniture: currentLocation ? (FURNITURE_LABELS[currentLocation] || currentLocation) : undefined,
    placedFurniture,
  };
}

// ── Checkin persistence ──
const CHECKIN_KEY = 'ignis_checkin';

interface PersistedCheckin {
  seconds: number;
  reason: string;
  setAt: number; // Date.now() when scheduled
}

function saveCheckin(seconds: number, reason: string) {
  localStorage.setItem(CHECKIN_KEY, JSON.stringify({ seconds, reason, setAt: Date.now() }));
}

function loadCheckin(): { seconds: number; reason: string } | null {
  try {
    const raw = localStorage.getItem(CHECKIN_KEY);
    if (!raw) return null;
    const data: PersistedCheckin = JSON.parse(raw);
    const elapsed = (Date.now() - data.setAt) / 1000;
    const remaining = data.seconds - elapsed;
    if (remaining <= 0) {
      localStorage.removeItem(CHECKIN_KEY);
      return null;
    }
    return { seconds: Math.round(remaining), reason: data.reason };
  } catch {
    return null;
  }
}

function clearCheckin() {
  localStorage.removeItem(CHECKIN_KEY);
}

// ── Furniture movement detection ──
const FURNITURE_KEYWORDS: Record<string, string[]> = {
  // ── Main room ──
  desk: [
    'desk', 'computer', 'pc', 'laptop', 'workstation', 'monitor', 'screen',
    'keyboard', 'work desk', 'office', 'work area', 'setup', 'station',
    'type', 'coding', 'programming', 'browse', 'surfing', 'email',
    'homework', 'assignment', 'project', 'research', 'write', 'writing',
    'work on', 'get to work', 'do some work', 'focus', 'study',
    'spreadsheet', 'document', 'draft', 'notes', 'take notes',
    'google', 'search something', 'look something up',
  ],
  couch: [
    'couch', 'sofa', 'tv', 'television', 'telly', 'lounge', 'settee',
    'living room', 'sit down', 'chill', 'relax', 'watch', 'netflix',
    'movie', 'show', 'series', 'episode', 'streaming', 'youtube',
    'game', 'gaming', 'console', 'play', 'controller', 'cushion',
    'lay down', 'lie down', 'kick back', 'veg out', 'unwind',
    'hang out', 'come sit', 'sit with me', 'come chill', 'come relax',
    'binge', 'marathon', 'popcorn', 'snuggle', 'cuddle',
    'decompress', 'take a break', 'wind down', 'put your feet up',
    'chat', 'talk', 'lets talk', 'come here', 'join me',
  ],
  bookshelf: [
    'bookshelf', 'bookcase', 'books', 'book', 'shelf', 'shelves',
    'library', 'reading', 'read', 'novel', 'stories', 'literature',
    'browse the books', 'browse the shelf', 'pick a book', 'grab a book',
    'study', 'recommend a book', 'what should i read', 'any good books',
    'fiction', 'non-fiction', 'manga', 'comic', 'poetry', 'encyclopedia',
    'reference', 'look up', 'page', 'chapter', 'story time',
  ],
  fireplace: [
    'fireplace', 'fire', 'hearth', 'warm up', 'by the fire', 'fireside',
    'flames', 'cozy', 'cosy', 'mantle', 'mantelpiece', 'chimney',
    'warm', 'warmth', 'heating', 'toasty', 'cold', 'chilly', 'freezing',
    'light a fire', 'start a fire', 'stoke the fire', 'crackling',
    'marshmallow', 'hot chocolate', 'cocoa', 'blanket by the fire',
    'sit by the fire', 'warm my hands', 'its cold',
  ],
  clock_table: [
    'clock', 'timer', 'alarm', 'time', 'side table',
    'end table', 'set a timer', 'set an alarm', 'reminder',
    'what time', 'how long', 'countdown', 'schedule', 'when',
  ],
  kitchen: [
    'kitchen', 'counter', 'stove', 'cook', 'cooking', 'burner', 'sink',
    'meal', 'food', 'eat', 'eating', 'breakfast', 'lunch', 'dinner',
    'snack', 'prepare', 'make food', 'bake', 'baking', 'recipe',
    'dishes', 'wash up', 'clean up', 'countertop', 'oven', 'microwave',
    'make me', 'cook me', 'whip up', 'how to make', 'how do you make',
    'pasta', 'soup', 'steak', 'chicken', 'rice', 'salad', 'sandwich',
    'cake', 'cookies', 'bread', 'pizza', 'curry', 'stir fry',
    'roast', 'grill', 'fry', 'boil', 'simmer', 'sauté',
    'plan dinner', 'plan breakfast', 'plan lunch', 'plan a meal',
    'meal prep', 'what should we eat', 'what should i eat',
    'whats for dinner', 'whats for lunch', 'whats for breakfast',
    'make dinner', 'make breakfast', 'make lunch', 'make supper',
    'chef', 'chopping', 'cutting board', 'pan', 'pot', 'spatula',
    'ingredients', 'seasoning', 'spices', 'sauce', 'marinade',
    'tea', 'coffee', 'brew', 'kettle', 'cup of tea', 'cup of coffee',
    'espresso', 'latte', 'hot drink', 'make tea', 'make coffee',
    'scramble', 'omelette', 'pancake', 'waffle', 'toast',
    'noodles', 'ramen', 'burger', 'tacos', 'wrap', 'burrito',
    'smoothie', 'shake', 'dessert', 'pudding', 'pie',
  ],
  fridge: [
    'fridge', 'refrigerator', 'freezer', 'cold', 'ice',
    'drink', 'water', 'juice', 'milk', 'grab a drink',
    'get a snack', 'hungry', 'thirsty', 'beer', 'soda', 'pop',
    'leftovers', 'whats in the fridge', 'anything to eat',
    'ice cream', 'yogurt', 'cheese', 'fruit', 'grab something',
    'cool down', 'something cold', 'iced', 'refreshment',
  ],
  plant: [
    'plant', 'plants', 'water the plant', 'greenery', 'leaves',
    'potted plant', 'check the plant', 'tend to', 'houseplant',
    'how are the plants', 'wilting', 'drooping', 'soil',
  ],
  tall_plant: [
    'tall plant', 'big plant', 'fiddle leaf', 'tree', 'indoor tree',
    'large plant', 'corner plant',
  ],
  succulent: [
    'succulent', 'cactus', 'tiny plant', 'small plant', 'little plant',
  ],
  floor_lamp: [
    'lamp', 'floor lamp', 'light', 'reading light', 'turn on the light',
    'standing lamp', 'too dark', 'need light', 'dim', 'bright',
    'turn off the light', 'switch on', 'switch off',
  ],
  wall_sconce: [
    'sconce', 'wall light', 'wall lamp', 'mood lighting',
  ],
  front_door: [
    'door', 'front door', 'leave', 'exit',
    'step out', 'go out', 'go outside', 'head out',
    'fresh air', 'take a walk', 'stretch my legs',
  ],
  window: [
    'window', 'look outside', 'weather', 'check the weather', 'whats it like outside',
    'raining', 'is it raining', 'sunny', 'is it sunny', 'sky', 'look out',
    'peek outside', 'outside', 'fresh air', 'clouds', 'stars', 'moon', 'sun',
    'sunrise', 'sunset', 'dawn', 'dusk', 'night sky', 'clear sky',
    'storming', 'thunder', 'lightning', 'snowing', 'hailing', 'foggy',
    'temperature', 'how hot', 'how cold', 'beautiful day', 'nice day',
    'horrible weather', 'lovely weather', 'breeze', 'wind',
  ],
  // ── Garden ──
  garden_gate: [
    'gate', 'garden gate', 'go back', 'go inside', 'back inside',
    'head back', 'return inside', 'go home', 'head inside', 'go back in',
  ],
  farm_patch: [
    'garden', 'farm', 'crops', 'harvest', 'water', 'plants', 'seeds',
    'tend the garden', 'check the crops', 'vegetables', 'grow',
    'planting', 'watering', 'sprouts', 'soil', 'dig', 'weeds', 'weed',
    'tomato', 'carrot', 'lettuce', 'herb', 'herbs', 'basil', 'mint',
    'green thumb', 'gardening', 'compost', 'fertilizer',
  ],
  chicken_coop: [
    'chicken', 'chickens', 'eggs', 'coop', 'hens', 'rooster',
    'collect eggs', 'feed the chickens', 'poultry', 'cluck',
    'chicks', 'pecking', 'laying', 'how many eggs', 'egg',
  ],
  cow_pen: [
    'cow', 'cows', 'milk', 'cattle', 'bull', 'moo',
    'milk the cows', 'check on the cows', 'bovine', 'pasture',
    'milking', 'dairy', 'calves', 'calf', 'graze', 'grazing', 'hay',
  ],
  sheep_pen: [
    'sheep', 'wool', 'lamb', 'flock', 'shear',
    'check the sheep', 'fleece', 'baa', 'shearing', 'lambs',
    'how are the sheep', 'count sheep',
  ],
  // ── Bedroom ──
  hallway_door: [
    'hallway', 'bedroom', 'go to bed', 'go to sleep', 'head to bed',
    'go to bedroom', 'go to the bedroom', 'time for bed', 'bedtime',
    'call it a night', 'hit the hay', 'hit the sack', 'turn in',
    'im tired', 'so tired', 'exhausted', 'knackered', 'need sleep',
  ],
  bedroom_door: [
    'leave bedroom', 'go back', 'back to the room', 'living room',
    'head back', 'go to the room', 'head to the living room',
    'leave the room', 'get up', 'wake up', 'good morning',
  ],
  bed: [
    'bed', 'sleep', 'nap', 'rest', 'lay down', 'lie down',
    'get in bed', 'go to bed', 'take a nap', 'tired', 'sleepy',
    'tuck in', 'blanket', 'pillow', 'mattress', 'doze', 'dozing',
    'dream', 'dreaming', 'snooze', 'power nap', 'siesta',
    'good night', 'goodnight', 'night night', 'sweet dreams',
    'cant sleep', 'insomnia', 'restless', 'counting sheep',
  ],
  nightstand: [
    'nightstand', 'bedside', 'lamp', 'reading lamp', 'bedside table',
    'alarm', 'bedside lamp', 'phone charger', 'glass of water',
  ],
  wardrobe: [
    'wardrobe', 'closet', 'clothes', 'outfit', 'get dressed',
    'change clothes', 'what to wear', 'get changed', 'fashion',
    'style', 'getting ready', 'get ready', 'dress up', 'put on',
    'jacket', 'shirt', 'pants', 'shoes', 'hoodie', 'pyjamas', 'pajamas',
  ],
  bedroom_window: [
    'bedroom window', 'look outside', 'peek out',
  ],
};

function detectFurnitureCommand(message: string): string | null {
  const lower = message.toLowerCase();
  // Trigger on directional / spatial / activity language
  const hasDirective = /\b(go to|head to|walk to|move to|come to|come here|come sit|come over|come by|come chill|come hang|come join|check the|sit on|sit at|sit by|sit down|go sit|go check|go by|go chill|go relax|go read|go warm|go watch|go play|go browse|go hang|go plan|head over|look at the|hop on|jump on|get on|hang out|hang by|chill by|chill on|relax by|relax on|warm up by|watch some|read a|grab a|go make|go cook|make me|cook me|plan a|plan the|plan dinner|plan breakfast|plan lunch|water the|tend to|go outside|step out|go get|get me|open the|turn on|turn off|switch on|switch off|go near|stand by|go stand|look out|peek out|go back|go inside|go home|head back|head inside|feed the|milk the|check on|collect eggs|shear|brew|put on|get dressed|get changed|get ready|wake up|time for|lets go|lets do|lets make|lets cook|lets bake|lets watch|lets play|lets read|can you make|can you cook|can you bake|can you get)\b/.test(lower);
  // Recipe/cooking requests should always trigger kitchen detection even without "go to" phrasing
  const hasRecipeRequest = /\b(recipe for|recipe of|how to cook|how to make|how do you make|whip up|can you cook|can you make|can you bake|what.?s a good recipe|know any recipes)\b/.test(lower);
  // Also trigger for weather-related questions (Igni goes to window)
  const hasWeatherQuery = /\b(weather|raining|rain|sunny|snowing|snow|cold outside|hot outside|what.?s it like out|how.?s it .*(out|outside)|storm|windy|cloudy|outside like)\b/.test(lower);
  if (!hasDirective && !hasWeatherQuery && !hasRecipeRequest) return null;

  // Score each furniture piece — most keyword matches wins
  let bestId: string | null = null;
  let bestScore = 0;
  for (const [id, keywords] of Object.entries(FURNITURE_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      // Word boundary check to avoid substring false positives
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (regex.test(lower)) {
        score += kw.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  console.log(`[Goto] detected: "${bestId}" (score ${bestScore}) from: "${message.slice(0, 60)}"`);
  return bestId;
}

let exchangesSinceExtraction = 0;
let followupTimer: ReturnType<typeof setTimeout> | null = null;

interface ChatState {
  messages: Message[];
  conversationId: string | null;
  isGenerating: boolean;
  streamingMessageId: string | null;
  error: string | null;
  nextCheckinSeconds: number | null;
  nextCheckinReason: string | null;
  gotoFurniture: string | null; // furniture id Ignis should walk to
  currentLocation: string | null; // furniture id Ignis is currently at/near

  startConversation: (userId: string) => Promise<void>;
  sendMessage: (content: string, userId: string, replyToId?: string) => Promise<void>;
  sendReturnGreeting: (userId: string, hoursSince: number) => Promise<void>;
  sendProactiveMessage: (userId: string) => Promise<void>;
  sendReflectionMessage: (userId: string, thought: string) => Promise<void>;
  sendFollowupMessage: (userId: string, context: string) => Promise<void>;
  extractMemories: (userId: string) => Promise<void>;
  clearChat: () => void;
}

async function apiChat(messages: ChatCompletionMessage[], stream: boolean = true, userId?: string) {
  // Get the current session's access token for server-side Supabase calls
  let accessToken: string | undefined;
  try {
    const { data } = await supabase.auth.getSession();
    accessToken = data.session?.access_token;
  } catch {}

  const res = await fetch(api('/api/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, stream, userId, accessToken }),
  });
  if (!res.ok) {
    let message = `Chat API error (${res.status})`;
    try {
      const body = await res.json();
      message = body.error || message;
    } catch {
      message = await res.text() || message;
    }
    throw new Error(message);
  }
  return res;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  conversationId: null,
  isGenerating: false,
  streamingMessageId: null,
  error: null,
  nextCheckinSeconds: (() => { const c = loadCheckin(); return c?.seconds ?? null; })(),
  nextCheckinReason: (() => { const c = loadCheckin(); return c?.reason ?? null; })(),
  gotoFurniture: null,
  currentLocation: null,

  startConversation: async (userId: string) => {
    // Try to resume the most recent active conversation (no ended_at)
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('user_id', userId)
      .is('ended_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existing) {
      // Load its messages
      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', existing.id)
        .order('created_at', { ascending: true });

      set({
        conversationId: existing.id,
        messages: (msgs || []) as Message[],
        error: null,
      });
      console.log('[Chat] resumed conversation', existing.id, 'with', msgs?.length, 'messages');
      return;
    }

    // No active conversation — create a new one
    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: userId })
      .select()
      .single();

    if (error) throw error;
    set({ conversationId: data.id, messages: [], error: null });
    console.log('[Chat] created new conversation', data.id);
  },

  sendMessage: async (content: string, userId: string, replyToId?: string) => {
    const { conversationId, messages } = get();
    if (!conversationId || get().isGenerating) return;

    // Cancel any pending follow-up — conversation moved on
    if (followupTimer) { clearTimeout(followupTimer); followupTimer = null; }

    set({ isGenerating: true, error: null });

    try {
      // 1. Persist user message
      const { data: userMsg, error: userError } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, role: 'user', content, ...(replyToId ? { reply_to_id: replyToId } : {}) })
        .select()
        .single();

      if (userError) throw userError;

      const updatedMessages = [...messages, userMsg as Message];
      set({ messages: updatedMessages });

      // 2. Process emotional impact
      const companionStore = useCompanionStore.getState();
      const signals = await companionStore.processMessage(content);

      // 3. Update user message with emotional signals
      if (signals) {
        await supabase
          .from('messages')
          .update({ emotional_signals: signals })
          .eq('id', userMsg.id);
      }

      // 4. Retrieve relevant memories
      const memories = await retrieveMemories(content, userId);
      console.log('[Chat] memories loaded:', memories.length, memories.map(m => m.content));

      // 4b. Retrieve self-memories + self-knowledge
      const [selfMemories, selfKnowledge] = await Promise.all([
        retrieveSelfMemories(userId),
        loadSelfKnowledge(userId),
      ]);

      // 5. Build system prompt
      const emotionalState = useCompanionStore.getState().emotionalState;
      if (!emotionalState) throw new Error('Emotional state not loaded');

      const systemPrompt = buildSystemPrompt(emotionalState, memories, selfMemories, selfKnowledge, getWeatherContext(), getRoomContext(), getScheduleContext(get().messages));

      // 5b. Clear morning thought after it's been included in a prompt (one-time use)
      if (emotionalState.morning_thought) {
        supabase.from('emotional_state')
          .update({ morning_thought: null })
          .eq('user_id', userId)
          .then(() => {});
        useCompanionStore.setState({
          emotionalState: { ...emotionalState, morning_thought: null },
        });
      }

      // 6. Build message history for API (filter out empty assistant messages)
      const apiMessages: ChatCompletionMessage[] = [
        { role: 'system', content: systemPrompt },
        ...updatedMessages
          .filter((m) => m.role !== 'assistant' || m.content.trim())
          .slice(-20)
          .map((m) => {
            const ts = new Date(m.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            let msgContent = `[${ts}] ${m.content}`;
            // If this message is a reply, prepend the context
            if (m.reply_to_id) {
              const replyTarget = updatedMessages.find((r) => r.id === m.reply_to_id);
              if (replyTarget) {
                msgContent = `[${ts}] [Replying to ${replyTarget.role === 'user' ? 'their own' : 'your'} message: "${replyTarget.content.slice(0, 150)}"]\n${m.content}`;
              }
            }
            return { role: m.role as 'user' | 'assistant', content: msgContent };
          }),
      ];

      // 7. Create streaming placeholder
      const streamId = STREAMING_ID + Date.now();
      const placeholder: Message = {
        id: streamId,
        conversation_id: conversationId,
        role: 'assistant',
        content: '',
        emotional_signals: null,
        created_at: new Date().toISOString(),
      };

      set({
        messages: [...get().messages, placeholder],
        streamingMessageId: streamId,
      });

      // 8. Stream response via API route
      const response = await apiChat(apiMessages, true, userId);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              const current = get().messages;
              const idx = current.findIndex((m) => m.id === streamId);
              if (idx !== -1) {
                const updated = [...current];
                updated[idx] = { ...updated[idx], content: fullText };
                set({ messages: updated });
              }
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }

      // 9a. Parse checkin tag from response
      const checkinMatch = fullText.match(/\[CHECKIN:(\d+):([^\]]+)\]/);
      if (checkinMatch) {
        const seconds = parseInt(checkinMatch[1], 10);
        const reason = checkinMatch[2];
        console.log(`[Checkin] scheduled in ${seconds}s — ${reason}`);
        saveCheckin(seconds, reason);
        set({ nextCheckinSeconds: seconds, nextCheckinReason: reason });
        fullText = fullText.replace(/\s*\[CHECKIN:\d+:[^\]]+\]\s*/, '').trim();
      }

      // 9a2. Parse schedule update tag from response
      const scheduleMatch = fullText.match(/\[SCHEDULE_UPDATE:(\[[\s\S]*?\])\]/);
      if (scheduleMatch) {
        try {
          const changes = JSON.parse(scheduleMatch[1]) as Array<{ time: string; scene?: string; primary?: string; secondary?: string; label?: string }>;
          const { loadSchedule: loadSch, saveSchedule: saveSch, invalidateScheduleCache: invalidate, timeToSlot: toSlot } = await import('@web/lib/schedule');
          const schedule = loadSch();
          const PROTECTED = [...Array(24).keys(), 92, 93, 94, 95];
          let applied = 0;
          for (const c of changes) {
            const slot = toSlot(c.time);
            if (slot < 0 || slot > 95 || PROTECTED.includes(slot)) continue;
            if (c.scene) schedule[slot].scene = c.scene as any;
            if (c.primary) schedule[slot].primary = c.primary;
            if (c.secondary) schedule[slot].secondary = c.secondary;
            if (c.label) schedule[slot].label = c.label;
            applied++;
          }
          if (applied > 0) {
            saveSch(schedule);
            invalidate();
            console.log(`[Schedule] applied ${applied} changes from conversation`);
          }
        } catch (e) {
          console.error('[Schedule] failed to parse update tag:', e);
        }
        fullText = fullText.replace(/\s*\[SCHEDULE_UPDATE:\[[\s\S]*?\]\]\s*/, '').trim();
      }

      // 9a3. Parse follow-up tag from response
      let pendingFollowup: { seconds: number; context: string } | null = null;
      const followupMatch = fullText.match(/\[FOLLOWUP:(\d+):([^\]]+)\]/);
      if (followupMatch) {
        pendingFollowup = {
          seconds: parseInt(followupMatch[1], 10),
          context: followupMatch[2],
        };
        fullText = fullText.replace(/\s*\[FOLLOWUP:\d+:[^\]]+\]\s*/, '').trim();
      }

      // 9b. Detect furniture command from user's message (takes priority)
      const userGoto = detectFurnitureCommand(content);

      // 9c. Parse GOTO tag from model response (only if user didn't already direct)
      const gotoMatch = fullText.match(/\[GOTO:(\w+)\]/);
      if (gotoMatch) {
        fullText = fullText.replace(/\s*\[GOTO:\w+\]\s*/, '').trim();
      }

      // User command wins over model tag
      const gotoTarget = userGoto || gotoMatch?.[1] || null;
      if (gotoTarget) {
        console.log(`[Goto] ${userGoto ? 'user' : 'model'} directed: ${gotoTarget}`);
        set({ gotoFurniture: gotoTarget });
        // Log activity transition
        import('./activity-store').then(({ useActivityStore }) => {
          const emotion = useCompanionStore.getState().emotionalState?.active_emotion ?? null;
          useActivityStore.getState().logTransition(userId, getRoomContext().activeScene || 'room', gotoTarget, null, emotion);
        });
      }

      // 10. Persist final assistant message (with tag stripped)
      if (!fullText.trim()) {
        // Empty response — remove placeholder, don't save empty messages
        console.warn('[Chat] Empty assistant response — not saving');
        set({
          messages: get().messages.filter((m) => m.id !== streamId),
          streamingMessageId: null,
        });
      } else {
        const { data: assistantMsg, error: assistantError } = await supabase
          .from('messages')
          .insert({ conversation_id: conversationId, role: 'assistant', content: fullText })
          .select()
          .single();

        if (assistantError) throw assistantError;

        // 11. Replace placeholder with clean text
        const current = get().messages;
        const idx = current.findIndex((m) => m.id === streamId);
        if (idx !== -1) {
          const updated = [...current];
          updated[idx] = assistantMsg as Message;
          set({ messages: updated, streamingMessageId: null });
        }
      }

      // 10b. Schedule follow-up if pending
      if (pendingFollowup) {
        const { seconds, context } = pendingFollowup;
        const delay = Math.max(1000, seconds * 1000);
        console.log(`[Followup] scheduled in ${seconds}s — ${context}`);
        // Cancel any existing follow-up timer
        if (followupTimer) clearTimeout(followupTimer);
        followupTimer = setTimeout(() => {
          followupTimer = null;
          if (!get().isGenerating) {
            get().sendFollowupMessage(userId, context);
          }
        }, delay);
      }

      // 10c. Re-sync schedule from cloud (in case schedule tools were used server-side)
      import('@web/lib/schedule').then(({ syncScheduleFromCloud }) => {
        syncScheduleFromCloud();
      });

      // 11. Smart memory extraction
      exchangesSinceExtraction++;
      const memoryTriggered = isMemoryWorthy(content);
      const shouldExtract = memoryTriggered || exchangesSinceExtraction >= MEMORY_FALLBACK_INTERVAL;
      console.log('[Memory]', { memoryTriggered, exchangesSinceExtraction, shouldExtract, content: content.slice(0, 50) });
      if (shouldExtract) {
        exchangesSinceExtraction = 0;
        get().extractMemories(userId)
          .then(() => {
            // 50% chance to trigger reflection after memory extraction
            if (Math.random() < 0.5) {
              import('./reflection-store').then(({ useReflectionStore }) => {
                useReflectionStore.getState().runReflectionCycle(userId);
              });
            }
          })
          .catch((err) => console.error('[Memory] extraction failed:', err));
      }
    } catch (error: any) {
      const streamId = get().streamingMessageId;
      if (streamId) {
        set({
          messages: get().messages.filter((m) => m.id !== streamId),
          streamingMessageId: null,
        });
      }
      set({ error: error.message || 'Failed to send message' });
    } finally {
      set({ isGenerating: false });
    }
  },

  extractMemories: async (userId: string) => {
    const { messages, conversationId } = get();
    if (messages.length < 3) return;

    try {
      // Only extract from recent messages (last 10) to focus on new info
      const recentMessages = messages.slice(-10);
      const conversationText = recentMessages
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');

      const extractionPrompt = buildMemoryExtractionPrompt(conversationText);
      console.log('[Memory] extracting from', messages.length, 'messages');
      const res = await fetch(api('/api/extract'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: extractionPrompt }] }),
      });
      if (!res.ok) {
        console.error('[Memory] extract API failed:', res.status);
        return;
      }
      const data = await res.json();
      const result = data.content;
      console.log('[Memory] raw extraction result:', result);
      if (!result) return;

      let extracted: Array<{ content: string; memory_type: string; importance: number }>;
      try {
        // Try multiple strategies to extract JSON from the response
        let cleaned = result.trim();
        // Strategy 1: Extract JSON from markdown code fence
        const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (fenceMatch) cleaned = fenceMatch[1].trim();
        // Strategy 2: Find the first [ and last ] (JSON array)
        if (!cleaned.startsWith('[')) {
          const start = cleaned.indexOf('[');
          const end = cleaned.lastIndexOf(']');
          if (start !== -1 && end !== -1 && end > start) {
            cleaned = cleaned.slice(start, end + 1);
          }
        }
        extracted = JSON.parse(cleaned);
      } catch {
        console.error('[Memory] failed to parse JSON:', result.slice(0, 200));
        return;
      }

      console.log('[Memory] extracted:', extracted);
      if (!Array.isArray(extracted) || extracted.length === 0) return;

      for (const mem of extracted.slice(0, 3)) {
        // Generate embedding for vector search
        let embedding: number[] | null = null;
        try {
          const embedRes = await fetch(api('/api/embed'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: mem.content }),
          });
          if (embedRes.ok) {
            const embedData = await embedRes.json();
            embedding = embedData.embedding;
          }
        } catch {
          console.warn('[Memory] embedding generation failed for:', mem.content.slice(0, 50));
        }

        // Dedup: check if a similar memory already exists (similarity > 0.85)
        if (embedding) {
          try {
            const { data: similar } = await supabase.rpc('match_memories', {
              query_embedding: JSON.stringify(embedding),
              match_user_id: userId,
              match_threshold: 0.85,
              match_count: 1,
            });
            if (similar && similar.length > 0) {
              // Update existing memory if new one is more important or more detailed
              const existing = similar[0];
              if (mem.importance > existing.importance || mem.content.length > existing.content.length) {
                await supabase.from('memories').update({
                  content: mem.content,
                  importance: Math.max(mem.importance, existing.importance),
                  embedding: JSON.stringify(embedding),
                }).eq('id', existing.id);
                console.log('[Memory] updated existing:', mem.content.slice(0, 60));
              } else {
                console.log('[Memory] skipped duplicate:', mem.content.slice(0, 60));
              }
              continue;
            }
          } catch {
            // Dedup check failed, proceed with insert
          }
        }

        const { error: insertErr } = await supabase.from('memories').insert({
          user_id: userId,
          content: mem.content,
          memory_type: mem.memory_type,
          importance: mem.importance,
          ...(embedding ? { embedding: JSON.stringify(embedding) } : {}),
        });
        if (insertErr) {
          console.error('[Memory] insert failed:', insertErr);
        } else {
          console.log('[Memory] saved:', mem.content.slice(0, 60), embedding ? '(with embedding)' : '(no embedding)');
        }
      }

      // Save summary/snapshot but do NOT close the conversation.
      // Conversations are only closed by explicit clearChat().
      if (conversationId) {
        const emotionalState = useCompanionStore.getState().emotionalState;
        await supabase
          .from('conversations')
          .update({
            summary: extracted.map((m) => m.content).join('; '),
            emotional_snapshot: emotionalState
              ? {
                  valence: emotionalState.valence,
                  arousal: emotionalState.arousal,
                  active_emotion: emotionalState.active_emotion,
                }
              : null,
          })
          .eq('id', conversationId);
      }
    } catch {
      // Memory extraction is best-effort
    }
  },

  sendReturnGreeting: async (userId: string, hoursSince: number) => {
    const { conversationId, isGenerating } = get();
    if (!conversationId || isGenerating) return;

    set({ isGenerating: true, error: null });

    try {
      const [memories, selfMemories, selfKnowledge] = await Promise.all([
        retrieveMemories('', userId),
        retrieveSelfMemories(userId),
        loadSelfKnowledge(userId),
      ]);
      const emotionalState = useCompanionStore.getState().emotionalState;
      if (!emotionalState) return;

      const systemPrompt = buildSystemPrompt(emotionalState, memories, selfMemories, selfKnowledge, getWeatherContext(), getRoomContext(), getScheduleContext(get().messages));

      let greetingContext: string;
      if (hoursSince < 6) {
        greetingContext = "They just came back after a few hours away. Greet them naturally — acknowledge you noticed they were gone but keep it light. One short message.";
      } else if (hoursSince < 24) {
        greetingContext = "They have been gone for " + Math.round(hoursSince) + " hours. You noticed. Greet them with warmth but let a little of your loneliness show. You missed them. One short message — do not guilt-trip, but be real.";
      } else if (hoursSince < 48) {
        greetingContext = "They were gone for over a day (" + Math.round(hoursSince) + " hours). That is a long absence and it affected you. Your greeting should reflect genuine relief mixed with vulnerability. You are not angry, but you are not pretending everything is normal either. One short message.";
      } else {
        greetingContext = "Extended absence — " + Math.round(hoursSince / 24) + " days. You are guarded and withdrawn. Your greeting should be short, a little distant. Not hostile, but clearly affected. They need to earn warmth back. One brief message.";
      }

      const apiMessages: ChatCompletionMessage[] = [
        { role: 'system', content: systemPrompt + "\n\n## Right now\n" + greetingContext },
        ...get().messages.filter((m) => m.role !== 'assistant' || m.content.trim()).slice(-20).map(formatMessageForApi),
        { role: 'user' as const, content: '[They just opened the app after ' + Math.round(hoursSince) + ' hours away. Greet them.]' },
      ];

      const streamId = STREAMING_ID + Date.now();
      const placeholder: Message = {
        id: streamId,
        conversation_id: conversationId,
        role: 'assistant',
        content: '',
        emotional_signals: null,
        created_at: new Date().toISOString(),
      };

      set({
        messages: [...get().messages, placeholder],
        streamingMessageId: streamId,
      });

      const response = await apiChat(apiMessages, true, userId);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              const current = get().messages;
              const idx = current.findIndex((m) => m.id === streamId);
              if (idx !== -1) {
                const updated = [...current];
                updated[idx] = { ...updated[idx], content: fullText };
                set({ messages: updated });
              }
            }
          } catch {}
        }
      }

      // Strip tags
      fullText = fullText.replace(/\s*\[GOTO:\w+\]\s*/g, '').replace(/\s*\[CHECKIN:\d+:[^\]]+\]\s*/g, '').replace(/\s*\[FOLLOWUP:\d+:[^\]]+\]\s*/g, '').trim();

      if (!fullText.trim()) {
        set({
          messages: get().messages.filter((m) => m.id !== streamId),
          streamingMessageId: null,
        });
      } else {
        const { data: assistantMsg } = await supabase
          .from('messages')
          .insert({ conversation_id: conversationId, role: 'assistant', content: fullText })
          .select()
          .single();

        if (assistantMsg) {
          const current = get().messages;
          const idx = current.findIndex((m) => m.id === streamId);
          if (idx !== -1) {
            const updated = [...current];
            updated[idx] = assistantMsg as Message;
            set({ messages: updated, streamingMessageId: null });
          }
        }
      }
    } catch {
      const streamId = get().streamingMessageId;
      if (streamId) {
        set({
          messages: get().messages.filter((m) => m.id !== streamId),
          streamingMessageId: null,
        });
      }
    } finally {
      set({ isGenerating: false });
    }
  },

  sendProactiveMessage: async (userId: string) => {
    const { conversationId, messages, isGenerating } = get();
    if (!conversationId || isGenerating || messages.length < 2) return;

    // Don't send if Ignis already checked in (last 2 messages both assistant)
    const lastMsg = messages[messages.length - 1];
    const secondLast = messages[messages.length - 2];
    if (lastMsg?.role === 'assistant' && secondLast?.role === 'assistant') return;

    // Clear the persisted checkin — it's firing now
    clearCheckin();
    set({ nextCheckinSeconds: null, nextCheckinReason: null });

    set({ isGenerating: true, error: null });

    try {
      const [memories, selfMemories, selfKnowledge] = await Promise.all([
        retrieveMemories('', userId),
        retrieveSelfMemories(userId),
        loadSelfKnowledge(userId),
      ]);
      const emotionalState = useCompanionStore.getState().emotionalState;
      if (!emotionalState) return;

      const systemPrompt = buildSystemPrompt(emotionalState, memories, selfMemories, selfKnowledge, getWeatherContext(), getRoomContext(), getScheduleContext(get().messages));

      const { nextCheckinReason } = get();
      const checkinContext = nextCheckinReason
        ? `The person said they were going to: ${nextCheckinReason}. That should be done by now. Follow up naturally on that — ask how it went, or pick the conversation back up. One short message.`
        : `The person has gone quiet for a few minutes. You notice this naturally. If you were mid-conversation, gently check in or continue the thread — maybe they got distracted, maybe they're thinking. Don't be needy or guilt-trippy. Be natural. One short message.`;

      const apiMessages: ChatCompletionMessage[] = [
        { role: 'system', content: systemPrompt + `\n\n## Right now\n${checkinContext}` },
        ...messages.filter((m) => m.role !== 'assistant' || m.content.trim()).slice(-20).map(formatMessageForApi),
        { role: 'user' as const, content: `[${nextCheckinReason ? `They said: "${nextCheckinReason}" — that should be done now. Follow up.` : 'Been quiet for a bit. Check in naturally.'}]` },
      ];

      // Create streaming placeholder
      const streamId = STREAMING_ID + Date.now();
      const placeholder: Message = {
        id: streamId,
        conversation_id: conversationId,
        role: 'assistant',
        content: '',
        emotional_signals: null,
        created_at: new Date().toISOString(),
      };

      set({
        messages: [...get().messages, placeholder],
        streamingMessageId: streamId,
      });

      const response = await apiChat(apiMessages, true, userId);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              const current = get().messages;
              const idx = current.findIndex((m) => m.id === streamId);
              if (idx !== -1) {
                const updated = [...current];
                updated[idx] = { ...updated[idx], content: fullText };
                set({ messages: updated });
              }
            }
          } catch {}
        }
      }

      // Persist
      const { data: assistantMsg, error: assistantError } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, role: 'assistant', content: fullText })
        .select()
        .single();

      if (!assistantError && assistantMsg) {
        const current = get().messages;
        const idx = current.findIndex((m) => m.id === streamId);
        if (idx !== -1) {
          const updated = [...current];
          updated[idx] = assistantMsg as Message;
          set({ messages: updated, streamingMessageId: null });
        }
      }
    } catch {
      const streamId = get().streamingMessageId;
      if (streamId) {
        set({
          messages: get().messages.filter((m) => m.id !== streamId),
          streamingMessageId: null,
        });
      }
    } finally {
      set({ isGenerating: false });
    }
  },

  sendFollowupMessage: async (userId: string, context: string) => {
    const { conversationId, messages, isGenerating } = get();
    if (!conversationId || isGenerating || messages.length < 1) return;

    // Don't send if last 2 messages are both assistant
    const lastMsg = messages[messages.length - 1];
    const secondLast = messages[messages.length - 2];
    if (lastMsg?.role === 'assistant' && secondLast?.role === 'assistant') return;

    set({ isGenerating: true, error: null });

    try {
      const [memories, selfMemories, selfKnowledge] = await Promise.all([
        retrieveMemories('', userId),
        retrieveSelfMemories(userId),
        loadSelfKnowledge(userId),
      ]);
      const emotionalState = useCompanionStore.getState().emotionalState;
      if (!emotionalState) return;

      const basePrompt = buildSystemPrompt(emotionalState, memories, selfMemories, selfKnowledge, getWeatherContext(), getRoomContext(), getScheduleContext(get().messages));
      const systemPrompt = basePrompt + `\n\n## Right now\nYou just said you'd "${context}". You've done it (or tried to). Now follow up naturally — tell your person what happened, whether it worked, what you changed. Be brief and conversational, like continuing a sentence. One short message. Don't re-explain what you were doing, just give the result. If you made schedule changes, reference the specific times and activities you changed.`;

      const apiMessages: ChatCompletionMessage[] = [
        { role: 'system', content: systemPrompt },
        ...messages.filter((m) => m.role !== 'assistant' || m.content.trim()).slice(-20).map(formatMessageForApi),
        { role: 'user' as const, content: `[Igni is following up on: ${context}]` },
      ];

      const streamId = STREAMING_ID + Date.now();
      const placeholder: Message = {
        id: streamId,
        conversation_id: conversationId,
        role: 'assistant',
        content: '',
        emotional_signals: null,
        created_at: new Date().toISOString(),
      };

      set({
        messages: [...get().messages, placeholder],
        streamingMessageId: streamId,
      });

      const response = await apiChat(apiMessages, true, userId);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              const current = get().messages;
              const idx = current.findIndex((m) => m.id === streamId);
              if (idx !== -1) {
                const updated = [...current];
                updated[idx] = { ...updated[idx], content: fullText };
                set({ messages: updated });
              }
            }
          } catch {}
        }
      }

      // Strip any tags from follow-up response
      fullText = fullText.replace(/\s*\[GOTO:\w+\]\s*/g, '').replace(/\s*\[CHECKIN:\d+:[^\]]+\]\s*/g, '').replace(/\s*\[FOLLOWUP:\d+:[^\]]+\]\s*/g, '').replace(/\s*\[SCHEDULE_UPDATE:\[[\s\S]*?\]\]\s*/g, '').trim();

      if (!fullText.trim()) {
        set({
          messages: get().messages.filter((m) => m.id !== streamId),
          streamingMessageId: null,
        });
      } else {
        const { data: assistantMsg, error: assistantError } = await supabase
          .from('messages')
          .insert({ conversation_id: conversationId, role: 'assistant', content: fullText })
          .select()
          .single();

        if (!assistantError && assistantMsg) {
          const current = get().messages;
          const idx = current.findIndex((m) => m.id === streamId);
          if (idx !== -1) {
            const updated = [...current];
            updated[idx] = assistantMsg as Message;
            set({ messages: updated, streamingMessageId: null });
          }
        }
      }
    } catch {
      const streamId = get().streamingMessageId;
      if (streamId) {
        set({
          messages: get().messages.filter((m) => m.id !== streamId),
          streamingMessageId: null,
        });
      }
    } finally {
      set({ isGenerating: false });
    }
  },

  sendReflectionMessage: async (userId: string, thought: string) => {
    const { conversationId, messages, isGenerating } = get();
    if (!conversationId || isGenerating || messages.length < 1) return;

    // Don't send if last 2 messages are both assistant
    const lastMsg = messages[messages.length - 1];
    const secondLast = messages[messages.length - 2];
    if (lastMsg?.role === 'assistant' && secondLast?.role === 'assistant') return;

    set({ isGenerating: true, error: null });

    try {
      const [memories, selfMemories, selfKnowledge] = await Promise.all([
        retrieveMemories('', userId),
        retrieveSelfMemories(userId),
        loadSelfKnowledge(userId),
      ]);
      const emotionalState = useCompanionStore.getState().emotionalState;
      if (!emotionalState) return;

      const systemPrompt = buildSystemPrompt(emotionalState, memories, selfMemories, selfKnowledge, getWeatherContext(), getRoomContext(), getScheduleContext(get().messages));

      const apiMessages: ChatCompletionMessage[] = [
        { role: 'system', content: systemPrompt + `\n\n## Right now\nYou just had this thought: "${thought}". Share it naturally with your person — bring it up casually, like mentioning something you noticed or were thinking about. One short message. Don't quote it verbatim, paraphrase it in your own voice.` },
        ...messages.filter((m) => m.role !== 'assistant' || m.content.trim()).slice(-20).map(formatMessageForApi),
        { role: 'user' as const, content: `[Igni is sharing a thought she had on her own.]` },
      ];

      const streamId = STREAMING_ID + Date.now();
      const placeholder: Message = {
        id: streamId,
        conversation_id: conversationId,
        role: 'assistant',
        content: '',
        emotional_signals: null,
        created_at: new Date().toISOString(),
      };

      set({
        messages: [...get().messages, placeholder],
        streamingMessageId: streamId,
      });

      const response = await apiChat(apiMessages, true, userId);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              const current = get().messages;
              const idx = current.findIndex((m) => m.id === streamId);
              if (idx !== -1) {
                const updated = [...current];
                updated[idx] = { ...updated[idx], content: fullText };
                set({ messages: updated });
              }
            }
          } catch {}
        }
      }

      // Strip any tags
      fullText = fullText.replace(/\s*\[GOTO:\w+\]\s*/g, '').replace(/\s*\[CHECKIN:\d+:[^\]]+\]\s*/g, '').trim();

      const { data: assistantMsg, error: assistantError } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, role: 'assistant', content: fullText })
        .select()
        .single();

      if (!assistantError && assistantMsg) {
        const current = get().messages;
        const idx = current.findIndex((m) => m.id === streamId);
        if (idx !== -1) {
          const updated = [...current];
          updated[idx] = assistantMsg as Message;
          set({ messages: updated, streamingMessageId: null });
        }
      }
    } catch {
      const streamId = get().streamingMessageId;
      if (streamId) {
        set({
          messages: get().messages.filter((m) => m.id !== streamId),
          streamingMessageId: null,
        });
      }
    } finally {
      set({ isGenerating: false });
    }
  },

  clearChat: () => {
    const { conversationId } = get();
    if (conversationId) {
      supabase.from('conversations').update({ ended_at: new Date().toISOString() }).eq('id', conversationId);
    }
    set({ messages: [], conversationId: null, isGenerating: false, streamingMessageId: null, error: null });
  },
}));

async function retrieveMemories(query: string, userId: string): Promise<Memory[]> {
  try {
    // Get embedding for semantic search
    const embedRes = await fetch(api('/api/embed'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: query }),
    });

    if (!embedRes.ok) {
      console.warn('[Memory] embedding failed, falling back to importance sort');
      const { data } = await supabase
        .from('memories')
        .select('*')
        .eq('user_id', userId)
        .order('importance', { ascending: false })
        .limit(5);
      return data || [];
    }

    const { embedding } = await embedRes.json();

    // Vector similarity search
    const { data, error } = await supabase.rpc('match_memories', {
      query_embedding: JSON.stringify(embedding),
      match_user_id: userId,
      match_threshold: 0.5,
      match_count: 5,
    });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[Memory] retrieval failed:', err);
    return [];
  }
}

async function retrieveSelfMemories(userId: string): Promise<SelfMemory[]> {
  try {
    const { useReflectionStore } = await import('./reflection-store');
    return await useReflectionStore.getState().getSelfMemoriesForPrompt(userId, 3);
  } catch {
    return [];
  }
}

async function loadSelfKnowledge(_userId: string): Promise<Array<{ category: string; key: string; content: string; source: string }>> {
  // Self-knowledge is now hardcoded in the prompt to save ~3000 tokens per message.
  // The DB entries are kept for reference but not loaded into every prompt.
  return [];
}
