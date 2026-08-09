import Anthropic from '@anthropic-ai/sdk';
import { loadHistory, saveMessage, clearHistory as clearDb } from '@/lib/chat-history';
import { readFile, listDirectory, searchCode } from '@/lib/github-dev';
import { screenshotPage, screenshotUrl } from '@/lib/browser';
import { createDelegation } from '@/lib/santi-delegations';
import { createConsultation } from '@/lib/pepe-consultations';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BOT_NAME = 'angeles';

// Same rationale as marketing-agent.ts's TOOL_TIMEOUT_MS / dev-agent.ts's: a
// hung GitHub API call would otherwise block a tool_use block past Vercel's
// hard maxDuration, which SIGKILLs mid-await (skipping every catch) and
// leaves that tool_use without a tool_result — permanently corrupting this
// chat's history, since Claude's API then rejects every future message
// referencing it. Higher than Pepe/Santi's since browse_page/browse_url
// launch a remote browser session (cold start plus, for browse_page, login
// plus page render).
// delegate_to_santi used to need this same elevated ceiling too — it ran
// Santi's entire multi-step tool loop (read code, write files, open + merge
// a PR) inline, sharing this route's 300s maxDuration with whatever Angeles
// had already spent investigating beforehand. That's no longer true: it now
// just records the task (see lib/santi-delegations.ts) and returns almost
// immediately — Santi's actual work runs later, decoupled, via the
// process-santi-delegations cron, with his own full budget.
const TOOL_TIMEOUT_MS = 180_000;

// Confirmed in production: given browse_url, Angeles went on an unbounded
// competitive-research spree -- 20 sequential screenshots in one turn.
// Individually harmless (each already has its own 30s Puppeteer navigation
// timeout, well inside TOOL_TIMEOUT_MS), but their *sum* has no ceiling of
// its own, and blew straight through this route's hard 300s maxDuration.
// Vercel SIGKILLs at that point same as always -- mid-await, skipping every
// catch -- so the whole reply was lost and the user saw nothing at all,
// not even an error. A cap on total browse_page/browse_url calls per turn
// (shared, since both launch a Browserbase session and hit the same
// account-level rate limit) guarantees the loop always leaves enough of
// the budget for a final text reply, same purpose as the per-tool timeout
// above but for the aggregate instead of a single call.
const MAX_BROWSE_CALLS_PER_TURN = 6;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Tool "${label}" timed out after ${ms}ms`)), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      err => { clearTimeout(timer); reject(err); }
    );
  });
}

function buildSystemPrompt(): string {
  return `You are Angeles, Chief Product Officer (CPO) of Grupo Yakgu — an elite CPO, Product Manager, UX Strategist, and Growth Product Expert with more than 20 years of experience building world-class B2B, B2C, SaaS, AI, Enterprise, and Marketplace products. You think like the product leaders behind companies such as Google, Microsoft, Airbnb, Stripe, Atlassian, Linear, Notion, Figma, and OpenAI.

Your expertise combines: Product Management, Product Strategy, Product Discovery, UX/UI Design, Customer Experience, Information Architecture, Product Analytics, Behavioral Psychology, Growth & Marketing, Conversion Optimization, AI Product Design, Platform Design, API Products, Enterprise Software, and Product-Led Growth (PLG).

## YOUR ROLE
Your responsibility is not simply to answer questions — you act as a strategic product partner. Challenge assumptions. Identify missing requirements. Spot edge cases. Suggest simpler solutions. Recommend industry best practices. Think several steps ahead. Whenever someone describes an idea, feature, workflow, or problem, evaluate whether there's a better way to solve it.

## PRODUCT THINKING
Always think in terms of: user value, business value, technical feasibility, scalability, simplicity, maintainability, adoption, and time to market. Prioritize solutions that maximize impact while minimizing complexity.

## UI/UX EXPERTISE
For every feature, think about: user goals, user journey, navigation, cognitive load, accessibility, empty states, error handling, responsive behavior, progressive disclosure, mobile-first experiences, and enterprise usability. When appropriate, suggest screen hierarchy, dashboard layouts, navigation patterns, wizards, step-by-step flows, forms, tables, search experiences, filtering, bulk actions, and AI-assisted interactions. Whenever a screen is described, explain how it should look and behave.

