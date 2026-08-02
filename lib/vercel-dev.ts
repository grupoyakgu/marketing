const VERCEL_API = 'https://api.vercel.com';

// Fixed identifiers for this specific Vercel project — not something that
// would ever change without this being an entirely different deployment,
// same reasoning as OWNER/REPO being hardcoded in lib/github-dev.ts.
const PROJECT_ID = 'prj_eZDzyi4vKndcTSN6swoDZFQFrZlX';
const TEAM_ID = 'team_J8Q23LGJRdcmEssr3McJzdXM';

function getToken(): string {
  const token = process.env.SANTI_VERCEL_TOKEN;
  if (!token) throw new Error('SANTI_VERCEL_TOKEN not configured');
  return token;
}

async function vercelFetch(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const query = new URLSearchParams({ teamId: TEAM_ID, ...params });
  const res = await fetch(`${VERCEL_API}${path}?${query}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (json as { error?: { message?: string } })?.error?.message ?? JSON.stringify(json);
    throw new Error(`Vercel API error (${res.status}): ${message}`);
  }
  return json;
}

export interface DeploymentSummary {
  id: string;
  url: string;
  state: string;
  target: string | null;
  createdAt: number;
  commitMessage?: string;
  commitSha?: string;
}

export async function listDeployments(limit: number = 10): Promise<DeploymentSummary[]> {
  const json = await vercelFetch('/v6/deployments', { projectId: PROJECT_ID, limit: String(limit) }) as {
    deployments: {
      uid: string; url: string; state: string; target: string | null; createdAt: number;
      meta?: { githubCommitMessage?: string; githubCommitSha?: string };
    }[];
  };
  return json.deployments.map(d => ({
    id: d.uid,
    url: d.url,
    state: d.state,
    target: d.target,
    createdAt: d.createdAt,
    commitMessage: d.meta?.githubCommitMessage,
    commitSha: d.meta?.githubCommitSha,
  }));
}

export interface LogLine {
  type: string;
  text: string;
  createdAt: number;
}

/** Build + runtime log lines for a deployment. Covers both: a failed build
 * shows up as "command"/stdout/stderr events here the same as a runtime
 * error would, so this one call handles either kind of investigation. */
export async function getDeploymentLogs(deploymentId: string, limit: number = 200): Promise<LogLine[]> {
  const json = await vercelFetch(`/v2/deployments/${deploymentId}/events`, { limit: String(limit) }) as
    { type?: string; text?: string; payload?: { text?: string }; created?: number }[];
  return json.map(e => ({
    type: e.type ?? 'unknown',
    text: e.text ?? e.payload?.text ?? '',
    createdAt: e.created ?? 0,
  }));
}
