// sound.js — a tiny, synthesized sound system (Web Audio API oscillators,
// not audio files) so the app has an audible personality without adding a
// single asset or dependency, matching the rest of the project's "no build
// step, no framework, no dependencies" rule. Every sound is just a couple
// of short envelope-shaped tones.
const MUTE_KEY = 'autocircuit-sound-muted';
let ctx = null;
let muted = localStorage.getItem(MUTE_KEY) === '1';

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function isMuted() { return muted; }
function setMuted(m) {
  muted = m;
  localStorage.setItem(MUTE_KEY, m ? '1' : '0');
}

// One short tone with a percussive volume envelope so nothing ever clicks
// or pops — attack up fast, exponential decay down, always silent by the
// time it "stops".
function tone({ freq = 440, duration = 0.12, type = 'sine', gain = 0.12, glideTo = null, delay = 0 }) {
  if (muted) return;
  const ac = getCtx();
  if (!ac) return;
  try {
    if (ac.state === 'suspended') ac.resume();
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + duration);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  } catch (e) { /* audio is a nicety — never let it break the app */ }
}

export const sound = {
  isMuted, setMuted,
  click() { tone({ freq: 520, duration: 0.07, type: 'square', gain: 0.07 }); },
  place() {
    tone({ freq: 380, duration: 0.09, type: 'triangle', gain: 0.11 });
    tone({ freq: 600, duration: 0.08, type: 'triangle', gain: 0.08, delay: 0.05 });
  },
  delete() { tone({ freq: 320, duration: 0.16, type: 'sawtooth', gain: 0.07, glideTo: 110 }); },
  powerOn() {
    tone({ freq: 440, duration: 0.14, type: 'sine', gain: 0.11 });
    tone({ freq: 660, duration: 0.16, type: 'sine', gain: 0.09, delay: 0.07 });
  },
  achievement() {
    tone({ freq: 523.25, duration: 0.11, gain: 0.11 });
    tone({ freq: 659.25, duration: 0.11, gain: 0.11, delay: 0.1 });
    tone({ freq: 783.99, duration: 0.24, gain: 0.13, delay: 0.2 });
  },
  publish() {
    tone({ freq: 392, duration: 0.09, gain: 0.09 });
    tone({ freq: 523.25, duration: 0.09, gain: 0.09, delay: 0.08 });
    tone({ freq: 659.25, duration: 0.2, gain: 0.11, delay: 0.16 });
  },
};
