import { supabase } from './supabase';

export type AgentName = 'pepe' | 'santi' | 'angeles' | 'abu' | 'leads';
export const AGENT_NAMES: AgentName[] = ['pepe', 'santi', 'angeles', 'abu', 'leads'];

// $ per million tokens, at standard (non-introductory) list price. Cache
// write is priced at 1.25x input (5-minute TTL, the only TTL any agent
// uses); cache read at 0.1x input. claude-sonnet-5 has a temporary
// introductory rate ($2/$10) through 2026-08-31 -- priced here at its
// permanent $3/$15 rate instead, so costs don't silently under-report the
// moment the intro window ends. 'claude-sonnet-4-6' stays in the table to
// price historical rows logged before the migration to claude-sonnet-5.
const PRICING: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  'claude-sonnet-5': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};

interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function calculateCost(model: string, usage: Usage): number {
  const pricing = PRICING[model] ?? PRICING['claude-sonnet-5'];
  const cacheCreation = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  return (
    (usage.input_tokens * pricing.input +
      usage.output_tokens * pricing.output +
      cacheCreation * pricing.cacheWrite +
      cacheRead * pricing.cacheRead) /
    1_000_000
  );
}

/** Logs one messages.create() call's usage. Never throws -- a logging
 * failure shouldn't take down the agent turn that triggered it. */
export async function recordUsage(
  agent: AgentName,
  model: string,
  usage: Usage,
  chatId?: number
): Promise<void> {
  try {
    await supabase.from('token_usage').insert({
      agent,
      model,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
      cost_usd: calculateCost(model, usage),
      chat_id: chatId ?? null,
    });
  } catch (err) {
    console.error('[token-usage] failed to record usage:', err);
  }
}

export interface AgentUsageSummary {
  agent: AgentName;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

export interface DailyCostPoint {
  date: string;
  costUsd: number;
}

export interface UsageSummary {
  byAgent: AgentUsageSummary[];
  byDay: DailyCostPoint[];
  totalCostUsd: number;
  totalCalls: number;
}

/** Aggregates token_usage rows since `since` into per-agent totals and a
 * per-day cost series (UTC calendar days) for the dashboard. */
export async function getUsageSummary(since: Date): Promise<UsageSummary> {
  const { data, error } = await supabase
    .from('token_usage')
    .select('agent, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cost_usd, created_at')
    .gte('created_at', since.toISOString());
  if (error) throw new Error(error.message);

  const rows = data ?? [];

  const byAgentMap = new Map<string, AgentUsageSummary>();
  for (const name of AGENT_NAMES) {
    byAgentMap.set(name, {
      agent: name,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      costUsd: 0,
    });
  }

  const byDayMap = new Map<string, number>();
  let totalCostUsd = 0;

  for (const row of rows) {
    const agentSummary = byAgentMap.get(row.agent) ?? {
      agent: row.agent as AgentName,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      costUsd: 0,
    };
    agentSummary.calls += 1;
    agentSummary.inputTokens += row.input_tokens;
    agentSummary.outputTokens += row.output_tokens;
    agentSummary.cacheCreationTokens += row.cache_creation_input_tokens;
    agentSummary.cacheReadTokens += row.cache_read_input_tokens;
    agentSummary.costUsd += Number(row.cost_usd);
    byAgentMap.set(row.agent, agentSummary);

    const day = row.created_at.slice(0, 10);
    byDayMap.set(day, (byDayMap.get(day) ?? 0) + Number(row.cost_usd));

    totalCostUsd += Number(row.cost_usd);
  }

  const byDay = Array.from(byDayMap.entries())
    .map(([date, costUsd]) => ({ date, costUsd }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    byAgent: Array.from(byAgentMap.values()),
    byDay,
    totalCostUsd,
    totalCalls: rows.length,
  };
}
