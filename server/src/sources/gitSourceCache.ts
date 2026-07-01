import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "../config.js";

const execFileAsync = promisify(execFile);

type LoadSourceRepositoryFilesInput = {
  repositoryCloneUrl: string;
  repositoryBranch: string;
  filePaths: string[];
};

type SourceRepositoryFile = {
  filePath: string;
  blobSha: string;
  content: string;
};

export type SourceRepositorySnapshot = {
  repositoryPath: string;
  remoteCommitSha: string;
  fetched: boolean;
  files: Map<string, SourceRepositoryFile>;
};

export async function loadSourceRepositoryFiles(
  input: LoadSourceRepositoryFilesInput
): Promise<SourceRepositorySnapshot> {
  const remoteCommitSha = await getRemoteHeadSha(input.repositoryCloneUrl, input.repositoryBranch);
  const repositoryPath = getRepositoryCachePath(input.repositoryCloneUrl, input.repositoryBranch);
  const fetched = await syncRepositoryCache({
    repositoryCloneUrl: input.repositoryCloneUrl,
    repositoryBranch: input.repositoryBranch,
    repositoryPath,
    remoteCommitSha
  });
  const files = new Map<string, SourceRepositoryFile>();

  for (const filePath of input.filePaths) {
    const blobSha = await git(["-C", repositoryPath, "rev-parse", `HEAD:${filePath}`]);
    files.set(filePath, {
      filePath,
      blobSha,
      content: await readFile(resolveRepositoryFilePath(repositoryPath, filePath), "utf8")
    });
  }

  return {
    repositoryPath,
    remoteCommitSha,
    fetched,
    files
  };
}

async function getRemoteHeadSha(repositoryCloneUrl: string, repositoryBranch: string) {
  const output = await git(["ls-remote", repositoryCloneUrl, `refs/heads/${repositoryBranch}`]);
  const [sha] = output.split(/\s+/);

  if (!sha) {
    throw new Error(`Could not find ${repositoryBranch} in ${repositoryCloneUrl}.`);
  }

  return sha;
}

async function syncRepositoryCache(input: {
  repositoryCloneUrl: string;
  repositoryBranch: string;
  repositoryPath: string;
  remoteCommitSha: string;
}) {
  await mkdir(path.dirname(input.repositoryPath), { recursive: true });

  if (!(await isGitRepository(input.repositoryPath))) {
    await rm(input.repositoryPath, { recursive: true, force: true });
    await git([
      "clone",
      "--depth=1",
      "--single-branch",
      "--branch",
      input.repositoryBranch,
      input.repositoryCloneUrl,
      input.repositoryPath
    ]);
    await checkoutRemoteHead(input.repositoryPath, input.remoteCommitSha);
    return true;
  }

  const currentRemoteUrl = await tryGit(["-C", input.repositoryPath, "config", "--get", "remote.origin.url"]);
  if (currentRemoteUrl !== input.repositoryCloneUrl) {
    await rm(input.repositoryPath, { recursive: true, force: true });
    await git([
      "clone",
      "--depth=1",
      "--single-branch",
      "--branch",
      input.repositoryBranch,
      input.repositoryCloneUrl,
      input.repositoryPath
    ]);
    await checkoutRemoteHead(input.repositoryPath, input.remoteCommitSha);
    return true;
  }

  const currentHeadSha = await tryGit(["-C", input.repositoryPath, "rev-parse", "HEAD"]);
  if (currentHeadSha === input.remoteCommitSha) {
    return false;
  }

  await git(["-C", input.repositoryPath, "fetch", "--depth=1", "origin", input.repositoryBranch]);
  await checkoutRemoteHead(input.repositoryPath, input.remoteCommitSha);
  return true;
}

async function checkoutRemoteHead(repositoryPath: string, remoteCommitSha: string) {
  await git(["-C", repositoryPath, "checkout", "--detach", remoteCommitSha]);
}

function getRepositoryCachePath(repositoryCloneUrl: string, repositoryBranch: string) {
  const cacheRoot = path.resolve(config.sourceCacheDir);
  const hash = createHash("sha256")
    .update(`${repositoryCloneUrl}#${repositoryBranch}`)
    .digest("hex")
    .slice(0, 12);
  return path.join(cacheRoot, `${getRepositorySlug(repositoryCloneUrl)}-${hash}`);
}

function getRepositorySlug(repositoryCloneUrl: string) {
  try {
    const parsedUrl = new URL(repositoryCloneUrl);
    const segments = parsedUrl.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
    return sanitizePathSegment(segments.at(-1) ?? "source-repo");
  } catch {
    return sanitizePathSegment(path.basename(repositoryCloneUrl, ".git") || "source-repo");
  }
}

function sanitizePathSegment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "source-repo";
}

async function isGitRepository(repositoryPath: string) {
  try {
    await stat(path.join(repositoryPath, ".git"));
    return true;
  } catch {
    return false;
  }
}

function resolveRepositoryFilePath(repositoryPath: string, filePath: string) {
  const resolvedRepositoryPath = path.resolve(repositoryPath);
  const resolvedFilePath = path.resolve(resolvedRepositoryPath, filePath);

  if (resolvedFilePath !== resolvedRepositoryPath && !resolvedFilePath.startsWith(`${resolvedRepositoryPath}${path.sep}`)) {
    throw new Error(`Source file path escapes repository cache: ${filePath}`);
  }

  return resolvedFilePath;
}

async function tryGit(args: string[]) {
  try {
    return await git(args);
  } catch {
    return null;
  }
}

async function git(args: string[]) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      timeout: 120_000,
      maxBuffer: 20 * 1024 * 1024
    });

    return String(stdout).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Git command failed.";
    throw new Error(`git ${args.join(" ")} failed: ${message}`);
  }
}
