// ui.js — factory for a panel's chrome: palette (search + collapsible,
// color-coded categories), inspector, toolbar (incl. zoom + undo/redo),
// examples menu. One instance per panel (electrical, mechanical); the help
// modal and toast are shared app-wide and wired up separately in main.js.
import { catSlug, getCycle } from './canvas.js';
import { exportSvgAsPng } from './exportImage.js';

export function createPanel({ store, partDefs, categoryColors, viewport, history, examples, dom, showToast }) {
  let currentSelection = null;
  let placeCounter = 0;
  let saveTimer = null;
  let recentTypes = []; // most-recent-first, unique — session-only, not persisted

  function saveDebounced() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(store.saveToLocalStorage, 400);
  }
  // Cheap live update for per-keystroke edits: repaint + persist, but don't
  // rebuild the inspector DOM (that would steal focus out of the input) and
  // don't push an undo snapshot per character.
  function liveUpdate() { viewport.render(); saveDebounced(); }

  function init() {
    buildPalette();
    buildToolbar();
    setupCanvasDrop();
    viewport.setInspectCallback(sel => { currentSelection = sel; renderInspector(); });
    viewport.setOnZoomChange(updateZoomLabel);
    store.onChange(() => { renderInspector(); updateStatusBar(); saveDebounced(); });
    history.onHistoryChange(updateHistoryButtons);
    renderInspector();
    updateStatusBar();
    updateHistoryButtons();
    updateZoomLabel();
  }

  function buildPalette() {
    const container = dom.paletteList;
    const searchInput = dom.paletteSearch;
    const categories = {};
    for (const [type, def] of Object.entries(partDefs)) {
      (categories[def.category] = categories[def.category] || []).push([type, def]);
    }

    function draw(filter) {
      container.innerHTML = '';
      const f = (filter || '').trim().toLowerCase();
      for (const [cat, items] of Object.entries(categories)) {
        const filtered = f ? items.filter(([, def]) => def.label.toLowerCase().includes(f)) : items;
        if (!filtered.length) continue;
        const colors = categoryColors[cat];
        const section = document.createElement('div');
        section.className = 'palette-section';
        const h = document.createElement('h3');
        h.textContent = cat;
        h.style.setProperty('--cat-accent', colors.accent);
        h.setAttribute('role', 'button');
        h.setAttribute('tabindex', '0');
        h.setAttribute('aria-expanded', 'true');
        const toggleSection = () => {
          const collapsed = section.classList.toggle('collapsed');
          h.setAttribute('aria-expanded', String(!collapsed));
        };
        h.addEventListener('click', toggleSection);
        h.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection(); }
        });
        section.appendChild(h);
        const grid = document.createElement('div');
        grid.className = 'palette-grid';
        for (const [type, def] of filtered) {
          const btn = document.createElement('div');
          btn.className = 'palette-item';
          btn.draggable = true;
          btn.title = `Drag onto the canvas, or click to add a ${def.label}`;
          btn.setAttribute('role', 'button');
          btn.setAttribute('tabindex', '0');
          btn.setAttribute('aria-label', `Add ${def.label}`);
          const h2 = Math.max(28, Math.round(40 * def.h / def.w));
          btn.innerHTML =
            `<span class="palette-icon" style="background:${colors.fill};border-color:${colors.stroke}">` +
            `<svg class="cat-${catSlug(cat)}" viewBox="0 0 ${def.w} ${def.h}" width="40" height="${h2}">${def.render(def.defaultProps, {})}</svg></span>` +
            `<span class="palette-name">${def.label}</span>`;
          btn.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', type);
            e.dataTransfer.effectAllowed = 'copy';
          });
          btn.addEventListener('click', () => addAtDefault(type));
          btn.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              addAtDefault(type);
            }
          });
          grid.appendChild(btn);
        }
        section.appendChild(grid);
        container.appendChild(section);
      }
    }
    draw('');
    searchInput.addEventListener('input', () => draw(searchInput.value));
  }

  function addAtDefault(type) {
    const x = 60 + (placeCounter % 6) * 130;
    const y = 60 + Math.floor(placeCounter / 6) * 150;
    placeCounter++;
    store.addComponent(type, x, y);
    recordRecent(type);
  }

  function setupCanvasDrop() {
    dom.canvasSvg.addEventListener('dragover', e => e.preventDefault());
    dom.canvasSvg.addEventListener('drop', e => {
      e.preventDefault();
      const type = e.dataTransfer.getData('text/plain');
      const def = partDefs[type];
      if (!def) return;
      const p = viewport.toSvgPoint(e.clientX, e.clientY);
      store.addComponent(type, Math.round((p.x - def.w / 2) / 10) * 10, Math.round((p.y - def.h / 2) / 10) * 10);
      recordRecent(type);
    });
  }

  // A small colorful "grab it again" strip above the categories — the parts
  // someone reaches for over and over (grounds, splices, a favorite switch)
  // no longer mean re-opening/scrolling a category every time.
  function recordRecent(type) {
    if (!dom.paletteRecent) return;
    recentTypes = [type, ...recentTypes.filter(t => t !== type)].slice(0, 8);
    renderRecent();
  }

  function renderRecent() {
    const container = dom.paletteRecent;
    if (!container) return;
    container.innerHTML = '';
    if (!recentTypes.length) return;
    const h = document.createElement('h3');
    h.textContent = '🕓 Recently Used';
    container.appendChild(h);
    const row = document.createElement('div');
    row.className = 'recent-row';
    for (const type of recentTypes) {
      const def = partDefs[type];
      if (!def) continue;
      const colors = categoryColors[def.category];
      const btn = document.createElement('div');
      btn.className = 'recent-item';
      btn.title = `Add ${def.label}`;
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', '0');
      btn.setAttribute('aria-label', `Add ${def.label}`);
      const h2 = Math.max(20, Math.round(28 * def.h / def.w));
      btn.innerHTML =
        `<span class="palette-icon" style="background:${colors.fill};border-color:${colors.stroke}">` +
        `<svg class="cat-${catSlug(def.category)}" viewBox="0 0 ${def.w} ${def.h}" width="28" height="${h2}">${def.render(def.defaultProps, {})}</svg></span>`;
      btn.addEventListener('click', () => addAtDefault(type));
      btn.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addAtDefault(type); }
      });
      row.appendChild(btn);
    }
    container.appendChild(row);
  }

  function updateZoomLabel() {
    if (dom.zoomLabel) dom.zoomLabel.textContent = Math.round(viewport.getZoom() * 100) + '%';
  }

  function updateHistoryButtons() {
    if (dom.btnUndo) dom.btnUndo.disabled = !history.canUndo();
    if (dom.btnRedo) dom.btnRedo.disabled = !history.canRedo();
  }

  function buildToolbar() {
    dom.btnNew.addEventListener('click', () => {
      if (store.state.components.length && !confirm('Clear the canvas and start a new circuit?')) return;
      store.clearAll();
    });

    dom.btnUndo.addEventListener('click', history.undo);
    dom.btnRedo.addEventListener('click', history.redo);

    // updateZoomLabel() itself now runs automatically off setOnZoomChange
    // (registered in init()) so wheel-zooming stays in sync too — these
    // buttons just have to change the zoom level.
    dom.btnZoomIn.addEventListener('click', () => viewport.setZoom(viewport.getZoom() + 0.1));
    dom.btnZoomOut.addEventListener('click', () => viewport.setZoom(viewport.getZoom() - 0.1));
    dom.btnZoomReset.addEventListener('click', () => viewport.resetView());

    dom.btnSave.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(store.toJSON(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'circuit.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    if (dom.btnExport) {
      dom.btnExport.addEventListener('click', () => {
        const suffix = dom.canvasSvg.id.replace('canvas-svg-', '');
        const bg = getComputedStyle(dom.canvasSvg.parentElement).backgroundColor;
        exportSvgAsPng(dom.canvasSvg, `autocircuit-${suffix}.png`, bg)
          .then(() => { if (showToast) showToast('📸 Snapshot saved!'); })
          .catch(() => { if (showToast) showToast('Could not export the image — try again.'); });
      });
    }

    dom.fileInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try { store.loadFromJSON(JSON.parse(reader.result)); }
        catch (err) { alert('Could not read that file — is it a saved circuit .json?'); }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
    dom.btnLoad.addEventListener('click', () => dom.fileInput.click());

    for (const [key, ex] of Object.entries(examples)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = ex.name;
      dom.examplesSelect.appendChild(opt);
    }
    dom.btnLoadExample.addEventListener('click', () => {
      const key = dom.examplesSelect.value;
      if (!key) return;
      const ex = examples[key];
      if (store.state.components.length && !confirm(`Load "${ex.name}"? This replaces your current circuit.`)) return;
      store.loadFromJSON(ex.build());
      if (showToast) showToast(ex.blurb);
    });
  }

  function mkField(label, type, value, onInput, attrs = {}) {
    const wrap = document.createElement('label');
    wrap.className = 'field';
    const span = document.createElement('span');
    span.textContent = label;
    const input = document.createElement('input');
    input.type = type;
    input.value = value;
    for (const [k, v] of Object.entries(attrs)) if (v != null) input.setAttribute(k, v);
    input.addEventListener('input', () => onInput(input.value));
    wrap.appendChild(span);
    wrap.appendChild(input);
    return wrap;
  }

  function mkButton(text, cls, onClick) {
    const btn = document.createElement('button');
    btn.className = 'btn ' + cls;
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  }

  // Declarative extra properties (cylinders, gear count, braking force, ...).
  // A field commits through store.notify() (undo-tracked, discrete choice)
  // except plain numbers, which use liveUpdate() like the Label field so
  // dragging/typing doesn't spam undo history or steal focus.
  function renderField(field, comp) {
    const value = comp.props[field.key];
    if (field.type === 'select') {
      const wrap = document.createElement('label');
      wrap.className = 'field';
      const span = document.createElement('span');
      span.textContent = field.label;
      const select = document.createElement('select');
      field.options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = field.formatOption ? field.formatOption(opt) : String(opt);
        if (String(value) === String(opt)) o.selected = true;
        select.appendChild(o);
      });
      select.addEventListener('change', () => {
        comp.props[field.key] = field.numeric ? Number(select.value) : select.value;
        store.notify();
      });
      wrap.appendChild(span);
      wrap.appendChild(select);
      return wrap;
    }
    if (field.type === 'range') {
      const wrap = document.createElement('label');
      wrap.className = 'field';
      const span = document.createElement('span');
      span.textContent = field.label;
      const row = document.createElement('div');
      row.className = 'range-row';
      const input = document.createElement('input');
      input.type = 'range';
      input.min = field.min;
      input.max = field.max;
      input.step = field.step || 1;
      input.value = value;
      const valLabel = document.createElement('span');
      valLabel.className = 'range-value';
      valLabel.textContent = field.formatOption ? field.formatOption(value) : value;
      input.addEventListener('input', () => {
        comp.props[field.key] = Number(input.value);
        valLabel.textContent = field.formatOption ? field.formatOption(comp.props[field.key]) : input.value;
        liveUpdate();
      });
      row.appendChild(input);
      row.appendChild(valLabel);
      wrap.appendChild(span);
      wrap.appendChild(row);
      return wrap;
    }
    if (field.type === 'color') {
      const wrap = document.createElement('label');
      wrap.className = 'field';
      const span = document.createElement('span');
      span.textContent = field.label;
      const row = document.createElement('div');
      row.className = 'color-row';
      const input = document.createElement('input');
      input.type = 'color';
      input.value = value || field.default || '#ff5fa2';
      const swatchLabel = document.createElement('span');
      swatchLabel.className = 'color-value';
      swatchLabel.textContent = input.value;
      input.addEventListener('input', () => {
        comp.props[field.key] = input.value;
        swatchLabel.textContent = input.value;
        liveUpdate();
      });
      row.appendChild(input);
      row.appendChild(swatchLabel);
      wrap.appendChild(span);
      wrap.appendChild(row);
      return wrap;
    }
    // number
    return mkField(field.label, 'number', value, v => {
      comp.props[field.key] = Number(v) || 0;
      liveUpdate();
    }, { min: field.min, max: field.max, step: field.step ?? 0.1 });
  }

  function renderInspector() {
    const body = dom.inspectorBody;
    body.innerHTML = '';

    if (!currentSelection) {
      body.innerHTML = '<p class="hint">Click a part or a wire to edit it. Drag from one terminal dot to another to connect them.</p>';
      return;
    }

    if (currentSelection.kind === 'wire') {
      const w = store.state.wires.find(w => w.id === currentSelection.id);
      if (!w) return;
      const h = document.createElement('h3');
      h.textContent = 'Wire';
      body.appendChild(h);
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = `Connects ${labelFor(w.a.compId)} → ${labelFor(w.b.compId)}`;
      body.appendChild(p);
      body.appendChild(mkButton('Delete Wire', 'danger', () => {
        store.removeWire(w.id);
        currentSelection = null;
        renderInspector();
      }));
      return;
    }

    const comp = store.getComponent(currentSelection.id);
    if (!comp) return;
    const def = partDefs[comp.type];

    const h = document.createElement('h3');
    h.textContent = def.label;
    body.appendChild(h);

    if (def.hint) {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = def.hint;
      body.appendChild(hint);
    }

    body.appendChild(mkField('Label', 'text', comp.props.label ?? '', v => {
      comp.props.label = v;
      liveUpdate();
    }));

    if (def.fields) {
      for (const field of def.fields) body.appendChild(renderField(field, comp));
    }

    const sim = viewport.getLastSim();
    const compState = sim && sim.compStates[comp.id];
    if (compState && compState.warning) {
      const warn = document.createElement('p');
      warn.className = 'warning';
      warn.textContent = '⚠ ' + compState.warning;
      body.appendChild(warn);
    }

    const cycle = getCycle(def, comp.props);
    if (cycle) {
      const wrap = document.createElement('div');
      wrap.className = 'segmented';
      for (const posName of cycle) {
        const b = document.createElement('button');
        b.className = 'seg-btn' + ((comp.props.position || cycle[0]) === posName ? ' active' : '');
        b.textContent = posName.toUpperCase();
        b.addEventListener('click', () => {
          comp.props.position = posName;
          store.notify();
        });
        wrap.appendChild(b);
      }
      body.appendChild(wrap);
    } else if (def.momentary) {
      const btn = mkButton('Hold to Test', '', () => {});
      const press = () => { comp.props.on = true; viewport.render(); };
      const release = () => { if (comp.props.on) { comp.props.on = false; store.notify(); } };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointerleave', release);
      body.appendChild(btn);
    } else if (def.toggleable) {
      body.appendChild(mkButton(comp.props.on ? 'Turn OFF' : 'Turn ON', comp.props.on ? 'active' : '', () => {
        comp.props.on = !comp.props.on;
        store.notify();
      }));
    }

    if (def.statusHint) {
      const text = def.statusHint(comp.props, compState);
      if (text) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = text;
        body.appendChild(p);
      }
    }

    body.appendChild(mkButton('⟳ Rotate 90°', '', () => {
      store.rotateComponent(comp.id);
    }));

    body.appendChild(mkButton('⧉ Duplicate (Ctrl+D)', '', () => {
      const copy = store.duplicateComponent(comp.id);
      if (copy) {
        currentSelection = { kind: 'component', id: copy.id };
        renderInspector();
      }
    }));

    body.appendChild(mkButton('Delete Part', 'danger', () => {
      store.removeComponent(comp.id);
      currentSelection = null;
      renderInspector();
    }));
  }

  function labelFor(compId) {
    const c = store.getComponent(compId);
    if (!c) return compId;
    return c.props.label || partDefs[c.type].label;
  }

  function updateStatusBar() {
    const bar = dom.statusBar;
    const sim = viewport.getLastSim();
    const blownCount = sim ? Object.values(sim.compStates).filter(s => s && s.blown).length : 0;
    let text = `${store.state.components.length} part${store.state.components.length === 1 ? '' : 's'} · ${store.state.wires.length} wire${store.state.wires.length === 1 ? '' : 's'}`;
    if (blownCount) text += ` · ⚠ ${blownCount} fuse${blownCount > 1 ? 's' : ''} blown`;
    bar.textContent = text;
    bar.classList.toggle('warning', blownCount > 0);
  }

  return { init };
}
