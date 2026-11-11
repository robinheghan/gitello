import fs from 'node:fs';
import path from 'node:path';

export const KNOWN_FIELDS = [
  'title',
  'description',
  'comments',
  'createdAt',
  'updatedAt',
];

// Turn a title into a slug usable as a file name.
export function sanitize(title) {
  const slug = String(title)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'card';
}

export function cardFileName(title) {
  return `${sanitize(title)}.json`;
}

function existingNames(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return new Set();
  }
  const lower = new Set();
  for (const name of names) {
    lower.add(name.toLowerCase());
  }
  return lower;
}

// Shared by create and move: pick a file name based on the given slug,
// appending -2, -3, ... when the name is already taken in the directory.
export function uniqueFileName(dir, slug) {
  const taken = existingNames(dir);
  let name = slug;
  let count = 1;
  while (taken.has(`${name}.json`.toLowerCase())) {
    count += 1;
    name = `${slug}-${count}`;
  }
  return `${name}.json`;
}

export function readCard(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeCard(filePath, card) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(card, null, 2)}\n`);
}

export function createCard(listDir, title) {
  const fileName = uniqueFileName(listDir, sanitize(title));
  const filePath = path.join(listDir, fileName);
  const now = new Date().toISOString();
  const card = {
    title,
    description: '',
    comments: [],
    createdAt: now,
    updatedAt: now,
  };
  writeCard(filePath, card);
  return { fileName, filePath, card };
}

// Move a card file into another list folder, renaming on collision.
export function moveCardFile(fromPath, toDir) {
  const slug = path.basename(fromPath).replace(/\.json$/, '');
  const fileName = uniqueFileName(toDir, slug);
  const toPath = path.join(toDir, fileName);
  fs.mkdirSync(toDir, { recursive: true });
  fs.renameSync(fromPath, toPath);
  return toPath;
}

// Write the card JSON, bumping updatedAt, keeping createdAt and any
// extra metadata.
export function updateCard(filePath, patch = {}) {
  const card = readCard(filePath);
  if (!card || typeof card !== 'object') {
    throw new Error(`invalid card file: ${filePath}`);
  }
  const updated = { ...card };
  if (patch.title !== undefined) {
    updated.title = patch.title;
  }
  if (patch.description !== undefined) {
    updated.description = patch.description;
  }
  if (patch.comments !== undefined) {
    updated.comments = patch.comments;
  }
  updated.updatedAt = new Date().toISOString();
  writeCard(filePath, updated);
  return updated;
}

const value = (v) => (v === undefined || v === null ? '' : v);

// The created:/modified: lines, plus a single other: line when the card
// carries metadata beyond the known fields.
export function formatMeta(card) {
  const lines = [
    `created: ${value(card.createdAt)}`,
    `modified: ${value(card.updatedAt)}`,
  ];
  const other = {};
  for (const key of Object.keys(card)) {
    if (!KNOWN_FIELDS.includes(key)) {
      other[key] = card[key];
    }
  }
  if (Object.keys(other).length > 0) {
    lines.push(`other: ${JSON.stringify(other)}`);
  }
  return lines.join('\n');
}

// One line per comment: strings as-is, objects as JSON.
export function formatComments(comments) {
  if (!Array.isArray(comments)) {
    return [];
  }
  return comments.map((comment) =>
    typeof comment === 'string' ? comment : JSON.stringify(comment),
  );
}

export function formatCard(card) {
  if (!card || typeof card !== 'object') {
    return '';
  }
  const comments = formatComments(card.comments).join('\n');
  return [
    value(card.title),
    '',
    value(card.description),
    '',
    formatMeta(card),
    '',
    comments,
  ]
    .join('\n')
    .replace(/\n+$/, '');
}

// Turn textarea lines back into a comments array. A line that parses
// as a JSON object becomes an object, everything else stays a string.
export function parseComments(text) {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      try {
        const parsed = JSON.parse(line);
        if (parsed !== null && typeof parsed === 'object') {
          return parsed;
        }
      } catch {
        // not JSON, keep the plain string
      }
      return line;
    });
}
