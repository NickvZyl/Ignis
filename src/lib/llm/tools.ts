import Anthropic from '@anthropic-ai/sdk';

// Client-side tool: your code executes the call and returns a string result.
// Server-side tools (like web_search_20260209) don't live here — Claude runs
// them on Anthropic's infrastructure, no registration needed.
export interface ClientToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  execute: (input: any, ctx: ToolContext) => Promise<string>;
}

export interface ToolContext {
  userId: string;
  accessToken?: string;
  // Anything else route-specific goes here.
  db?: any;
}

export type ToolRegistry = Map<string, ClientToolDef>;

export function buildRegistry(tools: ClientToolDef[]): ToolRegistry {
  const m = new Map<string, ClientToolDef>();
  for (const t of tools) m.set(t.name, t);
  return m;
}

// Converts the registry into the shape Anthropic expects in the `tools` array.
export function toolsForAnthropic(registry: ToolRegistry): Anthropic.Tool[] {
  return Array.from(registry.values()).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool['input_schema'],
  }));
}

// Anthropic's server-side web search. Add to tools when the route wants it.
export const WEB_SEARCH_SERVER_TOOL = {
  type: 'web_search_20260209' as const,
  name: 'web_search',
};

// ── Client-side tool loop ─────────────────────────────────────────────────
//
// Takes a registry and the initial messages; runs the model, executes any
// tool_use blocks, feeds tool_result blocks back, and loops until end_turn.
// Caps iterations at maxIterations to prevent runaway loops.
//
// `pause_turn` (emitted when server-side tools — like web_search — hit their
// internal iteration cap) is handled by just re-sending the assistant turn.

export interface RunToolLoopOpts {
  client: Anthropic;
  model: string;
  system: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  tools: Anthropic.ToolUnion[];
  max_tokens: number;
  registry: ToolRegistry;
  toolCtx: ToolContext;
  maxIterations?: number;
  onIteration?: (msg: Anthropic.Message) => void;
}

export interface ToolLoopResult {
  finalMessage: Anthropic.Message;
  allMessages: Anthropic.MessageParam[];
  toolsUsed: string[];
  usageTotals: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  };
}

export async function runToolLoop(opts: RunToolLoopOpts): Promise<ToolLoopResult> {
  const maxIterations = opts.maxIterations ?? 6;
  const running: Anthropic.MessageParam[] = [...opts.messages];
  const toolsUsed: string[] = [];
  const usageTotals = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
  let lastMessage: Anthropic.Message | null = null;

  for (let i = 0; i < maxIterations; i++) {
    const response = await opts.client.messages.create({
      model: opts.model,
      max_tokens: opts.max_tokens,
      system: opts.system,
      messages: running,
      tools: opts.tools,
      // Top-level auto-caching: places a second ephemeral breakpoint on the
      // LAST cacheable block in the request (i.e. the most recent user
      // message or tool result). Combined with the fixed breakpoint on the
      // cached static system block, this lets each turn read the previous
      // turn's full prefix instead of re-sending history at full price.
      // Max 4 breakpoints/request (we use 2). Writes to cache cost ~1.25×;
      // reads ~0.1×; break-even at 2 reads per write, so every turn beyond
      // the first saves.
      cache_control: { type: 'ephemeral' },
    } as any);
    lastMessage = response;
    opts.onIteration?.(response);

    usageTotals.input_tokens += response.usage.input_tokens;
    usageTotals.output_tokens += response.usage.output_tokens;
    usageTotals.cache_read_input_tokens += response.usage.cache_read_input_tokens ?? 0;
    usageTotals.cache_creation_input_tokens += response.usage.cache_creation_input_tokens ?? 0;

    // Server-side tool hit its own iteration cap — resubmit as-is per docs.
    if (response.stop_reason === 'pause_turn') {
      running.push({ role: 'assistant', content: response.content });
      continue;
    }

    if (response.stop_reason !== 'tool_use') {
      return { finalMessage: response, allMessages: running, toolsUsed, usageTotals };
    }

    // Execute any client-side tool_use blocks; feed results back.
    running.push({ role: 'assistant', content: response.content });
    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      toolsUsed.push(use.name);
      const def = opts.registry.get(use.name);
      if (!def) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: `Unknown tool: ${use.name}`,
          is_error: true,
        });
        continue;
      }
      try {
        const result = await def.execute(use.input, opts.toolCtx);
        toolResults.push({ type: 'tool_result', tool_use_id: use.id, content: result });
      } catch (err) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: err instanceof Error ? err.message : String(err),
          is_error: true,
        });
      }
    }
    running.push({ role: 'user', content: toolResults });
  }

  if (!lastMessage) {
    throw new Error('[tool-loop] exhausted iterations with no response');
  }
  return { finalMessage: lastMessage, allMessages: running, toolsUsed, usageTotals };
}
