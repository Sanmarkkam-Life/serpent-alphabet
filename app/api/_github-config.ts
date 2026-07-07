import type { GithubConfig } from "@/lib/github";

/**
 * Resolve GitHub coordinates + token from the environment. This module lives
 * under app/api/** so the GITHUB_TOKEN reference stays out of the client
 * bundle. It is imported only by the server-side route handlers.
 */

export const DEFAULT_OWNER = "Sanmarkkam-Life";
export const DEFAULT_REPO = "serpent-alphabet";
export const DEFAULT_BRANCH = "main";

/**
 * Returns the config, or null when GITHUB_TOKEN is not set (callers should
 * surface a clear 500 so setup problems are obvious rather than silent).
 */
export function resolveGithubConfig(): GithubConfig | null {
  const token = process.env.GITHUB_TOKEN;
  if (!token || token.trim() === "") return null;
  return {
    token,
    owner: process.env.GITHUB_REPO_OWNER || DEFAULT_OWNER,
    repo: process.env.GITHUB_REPO_NAME || DEFAULT_REPO,
    branch: process.env.GITHUB_BRANCH || DEFAULT_BRANCH,
  };
}
