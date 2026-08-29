// parts.js — definitions for every automotive electrical part the user can place.
// Each part defines: category (drives its color), size, terminals (connection
// points), default properties, and a render() function returning inner SVG
// markup for its body. Colors come from CSS custom properties set per
// category class (see style.css) so simulate.js can light things up live.
//
// A few parts declare an interaction style beyond plain click-to-select:
//   toggleable: true   — click flips props.on (latching switch behavior)
//   momentary: true    — press-and-hold sets props.on for as long as the
//                        mouse button is down (horn/starter button behavior)
//   cycle: [...states] — click advances props.position through this list
//                        (multi-position ignition switch)

// Shared field descriptors for the inspector's generic "extra properties"
// system (see ui.js's renderField). A part just lists which ones it wants
// in its `fields` array.
export const CURRENT_FIELD = { key: 'current', label: 'Rated current (A)', type: 'number', min: 0, step: 0.1 };
export const LIGHT_COLOR_FIELD = { key: 'color', label: 'Light Color', type: 'color' };

// Darkens (negative percent) or lightens (positive) a #rrggbb color — used
// to derive a light's "lit" stroke/glow from whatever color the user picks,
// so customizing one field still looks properly shaded, not flat.
export function shade(hex, percent) {
  const h = (hex || '#888888').replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const num = parseInt(full, 16) || 0;
  const clamp = v => Math.max(0, Math.min(255, v));
  const r = clamp((num >> 16) + Math.round(255 * percent));
  const g = clamp(((num >> 8) & 0xff) + Math.round(255 * percent));
  const b = clamp((num & 0xff) + Math.round(255 * percent));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}
export const FUSE_RATING_FIELD = {
  key: 'rating', label: 'Fuse rating (A)', type: 'select', numeric: true,
  options: [5, 7.5, 10, 15, 20, 25, 30, 40], formatOption: v => v + 'A',
};

export const CATEGORY_COLORS = {
  Power:       { fill: '#fef3c7', stroke: '#b45309', accent: '#f59e0b' },
  Control:     { fill: '#dbeafe', stroke: '#1d4ed8', accent: '#3b82f6' },
  Lights:      { fill: '#fef9c3', stroke: '#a16207', accent: '#eab308' },
  Motors:      { fill: '#ede9fe', stroke: '#6d28d9', accent: '#8b5cf6' },
  Accessories: { fill: '#cffafe', stroke: '#0e7490', accent: '#06b6d4' },
  Sensors:     { fill: '#d1fae5', stroke: '#047857', accent: '#10b981' },
  Passive:     { fill: '#fce7f3', stroke: '#be185d', accent: '#ec4899' },
};

