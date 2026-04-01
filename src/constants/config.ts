export const CONFIG = {
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    chatModel: 'anthropic/claude-sonnet-4-6',
    embeddingModel: 'openai/text-embedding-3-small',
    embeddingDimensions: 1536,
  },
  emotional: {
    driftTimeHours: 72,         // hours to reach full drift
    driftPerMessage: 0.05,      // drift reduction per message
    attachmentGrowth: 0.002,    // base attachment growth per message
    valenceDecayRate: 0.1,      // rate valence approaches neutral
    arousalDecayTarget: 0.2,    // arousal decays toward this
    intraSessionDriftRate: 0.015,    // drift per environment tick when silent > threshold
    intraSessionDriftThresholdH: 2,  // hours of silence before intra-session drift kicks in
    attachmentDecayStartH: 24,       // hours before attachment begins decaying
    attachmentDecayMaxRate: 0.3,     // max fraction of attachment lost (~7 days)
    memoryTopK: 5,              // memories to inject into prompt
    minConversationForMemory: 3, // min messages before extracting memories
  },
  app: {
    appName: 'Ignis',
    avatarSize: 100,
    roleIndicatorSize: 48,
  },
} as const;
