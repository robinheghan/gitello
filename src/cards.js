import fs from "node:fs";
import path from "node:path";
import { CliError } from "./store.js";

export function slugify(title) {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug === "" ? "card" : slug;
}

export function readCards(repo, list) {
  const dir = path.join(repo, list);
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => {
      let card;
      try {
        card = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      } catch {
        throw new CliError(`invalid card file: ${path.join(list, file)}`);
      }
      return { ...card, list, file };
    });
}

export function allCards(repo, lists) {
  return lists.flatMap((list) => readCards(repo, list));
}

const CARD_FIELDS = new Set([
  "title",
  "description",
  "comments",
  "createdAt",
  "updatedAt",
  "list",
  "file",
]);

export function formatCard(card) {
  const lines = [
    String(card.title ?? ""),
    "",
    String(card.description ?? ""),
    "",
    `created: ${card.createdAt ?? ""}`,
    `modified: ${card.updatedAt ?? ""}`,
  ];
  const other = Object.fromEntries(
    Object.entries(card).filter(([key]) => !CARD_FIELDS.has(key)),
  );
  if (Object.keys(other).length > 0) {
    lines.push(`other: ${JSON.stringify(other)}`);
  }
  lines.push("");
  const comments = Array.isArray(card.comments) ? card.comments : [];
  for (const comment of comments) {
    lines.push(typeof comment === "string" ? comment : JSON.stringify(comment));
  }
  return lines.join("\n");
}

export function byRecency(cards) {
  return [...cards].sort((a, b) => {
    const aTime = String(a.updatedAt ?? a.createdAt ?? "");
    const bTime = String(b.updatedAt ?? b.createdAt ?? "");
    return (
      bTime.localeCompare(aTime) ||
      String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")) ||
      a.list.localeCompare(b.list) ||
      a.file.localeCompare(b.file)
    );
  });
}

export function byCreation(cards) {
  return [...cards].sort(
    (a, b) =>
      String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) ||
      a.file.localeCompare(b.file),
  );
}

function uniqueFileName(dir, base) {
  let file = `${base}.json`;
  let counter = 2;
  while (fs.existsSync(path.join(dir, file))) {
    file = `${base}-${counter}.json`;
    counter += 1;
  }
  return file;
}

export function createCard(repo, list, title) {
  if (!title) {
    throw new CliError("card title must not be empty");
  }
  const dir = path.join(repo, list);
  const file = uniqueFileName(dir, slugify(title));
  const now = new Date().toISOString();
  const card = {
    title,
    description: "",
    comments: [],
    createdAt: now,
    updatedAt: now,
  };
  fs.writeFileSync(path.join(dir, file), JSON.stringify(card, null, 2) + "\n");
  return { card, file };
}

export function moveCardFile(repo, fromList, toList, file) {
  const targetDir = path.join(repo, toList);
  const target = uniqueFileName(targetDir, file.replace(/\.json$/, ""));
  fs.renameSync(path.join(repo, fromList, file), path.join(targetDir, target));
  return target;
}
