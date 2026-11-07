import path from "node:path";
import blessed from "@blessed/neo-blessed";
import {
  byCreation,
  formatComments,
  formatMeta,
  moveCardFile,
  parseComments,
  readCards,
  updateCard,
} from "./cards.js";
import { commit, ensureRepo, listNames } from "./store.js";

const QUIT_KEYS = new Set(["q", "escape", "C-c"]);
const NAV_KEYS = ["up", "down", "left", "right", "h", "j", "k", "l"];
const MOVE_KEYS = {
  "S-h": "h",
  "S-l": "l",
  "S-left": "left",
  "S-right": "right",
};
const MODAL_KEYS = ["tab", "S-tab", "enter"];

const HELP =
  "{grey-fg}h/l or ←/→: lists · j/k or ↑/↓: cards · shift+h/l or shift+←/→: move card · space: edit card · q/esc: quit{/grey-fg}";
const MODAL_HELP =
  "{grey-fg}tab/shift+tab: fields · enter: save & close · ctrl+q: discard · q/esc: quit{/grey-fg}";
const EMPTY_HELP =
  "{grey-fg}No lists yet — create one with `gitello lists create <name>` · q: quit{/grey-fg}";

export function buildModel(repo) {
  return {
    lists: listNames(repo).map((name) => ({
      name,
      cards: byCreation(readCards(repo, name)),
    })),
  };
}

export function initialState() {
  return { list: 0, card: 0 };
}

export function applyKey(model, state, key) {
  if (QUIT_KEYS.has(key)) {
    return { state, quit: true };
  }
  if (key === "space") {
    return { state, quit: false, toggleCard: true };
  }
  const moveKey = MOVE_KEYS[key];
  const nav = moveKey ?? key;
  const listCount = model.lists.length;
  let { list, card } = state;
  switch (nav) {
    case "h":
    case "left":
      list = Math.max(0, list - 1);
      break;
    case "l":
    case "right":
      list = Math.min(Math.max(listCount - 1, 0), list + 1);
      break;
    case "k":
    case "up":
      card = Math.max(0, card - 1);
      break;
    case "j":
    case "down":
      card = Math.min(
        Math.max((model.lists[list]?.cards.length ?? 0) - 1, 0),
        card + 1,
      );
      break;
    default:
      return { state, quit: false };
  }
  const cards = model.lists[list]?.cards ?? [];
  card = Math.min(card, Math.max(cards.length - 1, 0));
  const next = { list, card };
  if (moveKey && list !== state.list) {
    const from = model.lists[state.list];
    if (from && from.cards[state.card]) {
      return {
        state: next,
        quit: false,
        move: { from: from.name, to: model.lists[list].name, card: state.card },
      };
    }
  }
  return { state: next, quit: false };
}

export function performMove(repo, model, move) {
  const from = model.lists.find((list) => list.name === move.from);
  const card = from?.cards[move.card];
  if (!card) {
    return null;
  }
  moveCardFile(repo, move.from, move.to, card.file);
  commit(
    repo,
    [move.from, move.to],
    `Move card "${card.title}" from list "${move.from}" to list "${move.to}"`,
  );
  model.lists = buildModel(repo).lists;
  return card;
}

export function applyModalKey(key, focus, fieldCount) {
  if (fieldCount < 1) {
    return null;
  }
  switch (key) {
    case "tab":
      return { action: "focus", focus: (focus + 1) % fieldCount };
    case "S-tab":
      return { action: "focus", focus: (focus + fieldCount - 1) % fieldCount };
    case "enter":
      return { action: "save" };
    case "C-q":
      return { action: "discard" };
    default:
      return null;
  }
}

export function performUpdate(repo, model, state, values) {
  const column = model.lists[state.list];
  const card = column?.cards[state.card];
  if (!card) {
    return null;
  }
  const updated = updateCard(repo, column.name, card.file, values);
  commit(
    repo,
    path.join(column.name, card.file),
    `Update card "${updated.title}" in list "${column.name}"`,
  );
  model.lists = buildModel(repo).lists;
  return updated;
}

