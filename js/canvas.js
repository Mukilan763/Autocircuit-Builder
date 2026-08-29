// canvas.js — factory for an SVG workspace: rendering plus all pointer
// interaction (drag, wire, select, rotate, zoom). One instance per panel.
const SVGNS = 'http://www.w3.org/2000/svg';
const GRID = 10;
const ZOOM_MIN = 0.25, ZOOM_MAX = 3.5;
const GRID_PX = 26; // must match .canvas-wrap's background-size in style.css

export function catSlug(cat) {
  return cat.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// A part's `cycle` can be a static array or a function of its current props
// (e.g. a manual transmission's gear list depends on how many gears it's
// configured with) — this resolves either form.
export function getCycle(def, props) {
  if (!def.cycle) return null;
  return typeof def.cycle === 'function' ? def.cycle(props) : def.cycle;
}

export function createViewport({ store, partDefs, simulate, svgEl }) {
  let baseW = parseFloat(svgEl.getAttribute('width')) || 1700;
  let baseH = parseFloat(svgEl.getAttribute('height')) || 1100;
  let zoom = 1;
  let dragState = null;
  let inspectCallback = null;
  let zoomCallback = null;
  let lastSim = null;
  const wrap = svgEl.parentElement; // .canvas-wrap — the scrollable viewport around the SVG

  svgEl.innerHTML = '<g class="wires-layer"></g><g class="comps-layer"></g><g class="temp-layer"></g><g class="fx-layer"></g>';
  const wiresLayer = svgEl.querySelector('.wires-layer');
  const compsLayer = svgEl.querySelector('.comps-layer');
  const tempLayer = svgEl.querySelector('.temp-layer');
  const fxLayer = svgEl.querySelector('.fx-layer');
  const prevActive = new Map();

  function setInspectCallback(fn) { inspectCallback = fn; }
  function setOnZoomChange(fn) { zoomCallback = fn; }
  function getLastSim() { return lastSim; }

  function toSvgPoint(clientX, clientY) {
    const pt = svgEl.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    return pt.matrixTransform(svgEl.getScreenCTM().inverse());
  }

  function getZoom() { return zoom; }
  function setZoom(z) {
    zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    svgEl.setAttribute('width', Math.round(baseW * zoom));
    svgEl.setAttribute('height', Math.round(baseH * zoom));
    // The dotted grid lives on .canvas-wrap's CSS background, not inside the
    // SVG, so it has to be rescaled by hand to keep tracking the content
    // instead of staying a fixed size while the parts around it zoom.
    const g = Math.max(6, GRID_PX * zoom);
    wrap.style.backgroundSize = `${g}px ${g}px, 100% 100%, 100% 100%`;
    if (zoomCallback) zoomCallback(zoom);
    return zoom;
  }

  // Zoom while keeping whatever point is under the cursor visually fixed —
  // the "zoom to cursor" feel of Tinkercad/Figma-style canvases, rather than
  // always zooming toward the top-left corner.
  function setZoomAtClient(z, clientX, clientY) {
    const rect = wrap.getBoundingClientRect();
    const cx = clientX - rect.left, cy = clientY - rect.top;
    const oldW = baseW * zoom, oldH = baseH * zoom;
    const ratioX = (wrap.scrollLeft + cx) / oldW;
    const ratioY = (wrap.scrollTop + cy) / oldH;
    setZoom(z);
    wrap.scrollLeft = ratioX * (baseW * zoom) - cx;
    wrap.scrollTop = ratioY * (baseH * zoom) - cy;
  }

  // Now that free dragging can pan the view anywhere, "Reset" needs to bring
  // the scroll position back too — otherwise resetting the zoom after
  // panning off into empty space just leaves you staring at a blank patch
  // of grid with no clue where your build went.
  function resetView() {
    setZoom(1);
    wrap.scrollLeft = 0;
    wrap.scrollTop = 0;
  }

  function snap(v) { return Math.round(v / GRID) * GRID; }

  function rotatePoint(x, y, cx, cy, deg) {
    if (!deg) return { x, y };
    const rad = deg * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const dx = x - cx, dy = y - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  }

  function terminalDef(compId, terminalId) {
    const c = store.getComponent(compId);
    if (!c) return null;
    const def = partDefs[c.type];
    const t = def.terminals.find(t => t.id === terminalId);
    if (!t) return null;
    return { comp: c, def, t };
  }

  function terminalPos(end) {
    const r = terminalDef(end.compId, end.terminal);
    if (!r) return null;
    const local = rotatePoint(r.t.x, r.t.y, r.def.w / 2, r.def.h / 2, r.comp.rot || 0);
    return { x: r.comp.x + local.x, y: r.comp.y + local.y };
  }

  function wirePath(pa, pb) {
    const dx = (pb.x - pa.x) * 0.5;
    return `M ${pa.x} ${pa.y} C ${pa.x + dx} ${pa.y}, ${pb.x - dx} ${pb.y}, ${pb.x} ${pb.y}`;
  }

  function highlightTargets(originKey) {
    compsLayer.querySelectorAll('.terminal').forEach(t => {
      const k = t.dataset.comp + ':' + t.dataset.terminal;
      if (k !== originKey) t.classList.add('wire-target');
    });
  }
  function clearTargets() {
    compsLayer.querySelectorAll('.wire-target').forEach(t => t.classList.remove('wire-target'));
  }

  function isVisible() { return svgEl.offsetParent !== null; }

  function onPointerDown(e) {
    if (!isVisible()) return;
    const termEl = e.target.closest('.terminal');
    if (termEl) {
      e.preventDefault();
      const compId = termEl.dataset.comp;
      const terminal = termEl.dataset.terminal;
      const p = toSvgPoint(e.clientX, e.clientY);
      dragState = { type: 'wire', from: { compId, terminal }, x: p.x, y: p.y };
      highlightTargets(compId + ':' + terminal);
      return;
    }
    const compEl = e.target.closest('.component');
    if (compEl) {
      e.preventDefault();
      const id = compEl.dataset.id;
      const comp = store.getComponent(id);
      const def = partDefs[comp.type];
      const p = toSvgPoint(e.clientX, e.clientY);
      // Click-to-toggle/cycle only fires on a *second* click, once the part
      // is already selected — the first click on any part just selects it
      // (and opens the inspector) so you can look at something running
      // without accidentally shutting it off. Momentary parts (press-and-
      // hold) are a different interaction entirely and skip this: pressing
      // one always activates it immediately, selected or not.
      const wasSelected = store.state.selection && store.state.selection.kind === 'component' && store.state.selection.id === id;
      if (def.momentary) { comp.props.on = true; render(); }
      dragState = { type: 'move', id, startPx: p, origX: comp.x, origY: comp.y, momentary: !!def.momentary, wasSelected };
      store.setSelection({ kind: 'component', id });
      if (inspectCallback) inspectCallback({ kind: 'component', id });
      return;
    }
    const wireHit = e.target.closest('.wire-hit');
    if (wireHit) {
      const id = wireHit.dataset.id;
      store.setSelection({ kind: 'wire', id });
      if (inspectCallback) inspectCallback({ kind: 'wire', id });
      return;
    }
    // Nothing under the cursor — click-and-drag on empty canvas pans the
    // view (like Tinkercad's grab-canvas-to-move), and a plain click with no
    // drag still deselects, decided once the pointer comes back up.
    dragState = {
      type: 'pan', moved: false,
      startClientX: e.clientX, startClientY: e.clientY,
      startScrollLeft: wrap.scrollLeft, startScrollTop: wrap.scrollTop,
    };
    wrap.classList.add('panning');
  }

  function onPointerMove(e) {
    if (!dragState) return;
    if (dragState.type === 'pan') {
      const dx = e.clientX - dragState.startClientX;
      const dy = e.clientY - dragState.startClientY;
      if (!dragState.moved && Math.hypot(dx, dy) > 3) dragState.moved = true;
      wrap.scrollLeft = dragState.startScrollLeft - dx;
      wrap.scrollTop = dragState.startScrollTop - dy;
      return;
    }
    const p = toSvgPoint(e.clientX, e.clientY);
    if (dragState.type === 'move') {
      const comp = store.getComponent(dragState.id);
      if (!comp) return;
      comp.x = snap(dragState.origX + (p.x - dragState.startPx.x));
      comp.y = snap(dragState.origY + (p.y - dragState.startPx.y));
      render();
    } else if (dragState.type === 'wire') {
      dragState.x = p.x;
      dragState.y = p.y;
      renderTempWire();
    }
  }

  function onPointerUp(e) {
    if (!dragState) return;
    if (dragState.type === 'pan') {
      wrap.classList.remove('panning');
      if (!dragState.moved) {
        store.setSelection(null);
        if (inspectCallback) inspectCallback(null);
      }
      dragState = null;
      return;
    }
    if (dragState.type === 'move') {
      const comp = store.getComponent(dragState.id);
      const def = comp && partDefs[comp.type];
      if (comp && def) {
        if (dragState.momentary) {
          comp.props.on = false;
        } else {
          const p = toSvgPoint(e.clientX, e.clientY);
          const dist = Math.hypot(p.x - dragState.startPx.x, p.y - dragState.startPx.y);
          if (dist < 4 && dragState.wasSelected) {
            const cycle = getCycle(def, comp.props);
            if (cycle) {
              const idx = cycle.indexOf(comp.props.position || cycle[0]);
              comp.props.position = cycle[(idx + 1) % cycle.length];
            } else if (def.toggleable) {
              comp.props.on = !comp.props.on;
            }
          }
        }
      }
      // Clear dragState *before* notifying — render() (triggered
      // synchronously by notify()) checks dragState to decide whether a
      // newly-activated part deserves a spark, and a click-to-toggle (the
      // most common trigger for one) is exactly this code path.
      dragState = null;
      store.notify();
      return;
    } else if (dragState.type === 'wire') {
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const termEl = target && target.closest && target.closest('.terminal');
      tempLayer.innerHTML = '';
      clearTargets();
      if (termEl) {
        const compId = termEl.dataset.comp;
        const terminal = termEl.dataset.terminal;
        if (!(compId === dragState.from.compId && terminal === dragState.from.terminal)) {
          store.addWire(dragState.from, { compId, terminal });
        }
      }
    }
    dragState = null;
  }

  function onKeyDown(e) {
    if (!isVisible()) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && store.state.selection) {
      e.preventDefault();
      store.deleteSelected();
      if (inspectCallback) inspectCallback(null);
    } else if (e.key === 'r' || e.key === 'R') {
      if (store.state.selection && store.state.selection.kind === 'component') {
        store.rotateComponent(store.state.selection.id);
      }
    } else if ((e.key === 'd' || e.key === 'D') && (e.ctrlKey || e.metaKey)) {
      // Ctrl/Cmd+D is normally "bookmark this page" — claim it here instead,
      // since duplicating the selected part is a much more useful thing to
      // do with it while building.
      if (store.state.selection && store.state.selection.kind === 'component') {
        e.preventDefault();
        const copy = store.duplicateComponent(store.state.selection.id);
        if (copy && inspectCallback) inspectCallback({ kind: 'component', id: copy.id });
      }
    }
  }

  // Plain mouse wheel / trackpad scroll zooms in and out, anchored on the
  // cursor — like Tinkercad and most other browser-based design canvases —
  // instead of only being reachable through the toolbar +/− buttons.
  function onWheel(e) {
    if (!isVisible()) return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    setZoomAtClient(zoom * factor, e.clientX, e.clientY);
  }

  function renderTempWire() {
    tempLayer.innerHTML = '';
    const originPos = terminalPos(dragState.from);
    if (!originPos) return;
    const path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', wirePath(originPos, { x: dragState.x, y: dragState.y }));
    path.setAttribute('class', 'wire temp');
    path.setAttribute('fill', 'none');
    tempLayer.appendChild(path);
  }

  function titleEl(text) {
    const t = document.createElementNS(SVGNS, 'title');
    t.textContent = text;
    return t;
  }

  // Is this component "doing something" right now — lit, spinning, energized
  // — in a way worth celebrating the *moment* it first happens? Covers both
  // domains' compState shapes without either needing to know about this.
  function isEngaging(st) {
    return !!(st && (st.active || st.spinning || st.energized || st.boosting));
  }

  const SPARK_COLORS = ['#ff5fa2', '#7c5cff', '#ffb020', '#22c55e', '#06b6d4'];
  function spawnSpark(cx, cy) {
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'spark-burst');
    const n = 7;
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const dist = 20 + Math.random() * 16;
      const dot = document.createElementNS(SVGNS, 'circle');
      dot.setAttribute('cx', cx);
      dot.setAttribute('cy', cy);
      dot.setAttribute('r', 3.5);
      dot.setAttribute('fill', SPARK_COLORS[i % SPARK_COLORS.length]);
      dot.setAttribute('class', 'spark-dot');
      dot.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
      dot.style.setProperty('--dy', (Math.sin(angle) * dist).toFixed(1) + 'px');
      g.appendChild(dot);
    }
    fxLayer.appendChild(g);
    setTimeout(() => g.remove(), 650);
  }

  function render() {
    const sim = simulate(store.state);
    lastSim = sim;
    compsLayer.innerHTML = '';
    wiresLayer.innerHTML = '';

    for (const w of store.state.wires) {
      const pa = terminalPos(w.a);
      const pb = terminalPos(w.b);
      if (!pa || !pb) continue;
      const status = sim.wireStatus[w.id] || 'off';
      const selected = store.state.selection && store.state.selection.kind === 'wire' && store.state.selection.id === w.id;
      const d = wirePath(pa, pb);

      const path = document.createElementNS(SVGNS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', `wire ${status}${selected ? ' selected' : ''}`);
      path.setAttribute('fill', 'none');
      wiresLayer.appendChild(path);

      const hit = document.createElementNS(SVGNS, 'path');
      hit.setAttribute('d', d);
      hit.setAttribute('class', 'wire-hit');
      hit.setAttribute('data-id', w.id);
      hit.setAttribute('fill', 'none');
      wiresLayer.appendChild(hit);
    }

    const seenIds = new Set();
    for (const c of store.state.components) {
      const def = partDefs[c.type];
      if (!def) continue;
      seenIds.add(c.id);

      // Celebrate the exact moment a part first lights up / spins / clicks
      // on — not every render while it stays that way, and not while the
      // user is mid-drag (a re-render from dragging a wire shouldn't spark).
      const engaging = isEngaging(sim.compStates[c.id]);
      if (engaging && !prevActive.get(c.id) && !dragState) {
        spawnSpark(c.x + def.w / 2, c.y + def.h / 2);
      }
      prevActive.set(c.id, engaging);

      const selected = store.state.selection && store.state.selection.kind === 'component' && store.state.selection.id === c.id;
      const g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('class', `component cat-${catSlug(def.category)}${selected ? ' selected' : ''}`);
      g.setAttribute('data-id', c.id);
      g.setAttribute('transform', `translate(${c.x},${c.y}) rotate(${c.rot || 0} ${def.w / 2} ${def.h / 2})`);

      // Most parts' artwork (thin lines, small icons, text labels) covers
      // only a fraction of its own footprint, so clicking anywhere that
      // *looks* like part of the part but isn't literally painted pixel
      // used to miss entirely. An invisible rect spanning the part's full
      // w×h — `fill="transparent"` still hit-tests, unlike `fill="none"` —
      // makes the whole footprint clickable, the way a button's padding
      // is clickable even where there's no visible ink.
      const hitArea = document.createElementNS(SVGNS, 'rect');
      hitArea.setAttribute('x', 0);
      hitArea.setAttribute('y', 0);
      hitArea.setAttribute('width', def.w);
      hitArea.setAttribute('height', def.h);
      hitArea.setAttribute('fill', 'transparent');
      g.appendChild(hitArea);

      if (selected) {
        const outline = document.createElementNS(SVGNS, 'rect');
        outline.setAttribute('x', -6);
        outline.setAttribute('y', -6);
        outline.setAttribute('width', def.w + 12);
        outline.setAttribute('height', def.h + 12);
        outline.setAttribute('rx', 10);
        outline.setAttribute('class', 'select-outline');
        g.appendChild(outline);
      }

      const body = document.createElementNS(SVGNS, 'g');
      body.innerHTML = def.render(c.props, sim.compStates[c.id]);
      g.appendChild(body);

      for (const t of def.terminals) {
        const st = sim.terminalStatus[c.id + ':' + t.id] || {};
        const circle = document.createElementNS(SVGNS, 'circle');
        circle.setAttribute('cx', t.x);
        circle.setAttribute('cy', t.y);
        circle.setAttribute('r', 7);
        circle.setAttribute('class', `terminal${st.powered ? ' live' : st.grounded ? ' grounded' : ''}`);
        circle.setAttribute('data-comp', c.id);
        circle.setAttribute('data-terminal', t.id);
        circle.appendChild(titleEl(t.name));
        g.appendChild(circle);
      }

      compsLayer.appendChild(g);
    }

    for (const id of prevActive.keys()) {
      if (!seenIds.has(id)) prevActive.delete(id);
    }
  }

  svgEl.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  wrap.addEventListener('wheel', onWheel, { passive: false });
  store.onChange(render);
  render();

  return {
    toSvgPoint, getZoom, setZoom, setZoomAtClient, resetView, render, getLastSim,
    setInspectCallback, setOnZoomChange,
  };
}
