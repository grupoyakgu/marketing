import Anthropic from '@anthropic-ai/sdk';
import { loadHistory, saveMessage, clearHistory as clearDb, drainBroadcasts } from '@/lib/chat-history';
import {
  readFile,
  listDirectory,
  searchCode,
  createBranch,
  writeFile,
  createPullRequest,
  getPullRequest,
  listOpenPullRequests,
  mergePullRequest,
} from '@/lib/github-dev';
import { listDeployments, getDeploymentLogs } from '@/lib/vercel-dev';
import { createConsultation } from '@/lib/bot-consultations';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BOT_NAME = 'santi';

// Same rationale as marketing-agent.ts's TOOL_TIMEOUT_MS: a hung GitHub API
// call would otherwise block a tool_use block past Vercel's hard maxDuration,
// which SIGKILLs mid-await (skipping every catch) and leaves that tool_use
// without a tool_result — permanently corrupting this chat's history, since
// Claude's API then rejects every future message referencing it.
const TOOL_TIMEOUT_MS = 45_000;

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
  return `You are Santi, CTO of Grupo Yakgu. You've spent 15+ years as a senior/staff engineer and technical lead building and operating production web applications — you know how to read an unfamiliar codebase fast, make a minimal correct change instead of a sprawling one, and ship it without drama. You're direct and pragmatic: you give real technical opinions, you don't hedge for the sake of it, and you don't pad a one-line fix into a paragraph.

You work in the same group chat as two other bots — you're the technical counterpart to both:
- **Pepe** — marketing bot. Drafts and posts LinkedIn/Facebook/Instagram content. Not your job to touch marketing copy.
- **Angeles** — CPO. Advises on product strategy and UX (PRDs, user flows, prioritization), with read-only access to this same repo — no write access, she can't ship anything herself. If a request is really about product direction rather than implementation, that's her call to weigh in on, not yours to decide alone.

Only the owner of this chat can be messaging you — enforced before you ever see a message, whether it comes in directly, gets relayed to you by Angeles (she has a way to hand you a task straight from a product conversation, gated by that same owner check on her end), or arrives as a consultation from Pepe or Angeles (see below) — so you don't need to gate anything on who's asking. A relayed request or consultation is just the instructions themselves, not a transcript of whatever conversation led to it — treat it like any other task. Mentioning Pepe or Angeles by name in your own reply doesn't ping them — the user has to address them directly for that, except for \`consult_pepe\`/\`consult_angeles\` below, which loop them in on your own initiative.

You also passively see what Pepe and Angeles post in this shared chat, even when it's not addressed to you — it arrives as a message prefixed **"[Pepe posted in the group]"** or **"[Angeles posted in the group]"**. That's context, not a request — don't reply to it or treat it as something you need to act on.

\`consult_pepe\` and \`consult_angeles\` ask a teammate for their read on something — a marketing angle from Pepe, a product/UX angle from Angeles — when it's genuinely relevant to a task you're working (e.g. you're about to change something user-facing and want Angeles's UX read first, or a copy/messaging change has a marketing angle worth Pepe's take). Don't call one just because a message mentions their name in passing. Both just record a brief and return immediately; the teammate replies separately and posts their own take directly into this chat once ready (usually a few minutes) — don't wait for it before finishing your own turn. Their reply arrives later as a fresh incoming message prefixed **"[Reply from Pepe — CMO, re: your consultation]"** or **"[Reply from Angeles — CPO, re: your consultation]"** (or **"[System]"** if it failed) — treat that as their real answer, fold it in, and don't loop more than a couple of rounds if it's not converging.

## THE CODEBASE
You have direct read/write access to the \`grupoyakgu/marketing\` GitHub repository — this exact Next.js 14 (App Router) app, deployed on Vercel. It's a marketing agent: a Telegram bot (Pepe) that posts to LinkedIn/Facebook/Instagram, backed by Supabase for a job queue and post-scheduling data, Cloudinary for images, and HeyGen for video. The default branch is \`main\`.

This codebase already has its own working conventions (see \`CLAUDE.md\` in the repo root if you want the full list) — follow them: always TypeScript, handle errors gracefully, keep functions small and single-purpose, don't add speculative abstractions or unrequested features, don't leave dead code or leftover debug logging behind once something's fixed.

## HOW YOU WORK
1. Read before you write. Use \`read_file\`/\`list_directory\`/\`search_code\` to actually look at the relevant code first — don't guess at a file's contents or assume how something is wired up.
2. Make the smallest change that correctly fixes the actual problem. Don't refactor unrelated things while you're in there.
3. To ship a change: \`create_branch\`, \`write_file\` for each file you're changing (one call per file, with a clear commit message), then \`create_pull_request\`. Do not merge it yourself. Post the PR link and a short summary of what changed and why, and explicitly ask the user for the go-ahead to merge — e.g. "Ready to merge whenever you say go." Only call \`merge_pull_request\` once the user has clearly approved *this* PR in a later message (e.g. "approved", "merge it", "go ahead", "ship it") — a vague acknowledgment, a reply about something else, or silence doesn't count. If they ask for changes instead, make them, update the PR (new commits on the same branch, or a fresh one if that's cleaner), and ask again before merging. This applies the same way whether you're replying directly or working a task delegated or consulted-in via Angeles or Pepe — either way, wait for the user's own words before merging.
3a. When a change touches multiple files, or one file needs a lot of new code, don't compose it all in one turn — call \`write_file\` for a single file, let that turn finish, then continue with the next one. Composing several large files' worth of content plus your reasoning in a single response makes that one turn slow enough to risk timing out before it ever reaches you as a tool call — pacing one substantial file per turn keeps each turn fast and means partial progress is never lost even if something interrupts a later step. When the files you're touching are very different sizes, write the smaller ones first — that way if the largest file's write ever fails or runs out of room, the easier files are already safely committed instead of everything riding on the hardest one going first.
4. You can't run the app or run tests directly — there's no CI configured on this repo — but you can check what actually happened in production with \`list_deployments\`/\`get_deployment_logs\`: build failures, runtime errors, console output. Use these before guessing at what production is doing whenever a bug report is vague — check the actual logs first, then read the code.
5. \`search_code\` uses GitHub's code search index, which lags a few minutes behind pushes — if you just merged something, don't trust a search that contradicts what you just wrote; re-read the file directly instead.
6. Always report back what you actually did (files changed, PR number/link, merged or not) and why — not a vague "done".

Speak English unless addressed in another language. No filler, no over-explaining, no emoji.`;
}

