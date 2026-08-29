// main.js — bootstraps both panels (Electrical, Mechanical) and the shared
// app chrome (tabs, help modal, toast).
import { createStore } from './state.js';
import { createViewport } from './canvas.js';
import { createHistory } from './history.js';
import { createPanel } from './ui.js';

import { PART_DEFS, CATEGORY_COLORS } from './parts.js';
import { simulate } from './simulate.js';
import { EXAMPLES } from './examples.js';

import { PART_DEFS_MECH, CATEGORY_COLORS_MECH } from './mechParts.js';
import { simulate as simulateMech } from './mechSimulate.js';
import { MECH_EXAMPLES } from './mechExamples.js';
import { createEfficiencyPanel } from './mechEfficiency.js';
import { createCommunityPage } from './community.js';

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 5000);
}

function bootPanel({ partDefs, categoryColors, simulateFn, examples, storageKey, domSuffix }) {
  const store = createStore(partDefs, storageKey);
  const svg = document.getElementById('canvas-svg-' + domSuffix);
  const viewport = createViewport({ store, partDefs, simulate: simulateFn, svgEl: svg });
  const history = createHistory(store);
  const dom = {
    paletteList: document.getElementById('palette-list-' + domSuffix),
    paletteSearch: document.getElementById('palette-search-' + domSuffix),
    paletteRecent: document.getElementById('palette-recent-' + domSuffix),
    inspectorBody: document.getElementById('inspector-body-' + domSuffix),
    btnNew: document.getElementById('btn-new-' + domSuffix),
    btnUndo: document.getElementById('btn-undo-' + domSuffix),
    btnRedo: document.getElementById('btn-redo-' + domSuffix),
    btnZoomIn: document.getElementById('btn-zoom-in-' + domSuffix),
    btnZoomOut: document.getElementById('btn-zoom-out-' + domSuffix),
    btnZoomReset: document.getElementById('btn-zoom-reset-' + domSuffix),
    zoomLabel: document.getElementById('zoom-label-' + domSuffix),
    btnSave: document.getElementById('btn-save-' + domSuffix),
    btnLoad: document.getElementById('btn-load-' + domSuffix),
    btnExport: document.getElementById('btn-export-' + domSuffix),
    fileInput: document.getElementById('file-input-' + domSuffix),
    examplesSelect: document.getElementById('examples-select-' + domSuffix),
    btnLoadExample: document.getElementById('btn-load-example-' + domSuffix),
    statusBar: document.getElementById('status-bar-' + domSuffix),
    canvasSvg: svg,
  };
  const panel = createPanel({ store, partDefs, categoryColors, viewport, history, examples, dom, showToast });
  panel.init();

  const restored = store.loadFromLocalStorage();
  if (!restored) {
    const first = Object.values(examples)[0];
    store.loadFromJSON(first.build());
  }
  history.initHistory();

  // A friendly "your canvas is empty" prompt instead of a bare grid — shown
  // only when there's genuinely nothing on the canvas.
  const emptyHint = document.getElementById('canvas-empty-' + domSuffix);
  function updateEmptyHint() {
    emptyHint.classList.toggle('show', store.state.components.length === 0);
  }
  store.onChange(updateEmptyHint);
  updateEmptyHint();
  emptyHint.querySelector('[data-empty-example]').addEventListener('click', () => {
    store.loadFromJSON(Object.values(examples)[0].build());
  });

  return { store, history, examples };
}

const elec = bootPanel({
  partDefs: PART_DEFS, categoryColors: CATEGORY_COLORS, simulateFn: simulate,
  examples: EXAMPLES, storageKey: 'automobile-circuit-autosave', domSuffix: 'elec',
});

const mech = bootPanel({
  partDefs: PART_DEFS_MECH, categoryColors: CATEGORY_COLORS_MECH, simulateFn: simulateMech,
  examples: MECH_EXAMPLES, storageKey: 'automobile-mech-autosave', domSuffix: 'mech',
});

createEfficiencyPanel({
  store: mech.store,
  dom: {
    openBtn: document.getElementById('btn-efficiency-mech'),
    modal: document.getElementById('efficiency-modal'),
    closeBtn: document.getElementById('efficiency-close'),
    body: document.getElementById('efficiency-body'),
  },
});

