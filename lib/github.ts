/**
 * Minimal GitHub REST client for the author endpoints. Server-only in
 * practice (imported solely by app/api/** route handlers), but it reads NO
 * environment variables itself — the token and repo coordinates are passed
 * in by the caller, so this file never touches any secret and can't leak it.
 */

export interface GithubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

export interface GithubContentEntry {
  name: string;
  path: string;
  type: string;
}

export interface GithubFile {
  sha: string;
  /** Decoded UTF-8 file contents. */
  text: string;
}

const API_ROOT = "https://api.github.com";

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "serpent-alphabet-author",
  };
}

export class GithubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GithubError";
  }
}

async function ghFetch(
  config: GithubConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: { ...headers(config.token), ...(init?.headers ?? {}) },
    cache: "no-store",
  });
}

/** List entries of a directory in the repo at the configured branch. */
export async function listDirectory(
  config: GithubConfig,
  dirPath: string,
): Promise<GithubContentEntry[]> {
  const res = await ghFetch(
    config,
    `/repos/${config.owner}/${config.repo}/contents/${dirPath}?ref=${encodeURIComponent(config.branch)}`,
  );
  if (!res.ok) {
    throw new GithubError(
      `Failed to list ${dirPath}: ${res.status} ${res.statusText}`,
      res.status,
    );
  }
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new GithubError(`Expected a directory listing for ${dirPath}`, 500);
  }
  return data as GithubContentEntry[];
}

/** Fetch one file's decoded content + sha. Throws GithubError(404) if absent. */
export async function getFile(
  config: GithubConfig,
  filePath: string,
): Promise<GithubFile> {
  const res = await ghFetch(
    config,
    `/repos/${config.owner}/${config.repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, "/")}?ref=${encodeURIComponent(config.branch)}`,
  );
  if (!res.ok) {
    throw new GithubError(
      `Failed to read ${filePath}: ${res.status} ${res.statusText}`,
      res.status,
    );
  }
  const data = (await res.json()) as { content?: string; sha?: string };
  if (typeof data.content !== "string" || typeof data.sha !== "string") {
    throw new GithubError(`Unexpected file response for ${filePath}`, 500);
  }
  const text = Buffer.from(data.content, "base64").toString("utf-8");
  return { sha: data.sha, text };
}

/**
 * Create or update a file. Returns the new commit sha. On a 409 (the sha
 * moved underneath us) the caller is expected to re-read and retry.
 */
export async function putFile(
  config: GithubConfig,
  filePath: string,
  text: string,
  sha: string,
  message: string,
): Promise<{ commitSha: string | null }> {
  const res = await ghFetch(
    config,
    `/repos/${config.owner}/${config.repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, "/")}`,
    {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: Buffer.from(text, "utf-8").toString("base64"),
        sha,
        branch: config.branch,
      }),
    },
  );
  if (!res.ok) {
    throw new GithubError(
      `Failed to write ${filePath}: ${res.status} ${res.statusText}`,
      res.status,
    );
  }
  const data = (await res.json()) as { commit?: { sha?: string } };
  return { commitSha: data.commit?.sha ?? null };
}