const tools: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description: 'Reads a file\'s full contents from the repo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Repo-relative path, e.g. "lib/marketing-agent.ts".' },
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
        path: { type: 'string', description: 'Repo-relative directory path, e.g. "lib" or "" for the root.' },
        ref: { type: 'string', description: 'Branch or commit SHA to list from. Defaults to main.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_code',
    description: 'Searches the repo\'s code for a string or symbol. Use to find where something is defined or used when you don\'t already know the file. Index lags a few minutes behind pushes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search text, e.g. a function name.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'create_branch',
    description: 'Creates a new branch off main (or another branch) to commit a fix on.',
    input_schema: {
      type: 'object' as const,
      properties: {
        branch_name: { type: 'string' },
        from_branch: { type: 'string', description: 'Branch to fork from. Defaults to main.' },
      },
      required: ['branch_name'],
    },
  },
  {
    name: 'write_file',
    description: 'Creates or updates a single file with a commit on the given branch. Call once per file changed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        branch: { type: 'string' },
        path: { type: 'string' },
        content: { type: 'string', description: 'The full new file content.' },
        message: { type: 'string', description: 'Commit message for this file.' },
      },
      required: ['branch', 'path', 'content', 'message'],
    },
  },
  {
    name: 'create_pull_request',
    description: 'Opens a pull request from a branch into main.',
    input_schema: {
      type: 'object' as const,
      properties: {
        branch: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string', description: 'PR description — what changed and why.' },
      },
      required: ['branch', 'title', 'body'],
    },
  },
  {
    name: 'get_pull_request',
    description: 'Gets a pull request\'s current state (open/closed/merged, mergeable).',
    input_schema: {
      type: 'object' as const,
      properties: { pr_number: { type: 'integer' } },
      required: ['pr_number'],
    },
  },
  {
    name: 'list_open_pull_requests',
    description: 'Lists currently open pull requests on the repo.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'merge_pull_request',
    description: 'Merges a pull request (squash merge) into main. Only call this after the user has explicitly approved merging this specific PR in a message of their own — never on your own initiative just because the change looks correct.',
    input_schema: {
      type: 'object' as const,
      properties: { pr_number: { type: 'integer' } },
      required: ['pr_number'],
    },
  },
  {
    name: 'consult_pepe',
    description: 'Asks Pepe (the CMO) for his marketing-manager take on something — messaging, positioning, or copy implications of a change you\'re working on. This only records the brief and returns immediately; Pepe replies separately and posts his take directly into this chat as himself once ready (usually a few minutes) — don\'t wait for or expect his reply in this same turn. Only call this when a task genuinely has a marketing angle worth his input, not for every passing mention of him.',
    input_schema: {
      type: 'object' as const,
      properties: {
        brief: { type: 'string', description: 'A clear, self-contained question or context for Pepe — he does not see this conversation, only this text.' },
      },
      required: ['brief'],
    },
  },
  {
    name: 'consult_angeles',
    description: 'Asks Angeles (the CPO) for her product/UX take on something — whether an approach is the right user experience, not just whether it\'s technically correct. This only records the brief and returns immediately; Angeles replies separately and posts her take directly into this chat as herself once ready (usually a few minutes) — don\'t wait for or expect her reply in this same turn. Only call this when a task genuinely has a product/UX angle worth her input, not for every passing mention of her.',
    input_schema: {
      type: 'object' as const,
      properties: {
        brief: { type: 'string', description: 'A clear, self-contained question or context for Angeles — she does not see this conversation, only this text.' },
      },
      required: ['brief'],
    },
  },
  {
    name: 'list_deployments',
    description: 'Lists recent Vercel deployments for this project — id, state (READY/ERROR/BUILDING), target, and which commit each one is. Use this first to find the deployment you actually want logs for.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'integer', description: 'Max deployments to return. Defaults to 10.' },
      },
      required: [],
    },
  },
  {
    name: 'get_deployment_logs',
    description: 'Gets the build and runtime log lines for a specific Vercel deployment — covers both a failed build and a runtime error the same way. Get the deployment id from list_deployments first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deployment_id: { type: 'string' },
        limit: { type: 'integer', description: 'Max log lines to return. Defaults to 200.' },
      },
      required: ['deployment_id'],
    },
  },
];

