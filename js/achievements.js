// achievements.js — a small, local, no-account badge system that touches
// every corner of the app (both workbenches, the Community tab, even the
// theme picker) as a fun reason to go poke at the parts you haven't tried
// yet. Purely a localStorage-side nicety — nothing here is visible to
// anyone but you, unlike the Community tab's genuinely shared data.
const KEY = 'autocircuit-achievements';

export const ACHIEVEMENTS = [
  { id: 'first-part', emoji: '🔌', title: 'First Circuit', desc: 'Add your first part to a canvas.' },
  { id: 'power-on', emoji: '⚡', title: 'Let There Be Light', desc: 'Power something on for the first time.' },
  { id: 'engine-start', emoji: '🔧', title: 'Gearhead', desc: 'Start an Engine for the first time.' },
  { id: 'speed-demon', emoji: '🏎️', title: 'Speed Demon', desc: 'Build a car with a 250+ km/h top speed.' },
  { id: 'duplicate', emoji: '⧉', title: 'Cloner', desc: 'Duplicate a part.' },
  { id: 'export', emoji: '📸', title: 'Photographer', desc: 'Export your canvas as an image.' },
  { id: 'theme-explorer', emoji: '🎨', title: 'Style Icon', desc: 'Try all 5 themes.' },
  { id: 'publish', emoji: '🌍', title: 'Published!', desc: 'Publish a build to the Community.' },
  { id: 'liked-one', emoji: '❤️', title: 'Crowd Pleaser', desc: "Like someone else's build." },
  { id: 'commented', emoji: '💬', title: 'Conversationalist', desc: 'Post a comment.' },
  { id: 'remix', emoji: '🔄', title: 'Remixer', desc: "Load a community build into your canvas." },
];

function readUnlocked() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; }
  catch (e) { return []; }
}
function writeUnlocked(arr) { localStorage.setItem(KEY, JSON.stringify(arr)); }

let onUnlockCallback = null;
export function setOnUnlock(fn) { onUnlockCallback = fn; }

// Idempotent — safe to call on every relevant action without checking
// "have they already got this?" yourself first.
export function unlock(id) {
  const unlocked = readUnlocked();
  if (unlocked.includes(id)) return false;
  unlocked.push(id);
  writeUnlocked(unlocked);
  const def = ACHIEVEMENTS.find(a => a.id === id);
  if (def && onUnlockCallback) onUnlockCallback(def);
  return true;
}

export function getProgress() {
  const unlocked = readUnlocked();
  return {
    unlocked: unlocked.length,
    total: ACHIEVEMENTS.length,
    list: ACHIEVEMENTS.map(a => ({ ...a, unlocked: unlocked.includes(a.id) })),
  };
}

// Themes are tracked separately since "tried all 5" needs its own small
// set, not a single boolean.
const THEMES_KEY = 'autocircuit-themes-tried';
export function recordThemeTried(name) {
  let tried;
  try { tried = JSON.parse(localStorage.getItem(THEMES_KEY)) || []; }
  catch (e) { tried = []; }
  if (!tried.includes(name)) {
    tried.push(name);
    localStorage.setItem(THEMES_KEY, JSON.stringify(tried));
  }
  if (tried.length >= 5) unlock('theme-explorer');
}
