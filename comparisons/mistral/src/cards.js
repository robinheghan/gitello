import fs from 'node:fs';
import path from 'node:path';

/** Fields every card JSON knows about; anything else lands on the `other:` line. */
export const KNOWN_FIELDS = ['title', 'description', 'comments', 'createdAt', 'updatedAt'];

/**
 * Sanitize a card title into a file name base: lowercase, runs of
 * non-alphanumeric characters become a single dash, no leading/trailing dash.
 */
export function slugify(title) {
  const slug = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'card';
}

/**
 * Pick a fresh `<slug>.json` file name inside `dir`, adding a numeric
 * suffix (`-2`, `-3`, ...) on collision with an existing file.
 */
export function uniqueFileName(dir, title) {
  const base = slugify(title);
  const taken = new Set(fs.existsSync(dir) ? fs.readdirSync(dir) : []);
  let name = `${base}.json`;
  let n = 2;
  while (taken.has(name)) {
    name = `${base}-${n}.json`;
    n += 1;
  }
  return name;
}

/**
 * Validate a list name: it becomes a folder in the data repo, so it must be a
 * single safe path segment.
 */
export function isValidListName(name) {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    !name.startsWith('.') &&
    !name.includes('/') &&
    !name.includes('\\') &&
    name !== '.' &&
    name !== '..'
  );
}

/** List all list names (folders in the data repo), alphabetically. */
export function listNames(repoDir) {
  return fs
    .readdirSync(repoDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== '.git')
    .map((e) => e.name)
    .sort();
}

export function listExists(repoDir, name) {
  return (
    fs.existsSync(path.join(repoDir, name)) && fs.statSync(path.join(repoDir, name)).isDirectory()
  );
}

/** Read and parse a card JSON file. */
export function readCard(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * All cards of a list as `{ file, card }` entries, in creation order
 * (by createdAt, then file name).
 */
export function cardsInList(repoDir, list) {
  const dir = path.join(repoDir, list);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const entries = files.map((f) => ({
    file: path.join(dir, f),
    card: readCard(path.join(dir, f))
  }));
  entries.sort((a, b) => {
    const ca = a.card.createdAt ?? '';
    const cb = b.card.createdAt ?? '';
    if (ca !== cb) return ca < cb ? -1 : 1;
    return a.file < b.file ? -1 : 1;
  });
  return entries;
}

/** All cards of all lists, most recently updated first. */
export function allCards(repoDir) {
  const entries = [];
  for (const list of listNames(repoDir)) {
    for (const entry of cardsInList(repoDir, list)) {
      entries.push({ list, ...entry });
    }
  }
  entries.sort((a, b) => {
    const ua = a.card.updatedAt ?? '';
    const ub = b.card.updatedAt ?? '';
    if (ua !== ub) return ua < ub ? 1 : -1;
    return a.file < b.file ? -1 : 1;
  });
  return entries;
}

/** Cards in a list whose title matches exactly. */
export function findCards(repoDir, list, title) {
  return cardsInList(repoDir, list).filter((e) => e.card.title === title);
}

/** Create a new card object with timestamps set to now. */
export function newCard(title) {
  const now = new Date().toISOString();
  return { title, description: '', comments: [], createdAt: now, updatedAt: now };
}

/** Write a card object to a file. */
export function writeCard(file, card) {
  fs.writeFileSync(file, JSON.stringify(card, null, 2) + '\n');
}

/**
 * Format a card the way `gitello cards show <title>` prints it:
 *
 *   <title>
 *
 *   <description>
 *
 *   created: <createdAt>
 *   modified: <updatedAt>
 *   other: <json of any extra metadata>   (only when extra metadata exists)
 *
 *   ...comments, one per line (strings as-is, objects as JSON)...
 */
export function formatCard(card) {
  const lines = [card.title ?? '', '', ...String(card.description ?? '').split('\n'), ''];
  lines.push(`created: ${card.createdAt ?? ''}`);
  lines.push(`modified: ${card.updatedAt ?? ''}`);
  const other = {};
  for (const [k, v] of Object.entries(card)) {
    if (!KNOWN_FIELDS.includes(k)) other[k] = v;
  }
  if (Object.keys(other).length > 0) {
    lines.push(`other: ${JSON.stringify(other)}`);
  }
  lines.push('');
  for (const comment of card.comments ?? []) {
    lines.push(typeof comment === 'string' ? comment : JSON.stringify(comment));
  }
  return lines.join('\n');
}

/**
 * Parse the comments field of the edit modal: one comment per line.
 * Lines that look like JSON are parsed back into objects so object comments
 * round-trip through the editor.
 */
export function parseComments(text) {
  return String(text)
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const t = line.trim();
      if (t.startsWith('{') || t.startsWith('[')) {
        try {
          return JSON.parse(t);
        } catch {
          return line;
        }
      }
      return line;
    });
}

/** Render comments for the edit modal: one per line, objects as JSON. */
export function formatComments(comments) {
  return (comments ?? []).map((c) => (typeof c === 'string' ? c : JSON.stringify(c))).join('\n');
}

/**
 * Build the updated card object from edit-modal field values.
 * Preserves createdAt and any extra metadata, bumps updatedAt.
 */
export function serializeEdit(card, { title, description, comments }) {
  const now = new Date().toISOString();
  const next = { ...card };
  next.title = title;
  next.description = description;
  next.comments = comments;
  next.updatedAt = now;
  return next;
}

/** Validate edit-modal field values; returns an error message or null. */
export function validateEdit({ title }) {
  if (!title || !title.trim()) return 'title must not be empty';
  return null;
}
