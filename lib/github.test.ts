import { describe, it, expect } from 'vitest';
import { commitFiles, dispatchWorkflow, latestWorkflowRun, readConfig, readFile, RefMovedError } from './github';

const cfg = { repo: 'owner/repo', branch: 'main', token: 'tok' };

/** A fake fetch that answers by URL and records what it was asked. */
const fakeGithub = (over: Record<string, { status?: number; body: unknown }> = {}) => {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const routes: Record<string, { status?: number; body: unknown }> = {
    'git/ref/heads/main': { body: { object: { sha: 'parent-sha' } } },
    'git/commits/parent-sha': { body: { tree: { sha: 'base-tree' } } },
    'git/trees': { body: { sha: 'new-tree' } },
    'git/commits': { body: { sha: 'new-commit' } },
    'git/refs/heads/main': { body: {} },
    ...over,
  };

  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, method, body });

    // Longest key first, so 'git/commits/parent-sha' wins over 'git/commits'.
    const key = Object.keys(routes)
      .sort((a, b) => b.length - a.length)
      .find((k) => url.includes(k) && !(k === 'git/commits' && method === 'GET'));
    const route = key ? routes[key] : { status: 404, body: {} };
    const status = route.status ?? 200;

    return {
      ok: status < 400,
      status,
      json: async () => route.body,
      text: async () => JSON.stringify(route.body),
    } as Response;
  }) as unknown as typeof fetch;

  return { calls, deps: { fetch: fetchImpl } };
};

describe('readConfig', () => {
  it('reads repo and token from the environment, defaulting the branch', () => {
    expect(readConfig({ GITHUB_TOKEN: 't', GITHUB_REPO: 'o/r' })).toEqual({
      token: 't',
      repo: 'o/r',
      branch: 'main',
    });
  });

  it('returns null when the deployment has no token, rather than throwing', () => {
    // A missing token is a deployment that cannot accept signups, which the
    // route reports as 503 — not a crash.
    expect(readConfig({ GITHUB_REPO: 'o/r' })).toBeNull();
    expect(readConfig({ GITHUB_TOKEN: 't' })).toBeNull();
  });
});

describe('readFile', () => {
  it('decodes base64 content, newlines and all', () => {
    const encoded = Buffer.from('{"hello":"world"}').toString('base64');
    // The API wraps base64 at 60 characters; an undecoded newline breaks it.
    const { deps } = fakeGithub({ 'contents/roster.json': { body: { content: `${encoded}\n`, encoding: 'base64' } } });
    return expect(readFile(cfg, 'roster.json', deps)).resolves.toBe('{"hello":"world"}');
  });

  it('reads the branch tip, not the default branch', async () => {
    const encoded = Buffer.from('[]').toString('base64');
    const { calls, deps } = fakeGithub({ 'contents/roster.json': { body: { content: encoded } } });
    await readFile({ ...cfg, branch: 'other' }, 'roster.json', deps);
    expect(calls[0].url).toContain('ref=other');
  });
});

describe('commitFiles', () => {
  it('writes every file in a single commit on top of the current tip', async () => {
    const { calls, deps } = fakeGithub();
    const sha = await commitFiles(
      cfg,
      [
        { path: 'roster.json', content: '[]' },
        { path: 'data/board.json', content: '{}' },
      ],
      'Add someone',
      deps,
    );

    expect(sha).toBe('new-commit');

    const tree = calls.find((c) => c.url.includes('git/trees'))!;
    expect(tree.body).toMatchObject({ base_tree: 'base-tree' });
    expect((tree.body as { tree: { path: string }[] }).tree.map((t) => t.path)).toEqual([
      'roster.json',
      'data/board.json',
    ]);

    const commit = calls.find((c) => c.url.includes('git/commits') && c.method === 'POST')!;
    expect(commit.body).toMatchObject({ tree: 'new-tree', parents: ['parent-sha'], message: 'Add someone' });
  });

  it('never force-updates the ref', async () => {
    const { calls, deps } = fakeGithub();
    await commitFiles(cfg, [{ path: 'a', content: 'b' }], 'msg', deps);
    const patch = calls.find((c) => c.method === 'PATCH')!;
    // Forcing would silently discard whatever commit won the race.
    expect(patch.body).toMatchObject({ sha: 'new-commit', force: false });
  });

  it('reports a lost race as retryable rather than as a generic failure', async () => {
    for (const status of [409, 422]) {
      const { deps } = fakeGithub({ 'git/refs/heads/main': { status, body: { message: 'conflict' } } });
      await expect(commitFiles(cfg, [{ path: 'a', content: 'b' }], 'msg', deps)).rejects.toBeInstanceOf(
        RefMovedError,
      );
    }
  });

  it('surfaces other failures with their status', async () => {
    const { deps } = fakeGithub({ 'git/trees': { status: 500, body: { message: 'boom' } } });
    await expect(commitFiles(cfg, [{ path: 'a', content: 'b' }], 'msg', deps)).rejects.toThrow('500');
  });
});

describe('latestWorkflowRun', () => {
  it('returns the newest run of the workflow', async () => {
    const { calls, deps } = fakeGithub({
      'actions/workflows/refresh.yml/runs': {
        body: { workflow_runs: [{ created_at: '2026-11-02T10:00:00Z', status: 'completed', id: 1 }] },
      },
    });
    expect(await latestWorkflowRun(cfg, 'refresh.yml', deps)).toEqual({
      createdAt: '2026-11-02T10:00:00Z',
      status: 'completed',
    });
    expect(calls[0].url).toContain('per_page=1');
  });

  it('returns null for a workflow that has never run', async () => {
    const { deps } = fakeGithub({ 'actions/workflows/refresh.yml/runs': { body: { workflow_runs: [] } } });
    expect(await latestWorkflowRun(cfg, 'refresh.yml', deps)).toBeNull();
  });
});

describe('dispatchWorkflow', () => {
  it('starts the workflow on the configured branch and accepts an empty 204', async () => {
    const { calls, deps } = fakeGithub({ 'actions/workflows/refresh.yml/dispatches': { status: 204, body: null } });
    await dispatchWorkflow(cfg, 'refresh.yml', deps);
    expect(calls[0]).toMatchObject({ method: 'POST', body: { ref: 'main' } });
  });

  it('does not mistake an Actions 422 for a lost commit race', async () => {
    // 422 here means the workflow cannot be dispatched — retrying a commit
    // would be the wrong response to it.
    const { deps } = fakeGithub({ 'actions/workflows/refresh.yml/dispatches': { status: 422, body: {} } });
    const err = await dispatchWorkflow(cfg, 'refresh.yml', deps).catch((e) => e);
    expect(err).not.toBeInstanceOf(RefMovedError);
    expect(String(err)).toContain('422');
  });
});
