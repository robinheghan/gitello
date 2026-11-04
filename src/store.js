import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export class CliError extends Error {}

export function repoPath() {
  return process.env.GITELLO_PATH ?? path.join(os.homedir(), ".gitello");
}

export function git(repo, args) {
  try {
    return execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = error.stderr?.toString().trim();
    throw new CliError(
      stderr
        ? `git ${args.join(" ")} failed: ${stderr}`
        : `git ${args.join(" ")} failed: ${error.message}`,
    );
  }
}

function gitConfigValue(repo, key) {
  const result = spawnSync("git", ["-C", repo, "config", key], {
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function ensureRepo() {
  const repo = repoPath();
  if (!fs.existsSync(path.join(repo, ".git"))) {
    fs.mkdirSync(repo, { recursive: true });
    try {
      execFileSync("git", ["init", "-b", "main", repo], { stdio: "ignore" });
    } catch {
      execFileSync("git", ["init", repo], { stdio: "ignore" });
    }
    if (!gitConfigValue(repo, "user.name")) {
      git(repo, ["config", "user.name", "gitello"]);
    }
    if (!gitConfigValue(repo, "user.email")) {
      git(repo, ["config", "user.email", "gitello@localhost"]);
    }
  }
  return repo;
}

export function commit(repo, relativePaths, message) {
  const paths = Array.isArray(relativePaths) ? relativePaths : [relativePaths];
  git(repo, ["add", "--", ...paths]);
  git(repo, ["commit", "-m", message, "--", ...paths]);
}

export function listNames(repo) {
  return fs
    .readdirSync(repo, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
}

export function validateListName(name) {
  if (
    !name ||
    name === "." ||
    name === ".." ||
    name.startsWith(".") ||
    name.startsWith("-") ||
    name.includes("/")
  ) {
    throw new CliError(`invalid list name: ${JSON.stringify(name)}`);
  }
}
