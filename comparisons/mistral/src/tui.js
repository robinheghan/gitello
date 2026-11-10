import fs from 'node:fs';
import path from 'node:path';
import blessed from '@blessed/neo-blessed';
import {
  KNOWN_FIELDS,
  cardsInList,
  formatComments,
  listNames,
  parseComments,
  serializeEdit,
  slugify,
  uniqueFileName,
  validateEdit,
  writeCard
} from './cards.js';
import { autoCommit, ensureRepo } from './store.js';

// ---------------------------------------------------------------------------
// Pure logic (unit-testable without a TTY)
// ---------------------------------------------------------------------------

export const QUIT_KEYS = ['q', 'escape', 'C-c'];
export const LEFT_KEYS = ['h', 'left'];
export const RIGHT_KEYS = ['l', 'right'];
export const DOWN_KEYS = ['j', 'down'];
export const UP_KEYS = ['k', 'up'];
export const MOVE_CARD_LEFT_KEYS = ['S-h', 'S-left'];
export const MOVE_CARD_RIGHT_KEYS = ['S-l', 'S-right'];
// Vertical shift-moves are no-ops: a card can only move between lists.
export const SHIFT_VERTICAL_KEYS = ['S-j', 'S-k', 'S-up', 'S-down'];
export const MODAL_FIELDS = ['title', 'description', 'comments'];

export const HELP_TEXT =
  'h/l or ←/→: list · j/k or ↑/↓: card · S-h/S-l: move card to list · ' +
  'space: view/edit card · in modal: tab/S-tab: field, enter: save, C-q: discard · q: quit';

/** Build the board model: every list with its cards (creation order). */
export function buildModel(repoDir) {
  return {
    lists: listNames(repoDir).map((name) => ({ name, cards: cardsInList(repoDir, name) }))
  };
}

export function initialState() {
  return { listIndex: 0, cardIndex: 0, modal: null };
}

/** Keep indices inside the model after it changed (e.g. after a move). */
export function clampState(state, model) {
  const listIndex = Math.max(0, Math.min(state.listIndex, Math.max(0, model.lists.length - 1)));
  const cards = model.lists[listIndex] ? model.lists[listIndex].cards : [];
  const cardIndex = Math.max(0, Math.min(state.cardIndex, Math.max(0, cards.length - 1)));
  return { ...state, listIndex, cardIndex };
}

/**
 * Render one board column to plain lines: one `{ text, selected }` per card.
 */
export function renderColumn(list, selectedIndex) {
  return list.cards.map((entry, i) => ({
    text: entry.card.title,
    selected: i === selectedIndex
  }));
}

/**
 * Apply a key (neo-blessed `key.full` name) to the state.
 * Returns `{ state, action }` where action is one of:
 *   null | { type: 'quit' }
 *        | { type: 'moveCard', fromIndex, toIndex, cardIndex }
 *        | { type: 'openCard', listIndex, cardIndex }
 *        | { type: 'focusField', fieldIndex }
 *        | { type: 'saveCard' }
 *        | { type: 'closeModal' }
 */
export function applyKey(state, key, model) {
  if (state.modal) {
    // While the modal is open, navigation and move keys are ignored.
    if (QUIT_KEYS.includes(key)) return { state, action: { type: 'quit' } };
    if (state.modal.mode === 'edit') {
      if (key === 'tab') {
        const fieldIndex = (state.modal.fieldIndex + 1) % MODAL_FIELDS.length;
        return {
          state: { ...state, modal: { ...state.modal, fieldIndex } },
          action: { type: 'focusField', fieldIndex }
        };
      }
      if (key === 'S-tab') {
        const fieldIndex = (state.modal.fieldIndex + MODAL_FIELDS.length - 1) % MODAL_FIELDS.length;
        return {
          state: { ...state, modal: { ...state.modal, fieldIndex } },
          action: { type: 'focusField', fieldIndex }
        };
      }
      if (key === 'enter' || key === 'return') {
        return { state, action: { type: 'saveCard' } };
      }
      if (key === 'C-q') {
        return {
          state: { ...state, modal: null },
          action: { type: 'closeModal' }
        };
      }
    }
    return { state, action: null };
  }

  const lists = model.lists;
  if (QUIT_KEYS.includes(key)) return { state, action: { type: 'quit' } };
  if (lists.length === 0) return { state, action: null };

  const listIndex = state.listIndex;
  const cardIndex = state.cardIndex;

  if (LEFT_KEYS.includes(key)) {
    return {
      state: { ...state, listIndex: Math.max(0, listIndex - 1), cardIndex: 0 },
      action: null
    };
  }
  if (RIGHT_KEYS.includes(key)) {
    return {
      state: { ...state, listIndex: Math.min(lists.length - 1, listIndex + 1), cardIndex: 0 },
      action: null
    };
  }
  if (DOWN_KEYS.includes(key)) {
    const len = lists[listIndex].cards.length;
    return {
      state: { ...state, cardIndex: Math.min(Math.max(0, len - 1), cardIndex + 1) },
      action: null
    };
  }
  if (UP_KEYS.includes(key)) {
    return { state: { ...state, cardIndex: Math.max(0, cardIndex - 1) }, action: null };
  }
  if (MOVE_CARD_LEFT_KEYS.includes(key)) {
    if (listIndex === 0) return { state, action: null };
    return {
      state,
      action: { type: 'moveCard', fromIndex: listIndex, toIndex: listIndex - 1, cardIndex }
    };
  }
  if (MOVE_CARD_RIGHT_KEYS.includes(key)) {
    if (listIndex >= lists.length - 1) return { state, action: null };
    return {
      state,
      action: { type: 'moveCard', fromIndex: listIndex, toIndex: listIndex + 1, cardIndex }
    };
  }
  if (SHIFT_VERTICAL_KEYS.includes(key)) {
    return { state, action: null };
  }
  if (key === 'space') {
    if (lists[listIndex].cards.length === 0) return { state, action: null };
    return {
      state: { ...state, modal: { mode: 'edit', fieldIndex: 0 } },
      action: { type: 'openCard', listIndex, cardIndex }
    };
  }
  return { state, action: null };
}

