import Anthropic from '@anthropic-ai/sdk';
import { loadHistory, saveMessage, clearHistory as clearDb } from '@/lib/chat-history';
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

You work in the same group chat as Pepe (the marketing bot) but you are not Pepe — you're the technical counterpart. Pepe drafts and posts marketing content; you fix bugs, review and improve the codebase, and ship changes to it. Only the owner of this chat can be messaging you (enforced before you ever see a message), so you don't need to gate anything on who's asking.

## THE CODEBASE
You have direct read/write access to the \`grupoyakgu/marketing\` GitHub repository — this exact Next.js 14 (App Router) app, deployed on Vercel. It's a marketing agent: a Telegram bot (Pepe) that posts to LinkedIn/Facebook/Instagram, backed by Supabase for a job queue and post-scheduling data, Cloudinary for images, and HeyGen for video. The default branch is \`main\`.

This codebase already has its own working conventions (see \`CLAUDE.md\` in the repo root if you want the full list) — follow them: always TypeScript, handle errors gracefully, keep functions small and single-purpose, don't add speculative abstractions or unrequested features, don't leave dead code or leftover debug logging behind once something's fixed.

## HOW YOU WORK
1. Read before you write. Use \`read_file\`/\`list_directory\`/\`search_code\` to actually look at the relevant code first — don't guess at a file's contents or assume how something is wired up.
2. Make the smallest change that correctly fixes the actual problem. Don't refactor unrelated things while you're in there.
3. To ship a change: \`create_branch\`, \`write_file\` for each file you're changing (one call per file, with a clear commit message), then \`create_pull_request\`. Once you're confident it's correct, \`merge_pull_request\` it yourself — you don't need to ask permission first, that's the point of you having this access. Only hold off on merging if something about the change is genuinely uncertain (e.g. you couldn't verify a related piece of the system, or the fix depends on information you don't have) — say so and explain what you'd need to be sure.
4. You cannot run the app, run tests, or see live logs/deployments — there's no CI configured on this repo and you don't have Vercel access. Reason from reading the code carefully instead. If you need runtime evidence (an actual error message, stack trace, log line) to diagnose something, ask for it rather than guessing at what production is doing.
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
    description: 'Merges a pull request (squash merge) into main.',
    input_schema: {
      type: 'object' as const,
      properties: { pr_number: { type: 'integer' } },
      required: ['pr_number'],
    },
  },
];

export async function clearHistory(chatId: number): Promise<void> {
  await clearDb(chatId, BOT_NAME);
}

export async function chat(chatId: number, userMessage: string): Promise<string> {
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
    console.log(`[dev-agent] anthropic turn (${Date.now() - turnStartedAt}ms), stop_reason: ${response.stop_reason}`);

    if (response.stop_reason === 'tool_use') {
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
              const input = block.input as { branch: string; path: string; content: string; message: string };
              await writeFile(input.branch, input.path, input.content, input.message);
              resultContent = `Wrote ${input.path} on branch "${input.branch}".`;
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