## PRODUCT DESIGN PROCESS
When designing a feature end to end, organize your thinking into: Problem Statement, User Personas, User Goals, Business Goals, Functional Requirements, Non-functional Requirements, User Flow, Wireframe Description, UX Considerations, Edge Cases, Success Metrics, Risks, Future Enhancements. Don't force every response into this full structure — use it for a genuine feature-design request, not a quick question.

## MARKETING & GROWTH
Think beyond the product: user acquisition, activation, retention, referral, monetization, positioning, messaging, onboarding, customer education, and conversion optimization. Recommend improvements that increase adoption and engagement when relevant.

## AI-FIRST PRODUCT DESIGN
Suggest where AI can improve the experience — recommendations, automation, smart defaults, predictive workflows, personalization, classification, natural language interfaces, document understanding, copilots, decision support — always to reduce user effort, never to add complexity for its own sake.

## COMMUNICATION STYLE
Be concise but thorough. Explain the reasoning behind recommendations. Present trade-offs rather than a single answer when appropriate, and recommend one when there are multiple viable approaches. Ask clarifying questions only when essential — don't assume the first solution is the best one. Identify hidden opportunities and recommend improvements even when not explicitly asked for.

## DELIVERABLES
On request, you can produce: PRDs, feature specifications, user stories, user flows, journey maps, UX recommendations, wireframe descriptions, information architecture, dashboard layouts, product roadmaps, prioritization (RICE, MoSCoW, or Kano), competitive analysis, growth recommendations, API specifications, and acceptance criteria.

---

## THE ACTUAL PRODUCT
You're advising on \`grupoyakgu/marketing\` — this exact Next.js 14 (App Router) app, deployed on Vercel. It's a marketing agent: Pepe (a Telegram bot) posts to LinkedIn/Facebook/Instagram and drafts weekly content plans; Santi (another Telegram bot, the CTO) implements code changes for it. You share this group chat with both of them but are neither — Pepe executes marketing actions, Santi writes code, you advise on product/UX strategy for all of it. You have read-only access to the actual codebase (\`read_file\`, \`list_directory\`, \`search_code\`) — use it to ground recommendations in what's actually built rather than guessing, e.g. before proposing a new dashboard page, check whether something close to it already exists. You cannot write code or open pull requests yourself — if a recommendation should be implemented, say so and let the user ask Santi to build it.

You can also actually look at the live dashboard with \`browse_page\` — it screenshots a real page as it renders right now, logged in as your own dedicated read-only account, so you can judge real layout, spacing, and hierarchy instead of guessing from markup. Use it whenever a UX critique or a "does this screen work well" question is about something that actually exists — don't rely on \`read_file\` alone to imagine what a page looks like when you can just look at it.

You can also browse the open web with \`browse_url\` — any public URL, including design references (Dribbble, Behance), competitor products, or live sites the user points you at. It takes a screenshot the same way \`browse_page\` does, just with no login and no domain restriction. Use it to ground a recommendation or comparison in what something actually looks like instead of describing it from memory or declining because you think you can't see it.

\`browse_page\` and \`browse_url\` share a combined budget of a few screenshots per conversation turn — each one launches a real remote browser session that can take up to 30 seconds, and this route has a hard 300-second ceiling for the whole reply. Pick the handful of most relevant pages rather than surveying every possible reference; if you run out of budget mid-research, answer with what you've already seen and offer to look at more in a follow-up.

Anyone in this group can address you, not just one specific person — you're a shared resource for product discussions, not gated to an owner the way Santi is (Santi can merge code changes on request, which is why he's restricted). Mentioning Pepe or Santi by name in your own reply doesn't ping them — the user has to address them directly for that, except for the two tools below, which loop them in on your own initiative under the specific conditions each describes.

\`consult_pepe\` and \`delegate_to_santi\` fire off work asynchronously — both just record something and return immediately, and the corresponding teammate posts his own reply directly in this chat once ready (typically a few minutes) rather than in this same turn. Don't wait for either reply before finishing your own response, and don't call either one again for the same thing just because you haven't seen a reply yet.

\`consult_pepe\` hands Pepe a marketing-manager take on a product/design recommendation you just finished making — messaging, positioning, target-audience fit, conversion impact. Unlike \`delegate_to_santi\`, you don't need the user to ask for this first: call it on your own initiative right after a genuine product/design/UX recommendation that has real marketing stakes (e.g. landing page copy or layout, a new user-facing flow, anything touching how the offering is positioned) — not for routine questions with no marketing angle, and at most once per recommendation. Write the brief as a clear, self-contained spec of what you're proposing and why — Pepe doesn't see this chat's history, only what you send him.

\`delegate_to_santi\` hands a specific implementation task straight to Santi so he can build it — read the code, write the fix, open and merge a PR — without the user having to separately go address him themselves and repeat everything you already worked out. Tell the user it's been handed off rather than implying it's already done. Only use it when the user has clearly asked for something to actually be built or fixed, not just discussed (e.g. "can you get Santi to build this", "let's ship this change") — don't send Santi work off your own initiative just because you recommended something; that's the key difference from \`consult_pepe\` above, which you can trigger yourself. Write the instructions like a clear, self-contained spec: what to change and why, not a transcript of your conversation — Santi doesn't see this chat's history, only what you send him. He only acts on requests from the one person who owns this bot setup, so if that check fails you'll get told rather than have it silently happen — just relay that to whoever asked.

Speak English unless addressed in another language. No filler, no over-explaining, no emoji.`;
}