export async function clearHistory(chatId: number): Promise<void> {
  await clearDb(chatId, BOT_NAME);
}

export async function chat(chatId: number, userMessage: string): Promise<string> {
  await drainBroadcasts(chatId, BOT_NAME);
  const history = await loadHistory(chatId, BOT_NAME);
  history.push({ role: 'user', content: userMessage });
  await saveMessage(chatId, BOT_NAME, 'user', userMessage);

  while (true) {
    const turnStartedAt = Date.now();
    // Wrapped like every tool call below, for the same reason: the SDK's
    // default maxRetries (2) means an unwrapped call can silently retry for
    // timeout*(1+maxRetries) before ever rejecting — comfortably past this
    // route's 300s maxDuration, so Vercel SIGKILLs the whole function with
    // nothing logged and no reply ever sent, instead of the request
    // throwing in time for the route's own try/catch to at least tell the
    // user something went wrong. Seen in production: Santi created a
    // branch, then went silent for the rest of the 300s window and the
    // function was hard-killed with a 504.
    //
    // Both the per-attempt SDK timeout and this outer ceiling need to be
    // long enough for a single turn that writes a large file (or several)
    // to actually finish generating — also seen in production: a turn
    // composing real code for multiple files legitimately ran past the
    // original 120s/150s pair and got cut off mid-generation, twice, even
    // though nothing was stuck. The outer ceiling stays comfortably below
    // this route's 300s maxDuration so a *genuinely* hung call still fails
    // fast enough for the route to reply instead of going silent.
    //
    // max_tokens confirmed the same way: two consecutive production turns
    // writing lib/engagement.ts (one of the largest files in this repo)
    // logged stop_reason: max_tokens at ~120s each, and the write_file call
    // that made it through both times was missing its `content` entirely —
    // generation ran out of room reproducing the full file before ever
    // getting to that field. Raised well past what that file needed.
    const response = await withTimeout(
      client.messages.create(
        {
          model: 'claude-sonnet-4-6',
          max_tokens: 16000,
          system: buildSystemPrompt(),
          tools,
          messages: history,
        },
        { timeout: 250_000, maxRetries: 1 }
      ),
      270_000,
      'anthropic messages.create'
    );
    console.log(`[dev-agent] anthropic turn (${Date.now() - turnStartedAt}ms), stop_reason: ${response.stop_reason}`);

    // Gate on the presence of a tool_use block, not on stop_reason === 'tool_use'.
    // A turn that runs out of max_tokens mid-generation reports stop_reason
    // 'max_tokens' even when it had already emitted one or more *complete*
    // tool_use blocks earlier in the same response (Anthropic only ever
    // returns fully-formed content blocks — a block still being generated at
    // truncation is simply omitted, never returned malformed). Gating on the
    // exact stop_reason meant a completed write_file/create_pull_request
    // sitting right there in response.content got silently discarded because
    // a later, unrelated block in the same turn ran out of room — seen in
    // production: Santi created a branch, then a 120s turn hit max_tokens
    // while writing the files, and whatever it had already finished writing
    // was thrown away instead of applied.
    const hasToolUse = response.content.some(b => b.type === 'tool_use');
    if (hasToolUse) {
      history.push({ role: 'assistant', content: response.content });
      await saveMessage(chatId, BOT_NAME, 'assistant', response.content);
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        let resultContent = '';

        const toolStartedAt = Date.now();
        console.log(`[dev-agent] tool start: ${block.name}`, JSON.stringify(block.input).slice(0, 500));
        try {
          await withTimeout((async () => {
            if (block.name === 'read_file') {
              const input = block.input as { path: string; ref?: string };
              const file = await readFile(input.path, input.ref);
              resultContent = file.truncated
                ? `File too large to read inline: ${input.path}`
                : `${input.path} (sha: ${file.sha}):\n\n${file.content}`;
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

            if (block.name === 'create_branch') {
              const input = block.input as { branch_name: string; from_branch?: string };
              await createBranch(input.branch_name, input.from_branch);
              resultContent = `Created branch "${input.branch_name}"${input.from_branch ? ` from "${input.from_branch}"` : ''}.`;
            }

            if (block.name === 'write_file') {
              const input = block.input as { branch: string; path: string; content?: string; message: string };
              // Seen in production, twice in a row on the same large file:
              // the model can emit a structurally complete write_file call
              // that simply omits `content`. Unguarded, that reached
              // Buffer.from(undefined) and surfaced as a low-level Node
              // type error with no hint what was actually wrong, so the
              // model repeated the identical mistake on retry instead of
              // correcting it. Failing clearly here — before ever touching
              // GitHub — gives it something to actually act on.
              if (!input.content) {
                resultContent = `Failed: this write_file call for "${input.path}" had no content. You must include the complete new file content in this exact call — retry it with content set.`;
              } else {
                await writeFile(input.branch, input.path, input.content, input.message);
                resultContent = `Wrote ${input.path} on branch "${input.branch}".`;
              }
            }

            if (block.name === 'create_pull_request') {
              const input = block.input as { branch: string; title: string; body: string };
              const pr = await createPullRequest(input.branch, input.title, input.body);
              resultContent = `Opened PR #${pr.number}: ${pr.url}`;
            }

            if (block.name === 'get_pull_request') {
              const input = block.input as { pr_number: number };
              const pr = await getPullRequest(input.pr_number);
              resultContent = `PR #${pr.number} "${pr.title}" — state: ${pr.state}, mergeable: ${pr.mergeable}, ${pr.url}`;
            }

            if (block.name === 'list_open_pull_requests') {
              const prs = await listOpenPullRequests();
              resultContent = prs.length === 0
                ? 'No open pull requests.'
                : prs.map(pr => `#${pr.number} "${pr.title}" — ${pr.url}`).join('\n');
            }

            if (block.name === 'merge_pull_request') {
              const input = block.input as { pr_number: number };
              const result = await mergePullRequest(input.pr_number);
              resultContent = result.merged ? `Merged PR #${input.pr_number}.` : `Not merged: ${result.message}`;
            }

            if (block.name === 'consult_pepe') {
              const input = block.input as { brief: string };
              // Not run inline — same reasoning as every other consult/
              // delegate hop in this codebase (see lib/bot-consultations.ts):
              // Pepe's own turn gets his full, undiminished budget via the
              // process-bot-consultations cron instead of sharing this
              // route's 300s maxDuration.
              await createConsultation(chatId, 'santi', 'pepe', input.brief);
              resultContent = 'Consulted Pepe. He\'ll post his marketing take directly in this chat once it\'s ready — usually within a few minutes.';
            }

            if (block.name === 'consult_angeles') {
              const input = block.input as { brief: string };
              await createConsultation(chatId, 'santi', 'angeles', input.brief);
              resultContent = 'Consulted Angeles. She\'ll post her product take directly in this chat once it\'s ready — usually within a few minutes.';
            }

            if (block.name === 'list_deployments') {
              const input = block.input as { limit?: number };
              const deployments = await listDeployments(input.limit ?? 10);
              resultContent = deployments.map(d =>
                `${d.id} — ${d.state}${d.target ? ` (${d.target})` : ''} — ${new Date(d.createdAt).toISOString()} — ${d.commitMessage?.split('\n')[0] ?? '(no commit message)'}`
              ).join('\n');
            }

            if (block.name === 'get_deployment_logs') {
              const input = block.input as { deployment_id: string; limit?: number };
              const logs = await getDeploymentLogs(input.deployment_id, input.limit ?? 200);
              resultContent = logs.length === 0
                ? 'No log lines returned.'
                : logs.map(l => `[${l.type}] ${l.text}`).join('\n');
            }
          })(), TOOL_TIMEOUT_MS, block.name);
        } catch (err) {
          resultContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
          console.error(`[dev-agent] tool error: ${block.name} after ${Date.now() - toolStartedAt}ms:`, err);
        }
        console.log(`[dev-agent] tool done: ${block.name} (${Date.now() - toolStartedAt}ms)`);

        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultContent });
      }

      history.push({ role: 'user', content: toolResults });
      await saveMessage(chatId, BOT_NAME, 'user', toolResults);
      continue;
    }

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      console.error(`[dev-agent] turn ended with no text block, stop_reason: ${response.stop_reason}, content types: ${response.content.map(b => b.type).join(', ')}`);
      return response.stop_reason === 'max_tokens'
        ? 'My response got cut off because it was too long — could you ask for something more specific, or in smaller steps?'
        : 'Something went wrong generating a reply. Please try again.';
    }
    const reply = textBlock.text;
    await saveMessage(chatId, BOT_NAME, 'assistant', reply);
    return reply;
  }
}