export const PART_DEFS = {

  // ---------------------------------------------------------------- Power
  battery: {
    label: 'Battery (12V)',
    category: 'Power',
    w: 70, h: 100,
    terminals: [
      { id: 'pos', x: 35, y: 0,   role: 'source_pos', name: '+' },
      { id: 'neg', x: 35, y: 100, role: 'source_neg', name: '-' },
    ],
    defaultProps: { label: 'Battery' },
    render() {
      return `
        <rect x="10" y="15" width="50" height="70" rx="6" class="body" fill="var(--part-fill)" stroke="var(--part-stroke)" stroke-width="2"/>
        <rect x="24" y="6" width="10" height="10" fill="var(--part-stroke)"/>
        <rect x="36" y="6" width="10" height="10" fill="var(--part-stroke)"/>
        <text x="35" y="38" text-anchor="middle" class="glyph" font-size="20" font-weight="700" fill="#e74c3c">+</text>
        <text x="35" y="70" text-anchor="middle" class="glyph" font-size="20" font-weight="700" fill="#555">−</text>
        <text x="35" y="98" text-anchor="middle" class="part-label">Battery</text>
      `;
    }
  },

  ground: {
    label: 'Chassis Ground',
    category: 'Power',
    w: 50, h: 46,
    terminals: [
      { id: 'gnd', x: 25, y: 0, role: 'ground', name: 'GND' },
    ],
    defaultProps: { label: 'Ground' },
    render() {
      return `
        <line x1="25" y1="2" x2="25" y2="18" stroke="var(--part-stroke)" stroke-width="3"/>
        <line x1="8" y1="18" x2="42" y2="18" stroke="var(--part-stroke)" stroke-width="3"/>
        <line x1="14" y1="26" x2="36" y2="26" stroke="var(--part-stroke)" stroke-width="3"/>
        <line x1="20" y1="34" x2="30" y2="34" stroke="var(--part-stroke)" stroke-width="3"/>
        <text x="25" y="46" text-anchor="middle" class="part-label">Ground</text>
      `;
    }
  },

  alternator: {
    label: 'Alternator',
    category: 'Power',
    w: 70, h: 70,
    terminals: [
      { id: 'out', x: 0, y: 35, role: 'source_pos', name: 'B+' },
      { id: 'gnd', x: 70, y: 35, role: 'source_neg', name: 'GND' },
    ],
    defaultProps: { label: 'Alternator', on: false },
    toggleable: true,
    render(props) {
      const running = !!props.on;
      return `
        <circle cx="35" cy="33" r="20" fill="var(--part-fill)" stroke="var(--part-stroke)" stroke-width="2" class="${running ? 'spin' : ''}"/>
        <text x="35" y="38" text-anchor="middle" font-size="11" font-weight="700" fill="var(--part-stroke)">ALT</text>
        <text x="35" y="66" text-anchor="middle" class="part-label">${props.label || 'Alternator'} — ${running ? 'running' : 'off'}</text>
      `;
    }
  },

  voltageRegulator: {
    label: 'Voltage Regulator',
    category: 'Power',
    w: 84, h: 56,
    terminals: [
      { id: 'pwr', x: 0, y: 28, role: 'load_pwr', name: 'PWR' },
      { id: 'gnd', x: 84, y: 28, role: 'load_gnd', name: 'GND' },
    ],
    defaultProps: { label: 'Voltage Regulator', current: 0.3 },
    fields: [CURRENT_FIELD],
    render(props, s) {
      const on = s && s.active;
      return `
        <rect x="10" y="8" width="64" height="34" rx="4" fill="var(--part-fill)" stroke="var(--part-stroke)" stroke-width="2"/>
        <circle cx="64" cy="16" r="4" fill="${on ? '#3ddc50' : '#999'}"/>
        <text x="42" y="30" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--part-stroke)">V-REG</text>
        <text x="42" y="54" text-anchor="middle" class="part-label">${props.label || 'V-Reg'}</text>
      `;
    }
  },

  junction: {
    label: 'Splice / Junction',
    category: 'Power',
    w: 44, h: 44,
    terminals: [
      { id: 'a', x: 22, y: 2,  role: 'pass', name: 'A' },
      { id: 'b', x: 2,  y: 38, role: 'pass', name: 'B' },
      { id: 'c', x: 42, y: 38, role: 'pass', name: 'C' },
    ],
    defaultProps: { label: 'Splice' },
    render() {
      return `
        <circle cx="22" cy="24" r="9" fill="var(--part-stroke)"/>
        <text x="22" y="44" text-anchor="middle" class="part-label" style="display:none">Splice</text>
      `;
    }
  },

  // -------------------------------------------------------------- Control
  switch: {
    label: 'Switch',
    category: 'Control',
    w: 90, h: 50,
    terminals: [
      { id: 'in', x: 0, y: 25, role: 'pass_in', name: 'IN' },
      { id: 'out', x: 90, y: 25, role: 'pass_out', name: 'OUT' },
    ],
    defaultProps: { label: 'Switch', on: false },
    toggleable: true,
    render(props) {
      const on = !!props.on;
      const leverEnd = on ? { x: 68, y: 12 } : { x: 68, y: 34 };
      return `
        <circle cx="14" cy="25" r="5" fill="var(--part-stroke)"/>
        <circle cx="76" cy="25" r="5" fill="var(--part-stroke)"/>
        <line x1="14" y1="25" x2="${leverEnd.x}" y2="${leverEnd.y}" stroke="${on ? 'var(--wire-hot)' : 'var(--part-stroke)'}" stroke-width="3" stroke-linecap="round"/>
        <text x="45" y="46" text-anchor="middle" class="part-label">${props.label || 'Switch'} — ${on ? 'ON' : 'OFF'}</text>
      `;
    }
  },

  pushbutton: {
    label: 'Push Button',
    category: 'Control',
    w: 70, h: 60,
    terminals: [
      { id: 'in', x: 0, y: 30, role: 'pass_in', name: 'IN' },
      { id: 'out', x: 70, y: 30, role: 'pass_out', name: 'OUT' },
    ],
    defaultProps: { label: 'Push Button', on: false },
    momentary: true,
    render(props) {
      const on = !!props.on;
      return `
        <circle cx="35" cy="26" r="17" fill="${on ? '#fca5a5' : 'var(--part-fill)'}" stroke="var(--part-stroke)" stroke-width="2"/>
        <circle cx="35" cy="26" r="${on ? 9 : 11}" fill="${on ? '#ef4444' : '#fff'}" stroke="var(--part-stroke)" stroke-width="1.5"/>
        <text x="35" y="56" text-anchor="middle" class="part-label">${props.label || 'Push Button'}${on ? ' (pressed)' : ''}</text>
      `;
    }
  },

  ignitionSwitch: {
    label: 'Ignition Switch',
    category: 'Control',
    w: 150, h: 70,
    terminals: [
      { id: 'com', x: 0, y: 35, role: 'pass_in', name: 'BATT' },
      { id: 'acc', x: 150, y: 12, role: 'pass_out', name: 'ACC' },
      { id: 'on', x: 150, y: 35, role: 'pass_out', name: 'ON' },
      { id: 'start', x: 150, y: 58, role: 'pass_out', name: 'START' },
    ],
    defaultProps: { label: 'Ignition', position: 'off' },
    cycle: ['off', 'acc', 'on', 'start'],
    render(props) {
      const pos = props.position || 'off';
      const rows = [
        { key: 'acc', y: 12, text: 'ACC' },
        { key: 'on', y: 35, text: 'ON' },
        { key: 'start', y: 58, text: 'START' },
      ];
      const dotY = { off: 35, acc: 12, on: 35, start: 58 }[pos];
      return `
        <rect x="6" y="4" width="138" height="62" rx="8" fill="var(--part-fill)" stroke="var(--part-stroke)" stroke-width="2"/>
        <circle cx="16" cy="35" r="5" fill="var(--part-stroke)"/>
        ${rows.map(r => `
          <circle cx="134" cy="${r.y}" r="4" fill="var(--part-stroke)"/>
          <text x="112" y="${r.y + 4}" text-anchor="end" font-size="10" fill="var(--part-stroke)">${r.text}</text>
        `).join('')}
        <line x1="16" y1="35" x2="70" y2="${dotY}" stroke="var(--wire-hot)" stroke-width="2.5"/>
        <circle cx="70" cy="${dotY}" r="4" fill="var(--wire-hot)"/>
        <text x="75" y="70" text-anchor="middle" class="part-label">${props.label || 'Ignition'} — ${pos.toUpperCase()}</text>
      `;
    }
  },

  fuse: {
    label: 'Fuse',
    category: 'Control',
    w: 70, h: 40,
    terminals: [
      { id: 'in', x: 0, y: 20, role: 'fuse_in', name: 'IN' },
      { id: 'out', x: 70, y: 20, role: 'fuse_out', name: 'OUT' },
    ],
    defaultProps: { label: 'Fuse', rating: 10 },
    fields: [FUSE_RATING_FIELD],
    render(props, s) {
      const blown = s && s.blown;
      return `
        <rect x="10" y="8" width="50" height="24" rx="10" fill="${blown ? '#fecaca' : 'var(--part-fill)'}" stroke="${blown ? '#c0392b' : 'var(--part-stroke)'}" stroke-width="2"/>
        <path d="M 16 20 L 26 12 L 34 26 L 44 12 L 54 20" fill="none" stroke="${blown ? '#c0392b' : 'var(--part-stroke)'}" stroke-width="2" stroke-dasharray="${blown ? '3,3' : ''}"/>
        <text x="35" y="40" text-anchor="middle" class="part-label">${props.rating}A Fuse${blown ? ' (BLOWN)' : ''}</text>
      `;
    }
  },

  circuitBreaker: {
    label: 'Circuit Breaker',
    category: 'Control',
    w: 74, h: 44,
    terminals: [
      { id: 'in', x: 0, y: 22, role: 'fuse_in', name: 'IN' },
      { id: 'out', x: 74, y: 22, role: 'fuse_out', name: 'OUT' },
    ],
    // Same overload math as a Fuse (see simulate.js), just heavier-duty
    // default ratings — the kind you'd use for a whole accessory panel
    // rather than one bulb.
    defaultProps: { label: 'Circuit Breaker', rating: 30 },
    fields: [{ key: 'rating', label: 'Breaker rating (A)', type: 'select', numeric: true, options: [20, 30, 40, 50, 60], formatOption: v => v + 'A' }],
    render(props, s) {
      const blown = s && s.blown;
      return `
        <rect x="8" y="6" width="58" height="32" rx="8" fill="${blown ? '#fecaca' : 'var(--part-fill)'}" stroke="${blown ? '#c0392b' : 'var(--part-stroke)'}" stroke-width="2"/>
        <rect x="${blown ? 16 : 30}" y="14" width="16" height="16" rx="4" fill="${blown ? '#c0392b' : 'var(--wire-hot)'}"/>
        <text x="37" y="44" text-anchor="middle" class="part-label" transform="translate(0,4)">${props.rating}A Breaker${blown ? ' (TRIPPED)' : ''}</text>
      `;
    }
  },

  relay: {
    label: 'Relay',
    category: 'Control',
    w: 110, h: 90,
    terminals: [
      { id: 'coilA', x: 0, y: 15, role: 'pass_in', name: '85 (coil+)' },
      { id: 'coilB', x: 0, y: 75, role: 'ground_in', name: '86 (coil−)' },
      { id: 'com', x: 110, y: 45, role: 'pass_in', name: '30 (COM)' },
      { id: 'no', x: 110, y: 15, role: 'pass_out', name: '87 (NO)' },
      { id: 'nc', x: 110, y: 75, role: 'pass_out', name: '87a (NC)' },
    ],
    defaultProps: { label: 'Relay' },
    statusHint(props, s) {
      return s && s.energized ? 'Coil energized — switched to NO (87).' : 'Coil off — resting on NC (87a).';
    },
    render(props, s) {
      const energized = s && s.energized;
      return `
        <rect x="6" y="4" width="98" height="82" rx="6" fill="var(--part-fill)" stroke="var(--part-stroke)" stroke-width="2"/>
        <path d="M 14 15 q6 -8 12 0 q6 -8 12 0 q6 -8 12 0" fill="none" stroke="${energized ? 'var(--wire-hot)' : 'var(--part-stroke)'}" stroke-width="2"/>
        <line x1="14" y1="75" x2="50" y2="75" stroke="var(--part-stroke)" stroke-width="1" stroke-dasharray="2,2"/>
        <circle cx="96" cy="45" r="4" fill="var(--part-stroke)"/>
        <circle cx="96" cy="15" r="4" fill="var(--part-stroke)"/>
        <circle cx="96" cy="75" r="4" fill="var(--part-stroke)"/>
        <line x1="96" y1="45" x2="96" y2="${energized ? 17 : 73}" stroke="${energized ? 'var(--wire-hot)' : '#888'}" stroke-width="3"/>
        <text x="55" y="88" text-anchor="middle" class="part-label">${props.label || 'Relay'}${energized ? ' ⚡' : ''}</text>
      `;
    }
  },

  // --------------------------------------------------------------- Lights
  headlight: {
    label: 'Headlight',
    category: 'Lights',
    w: 70, h: 60,
    terminals: [
      { id: 'pwr', x: 0, y: 30, role: 'load_pwr', name: 'PWR' },
      { id: 'gnd', x: 70, y: 30, role: 'load_gnd', name: 'GND' },
    ],
    defaultProps: { label: 'Headlight', current: 5, color: '#ffe066' },
    fields: [CURRENT_FIELD, LIGHT_COLOR_FIELD],
    render(props, s) {
      const on = s && s.active;
      const c = props.color || '#ffe066';
      return `
        ${on ? `<circle cx="35" cy="28" r="22" fill="${c}" opacity="0.45" class="glow"/>` : ''}
        <circle cx="35" cy="28" r="16" fill="${on ? c : 'var(--part-fill)'}" stroke="${on ? shade(c, -0.3) : 'var(--part-stroke)'}" stroke-width="2"/>
        <text x="35" y="58" text-anchor="middle" class="part-label">${props.label || 'Headlight'}</text>
      `;
    }
  },

  taillight: {
    label: 'Taillight',
    category: 'Lights',
    w: 70, h: 60,
    terminals: [
      { id: 'pwr', x: 0, y: 30, role: 'load_pwr', name: 'PWR' },
      { id: 'gnd', x: 70, y: 30, role: 'load_gnd', name: 'GND' },
    ],
    defaultProps: { label: 'Taillight', current: 1, color: '#ff4d4d' },
    fields: [CURRENT_FIELD, LIGHT_COLOR_FIELD],
    render(props, s) {
      const on = s && s.active;
      const c = props.color || '#ff4d4d';
      return `
        ${on ? `<circle cx="35" cy="28" r="22" fill="${c}" opacity="0.45" class="glow"/>` : ''}
        <circle cx="35" cy="28" r="16" fill="${on ? c : 'var(--part-fill)'}" stroke="${on ? shade(c, -0.3) : 'var(--part-stroke)'}" stroke-width="2"/>
        <text x="35" y="58" text-anchor="middle" class="part-label">${props.label || 'Taillight'}</text>
      `;
    }
  },

  indicator: {
    label: 'Turn Signal',
    category: 'Lights',
    w: 70, h: 60,
    terminals: [
      { id: 'pwr', x: 0, y: 30, role: 'load_pwr', name: 'PWR' },
      { id: 'gnd', x: 70, y: 30, role: 'load_gnd', name: 'GND' },
    ],
    defaultProps: { label: 'Turn Signal', current: 1.5, color: '#ffa733' },
    fields: [CURRENT_FIELD, LIGHT_COLOR_FIELD],
    render(props, s) {
      const on = s && s.active;
      const c = props.color || '#ffa733';
      return `
        <circle cx="35" cy="28" r="16" fill="${on ? c : 'var(--part-fill)'}" stroke="${on ? shade(c, -0.3) : 'var(--part-stroke)'}" stroke-width="2" class="${on ? 'blink' : ''}"/>
        <text x="35" y="58" text-anchor="middle" class="part-label">${props.label || 'Turn Signal'}</text>
      `;
    }
  },

  fogLight: {
    label: 'Fog Light',
    category: 'Lights',
    w: 70, h: 60,
    terminals: [
      { id: 'pwr', x: 0, y: 30, role: 'load_pwr', name: 'PWR' },
      { id: 'gnd', x: 70, y: 30, role: 'load_gnd', name: 'GND' },
    ],
    defaultProps: { label: 'Fog Light', current: 4, color: '#ffb84d' },
    fields: [CURRENT_FIELD, LIGHT_COLOR_FIELD],
    render(props, s) {
      const on = s && s.active;
      const c = props.color || '#ffb84d';
      return `
        ${on ? `<circle cx="35" cy="28" r="22" fill="${c}" opacity="0.4" class="glow"/>` : ''}
        <rect x="19" y="12" width="32" height="32" rx="16" fill="${on ? c : 'var(--part-fill)'}" stroke="${on ? shade(c, -0.35) : 'var(--part-stroke)'}" stroke-width="2"/>
        <text x="35" y="58" text-anchor="middle" class="part-label">${props.label || 'Fog Light'}</text>
      `;
    }
  },

  warningLight: {
    label: 'Warning Light',
    category: 'Lights',
    w: 44, h: 40,
    terminals: [
      { id: 'pwr', x: 0, y: 20, role: 'load_pwr', name: 'PWR' },
      { id: 'gnd', x: 44, y: 20, role: 'load_gnd', name: 'GND' },
    ],
    defaultProps: { label: 'Warning Light', current: 0.2, color: '#ff3b3b' },
    fields: [CURRENT_FIELD, LIGHT_COLOR_FIELD],
    render(props, s) {
      const on = s && s.active;
      const c = props.color || '#ff3b3b';
      return `
        ${on ? `<circle cx="22" cy="18" r="13" fill="${c}" opacity="0.5" class="glow"/>` : ''}
        <circle cx="22" cy="18" r="8" fill="${on ? c : 'var(--part-fill)'}" stroke="${on ? shade(c, -0.4) : 'var(--part-stroke)'}" stroke-width="2"/>
        <text x="22" y="38" text-anchor="middle" class="part-label">${props.label || 'Warning'}</text>
      `;
    }
  },

  // --------------------------------------------------------------- Motors
  starter: {
    label: 'Starter Motor',
    category: 'Motors',
    w: 70, h: 70,
    terminals: [
      { id: 'pwr', x: 0, y: 35, role: 'load_pwr', name: 'PWR' },
      { id: 'gnd', x: 70, y: 35, role: 'load_gnd', name: 'GND' },
    ],
    defaultProps: { label: 'Starter Motor', current: 80 },
    fields: [CURRENT_FIELD],
    render(props, s) {
      const on = s && s.active;
      return `
        <circle cx="35" cy="33" r="20" fill="var(--part-fill)" stroke="var(--part-stroke)" stroke-width="2" class="${on ? 'spin' : ''}"/>
        <line x1="35" y1="33" x2="35" y2="17" stroke="var(--part-stroke)" stroke-width="2" class="${on ? 'spin' : ''}"/>
        <text x="35" y="37" text-anchor="middle" font-size="16" font-weight="700" fill="var(--part-stroke)">M</text>
        <text x="35" y="66" text-anchor="middle" class="part-label">${props.label || 'Starter'}</text>
      `;
    }
  },

  wiper: {
    label: 'Wiper Motor',
    category: 'Motors',
    w: 70, h: 70,
    terminals: [
      { id: 'pwr', x: 0, y: 35, role: 'load_pwr', name: 'PWR' },
      { id: 'gnd', x: 70, y: 35, role: 'load_gnd', name: 'GND' },
    ],
    defaultProps: { label: 'Wiper Motor', current: 3 },
    fields: [CURRENT_FIELD],
    render(props, s) {
      const on = s && s.active;
      return `
        <circle cx="35" cy="33" r="20" fill="var(--part-fill)" stroke="var(--part-stroke)" stroke-width="2" class="${on ? 'spin' : ''}"/>
        <line x1="35" y1="33" x2="35" y2="17" stroke="var(--part-stroke)" stroke-width="2" class="${on ? 'spin' : ''}"/>
        <text x="35" y="37" text-anchor="middle" font-size="16" font-weight="700" fill="var(--part-stroke)">M</text>
        <text x="35" y="66" text-anchor="middle" class="part-label">${props.label || 'Wiper'}</text>
      `;
    }
  },

  motor: {
    label: 'Motor (generic)',
    category: 'Motors',
    w: 70, h: 70,
    terminals: [
      { id: 'pwr', x: 0, y: 35, role: 'load_pwr', name: 'PWR' },
      { id: 'gnd', x: 70, y: 35, role: 'load_gnd', name: 'GND' },
    ],
    defaultProps: { label: 'Motor', current: 5 },
    fields: [CURRENT_FIELD],
    render(props, s) {
      const on = s && s.active;
      return `
        <circle cx="35" cy="33" r="20" fill="var(--part-fill)" stroke="var(--part-stroke)" stroke-width="2" class="${on ? 'spin' : ''}"/>
        <line x1="35" y1="33" x2="35" y2="17" stroke="var(--part-stroke)" stroke-width="2" class="${on ? 'spin' : ''}"/>
        <text x="35" y="37" text-anchor="middle" font-size="16" font-weight="700" fill="var(--part-stroke)">M</text>
        <text x="35" y="66" text-anchor="middle" class="part-label">${props.label || 'Motor'}</text>
      `;
    },
    hint: 'Rename this to build a fan, window, fuel pump, or any other motor.'
  },

  // ---------------------------------------------------------- Accessories
  horn: {
    label: 'Horn',
    category: 'Accessories',
    w: 70, h: 60,
    terminals: [
      { id: 'pwr', x: 0, y: 30, role: 'load_pwr', name: 'PWR' },
      { id: 'gnd', x: 70, y: 30, role: 'load_gnd', name: 'GND' },
    ],
    defaultProps: { label: 'Horn', current: 5 },
    fields: [CURRENT_FIELD],
    render(props, s) {
      const on = s && s.active;
      return `
        <g class="${on ? 'pulse' : ''}">
          <path d="M 16 18 L 40 10 L 40 46 L 16 38 Z" fill="${on ? '#ffd966' : 'var(--part-fill)'}" stroke="var(--part-stroke)" stroke-width="2"/>
          <path d="M 40 14 Q 58 28 40 42" fill="none" stroke="var(--part-stroke)" stroke-width="3"/>
        </g>
        <text x="35" y="58" text-anchor="middle" class="part-label">${props.label || 'Horn'}</text>
      `;
    }
  },

  buzzer: {
    label: 'Buzzer',
    category: 'Accessories',
    w: 60, h: 56,
    terminals: [
      { id: 'pwr', x: 0, y: 28, role: 'load_pwr', name: 'PWR' },
      { id: 'gnd', x: 60, y: 28, role: 'load_gnd', name: 'GND' },
    ],
    defaultProps: { label: 'Buzzer', current: 0.5 },
    fields: [CURRENT_FIELD],
    render(props, s) {
      const on = s && s.active;
      return `
        <g class="${on ? 'pulse' : ''}">
          <circle cx="30" cy="26" r="15" fill="${on ? '#ffd966' : 'var(--part-fill)'}" stroke="var(--part-stroke)" stroke-width="2"/>
          <path d="M 20 26 a10 10 0 0 1 20 0" fill="none" stroke="var(--part-stroke)" stroke-width="1.5"/>
          <path d="M 16 26 a14 14 0 0 1 28 0" fill="none" stroke="var(--part-stroke)" stroke-width="1.5" opacity="0.6"/>
        </g>
        <text x="30" y="54" text-anchor="middle" class="part-label">${props.label || 'Buzzer'}</text>
      `;
    }
  },

  accessory: {
    label: '12V Accessory',
    category: 'Accessories',
    w: 78, h: 56,
    terminals: [
      { id: 'pwr', x: 0, y: 28, role: 'load_pwr', name: 'PWR' },
      { id: 'gnd', x: 78, y: 28, role: 'load_gnd', name: 'GND' },
    ],
    defaultProps: { label: '12V Accessory', current: 3 },
    fields: [CURRENT_FIELD],
    render(props, s) {
      const on = s && s.active;
      return `
        <rect x="14" y="10" width="50" height="32" rx="6" fill="${on ? '#a5f3fc' : 'var(--part-fill)'}" stroke="var(--part-stroke)" stroke-width="2"/>
        <circle cx="30" cy="26" r="3" fill="var(--part-stroke)"/>
        <circle cx="48" cy="26" r="3" fill="var(--part-stroke)"/>
        <text x="39" y="52" text-anchor="middle" class="part-label">${props.label || 'Accessory'}</text>
      `;
    },
    hint: 'A generic 12V load — rename it for a radio, charger, socket, anything.'
  },

  ledStrip: {
    label: 'LED Accent Light',
    category: 'Accessories',
    w: 80, h: 34,
    terminals: [
      { id: 'pwr', x: 0, y: 17, role: 'load_pwr', name: 'PWR' },
      { id: 'gnd', x: 80, y: 17, role: 'load_gnd', name: 'GND' },
    ],
    defaultProps: { label: 'LED Strip', current: 0.8, color: '#a855f7' },
    fields: [CURRENT_FIELD, LIGHT_COLOR_FIELD],
    hint: 'Pure personalization — pick any color for interior/underglow accent lighting.',
    render(props, s) {
      const on = s && s.active;
      const c = props.color || '#a855f7';
      const dots = [10, 24, 38, 52, 66];
      return `
        ${on ? `<rect x="4" y="6" width="72" height="22" rx="11" fill="${c}" opacity="0.35" class="glow"/>` : ''}
        <rect x="6" y="9" width="68" height="16" rx="8" fill="${on ? shade(c, 0.25) : 'var(--part-fill)'}" stroke="${on ? shade(c, -0.2) : 'var(--part-stroke)'}" stroke-width="2"/>
        ${dots.map(x => `<circle cx="${x}" cy="17" r="3" fill="${on ? c : 'var(--part-stroke)'}"/>`).join('')}
      `;
    }
  },

  ecu: {
    label: 'ECU',
    category: 'Accessories',
    w: 80, h: 56,
    terminals: [
      { id: 'pwr', x: 0, y: 28, role: 'load_pwr', name: 'PWR' },
      { id: 'gnd', x: 80, y: 28, role: 'load_gnd', name: 'GND' },
    ],
    defaultProps: { label: 'ECU', current: 0.5 },
    fields: [CURRENT_FIELD],
    render(props, s) {
      const on = s && s.active;
      return `
        <rect x="10" y="8" width="60" height="34" rx="4" fill="var(--part-fill)" stroke="var(--part-stroke)" stroke-width="2"/>
        <circle cx="60" cy="16" r="4" fill="${on ? '#3ddc50' : '#999'}"/>
        <text x="40" y="30" text-anchor="middle" font-size="12" font-weight="700" fill="var(--part-stroke)">ECU</text>
        <text x="40" y="54" text-anchor="middle" class="part-label">${props.label || 'ECU'}</text>
      `;
    }
  },

  voltmeter: {
    label: 'Voltmeter',
    category: 'Accessories',
    w: 64, h: 68,
    terminals: [
      { id: 'pwr', x: 0, y: 30, role: 'load_pwr', name: 'PWR' },
      { id: 'gnd', x: 64, y: 30, role: 'load_gnd', name: 'GND' },
    ],
    defaultProps: { label: 'Voltmeter', current: 0.05 },
    fields: [CURRENT_FIELD],
    hint: 'Reads a healthy 12.6V whenever it has a complete circuit back to the battery.',
    render(props, s) {
      const on = s && s.active;
      const angle = on ? 20 : -80;
      return `
        <circle cx="32" cy="28" r="22" fill="var(--part-fill)" stroke="var(--part-stroke)" stroke-width="2"/>
        <line x1="32" y1="28" x2="32" y2="10" stroke="${on ? '#16a34a' : 'var(--part-stroke)'}" stroke-width="2.5" transform="rotate(${angle} 32 28)"/>
        <circle cx="32" cy="28" r="2.5" fill="var(--part-stroke)"/>
        <text x="32" y="66" text-anchor="middle" class="part-label">${on ? '12.6V' : '--'}</text>
      `;
    }
  },

  // -------------------------------------------------------------- Sensors
  sensor: {
    label: 'Sensor Switch',
    category: 'Sensors',
    w: 90, h: 50,
    terminals: [
      { id: 'in', x: 0, y: 25, role: 'pass_in', name: 'IN' },
      { id: 'out', x: 90, y: 25, role: 'pass_out', name: 'OUT' },
    ],
    defaultProps: { label: 'Door Sensor', on: false },
    toggleable: true,
    render(props) {
      const on = !!props.on;
      return `
        <rect x="8" y="10" width="74" height="30" rx="15" fill="var(--part-fill)" stroke="var(--part-stroke)" stroke-width="2"/>
        <circle cx="${on ? 58 : 24}" cy="25" r="11" fill="${on ? 'var(--wire-hot)' : '#fff'}" stroke="var(--part-stroke)" stroke-width="1.5"/>
        <text x="45" y="46" text-anchor="middle" class="part-label">${props.label || 'Sensor'} — ${on ? 'TRIGGERED' : 'idle'}</text>
      `;
    },
    hint: 'Represents any on/off sensor — door jamb, brake pedal, oil pressure. Rename it.'
  },

  // -------------------------------------------------------------- Passive
  resistor: {
    label: 'Resistor',
    category: 'Passive',
    w: 74, h: 30,
    terminals: [
      { id: 'in', x: 0, y: 15, role: 'pass_in', name: 'IN' },
      { id: 'out', x: 74, y: 15, role: 'pass_out', name: 'OUT' },
    ],
    defaultProps: { label: 'Resistor' },
    render() {
      return `
        <line x1="2" y1="15" x2="14" y2="15" stroke="var(--part-stroke)" stroke-width="2"/>
        <path d="M 14 15 L 20 5 L 28 25 L 36 5 L 44 25 L 52 5 L 60 15" fill="none" stroke="var(--part-stroke)" stroke-width="2" stroke-linejoin="round"/>
        <line x1="60" y1="15" x2="72" y2="15" stroke="var(--part-stroke)" stroke-width="2"/>
      `;
    }
  },

  diode: {
    label: 'Diode',
    category: 'Passive',
    w: 64, h: 34,
    terminals: [
      { id: 'anode', x: 0, y: 17, role: 'pass_in', name: 'Anode (+)' },
      { id: 'cathode', x: 64, y: 17, role: 'pass_out', name: 'Cathode (−)' },
    ],
    defaultProps: { label: 'Diode' },
    render() {
      return `
        <line x1="2" y1="17" x2="20" y2="17" stroke="var(--part-stroke)" stroke-width="2"/>
        <path d="M 20 4 L 20 30 L 42 17 Z" fill="var(--part-fill)" stroke="var(--part-stroke)" stroke-width="2" stroke-linejoin="round"/>
        <line x1="42" y1="4" x2="42" y2="30" stroke="var(--part-stroke)" stroke-width="3"/>
        <line x1="42" y1="17" x2="62" y2="17" stroke="var(--part-stroke)" stroke-width="2"/>
      `;
    },
    hint: 'Only lets current flow anode → cathode, like a real diode.'
  },

};

export function getTerminal(type, terminalId) {
  const def = PART_DEFS[type];
  return def.terminals.find(t => t.id === terminalId);
}

// Types whose in/out pass-through is gated by a simple props.on flag
// (ordinary switches, momentary buttons, and sensor switches all behave
// identically in the simulator — only the interaction style differs).
export const GATED_PASS_TYPES = new Set(['switch', 'pushbutton', 'sensor']);

// Types that are always electrically connected end-to-end (decorative or
// current-limiting, but never open the circuit).
export const ALWAYS_PASS_TYPES = new Set(['resistor']);

// Fuse and Circuit Breaker use identical overload math (see simulate.js) —
// just different default ratings for different jobs.
export const FUSE_LIKE_TYPES = new Set(['fuse', 'circuitBreaker']);

// Types that behave as loads: active when their pwr terminal reaches the
// power net and their gnd terminal reaches the ground net.
export const LOAD_TYPES = new Set([
  'headlight', 'taillight', 'indicator', 'fogLight', 'warningLight',
  'horn', 'buzzer', 'accessory', 'starter', 'wiper', 'motor', 'ecu',
  'voltageRegulator', 'ledStrip', 'voltmeter',
]);
