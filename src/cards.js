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

export function formatComments(comments) {
  const list = Array.isArray(comments) ? comments : [];
  return list
    .map((comment) =>
      typeof comment === "string" ? comment : JSON.stringify(comment),
    )
    .join("\n");
}

export function parseComments(text) {
  return String(text ?? "")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          return JSON.parse(trimmed);
        } catch {
          return line;
        }
      }
      return line;
    });
}

function metaLines(card) {
  const other = Object.fromEntries(
    Object.entries(card).filter(([key]) => !CARD_FIELDS.has(key)),
  );
  const lines = [
    `created: ${card.createdAt ?? ""}`,
    `modified: ${card.updatedAt ?? ""}`,
  ];
  if (Object.keys(other).length > 0) {
    lines.push(`other: ${JSON.stringify(other)}`);
  }
  return lines;
}

export function formatMeta(card) {
  return metaLines(card).join(" · ");
}

export function formatCard(card) {
  const comments = Array.isArray(card.comments) ? card.comments : [];
  const lines = [
    String(card.title ?? ""),
    "",
    String(card.description ?? ""),
    "",
    ...metaLines(card),
    "",
  ];
  if (comments.length > 0) {
    lines.push(formatComments(comments));
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

export function updateCard(repo, list, file, changes) {
  const filePath = path.join(repo, list, file);
  let card;
  try {
    card = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    throw new CliError(`invalid card file: ${path.join(list, file)}`);
  }
  const { title, description, comments } = changes;
  if (title !== undefined) {
    if (!String(title).trim()) {
      throw new CliError("card title must not be empty");
    }
    card.title = String(title);
  }
  if (description !== undefined) {
    card.description = String(description);
  }
  if (comments !== undefined) {
    card.comments = Array.isArray(comments) ? comments : [];
  }
  card.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(card, null, 2) + "\n");
  return card;
}