/** Read-only metadata footer of the card modal (same lines as `cards show`). */
export function formatMeta(card) {
  const lines = [`created: ${card.createdAt ?? ''}`, `modified: ${card.updatedAt ?? ''}`];
  const other = {};
  for (const [k, v] of Object.entries(card)) {
    if (!KNOWN_FIELDS.includes(k)) other[k] = v;
  }
  if (Object.keys(other).length > 0) lines.push(`other: ${JSON.stringify(other)}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// TUI wiring (neo-blessed)
// ---------------------------------------------------------------------------

// Keys that must reach the screen handler even while an input field has
// grabbed the keyboard (screen `ignoreLocked` list).
const IGNORE_LOCKED = ['tab', 'S-tab', 'enter', 'return', 'C-q', 'q', 'escape', 'C-c', 'space'];
// Control keys whose reading must be ended synchronously so the key itself
// is not inserted into the focused field.
const END_READING_KEYS = ['tab', 'S-tab', 'enter', 'return', 'C-q', 'q', 'escape', 'C-c'];

export function launch() {
  const repo = ensureRepo();
  let model = buildModel(repo);
  let state = initialState();

  // `extended: false` skips the extended terminfo section entirely: modern
  // terminfo entries contain a `Setulc` capability whose parameterized string
  // makes neo-blessed's terminfo compiler emit invalid JS and print an
  // `Error on <term>.Setulc:` dump on startup. gitello uses no extended
  // capabilities, so nothing is lost. (The program is constructed explicitly
  // because `blessed.screen()` does not forward the option to the program.)
  const program = blessed.program({ extended: false });
  const screen = blessed.screen({
    smartCSR: true,
    extended: false,
    program,
    title: 'gitello',
    ignoreLocked: IGNORE_LOCKED
  });

  const helpBar = blessed.box({
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: HELP_TEXT,
    tags: false,
    style: { fg: 'white', bg: 'blue' }
  });
  screen.append(helpBar);

  let columns = [];
  let emptyHint = null;
  let modal = null;
  let modalFields = [];
  let modalContext = null; // { listName, file, card }

  function setHelp(content) {
    helpBar.setContent(content ?? HELP_TEXT);
  }

  function render() {
    for (const col of columns) col.destroy();
    columns = [];
    if (emptyHint) {
      emptyHint.destroy();
      emptyHint = null;
    }
    if (model.lists.length === 0) {
      emptyHint = blessed.box({
        top: 'center',
        left: 'center',
        width: 'shrink',
        height: 'shrink',
        content: 'No lists yet — create one with: gitello lists create <name>',
        tags: false,
        style: { fg: 'gray' }
      });
      screen.append(emptyHint);
    } else {
      const n = model.lists.length;
      const colWidth = Math.max(12, Math.floor(screen.width / n));
      model.lists.forEach((list, i) => {
        const active = i === state.listIndex;
        const lines = renderColumn(list, state.cardIndex);
        const col = blessed.list({
          top: 0,
          left: Math.min(i * colWidth, Math.max(0, screen.width - colWidth)),
          width: colWidth,
          height: '100%-1',
          label: ` ${list.name} `,
          border: { type: 'line' },
          tags: false,
          keys: false,
          mouse: false,
          items: lines.map((l) => l.text),
          style: {
            border: { fg: active ? 'cyan' : 'gray' },
            label: { fg: active ? 'cyan' : 'gray', bold: active },
            selected: { inverse: true }
          }
        });
        if (lines.length > 0) col.select(Math.min(state.cardIndex, lines.length - 1));
        screen.append(col);
        columns.push(col);
      });
    }
    screen.render();
  }

  /** End the focused input field's reading synchronously (key not inserted). */
  function endReading(el) {
    if (!el || !el._reading) return;
    el._reading = false;
    if (el.__listener) el.removeListener('keypress', el.__listener);
    delete el.__listener;
    delete el.__done;
    screen.grabKeys = false;
    screen.program.hideCursor();
  }

  function destroyModal() {
    if (modal) {
      modal.destroy();
      modal = null;
      modalFields = [];
      modalContext = null;
    }
  }

  function openCard(listIndex, cardIndex) {
    const list = model.lists[listIndex];
    const entry = list && list.cards[cardIndex];
    if (!entry) return;
    const card = entry.card;
    modalContext = { listName: list.name, file: entry.file, card };
    modal = blessed.box({
      top: 'center',
      left: 'center',
      width: '70%',
      height: '70%',
      label: ` ${card.title} `,
      border: { type: 'line' },
      scrollable: true,
      alwaysScroll: true,
      tags: false, // card text must never be parsed as blessed tags
      style: { border: { fg: 'cyan' } }
    });
    const titleInput = blessed.textbox({
      parent: modal,
      top: 0,
      left: 0,
      width: '100%-2',
      height: 3,
      label: ' Title ',
      value: card.title ?? '',
      inputOnFocus: true,
      border: { type: 'line' },
      tags: false,
      style: { border: { fg: 'gray' }, focus: { border: { fg: 'cyan' } } }
    });
    const descInput = blessed.textarea({
      parent: modal,
      top: 3,
      left: 0,
      width: '100%-2',
      height: 6,
      label: ' Description ',
      value: card.description ?? '',
      inputOnFocus: true,
      border: { type: 'line' },
      tags: false,
      style: { border: { fg: 'gray' }, focus: { border: { fg: 'cyan' } } }
    });
    const commentsInput = blessed.textarea({
      parent: modal,
      top: 9,
      left: 0,
      width: '100%-2',
      height: 6,
      label: ' Comments (one per line) ',
      value: formatComments(card.comments),
      inputOnFocus: true,
      border: { type: 'line' },
      tags: false,
      style: { border: { fg: 'gray' }, focus: { border: { fg: 'cyan' } } }
    });
    const metaBox = blessed.box({
      parent: modal,
      bottom: 0,
      left: 0,
      width: '100%-2',
      height: 'shrink',
      content: formatMeta(card),
      tags: false,
      style: { fg: 'gray' }
    });
    modalFields = [titleInput, descInput, commentsInput];
    screen.append(modal);
    modalFields[state.modal.fieldIndex].focus();
    screen.render();
  }

  function saveCard() {
    if (!modalContext || modalFields.length !== MODAL_FIELDS.length) return;
    const [titleInput, descInput, commentsInput] = modalFields;
    const fields = {
      title: titleInput.value,
      description: descInput.value,
      comments: parseComments(commentsInput.value)
    };
    const error = validateEdit(fields);
    if (error) {
      // Rejected: show a hint in the help line and keep the modal open.
      setHelp(`Error: ${error} · ${HELP_TEXT}`);
      modalFields[state.modal.fieldIndex].focus();
      screen.render();
      return;
    }
    const { listName, file, card } = modalContext;
    const updated = serializeEdit(card, fields);
    const dir = path.dirname(file);
    let newFile = file;
    if (slugify(fields.title) !== slugify(card.title)) {
      // Keep the file name in sync with the (sanitized) title.
      newFile = path.join(dir, uniqueFileName(dir, fields.title));
      fs.renameSync(file, newFile);
    }
    writeCard(newFile, updated);
    const paths = newFile === file ? [file] : [file, newFile];
    autoCommit(paths, `Update card "${fields.title}" in list "${listName}"`);
    destroyModal();
    state = { ...state, modal: null };
    model = buildModel(repo);
    state = clampState(state, model);
    setHelp();
  }

  function performMove(action) {
    const fromList = model.lists[action.fromIndex];
    const toList = model.lists[action.toIndex];
    const entry = fromList && fromList.cards[action.cardIndex];
    if (!fromList || !toList || !entry) return;
    const toDir = path.join(repo, toList.name);
    const toFile = path.join(toDir, uniqueFileName(toDir, entry.card.title));
    fs.renameSync(entry.file, toFile);
    autoCommit(
      [entry.file, toFile],
      `Move card "${entry.card.title}" from "${fromList.name}" to "${toList.name}"`
    );
    model = buildModel(repo);
    state = { ...state, listIndex: action.toIndex };
    state = clampState(state, model);
  }

  function handleAction(action) {
    switch (action.type) {
      case 'quit':
        destroyModal();
        screen.destroy();
        process.exit(0);
        break;
      case 'moveCard':
        performMove(action);
        break;
      case 'openCard':
        openCard(action.listIndex, action.cardIndex);
        break;
      case 'focusField':
        if (modalFields[action.fieldIndex]) modalFields[action.fieldIndex].focus();
        break;
      case 'saveCard':
        saveCard();
        break;
      case 'closeModal':
        destroyModal();
        setHelp();
        break;
      default:
        break;
    }
  }

  screen.on('keypress', (ch, key) => {
    const k = key.full;
    if (END_READING_KEYS.includes(k)) endReading(screen.focused);
    const { state: next, action } = applyKey(state, k, model);
    state = next;
    if (action) handleAction(action);
    render();
  });

  screen.on('resize', () => {
    render();
  });

  render();
  screen.key(['C-c'], () => {
    // Fallback in case the keypress handler above was bypassed.
    destroyModal();
    screen.destroy();
    process.exit(0);
  });
}