export function truncate(text, max) {
  if (max < 1) {
    return "";
  }
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function renderColumn(column, { active, selectedCard, width }) {
  const inner = Math.max(width - 2, 1);
  if (column.cards.length === 0) {
    return "{grey-fg} (empty){/grey-fg}";
  }
  return column.cards
    .map((card, index) => {
      const line = ` ${truncate(card.title, inner - 1)}`.padEnd(inner);
      return active && index === selectedCard
        ? `{inverse}${line}{/inverse}`
        : line;
    })
    .join("\n");
}

export function launch(io = {}) {
  const input = io.stdin ?? process.stdin;
  const output = io.stdout ?? process.stdout;
  const repo = ensureRepo();
  const model = buildModel(repo);
  const screen = blessed.screen({
    input,
    output,
    smartCSR: true,
    fullUnicode: true,
    extended: false,
    title: "gitello",
    ignoreLocked: [...QUIT_KEYS, "C-q", ...MODAL_KEYS],
  });

  const help = blessed.box({
    parent: screen,
    top: "100%-1",
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
  });

  const columns = model.lists.map((column) =>
    blessed.box({
      parent: screen,
      label: ` ${column.name} `,
      border: { type: "line" },
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      top: 0,
      left: 0,
      width: 0,
      height: "100%-1",
      style: { border: { fg: "grey" } },
    }),
  );

  const cardModal = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: "80%",
    height: "80%",
    border: { type: "line" },
    tags: false,
    hidden: true,
    style: { border: { fg: "cyan" } },
  });

  const fieldStyle = {
    border: { fg: "grey" },
    focus: { border: { fg: "cyan" } },
  };

  const titleField = blessed.textbox({
    parent: cardModal,
    name: "title",
    label: " Title ",
    top: 0,
    left: 0,
    width: "100%",
    height: 3,
    keys: true,
    inputOnFocus: true,
    mouse: true,
    border: { type: "line" },
    style: fieldStyle,
  });

  const descriptionField = blessed.textarea({
    parent: cardModal,
    name: "description",
    label: " Description ",
    top: 3,
    left: 0,
    width: "100%",
    height: "50%-4",
    keys: true,
    inputOnFocus: true,
    mouse: true,
    scrollable: true,
    alwaysScroll: true,
    border: { type: "line" },
    style: fieldStyle,
  });

  const commentsField = blessed.textarea({
    parent: cardModal,
    name: "comments",
    label: " Comments (one per line) ",
    top: "50%-1",
    left: 0,
    width: "100%",
    height: "50%-4",
    keys: true,
    inputOnFocus: true,
    mouse: true,
    scrollable: true,
    alwaysScroll: true,
    border: { type: "line" },
    style: fieldStyle,
  });

  const metaLine = blessed.text({
    parent: cardModal,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: { fg: "grey" },
  });

  const fields = [titleField, descriptionField, commentsField];

  let state = initialState();
  let modalOpen = false;
  let focusIndex = 0;

  for (const field of fields) {
    field.on("focus", () => {
      focusIndex = fields.indexOf(field);
    });
  }

  function openCardModal() {
    const card = model.lists[state.list]?.cards[state.card];
    if (!card) {
      return;
    }
    modalOpen = true;
    focusIndex = 0;
    cardModal.setLabel(` ${truncate(card.title, 60)} `);
    titleField.setValue(String(card.title ?? ""));
    descriptionField.setValue(String(card.description ?? ""));
    commentsField.setValue(formatComments(card.comments));
    metaLine.setContent(`{grey-fg}${formatMeta(card)}{/grey-fg}`);
    cardModal.show();
    fields[0].focus();
    render();
  }

  function closeModal() {
    if (!modalOpen) {
      return;
    }
    modalOpen = false;
    const focused = screen.focused;
    if (fields.includes(focused)) {
      if (focused._reading) {
        focused.emit("keypress", "\x1b", { name: "escape" });
      }
      screen.focusPush(screen);
    }
    cardModal.hide();
    render();
  }

  function saveModal() {
    const column = model.lists[state.list];
    const card = column?.cards[state.card];
    if (!card) {
      closeModal();
      return;
    }
    const values = {
      title: titleField.getValue(),
      description: descriptionField.getValue(),
      comments: parseComments(commentsField.getValue()),
    };
    if (!values.title.trim()) {
      help.setContent(
        "{red-fg}title must not be empty · enter: save & close · ctrl+q: discard{/red-fg}",
      );
      screen.render();
      return;
    }
    performUpdate(repo, model, state, values);
    closeModal();
  }

  function modalKey(key) {
    const action = applyModalKey(key, focusIndex, fields.length);
    if (!action) {
      return;
    }
    const focused = screen.focused;
    if (fields.includes(focused) && focused._reading) {
      focused.emit("keypress", "\x1b", { name: "escape" });
    }
    if (action.action === "focus") {
      focusIndex = action.focus;
      fields[focusIndex].focus();
      render();
    } else if (action.action === "save") {
      saveModal();
    } else {
      closeModal();
    }
  }

  function layout() {
    const width = screen.width || output.columns || 80;
    const count = columns.length;
    const colWidth = count > 0 ? Math.floor(width / count) : width;
    columns.forEach((box, index) => {
      box.left = index * colWidth;
      box.width = index === count - 1 ? width - index * colWidth : colWidth;
      box.height = "100%-1";
    });
  }

  function render() {
    help.setContent(
      columns.length === 0 ? EMPTY_HELP : modalOpen ? MODAL_HELP : HELP,
    );
    if (columns.length === 0) {
      screen.render();
      return;
    }
    layout();
    columns.forEach((box, index) => {
      const column = model.lists[index];
      const active = index === state.list;
      box.setLabel(
        active ? `{cyan-fg} ${column.name} {/cyan-fg}` : ` ${column.name} `,
      );
      box.style.border.fg = active ? "cyan" : "grey";
      box.setContent(
        renderColumn(column, {
          active,
          selectedCard: state.card,
          width: box.width,
        }),
      );
      if (active && column.cards.length > 0) {
        const visible = Math.max((box.height ?? 1) - 2, 1);
        const offset = box.childOffset ?? 0;
        if (state.card < offset || state.card >= offset + visible) {
          if (typeof box.scrollTo === "function") {
            box.scrollTo(state.card);
          }
        }
      }
    });
    screen.render();
  }

  return new Promise((resolve) => {
    function quit() {
      screen.destroy();
      resolve(0);
    }
    screen.key([...QUIT_KEYS], quit);
    screen.key(["C-q"], () => {
      if (modalOpen) {
        closeModal();
        return;
      }
      quit();
    });
    screen.key(["space"], () => {
      if (modalOpen) {
        return;
      }
      const result = applyKey(model, state, "space");
      if (result.toggleCard) {
        openCardModal();
      }
    });
    for (const key of MODAL_KEYS) {
      screen.key([key], () => {
        if (!modalOpen) {
          return;
        }
        modalKey(key);
      });
    }
    for (const key of NAV_KEYS) {
      screen.key([key], () => {
        if (modalOpen) {
          return;
        }
        const result = applyKey(model, state, key);
        if (result.quit) {
          quit();
          return;
        }
        state = result.state;
        render();
      });
    }
    for (const key of Object.keys(MOVE_KEYS)) {
      screen.key([key], () => {
        if (modalOpen) {
          return;
        }
        const result = applyKey(model, state, key);
        if (result.quit) {
          quit();
          return;
        }
        if (result.move) {
          performMove(repo, model, result.move);
          const column = model.lists[result.state.list];
          const maxCard = Math.max((column?.cards.length ?? 0) - 1, 0);
          result.state = {
            list: result.state.list,
            card: Math.min(result.state.card, maxCard),
          };
        }
        state = result.state;
        render();
      });
    }
    screen.on("resize", render);
    render();
  });
}
