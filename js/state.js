// state.js — factory for a panel's data model (components, wires, selection)
// plus persistence. Called once per panel (electrical, mechanical) so each
// gets an independent, isolated store.
export function createStore(partDefs, storageKey) {
  const state = {
    components: [],   // { id, type, x, y, rot, props }
    wires: [],         // { id, a:{compId,terminal}, b:{compId,terminal} }
    selection: null,   // { kind: 'component'|'wire', id }
    nextId: 1,
  };

  const listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function notify() { listeners.forEach(fn => fn()); }

  function addComponent(type, x, y) {
    const def = partDefs[type];
    if (!def) return null;
    const id = 'c' + (state.nextId++);
    const comp = { id, type, x, y, rot: 0, props: { ...def.defaultProps } };
    state.components.push(comp);
    notify();
    return comp;
  }

  function duplicateComponent(id) {
    const src = getComponent(id);
    if (!src) return null;
    const id2 = 'c' + (state.nextId++);
    // Offset so the copy doesn't land exactly on top of the original —
    // wires are intentionally *not* copied, matching Tinkercad's plain
    // duplicate (not a "clone this sub-circuit") to keep the mental model simple.
    const comp = { id: id2, type: src.type, x: src.x + 30, y: src.y + 30, rot: src.rot || 0, props: { ...src.props } };
    state.components.push(comp);
    state.selection = { kind: 'component', id: id2 };
    notify();
    return comp;
  }

  function rotateComponent(id) {
    const comp = getComponent(id);
    if (!comp) return;
    comp.rot = ((comp.rot || 0) + 90) % 360;
    notify();
  }

  function removeComponent(id) {
    state.components = state.components.filter(c => c.id !== id);
    state.wires = state.wires.filter(w => w.a.compId !== id && w.b.compId !== id);
    if (state.selection && state.selection.kind === 'component' && state.selection.id === id) {
      state.selection = null;
    }
    notify();
  }

  function addWire(a, b) {
    if (a.compId === b.compId && a.terminal === b.terminal) return null;
    const dup = state.wires.find(w =>
      (sameEnd(w.a, a) && sameEnd(w.b, b)) || (sameEnd(w.a, b) && sameEnd(w.b, a))
    );
    if (dup) return null;
    const id = 'w' + (state.nextId++);
    const wire = { id, a, b };
    state.wires.push(wire);
    notify();
    return wire;
  }
  function sameEnd(x, y) { return x.compId === y.compId && x.terminal === y.terminal; }

  function removeWire(id) {
    state.wires = state.wires.filter(w => w.id !== id);
    if (state.selection && state.selection.kind === 'wire' && state.selection.id === id) {
      state.selection = null;
    }
    notify();
  }

  function getComponent(id) {
    return state.components.find(c => c.id === id);
  }

  function setSelection(sel) {
    state.selection = sel;
    notify();
  }

  function deleteSelected() {
    if (!state.selection) return;
    if (state.selection.kind === 'component') removeComponent(state.selection.id);
    else if (state.selection.kind === 'wire') removeWire(state.selection.id);
  }

  function clearAll() {
    state.components = [];
    state.wires = [];
    state.selection = null;
    notify();
  }

  function loadFromJSON(data) {
    // Backfill any props a part has gained since this data was saved (a new
    // config field, say) so older autosaves/exports don't show "undefined".
    state.components = (data.components || []).map(c => {
      const def = partDefs[c.type];
      return def ? { ...c, rot: c.rot || 0, props: { ...def.defaultProps, ...c.props } } : c;
    });
    state.wires = data.wires || [];
    state.selection = null;
    state.nextId = data.nextId || (state.components.length + state.wires.length + 1);
    notify();
  }

  function toJSON() {
    return { components: state.components, wires: state.wires, nextId: state.nextId };
  }

  function saveToLocalStorage() {
    localStorage.setItem(storageKey, JSON.stringify(toJSON()));
  }

  function loadFromLocalStorage() {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return false;
    try { loadFromJSON(JSON.parse(raw)); return true; }
    catch (e) { return false; }
  }

  return {
    state, onChange, notify, addComponent, duplicateComponent, rotateComponent, removeComponent,
    addWire, removeWire, getComponent, setSelection, deleteSelected, clearAll,
    loadFromJSON, toJSON, saveToLocalStorage, loadFromLocalStorage,
  };
}
