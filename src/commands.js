import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  allCards,
  byCreation,
  byRecency,
  createCard,
  formatCard,
  moveCardFile,
  readCards,
} from "./cards.js";
import {
  CliError,
  commit,
  ensureRepo,
  listNames,
  validateListName,
} from "./store.js";

export function lists(io) {
  const repo = ensureRepo();
  for (const name of listNames(repo)) {
    io.stdout.write(`${name}\n`);
  }
}

export function createList(io, name) {
  validateListName(name);
  const repo = ensureRepo();
  if (listNames(repo).includes(name)) {
    throw new CliError(`list already exists: ${name}`);
  }
  try {
    fs.mkdirSync(path.join(repo, name));
  } catch {
    throw new CliError(`cannot create list: ${name}`);
  }
  fs.writeFileSync(path.join(repo, name, ".gitkeep"), "");
  commit(repo, name, `Create list "${name}"`);
  io.stdout.write(`Created list "${name}"\n`);
}

export function removeList(io, name) {
  validateListName(name);
  const repo = ensureRepo();
  if (!listNames(repo).includes(name)) {
    throw new CliError(`list not found: ${name}`);
  }
  fs.rmSync(path.join(repo, name), { recursive: true, force: true });
  commit(repo, name, `Remove list "${name}"`);
  io.stdout.write(`Removed list "${name}"\n`);
}

export function cards(io, { all }) {
  const repo = ensureRepo();
  let result = byRecency(allCards(repo, listNames(repo)));
  if (!all) {
    result = result.slice(0, 10);
  }
  for (const card of result) {
    io.stdout.write(`${card.title}\n`);
  }
}

export function listCards(io, list) {
  validateListName(list);
  const repo = ensureRepo();
  if (!listNames(repo).includes(list)) {
    throw new CliError(`list not found: ${list}`);
  }
  for (const card of byCreation(readCards(repo, list))) {
    io.stdout.write(`${card.title}\n`);
  }
}

export function showCard(io, title) {
  const repo = ensureRepo();
  const matches = byRecency(allCards(repo, listNames(repo))).filter(
    (card) => card.title === title,
  );
  if (matches.length === 0) {
    throw new CliError(`card not found: ${title}`);
  }
  io.stdout.write(`${matches.map(formatCard).join("\n\n")}\n`);
}

export function createCardCommand(io, list, title) {
  validateListName(list);
  const repo = ensureRepo();
  if (!listNames(repo).includes(list)) {
    throw new CliError(`list not found: ${list}`);
  }
  const { file } = createCard(repo, list, title);
  commit(
    repo,
    path.join(list, file),
    `Create card "${title}" in list "${list}"`,
  );
  io.stdout.write(`Created card "${title}" in list "${list}"\n`);
}

export function removeCard(io, list, title) {
  validateListName(list);
  const repo = ensureRepo();
  if (!listNames(repo).includes(list)) {
    throw new CliError(`list not found: ${list}`);
  }
  const matches = readCards(repo, list).filter((card) => card.title === title);
  if (matches.length === 0) {
    throw new CliError(`card not found in list "${list}": ${title}`);
  }
  for (const match of matches) {
    fs.rmSync(path.join(repo, list, match.file));
  }
  commit(repo, list, `Remove card "${title}" from list "${list}"`);
  for (const match of matches) {
    io.stdout.write(`Removed card "${match.title}" from list "${list}"\n`);
  }
}

export function moveCard(io, fromList, title, toList) {
  validateListName(fromList);
  validateListName(toList);
  const repo = ensureRepo();
  const names = listNames(repo);
  if (!names.includes(fromList)) {
    throw new CliError(`list not found: ${fromList}`);
  }
  if (!names.includes(toList)) {
    throw new CliError(`list not found: ${toList}`);
  }
  if (fromList === toList) {
    throw new CliError(`cannot move a card to the same list: ${fromList}`);
  }
  const matches = readCards(repo, fromList).filter(
    (card) => card.title === title,
  );
  if (matches.length === 0) {
    throw new CliError(`card not found in list "${fromList}": ${title}`);
  }
  for (const match of matches) {
    moveCardFile(repo, fromList, toList, match.file);
  }
  commit(
    repo,
    [fromList, toList],
    `Move card "${title}" from list "${fromList}" to list "${toList}"`,
  );
  for (const match of matches) {
    io.stdout.write(
      `Moved card "${match.title}" from list "${fromList}" to list "${toList}"\n`,
    );
  }
}

export function git(io, args) {
  const repo = ensureRepo();
  const result = spawnSync("git", ["-C", repo, ...args], {
    stdio: ["inherit", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (result.error) {
    throw new CliError(`failed to run git: ${result.error.message}`);
  }
  if (result.stdout) {
    io.stdout.write(result.stdout);
  }
  if (result.stderr) {
    io.stderr.write(result.stderr);
  }
  return result.status ?? 1;
}
