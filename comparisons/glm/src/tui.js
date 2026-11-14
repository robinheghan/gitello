import path from 'node:path';

import blessed from '@blessed/neo-blessed';

import * as cards from './cards.js';
import * as commands from './commands.js';
import * as store from './store.js';

const NAV_STEPS = {
  h: [-1, 0],
  left: [-1, 0],
  l: [1, 0],
  right: [1, 0],
  j: [0, 1],
  down: [0, 1],
  k: [0, -1],
  up: [0, -1],
};

const BOARD_HELP =
  'h/l: list  j/k: card  shift+h/l: move card  space: edit card  q: quit';

const MODAL_HELP = 'enter: save  ctrl-q: discard  tab/shift-tab: switch field';

// Keys that keep working while a modal input field has grabbed the
// keyboard focus.
const LOCKED_KEYS = ['tab', 'S-tab', 'enter', 'C-q', 'escape', 'q', 'C-c'];

const escapeTags = (text) =>
  String(text).replaceAll('{', '{open-brace}').replaceAll('}', '{close-brace}');

// The board model: every list with its cards, in creation order.
export function buildModel(repo = store.repoPath()) {
  const lists = commands.listNames(repo).map((name) => ({
    name,
    dir: path.join(repo, name),
    cards: commands.cardsInList(repo, name),
  }));
  return { repo, lists };
}

export function initialState() {
  return { list: 0, card: 0 };
}

export function clampState(state, model) {
  const listCount = model.lists.length;
  const list = Math.max(0, Math.min(state.list, listCount - 1));
  const cardCount = listCount > 0 ? model.lists[list].cards.length : 0;
  const card = Math.max(0, Math.min(state.card, cardCount - 1));
  return { list, card };
}

// Map a key press to a descriptor: navigation step, card move, card
// modal toggle, quit, or noop.
export function applyKey(state, model, key) {
  if (NAV_STEPS[key]) {
    const [dx, dy] = NAV_STEPS[key];
    if (model.lists.length === 0) {
      return { type: 'noop', state: { list: 0, card: 0 } };
    }
    const next =
      dx !== 0
        ? { list: state.list + dx, card: state.card }
        : { list: state.list, card: state.card + dy };
    return { type: 'nav', state: clampState(next, model) };
  }
  switch (key) {
    // neo-blessed usually reports shift-modified keys as S-<key>, but
    // some terminals deliver shift+letter as an uppercase character.
    case 'S-h':
    case 'H':
    case 'S-left':
      return { type: 'move', dx: -1 };
    case 'S-l':
    case 'L':
    case 'S-right':
      return { type: 'move', dx: 1 };
    // Cards move between lists, never up or down within a list.
    case 'S-j':
    case 'S-k':
    case 'S-up':
    case 'S-down':
      return { type: 'noop' };
    case 'q':
    case 'escape':
    case 'C-c':
      return { type: 'quit' };
    case 'space': {
      const list = model.lists[state.list];
      if (list && list.cards[state.card]) {
        return { type: 'toggleCard' };
      }
      return { type: 'noop' };
    }
    default:
      return { type: 'none' };
  }
}

// Render one list column: a label plus one line per card, the selected
// card in inverse video, the active list in cyan.
export function renderColumn(list, selectedIndex = -1, isActive = false) {
  const name = escapeTags(list.name);
  const label = isActive ? `{cyan-fg}${name}{/}` : name;
  const content = list.cards
    .map((entry, index) => {
      const title = escapeTags(entry.card.title);
      return index === selectedIndex ? `{inverse}${title}{/}` : title;
    })
    .join('\n');
  return { label, content };
}

// Pure modal key handling: tab/shift-tab cycle the fields (wrapping
// around), enter saves, ctrl-q discards, everything else types.
export function applyModalKey(key, focus, fieldCount) {
  const count = Math.max(1, fieldCount);
  switch (key) {
    case 'tab':
      return { type: 'focus', focus: (focus + 1) % count };
    case 'S-tab':
      return { type: 'focus', focus: (focus - 1 + count) % count };
    case 'enter':
      return { type: 'save' };
    case 'C-q':
      return { type: 'close' };
    default:
      return { type: 'none' };
  }
}

// Move the selected card to a neighbouring list: file move plus a
// single commit, then a model rebuild.
export function performMove(repo, model, state, dx) {
  const target = state.list + dx;
  if (target < 0 || target >= model.lists.length) {
    return { error: 'cannot move a card beyond the board' };
  }
  const fromList = model.lists[state.list];
  const entry = fromList.cards[state.card];
  if (!entry) {
    return { error: 'no card selected' };
  }
  const toList = model.lists[target];
  const toPath = cards.moveCardFile(entry.filePath, toList.dir);
  store.commit(
    repo,
    [path.relative(repo, entry.filePath), path.relative(repo, toPath)],
    `Move card "${entry.card.title}" from list "${fromList.name}" to list "${toList.name}"`,
  );
  const nextModel = buildModel(repo);
  const movedIndex = nextModel.lists[target].cards.findIndex(
    (candidate) => candidate.filePath === toPath,
  );
  const nextState = clampState({ list: target, card: movedIndex }, nextModel);
  return { model: nextModel, state: nextState };
}

