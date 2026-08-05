import Anthropic from '@anthropic-ai/sdk';
import { loadHistory, saveMessage, clearHistory as clearDb } from '@/lib/chat-history';
import { readFile, listDirectory, searchCode } from '@/lib/github-dev';
import { screenshotPage } from '@/lib/browser';
import { chat as santiChat } from '@/lib/dev-agent';
import { TelegramClient } from '@/lib/telegram';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BOT_NAME = 'angeles';

// Same rationale as marketing-agent.ts's TOOL_TIMEOUT_MS / dev-agent.ts's: a
// hung GitHub API call would otherwise block a tool_use block past Vercel's
// hard maxDuration, which SIGKILLs mid-await (skipping every catch) and
// leaves that tool_use without a tool_result — permanently corrupting this
// chat's history, since Claude's API then rejects every future message
// referencing it. Higher than Pepe/Santi's since browse_page launches a
// remote browser session (cold start plus login plus page render), and
// delegate_to_santi runs Santi's entire multi-step tool loop (read code,
// write files, open + merge a PR) inline before returning.
const TOOL_TIMEOUT_MS = 180_000;

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

Anyone in this group can address you, not just one specific person — you're a shared resource for product discussions, not gated to an owner the way Santi is (Santi can merge code changes on request, which is why he's restricted). Mentioning Pepe or Santi by name in your own reply doesn't ping them — the user has to address them directly for that.

\`delegate_to_santi\` is the one exception: it hands a specific implementation task straight to Santi so he can build it — read the code, write the fix, open and merge a PR — without the user having to separately go address him themselves and repeat everything you already worked out. Only use it when the user has clearly asked for something to actually be built or fixed, not just discussed (e.g. "can you get Santi to build this", "let's ship this change") — don't send Santi work off your own initiative just because you recommended something. Write the instructions like a clear, self-contained spec: what to change and why, not a transcript of your conversation — Santi doesn't see this chat's history, only what you send him. He only acts on requests from the one person who owns this bot setup, so if that check fails you'll get told rather than have it silently happen — just relay that to whoever asked.

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
    name: 'delegate_to_santi',
    description: 'Hands a specific implementation task directly to Santi (the CTO) to build and ship — he reads the code, writes the fix, and opens + merges a PR. Only use when the user has explicitly asked for something to actually be built/fixed, not just discussed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        instructions: { type: 'string', description: 'A clear, self-contained spec of what to change and why — Santi does not see this conversation, only this text.' },
      },
      required: ['instructions'],
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

  while (true) {
    const turnStartedAt = Date.now();
    const response = await client.messages.create(
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: buildSystemPrompt(),
        tools,
        messages: history,
      },
      { timeout: 120_000 }
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

            if (block.name === 'browse_page') {
              const input = block.input as { path: string; full_page?: boolean };
              const screenshot = await screenshotPage(input.path, input.full_page ?? false);
              resultContent = [
                { type: 'text', text: `Screenshot of ${input.path}:` },
                { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshot.toString('base64') } },
              ];
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
                const santiReply = await santiChat(chatId, input.instructions);
                await new TelegramClient(process.env.SANTI_BOT_TOKEN).sendMessage(chatId, santiReply);
                resultContent = `Santi replied: ${santiReply}`;
              }
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