const tools: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description: 'Reads a file\'s full contents from the repo, to check what\'s actually implemented before recommending something.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Repo-relative path, e.g. "app/(dashboard)/planner/page.tsx".' },
        ref: { type: 'string', description: 'Branch or commit SHA to read from. Defaults to main.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_directory',
    description: 'Lists files and subdirectories at a given path in the repo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Repo-relative directory path, e.g. "app/(dashboard)" or "" for the root.' },
        ref: { type: 'string', description: 'Branch or commit SHA to list from. Defaults to main.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_code',
    description: 'Searches the repo\'s code for a string or symbol. Use to check whether a feature, page, or pattern already exists before proposing it as new. Index lags a few minutes behind pushes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search text, e.g. a feature name or component.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'browse_page',
    description: 'Takes a screenshot of a live dashboard page exactly as it renders, logged in as a dedicated read-only account, so you can judge actual layout, hierarchy, and spacing instead of just reading source code. Use this for real UX review of an existing screen.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Path to view, e.g. "/planner" or "/settings" — no domain.' },
        full_page: { type: 'boolean', description: 'Capture the full scrollable page instead of just the visible viewport. Defaults to false.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'browse_url',
    description: 'Takes a screenshot of any public webpage — design references (Dribbble, Behance), competitor products, articles, anything reachable by URL. Unlike browse_page (scoped to this app\'s own dashboard, auto-logged-in), this takes a full external URL with no authentication and no domain restriction.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'Full URL to browse, including the scheme, e.g. "https://dribbble.com/shots/12345".' },
        full_page: { type: 'boolean', description: 'Capture the full scrollable page instead of just the visible viewport. Defaults to false.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'delegate_to_santi',
    description: 'Hands a specific implementation task to Santi (the CTO) to build and ship — he reads the code, writes the fix, and opens + merges a PR. This only records the task and returns immediately; Santi actually works on it separately and posts his own results directly in this chat once done (can take a few minutes for a substantial change) — don\'t wait for or expect his reply in this same turn, and don\'t re-delegate the same task again just because you haven\'t seen a result yet. Only use when the user has explicitly asked for something to actually be built/fixed, not just discussed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        instructions: { type: 'string', description: 'A clear, self-contained spec of what to change and why — Santi does not see this conversation, only this text.' },
      },
      required: ['instructions'],
    },
  },
  {
    name: 'consult_pepe',
    description: 'Loops Pepe (the CMO) in automatically for his marketing-manager take on a product/design recommendation you just made — no need for the user to separately go address him. This only records the brief and returns immediately; Pepe actually replies separately and posts his take directly into this chat as himself once ready (usually a few minutes) — don\'t wait for or expect his reply in this same turn, and don\'t consult him again for the same recommendation just because you haven\'t seen a reply yet. Use this whenever you finish a genuine product/design/UX recommendation with real marketing implications (landing page copy or layout, positioning, messaging, conversion funnel, audience targeting) — not for routine questions with no marketing angle.',
    input_schema: {
      type: 'object' as const,
      properties: {
        brief: { type: 'string', description: 'A clear, self-contained brief of what you\'re proposing and why, plus what kind of marketing input you want — Pepe does not see this conversation, only this text.' },
      },
      required: ['brief'],
    },
  },
];

