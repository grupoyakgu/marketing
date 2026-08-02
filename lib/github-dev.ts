const GITHUB_API = 'https://api.github.com';
const OWNER = 'grupoyakgu';
const REPO = 'marketing';
const DEFAULT_BRANCH = 'main';

function getToken(): string {
  const token = process.env.SANTI_GITHUB_TOKEN;
  if (!token) throw new Error('SANTI_GITHUB_TOKEN not configured');
  return token;
}

async function githubFetch(path: string, init?: RequestInit): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function assertOk(status: number, json: unknown, action: string): void {
  if (status < 200 || status >= 300) {
    const message = (json as { message?: string })?.message ?? JSON.stringify(json);
    throw new Error(`GitHub API error (${action}, ${status}): ${message}`);
  }
}

export interface RepoFile {
  path: string;
  content: string;
  sha: string;
  truncated: boolean;
}

/** Reads a single file's content and blob sha (the sha is required to update
 * that same file later — GitHub rejects a content update without the sha of
 * what it's replacing, to guard against clobbering a change it hasn't seen). */
export async function readFile(path: string, ref: string = DEFAULT_BRANCH): Promise<RepoFile> {
  const { status, json } = await githubFetch(`/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref)}`);
  assertOk(status, json, `read ${path}`);
  const file = json as { content?: string; encoding?: string; sha: string; type: string; size: number };
  if (file.type !== 'file') throw new Error(`"${path}" is a ${file.type}, not a file`);
  const raw = Buffer.from(file.content ?? '', (file.encoding as BufferEncoding) ?? 'base64').toString('utf-8');
  // GitHub's Contents API omits inline content above ~1MB; nothing in this
  // codebase should ever hit that, but flagging it rather than silently
  // handing Santi a partial file to reason about.
  const truncated = raw.length === 0 && file.size > 0;
  return { path, content: raw, sha: file.sha, truncated };
}

export interface DirEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
}

export async function listDirectory(path: string, ref: string = DEFAULT_BRANCH): Promise<DirEntry[]> {
  const { status, json } = await githubFetch(`/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref)}`);
  assertOk(status, json, `list ${path}`);
  if (!Array.isArray(json)) throw new Error(`"${path}" is a file, not a directory`);
  return json.map((e: { name: string; path: string; type: string }) => ({ name: e.name, path: e.path, type: e.type === 'dir' ? 'dir' : 'file' }));
}

export interface CodeSearchMatch {
  path: string;
  snippet: string;
}

/** GitHub's code search index lags a few minutes behind pushes and is
 * eventually-consistent — a just-committed change may not show up
 * immediately. Fine for exploring existing code, not a substitute for
 * reading a file directly when the latest state matters. */
export async function searchCode(query: string): Promise<CodeSearchMatch[]> {
  const { status, json } = await githubFetch(`/search/code?q=${encodeURIComponent(query)}+repo:${OWNER}/${REPO}`);
  assertOk(status, json, `search "${query}"`);
  const items = (json as { items?: { path: string; text_matches?: { fragment: string }[] }[] }).items ?? [];
  return items.map(item => ({
    path: item.path,
    snippet: item.text_matches?.map(m => m.fragment).join(' … ') ?? '',
  }));
}

async function getBranchSha(branch: string): Promise<string> {
  const { status, json } = await githubFetch(`/repos/${OWNER}/${REPO}/git/ref/heads/${encodeURIComponent(branch)}`);
  assertOk(status, json, `look up branch "${branch}"`);
  return (json as { object: { sha: string } }).object.sha;
}

/** Creates a new branch off another branch's current tip (default: main). */
export async function createBranch(branchName: string, fromBranch: string = DEFAULT_BRANCH): Promise<void> {
  const baseSha = await getBranchSha(fromBranch);
  const { status, json } = await githubFetch(`/repos/${OWNER}/${REPO}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
  });
  assertOk(status, json, `create branch "${branchName}"`);
}

/** Creates or updates a single file on a branch in one commit. Resolves the
 * current blob sha itself when the file already exists — GitHub requires it
 * for an update but rejects it for a brand new file, so the caller shouldn't
 * have to know which case they're in. */
export async function writeFile(branch: string, path: string, content: string, message: string): Promise<void> {
  let sha: string | undefined;
  const existing = await githubFetch(`/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`);
  if (existing.status === 200) sha = (existing.json as { sha: string }).sha;
  else if (existing.status !== 404) assertOk(existing.status, existing.json, `check existing "${path}"`);

  const { status, json } = await githubFetch(`/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: Buffer.from(content, 'utf-8').toString('base64'),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
  assertOk(status, json, `write "${path}"`);
}

export interface PullRequestSummary {
  number: number;
  url: string;
  state: string;
  mergeable: boolean | null;
  title: string;
}

export async function createPullRequest(branch: string, title: string, body: string): Promise<PullRequestSummary> {
  const { status, json } = await githubFetch(`/repos/${OWNER}/${REPO}/pulls`, {
    method: 'POST',
    body: JSON.stringify({ title, body, head: branch, base: DEFAULT_BRANCH }),
  });
  assertOk(status, json, `open PR for "${branch}"`);
  const pr = json as { number: number; html_url: string; state: string; mergeable: boolean | null; title: string };
  return { number: pr.number, url: pr.html_url, state: pr.state, mergeable: pr.mergeable, title: pr.title };
}

export async function getPullRequest(prNumber: number): Promise<PullRequestSummary> {
  const { status, json } = await githubFetch(`/repos/${OWNER}/${REPO}/pulls/${prNumber}`);
  assertOk(status, json, `get PR #${prNumber}`);
  const pr = json as { number: number; html_url: string; state: string; mergeable: boolean | null; title: string };
  return { number: pr.number, url: pr.html_url, state: pr.state, mergeable: pr.mergeable, title: pr.title };
}

export async function listOpenPullRequests(): Promise<PullRequestSummary[]> {
  const { status, json } = await githubFetch(`/repos/${OWNER}/${REPO}/pulls?state=open&per_page=20`);
  assertOk(status, json, 'list open PRs');
  const prs = json as { number: number; html_url: string; state: string; mergeable: boolean | null; title: string }[];
  return prs.map(pr => ({ number: pr.number, url: pr.html_url, state: pr.state, mergeable: pr.mergeable, title: pr.title }));
}

export async function mergePullRequest(prNumber: number): Promise<{ merged: boolean; message: string }> {
  const { status, json } = await githubFetch(`/repos/${OWNER}/${REPO}/pulls/${prNumber}/merge`, {
    method: 'PUT',
    body: JSON.stringify({ merge_method: 'squash' }),
  });
  assertOk(status, json, `merge PR #${prNumber}`);
  const result = json as { merged: boolean; message: string };
  return { merged: result.merged, message: result.message };
}