// Save modal values back to the selected card and commit. The card
// keeps its file name, `createdAt`, and any extra metadata.
export function performUpdate(repo, model, state, values) {
  const title = String(values.title ?? '').trim();
  if (!title) {
    return { error: 'title must not be empty' };
  }
  const list = model.lists[state.list];
  const entry = list?.cards[state.card];
  if (!entry) {
    return { error: 'no card selected' };
  }
  const updated = cards.updateCard(entry.filePath, {
    title,
    description: String(values.description ?? ''),
    comments: cards.parseComments(values.comments ?? ''),
  });
  store.commit(
    repo,
    [path.relative(repo, entry.filePath)],
    `Update card "${updated.title}" in list "${list.name}"`,
  );
  return { model: buildModel(repo) };
}

export function launch({ repo = null } = {}) {
  const gitelloRepo = store.ensureRepo(repo ?? store.repoPath());
  return new Promise((resolve) => {
    let model = buildModel(gitelloRepo);
    let state = clampState(initialState(), model);
    let modal = null;
    let columns = [];
    let hintBox = null;

    // extended: false skips the terminfo *extended* section (whose
    // Setulc capability makes the compiler emit invalid JS and print
    // "Error on xterm-256color.Setulc:"). The screen options do not
    // reach the tput compiler, so the program must be created first.
    const program = blessed.program({ extended: false });
    const screen = blessed.screen({
      program,
      extended: false,
      ignoreLocked: LOCKED_KEYS,
      fullUnicode: true,
    });
    if (process.env.GITELLO_DEBUG) {
      program.on('keypress', (ch, key) =>
        console.error(
          `[prog ${JSON.stringify(key?.full ?? ch)} focused=${screen.focused?.type} grab=${screen.grabKeys}]`,
        ),
      );
    }

    const helpBar = blessed.box({
      parent: screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: BOARD_HELP,
      style: { fg: 'gray' },
    });

    function quit() {
      screen.destroy();
      resolve(0);
    }

    function destroyBoard() {
      for (const column of columns) {
        column.destroy();
      }
      columns = [];
      if (hintBox) {
        hintBox.destroy();
        hintBox = null;
      }
    }

    function buildBoard() {
      destroyBoard();
      if (model.lists.length === 0) {
        hintBox = blessed.box({
          parent: screen,
          top: 'center',
          left: 'center',
          width: 26,
          height: 1,
          align: 'center',
          content: 'No lists yet',
          tags: false,
          style: { fg: 'gray' },
        });
        return;
      }
      const count = model.lists.length;
      const width = Math.max(14, Math.floor(screen.width / count));
      model.lists.forEach((list, index) => {
        const isSelected = index === state.list;
        const { label, content } = renderColumn(
          list,
          isSelected ? state.card : -1,
          isSelected,
        );
        const left = index * width;
        const column = blessed.box({
          parent: screen,
          top: 0,
          left,
          width: Math.max(width, screen.width - left),
          height: '100%-1',
          border: 'line',
          label: ` ${label} `,
          tags: true,
          content,
          style: { border: { fg: isSelected ? 'cyan' : 'white' } },
        });
        columns.push(column);
      });
    }

    function refreshColumns() {
      model.lists.forEach((list, index) => {
        if (!columns[index]) {
          return;
        }
        const isSelected = index === state.list;
        const { label, content } = renderColumn(
          list,
          isSelected ? state.card : -1,
          isSelected,
        );
        columns[index].setContent(content);
        columns[index].setLabel(` ${label} `);
        columns[index].style.border.fg = isSelected ? 'cyan' : 'white';
      });
    }

    function endReading() {
      // End the focused field's reading synchronously, so the key
      // that triggered this handler is not inserted into the field.
      if (modal?.reading && modal.reading._reading) {
        modal.reading._done();
      }
      if (modal) {
        modal.reading = null;
      }
    }

    function startReading(field) {
      if (process.env.GITELLO_DEBUG) {
        field.on('keypress', (ch, key) =>
          console.error(
            `[field ${key?.full ?? ch} listener=${!!field.__listener} reading=${field._reading} value=${JSON.stringify(field.getValue())}]`,
          ),
        );
      }
      modal.reading = field;
      field.readInput();
    }

    function closeModal() {
      if (!modal) {
        return;
      }
      endReading();
      modal.container.destroy();
      modal = null;
      helpBar.setContent(BOARD_HELP);
      refreshColumns();
      screen.render();
    }

    function saveModal() {
      const values = {
        title: modal.fields[0].getValue(),
        description: modal.fields[1].getValue(),
        comments: modal.fields[2].getValue(),
      };
      const result = performUpdate(gitelloRepo, model, state, values);
      if (result.error) {
        modal.help.setContent(`${result.error} — ${MODAL_HELP}`);
        startReading(modal.fields[modal.focus]);
        screen.render();
        return;
      }
      model = result.model;
      state = clampState(state, model);
      closeModal();
    }

    function onModalKey(full) {
      const descriptor = applyModalKey(full, modal.focus, modal.fields.length);
      if (descriptor.type === 'none') {
        return;
      }
      endReading();
      if (descriptor.type === 'focus') {
        modal.focus = descriptor.focus;
        const field = modal.fields[modal.focus];
        field.focus();
        startReading(field);
        screen.render();
      } else if (descriptor.type === 'save') {
        saveModal();
      } else {
        closeModal();
      }
    }

    function openModal() {
      const list = model.lists[state.list];
      const entry = list.cards[state.card];
      if (!entry) {
        return;
      }
      const modalWidth = Math.max(30, Math.floor(screen.width * 0.7));
      const modalHeight = Math.max(12, Math.floor(screen.height * 0.75));
      const innerHeight = modalHeight - 2;
      const fieldHeight = Math.max(2, Math.floor((innerHeight - 13) / 2));
      const fieldWidth = modalWidth - 4;

      const container = blessed.box({
        parent: screen,
        top: 'center',
        left: 'center',
        width: modalWidth,
        height: modalHeight,
        border: 'line',
        scrollable: true,
        tags: false,
        label: ` ${escapeTags(entry.card.title)} `,
        style: { border: { fg: 'cyan' } },
      });

      const label = (text, top) =>
        blessed.text({
          parent: container,
          top,
          left: 2,
          content: text,
          tags: false,
          style: { fg: 'gray' },
        });
      const fieldOptions = (top, height) => ({
        parent: container,
        top,
        left: 2,
        width: fieldWidth,
        height,
        tags: false,
        keys: false,
        style: { focus: { bg: 'blue' } },
      });

      label('Title', 1);
      const titleBox = blessed.textbox(fieldOptions(2, 1));
      label('Description', 4);
      const descriptionBox = blessed.textarea(fieldOptions(5, fieldHeight));
      label('Comments', 6 + fieldHeight);
      const commentsBox = blessed.textarea(
        fieldOptions(7 + fieldHeight, fieldHeight),
      );

      blessed.box({
        parent: container,
        bottom: 2,
        left: 2,
        width: fieldWidth,
        height: 1,
        tags: false,
        content: cards.formatMeta(entry.card),
        style: { fg: 'gray' },
      });

      const modalHelp = blessed.box({
        parent: container,
        bottom: 0,
        left: 2,
        width: fieldWidth,
        height: 1,
        content: MODAL_HELP,
        tags: false,
        style: { fg: 'gray' },
      });

      // Read the card JSON defensively: an unreadable card still opens
      // the modal with empty fields rather than crashing the TUI.
      const card = entry.card ?? {};
      titleBox.setValue(card.title ?? '');
      descriptionBox.setValue(card.description ?? '');
      commentsBox.setValue(cards.formatComments(card.comments).join('\n'));

      modal = {
        container,
        fields: [titleBox, descriptionBox, commentsBox],
        focus: 0,
        reading: null,
        help: modalHelp,
      };
      screen.render();
      startReading(titleBox);
    }

    function doMove(dx) {
      const result = performMove(gitelloRepo, model, state, dx);
      if (result.error) {
        helpBar.setContent(`${result.error}`);
        screen.render();
        return;
      }
      model = result.model;
      state = result.state;
      helpBar.setContent(BOARD_HELP);
      buildBoard();
      screen.render();
    }

    function onKey(_ch, key) {
      const full = key ? key.full : '';
      if (process.env.GITELLO_DEBUG) {
        console.error(
          `[key ${full}] modal=${!!modal} reading=${
            modal?.reading ? `${modal.focus}:${modal.reading._reading}` : '-'
          } values=${JSON.stringify(
            modal ? modal.fields.map((f) => f.getValue()) : [],
          )}`,
        );
      }
      if (full === 'C-c') {
        quit();
        return;
      }
      if (modal) {
        onModalKey(full);
        return;
      }
      const descriptor = applyKey(state, model, full);
      switch (descriptor.type) {
        case 'nav':
          state = descriptor.state;
          refreshColumns();
          screen.render();
          break;
        case 'move':
          doMove(descriptor.dx);
          break;
        case 'toggleCard':
          openModal();
          break;
        case 'quit':
          quit();
          break;
        default:
          break;
      }
    }

    buildBoard();
    screen.key(
      [
        ...Object.keys(NAV_STEPS),
        'S-h',
        'S-l',
        'S-j',
        'S-k',
        'S-left',
        'S-right',
        'S-up',
        'S-down',
        'space',
        'q',
        'escape',
        'C-c',
        'tab',
        'S-tab',
        'enter',
        'C-q',
      ],
      onKey,
    );
    screen.render();
  });
}