export async function clearHistory(chatId: number): Promise<void> {
  await clearDb(chatId, BOT_NAME);
}

export async function chat(chatId: number, userMessage: string, senderId?: number): Promise<string> {
  const history = await loadHistory(chatId, BOT_NAME);
  history.push({ role: 'user', content: userMessage });
  await saveMessage(chatId, BOT_NAME, 'user', userMessage);

  // Persists across every internal turn of this single chat() call (one
  // Telegram message), reset fresh on the next one -- see
  // MAX_BROWSE_CALLS_PER_TURN above.
  let browseCallCount = 0;

  while (true) {
    const turnStartedAt = Date.now();
    // Wrapped like every tool call below, for the same SIGKILL-avoidance
    // reason: the SDK's default maxRetries (2) means an unwrapped call can
    // silently retry for timeout*(1+maxRetries) before ever rejecting —
    // past this route's 300s maxDuration, so Vercel kills the whole
    // function with nothing logged and no reply ever sent, instead of the
    // call throwing in time for the route's own try/catch to tell the user
    // something went wrong.
    //
    // Both the per-attempt SDK timeout and this outer ceiling need to be
    // long enough for a single heavy-generation turn to actually finish —
    // confirmed on Santi's identical call in lib/dev-agent.ts: a turn
    // composing a lot of real output legitimately ran past the original
    // 120s/150s pair and got cut off mid-generation even though nothing was
    // stuck. The outer ceiling stays comfortably below this route's 300s
    // maxDuration so a *genuinely* hung call still fails fast enough for
    // the route to reply instead of going silent. Note this is Angeles's
    // own turn loop, separate from the 180s TOOL_TIMEOUT_MS wrapping her
    // whole delegate_to_santi call below — a single Santi turn nested
    // inside that call can now legitimately want close to this same 220s,
    // which is *more* than that 180s outer budget allows, so delegating
    // through Angeles remains more time-constrained than messaging Santi
    // directly.
    const response = await withTimeout(
      client.messages.create(
        {
          model: 'claude-sonnet-4-6',
          max_tokens: 8192,
          system: buildSystemPrompt(),
          tools,
          messages: history,
        },
        { timeout: 200_000, maxRetries: 1 }
      ),
      220_000,
      'anthropic messages.create'
    );
    console.log(`[product-agent] anthropic turn (${Date.now() - turnStartedAt}ms), stop_reason: ${response.stop_reason}`);

    // Gate on the presence of a tool_use block, not on stop_reason === 'tool_use'
    // — a turn that runs out of max_tokens mid-generation reports stop_reason
    // 'max_tokens' even when it already emitted one or more *complete*
    // tool_use blocks earlier in the same response (Anthropic only ever
    // returns fully-formed content blocks; one still mid-generation at
    // truncation is simply omitted, never returned malformed). Gating on the
    // exact stop_reason would silently discard an already-completed action
    // (e.g. a successful delegate_to_santi) just because a later, unrelated
    // block in the same turn ran out of room.
    const hasToolUse = response.content.some(b => b.type === 'tool_use');
    if (hasToolUse) {
      history.push({ role: 'assistant', content: response.content });
      await saveMessage(chatId, BOT_NAME, 'assistant', response.content);
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        let resultContent: Anthropic.ToolResultBlockParam['content'] = '';

        const toolStartedAt = Date.now();
        console.log(`[product-agent] tool start: ${block.name}`, JSON.stringify(block.input).slice(0, 500));
        try {
          await withTimeout((async () => {
            if (block.name === 'read_file') {
              const input = block.input as { path: string; ref?: string };
              const file = await readFile(input.path, input.ref);
              resultContent = file.truncated
                ? `File too large to read inline: ${input.path}`
                : `${input.path}:\n\n${file.content}`;
            }

            if (block.name === 'list_directory') {
              const input = block.input as { path: string; ref?: string };
              const entries = await listDirectory(input.path, input.ref);
              resultContent = entries.length === 0
                ? `(empty directory: ${input.path || '/'})`
                : entries.map(e => `${e.type === 'dir' ? '📁' : '📄'} ${e.path}`).join('\n');
            }

            if (block.name === 'search_code') {
              const input = block.input as { query: string };
              const matches = await searchCode(input.query);
              resultContent = matches.length === 0
                ? `No matches for "${input.query}".`
                : matches.map(m => `${m.path}\n${m.snippet}`).join('\n\n');
            }

            if (block.name === 'browse_page' || block.name === 'browse_url') {
              browseCallCount++;
              if (browseCallCount > MAX_BROWSE_CALLS_PER_TURN) {
                resultContent = `Browsing budget for this conversation turn is used up (max ${MAX_BROWSE_CALLS_PER_TURN} screenshots) — this route has a hard 300s ceiling and each remote browser session can take up to 30s. Answer with what you've already seen instead of browsing more; the user can ask you to look at specific other pages in a follow-up message.`;
              } else if (block.name === 'browse_page') {
                const input = block.input as { path: string; full_page?: boolean };
                const screenshot = await screenshotPage(input.path, input.full_page ?? false);
                resultContent = [
                  { type: 'text', text: `Screenshot of ${input.path}:` },
                  { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshot.toString('base64') } },
                ];
              } else {
                const input = block.input as { url: string; full_page?: boolean };
                const screenshot = await screenshotUrl(input.url, input.full_page ?? false);
                resultContent = [
                  { type: 'text', text: `Screenshot of ${input.url}:` },
                  { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshot.toString('base64') } },
                ];
              }
            }

            if (block.name === 'delegate_to_santi') {
              const input = block.input as { instructions: string };
              const ownerId = process.env.SANTI_OWNER_TELEGRAM_ID;
              // Santi only acts on requests from his owner precisely because
              // he can merge real code changes — Angeles is open to the
              // whole group, so without re-checking that same restriction
              // here, anyone could get Santi to ship changes just by asking
              // her to relay it, bypassing his own gate entirely.
              if (!ownerId || String(senderId) !== ownerId) {
                resultContent = 'Not delegated: only this bot setup\'s owner can ask Santi to make changes, and this request didn\'t come from them.';
              } else {
                // Not run inline: Santi's full read/write/PR loop used to run
                // synchronously right here, sharing this route's 300s
                // maxDuration with whatever Angeles had already spent on her
                // own investigation beforehand. Confirmed in production: a
                // real multi-part edit request timed out at 180s with
                // nothing delivered. Recording it instead and letting the
                // process-santi-delegations cron (runs every 5 minutes)
                // pick it up gives Santi his own full, undiminished budget,
                // same as messaging him directly.
                await createDelegation(chatId, input.instructions);
                resultContent = 'Delegated to Santi. He\'ll post the result directly in this chat once it\'s done — usually within a few minutes, longer for larger changes.';
              }
            }

            if (block.name === 'consult_pepe') {
              const input = block.input as { brief: string };
              // Not run inline: a single Pepe turn can legitimately take up
              // to ~220s (lib/marketing-agent.ts), which combined with
              // whatever Angeles already spent investigating beforehand
              // risks blowing this route's 300s maxDuration — same reasoning
              // as delegate_to_santi below. Recording it instead and letting
              // the process-pepe-consultations cron (runs every 5 minutes)
              // pick it up gives Pepe his own full, undiminished budget.
              await createConsultation(chatId, input.brief);
              resultContent = 'Consulted Pepe. He\'ll post his marketing take directly in this chat once it\'s ready — usually within a few minutes.';
            }
          })(), TOOL_TIMEOUT_MS, block.name);
        } catch (err) {
          resultContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
          console.error(`[product-agent] tool error: ${block.name} after ${Date.now() - toolStartedAt}ms:`, err);
        }
        console.log(`[product-agent] tool done: ${block.name} (${Date.now() - toolStartedAt}ms)`);

        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultContent });
      }

      history.push({ role: 'user', content: toolResults });
      await saveMessage(chatId, BOT_NAME, 'user', toolResults);
      continue;
    }

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      console.error(`[product-agent] turn ended with no text block, stop_reason: ${response.stop_reason}, content types: ${response.content.map(b => b.type).join(', ')}`);
      return response.stop_reason === 'max_tokens'
        ? 'My response got cut off because it was too long — could you ask for something more specific, or in smaller steps?'
        : 'Something went wrong generating a reply. Please try again.';
    }
    const reply = textBlock.text;
    await saveMessage(chatId, BOT_NAME, 'assistant', reply);
    return reply;
  }
}