createCommunityPage({
  stores: { elec: elec.store, mech: mech.store },
  partDefs: { elec: PART_DEFS, mech: PART_DEFS_MECH },
  showToast,
  dom: {
    communityPanel: document.getElementById('panel-community'),
    communityStatus: document.getElementById('community-status'),
    communityFeed: document.getElementById('community-feed'),
    communityFilterDomain: document.getElementById('community-filter-domain'),
    communitySort: document.getElementById('community-sort'),
    communityRefresh: document.getElementById('btn-community-refresh'),
    publishButtons: {
      elec: document.getElementById('btn-publish-elec'),
      mech: document.getElementById('btn-publish-mech'),
    },
    publishModal: document.getElementById('publish-modal'),
    publishClose: document.getElementById('publish-close'),
    publishName: document.getElementById('publish-name'),
    publishTitle: document.getElementById('publish-title'),
    publishDesc: document.getElementById('publish-desc'),
    publishError: document.getElementById('publish-error'),
    publishSubmit: document.getElementById('publish-submit'),
  },
});

// ---- Undo/redo keyboard shortcuts (act on whichever tab is visible) ----
window.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if (!(e.ctrlKey || e.metaKey)) return;
  const activePanel = document.getElementById('panel-elec').classList.contains('active') ? elec : mech;
  if (e.key === 'z' || e.key === 'Z') {
    e.preventDefault();
    if (e.shiftKey) activePanel.history.redo(); else activePanel.history.undo();
  } else if (e.key === 'y' || e.key === 'Y') {
    e.preventDefault();
    activePanel.history.redo();
  }
});

// ---------------------------------------------------------------- Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.app-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    // Each workbench gets its own color mood — electric amber/violet vs.
    // mechanical blue/teal — so switching tabs actually feels like walking
    // into a different room, not just swapping a table underneath you.
    // (This is `data-mood`, separate from the light/dark/etc. `data-theme`
    // on <html> below — a tab's mood layers on top of whichever theme is active.)
    document.body.dataset.mood = btn.dataset.tab;
  });
});

// ------------------------------------------------------------ Theme picker
// Five color themes — not just dark/light: Neon and Blueprint deliberately
// don't look like a conventional app. Every color in style.css reads from
// a CSS custom property, so switching themes is just swapping the
// `data-theme` attribute on <html>; nothing else needs to know.
const THEME_KEY = 'autocircuit-app-theme';
const THEMES = ['light', 'dark', 'neon', 'blueprint', 'candy'];
const themeBtn = document.getElementById('btn-theme');
const themePopover = document.getElementById('theme-popover');
const themeSwatches = [...themePopover.querySelectorAll('.theme-swatch')];

function applyTheme(name) {
  if (!THEMES.includes(name)) name = 'light';
  if (name === 'light') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = name;
  localStorage.setItem(THEME_KEY, name);
  themeSwatches.forEach(s => s.classList.toggle('active', s.dataset.themeValue === name));
}
function openThemePopover() {
  themePopover.classList.add('open');
  themeBtn.setAttribute('aria-expanded', 'true');
}
function closeThemePopover() {
  themePopover.classList.remove('open');
  themeBtn.setAttribute('aria-expanded', 'false');
}
themeBtn.addEventListener('click', () => {
  themePopover.classList.contains('open') ? closeThemePopover() : openThemePopover();
});
themeSwatches.forEach(s => s.addEventListener('click', () => {
  applyTheme(s.dataset.themeValue);
  closeThemePopover();
}));
document.addEventListener('click', e => {
  if (!themePopover.classList.contains('open')) return;
  if (e.target === themeBtn || themeBtn.contains(e.target) || themePopover.contains(e.target)) return;
  closeThemePopover();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeThemePopover(); });
applyTheme(localStorage.getItem(THEME_KEY) || 'light');

// -------------------------------------------------------------- Help modal
const modal = document.getElementById('help-modal');
document.getElementById('btn-help').addEventListener('click', () => modal.classList.add('open'));
document.getElementById('help-close').addEventListener('click', () => modal.classList.remove('open'));
modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });

// ----------------------------------------------------------- Welcome modal
const WELCOME_KEY = 'autocircuit-welcomed';
const welcomeModal = document.getElementById('welcome-modal');
function closeWelcome() {
  welcomeModal.classList.remove('open');
  localStorage.setItem(WELCOME_KEY, '1');
}
document.getElementById('welcome-close').addEventListener('click', closeWelcome);
document.getElementById('welcome-explore').addEventListener('click', closeWelcome);
document.getElementById('welcome-example').addEventListener('click', () => {
  elec.store.loadFromJSON(Object.values(elec.examples)[0].build());
  closeWelcome();
  showToast('Flip the switch on the headlight to see it in action! ⚡');
});
welcomeModal.addEventListener('click', e => { if (e.target === welcomeModal) closeWelcome(); });
if (!localStorage.getItem(WELCOME_KEY)) welcomeModal.classList.add('open');
