// history.js — factory for snapshot-based undo/redo over a store. Structural
// changes (add, remove, wire, move, toggle, rotate) each push a snapshot;
// per-keystroke text/number edits deliberately don't (see ui.js's
// liveUpdate) so undo stays meaningful instead of reverting one character
// at a time. One instance per panel.
export function createHistory(store) {
  const MAX_ENTRIES = 60;
  let stack = [];
  let index = -1;
  let applying = false;
  let listeners = [];

  function notifyListeners() { listeners.forEach(fn => fn()); }
  function onHistoryChange(fn) { listeners.push(fn); }

  function push() {
    const snap = JSON.stringify(store.toJSON());
    if (stack[index] === snap) return;
    stack = stack.slice(0, index + 1);
    stack.push(snap);
    if (stack.length > MAX_ENTRIES) stack.shift();
    index = stack.length - 1;
    notifyListeners();
  }

  function initHistory() {
    push();
    store.onChange(() => { if (!applying) push(); });
  }

  function undo() {
    if (index <= 0) return;
    index--;
    applying = true;
    store.loadFromJSON(JSON.parse(stack[index]));
    applying = false;
    notifyListeners();
  }

  function redo() {
    if (index >= stack.length - 1) return;
    index++;
    applying = true;
    store.loadFromJSON(JSON.parse(stack[index]));
    applying = false;
    notifyListeners();
  }

  function canUndo() { return index > 0; }
  function canRedo() { return index < stack.length - 1; }

  return { initHistory, undo, redo, canUndo, canRedo, onHistoryChange };
}
