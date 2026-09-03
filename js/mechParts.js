// mechParts.js — definitions for the mechanical/drivetrain panel: engine,
// transmission, brakes, cooling, fuel/air, gauges. Same shape as parts.js
// (category, size, terminals, render) so it plugs into the same generic
// canvas/ui engine. Unlike the electrical panel there's no "ground" concept
// — mechanical power just needs to be reachable from the Engine (drive
// network) or from a brake source (brake network); most parts have a single
// 'in' terminal instead of a pwr/gnd pair.

export const CATEGORY_COLORS_MECH = {
  Engine:      { fill: '#fed7aa', stroke: '#c2410c', accent: '#f97316' },
  Drivetrain:  { fill: '#e0e7ff', stroke: '#3730a3', accent: '#6366f1' },
  Brakes:      { fill: '#fecaca', stroke: '#991b1b', accent: '#dc2626' },
  Cooling:     { fill: '#cffafe', stroke: '#0e7490', accent: '#06b6d4' },
  'Air & Fuel': { fill: '#ecfccb', stroke: '#4d7c0f', accent: '#84cc16' },
  Gauges:      { fill: '#ede9fe', stroke: '#6d28d9', accent: '#8b5cf6' },
  Performance: { fill: '#fbcfe8', stroke: '#a21caf', accent: '#d946ef' },
};

// ---- shared formulas (also used by mechSimulate.js for RPM/speed math) ----

export const GEAR_TYPE_SPREAD = {
  Standard: { high: 3.5, low: 0.8 },
  'Close-Ratio': { high: 2.8, low: 1.0 },
  'Off-Road': { high: 5.0, low: 0.9 },
};
export const REVERSE_RATIO = 3.2;

// An automatic's mechanical efficiency depends heavily on its type — a
// torque converter bleeds real power as heat, a dual-clutch box barely
// loses any. Ties the previously-cosmetic "type" field to something real.
export const AUTO_EFF_BY_TYPE = { Traditional: 86, CVT: 90, 'Dual-Clutch': 95 };
export function autoTransEfficiency(props) {
  return AUTO_EFF_BY_TYPE[props.type] ?? 86;
}

// Ratio for a manual transmission position, or null if that position is out
// of range for the current gear count (e.g. stale '6' after dropping to a
// 4-speed) or is neutral.
export function manualGearRatio(position, gearCount, gearType) {
  if (position === 'R') return REVERSE_RATIO;
  const n = Number(position);
  const count = Number(gearCount) || 5;
  if (!n || n < 1 || n > count) return null;
  const spread = GEAR_TYPE_SPREAD[gearType] || GEAR_TYPE_SPREAD.Standard;
  if (count <= 1) return spread.high;
  return spread.high - (spread.high - spread.low) * (n - 1) / (count - 1);
}

export function engineRpm(props) {
  if (!props.on) return 0;
  const idle = Number(props.idleRPM) || 800;
  const redline = Number(props.redlineRPM) || 7000;
  const throttle = Math.max(0, Math.min(100, Number(props.throttle) || 0));
  return Math.round(idle + (throttle / 100) * (redline - idle));
}

// Power scales with *total* displacement — "Displacement (cc)" is, and has
// always been shown as, the whole-engine figure (the default is literally
// labeled "4-cyl, 2000cc", i.e. an ordinary 2.0L I4). Cylinder count on its
// own doesn't multiply power on top of that: a 2.0L I4 and a 2.0L V6 make
// broadly similar real-world horsepower, not 50% more just for having two
// extra cylinders at the same total displacement — cylinder count mostly
// buys a higher *safe redline* in reality, which this simulator already
// exposes as its own independent field (redlineRPM), so it isn't silently
// double-counted here too. ~65 hp/liter is a reasonable naturally-aspirated
// average across the whole 0.5-8.0L range this tool allows.
export function estimatedPower(props) {
  const cc = Number(props.displacement) || 2000;
  return Math.round((cc / 1000) * 65);
}

// A turbo only matters once there's enough exhaust flow to spool it up, and
// even then it's a fixed +30% power bump — simple, but a real, testable
// number rather than pure decoration.
export const TURBO_SPOOL_RPM = 3500;
export const TURBO_BOOST_MULT = 1.3;

// Nitrous is instant and huge but only while you're holding the button down
// — no spool-up condition like the turbo. Supercharger is the opposite:
// always boosting the moment it's switched on and the engine's running, no
// RPM threshold at all (it's driven straight off the crank by a belt).
export const NITROUS_BOOST_MULT = 1.6;
export const SUPERCHARGER_BOOST_MULT = 1.2;

// Engine displacement determines horsepower (estimatedPower), and — this is
// the part a pure RPM×gearing formula was missing — horsepower is what
// actually limits how fast the car can go. Real aerodynamic drag rises with
// the *cube* of speed, so top speed roughly follows power^(1/3); the
// constant here (re-tuned alongside estimatedPower's cylinder-double-count
// fix) lands a ~1L economy engine around 150 km/h, a 2.0L family engine
// around 190, and an 8.0L monster around 300 — supercar territory, not
// either one hitting 300+ on a tall enough gear regardless of how much
// engine it's got.
export function topSpeedFromPower(hp) {
  if (!hp || hp <= 0) return 0;
  return 38 * Math.cbrt(hp);
}

// Estimated fuel economy — same "plausible, not real physics" tier as
// topSpeedFromPower. Bigger engines drink more fuel per 100km, a leakier
// drivetrain wastes some of that fuel before it ever reaches the wheels
// (reuses the exact same overallEfficiency the power waterfall already
// computes, so the two numbers can't disagree), and how/where you actually
// drive matters *on top of* the car itself — city stop-start burns more
// than a steady highway cruise, traffic makes either worse, and a rough
// road adds rolling resistance. Every condition is a flat multiplier,
// stacked multiplicatively — the same pattern as the turbo/nitrous/
// supercharger boosts already use.
export const DRIVE_TYPE_MULT = { highway: 0.85, city: 1.35 };
export const TRAFFIC_MULT = { light: 1, moderate: 1.15, heavy: 1.35 };
export const ROAD_QUALITY_MULT = { smooth: 1, average: 1.08, rough: 1.2 };

export function computeFuelEconomy(displacementCc, overallEfficiencyPct, conditions) {
  const displacementL = (Number(displacementCc) || 2000) / 1000;
  let l100km = 5 + displacementL * 2.5;

  // A drivetrain that only delivers 90% of the engine's power to the wheels
  // needs proportionally more fuel to cover the same ground — floor at 40%
  // so a pathologically lossy build doesn't blow this up to nonsense.
  const eff = Math.max(40, Number(overallEfficiencyPct) || 100);
  l100km *= 100 / eff;

  l100km *= DRIVE_TYPE_MULT[conditions.driveType] ?? 1;
  l100km *= TRAFFIC_MULT[conditions.traffic] ?? 1;
  l100km *= ROAD_QUALITY_MULT[conditions.roadQuality] ?? 1;

  return { l100km, kmPerLiter: l100km > 0 ? 100 / l100km : 0 };
}

// RPM -> road speed (km/h) for a given wheel diameter in inches, and its
// inverse — used to cap both a wheel's own spin rate and any speedometer's
// reading at whatever the engine's power can actually achieve, so a tiny
// engine can't be geared into an impossible top speed.
export function speedFromRpm(rpm, wheelDiameterIn) {
  const circumferenceM = Math.PI * (Number(wheelDiameterIn) || 24) * 0.0254;
  return (rpm || 0) * circumferenceM * 60 / 1000;
}
export function rpmFromSpeed(speedKmh, wheelDiameterIn) {
  const circumferenceM = Math.PI * (Number(wheelDiameterIn) || 24) * 0.0254;
  if (circumferenceM <= 0) return 0;
  return speedKmh / (circumferenceM * 60 / 1000);
}

// Turns an RPM value into a `class`+`style` pair that makes a part's CSS
// spin/pulse animation actually run faster at higher RPM, instead of every
// spinning part looping at the same fixed rate regardless of speed.
// `speedMult` lets a part spin faster than its RPM for the same visual rate
// (a turbocharger spins ~10-20x crank speed).
export function spinRate(rpm, speedMult = 1) {
  if (!rpm || rpm <= 0) return { cls: '', style: '' };
  const r = Math.max(150, Math.min(90000, rpm * speedMult));
  const duration = Math.max(0.08, 1.3 - (Math.min(r, 9000) / 9000) * 1.18).toFixed(2);
  return { cls: 'spin', style: `animation-duration:${duration}s` };
}

export function pulseRate(rpm) {
  if (!rpm || rpm <= 0) return { cls: '', style: '' };
  const r = Math.max(150, Math.min(9000, rpm));
  const duration = Math.max(0.1, 0.9 - (r / 9000) * 0.75).toFixed(2);
  return { cls: 'pulse', style: `animation-duration:${duration}s` };
}

export const PART_DEFS_MECH = {

  // ---------------------------------------------------------------- Engine
  engine: {
    label: 'Engine',
    category: 'Engine',
    w: 100, h: 90,
    terminals: [
      { id: 'out', x: 100, y: 45, role: 'source', name: 'Power out' },
    ],
    defaultProps: {
      label: 'Engine', on: false,
      cylinders: 4, displacement: 2000, idleRPM: 800, redlineRPM: 7000, throttle: 0,
    },
    toggleable: true,
    fields: [
      { key: 'cylinders', label: 'Cylinders', type: 'select', numeric: true, options: [3, 4, 5, 6, 8, 10, 12] },
      { key: 'displacement', label: 'Displacement (cc)', type: 'number', min: 500, max: 8000, step: 50 },
      { key: 'idleRPM', label: 'Idle RPM', type: 'number', min: 400, max: 2000, step: 50 },
      { key: 'redlineRPM', label: 'Redline RPM', type: 'number', min: 3000, max: 12000, step: 100 },
      { key: 'throttle', label: 'Throttle', type: 'range', min: 0, max: 100, step: 1, formatOption: v => v + '%' },
    ],
    statusHint(props, s) {
      const power = `≈ ${estimatedPower(props)} hp estimated (${props.cylinders}-cyl, ${props.displacement}cc)`;
      if (!props.on) return `${power}.`;
      const rpm = (s && s.rpm) || 0;
      const nearRedline = rpm >= (Number(props.redlineRPM) || 7000) * 0.92;
      return `${power} · turning ${rpm} RPM.${nearRedline ? ' ⚠ Near redline!' : ''}`;
    },
    render(props, s) {
      const running = !!props.on;
      const rpm = (s && s.rpm) || 0;
      const nearRedline = running && rpm >= (Number(props.redlineRPM) || 7000) * 0.92;
      const anim = spinRate(rpm);
      return `
        <rect x="8" y="10" width="70" height="60" rx="8" fill="${nearRedline ? '#fecaca' : 'var(--part-fill)'}" stroke="${nearRedline ? '#dc2626' : 'var(--part-stroke)'}" stroke-width="2.5"/>
        <circle cx="30" cy="40" r="9" fill="none" stroke="var(--part-stroke)" stroke-width="2" class="${anim.cls}" style="${anim.style}"/>
        <circle cx="56" cy="40" r="9" fill="none" stroke="var(--part-stroke)" stroke-width="2" class="${anim.cls}" style="${anim.style}"/>
        <text x="43" y="86" text-anchor="middle" class="part-label">${props.label || 'Engine'} — ${running ? rpm + ' RPM' : 'off'}</text>
      `;
    }
  },

  flywheel: {
    label: 'Flywheel',
    category: 'Engine',
    w: 60, h: 60,
    terminals: [
      { id: 'in', x: 0, y: 30, role: 'pass_in', name: 'IN' },
      { id: 'out', x: 60, y: 30, role: 'pass_out', name: 'OUT' },
    ],
    defaultProps: { label: 'Flywheel' },
    render(props, s) {
      const on = s && s.active;
      const anim = spinRate(s && s.rpm);
      return `
        <circle cx="30" cy="28" r="20" fill="var(--part-fill)" stroke="var(--part-stroke)" stroke-width="2.5" class="${anim.cls}" style="${anim.style}"/>
        <circle cx="30" cy="28" r="20" fill="none" stroke="var(--part-stroke)" stroke-width="1" stroke-dasharray="3 4" class="${anim.cls}" style="${anim.style}"/>
        <text x="30" y="56" text-anchor="middle" class="part-label">${props.label || 'Flywheel'}</text>
      `;
    }
  },

  turbo: {
    label: 'Turbocharger',
    category: 'Engine',
    w: 60, h: 60,
    terminals: [
      { id: 'in', x: 0, y: 30, role: 'pass_in', name: 'IN' },
      { id: 'out', x: 60, y: 30, role: 'pass_out', name: 'OUT' },
    ],
    defaultProps: { label: 'Turbocharger' },
    // Real turbos spin ~10-20x crank speed and only really "spool up" past
    // a certain RPM — and unlike a purely decorative spinner, that spool-up
    // genuinely adds +30% power (see TURBO_BOOST_MULT), which raises the
    // whole car's power-limited top speed. No turbo, or an unspooled one,
    // means no bonus.
    statusHint(props, s) {
      const rpm = (s && s.rpm) || 0;
      if (!rpm) return 'Spools up once the engine is turning and feeding it exhaust.';
      return rpm > TURBO_SPOOL_RPM
        ? `Spooled up, boosting 🌀 — engine power +30%, raising top speed (spinning ~${Math.round(rpm * 14 / 1000)}k RPM).`
        : `Idling below ~${TURBO_SPOOL_RPM} RPM — not enough exhaust flow to spool up yet.`;
    },
    render(props, s) {
      const rpm = (s && s.rpm) || 0;
      const boosting = rpm > TURBO_SPOOL_RPM;
      const anim = spinRate(rpm, 14);
      return `
        <circle cx="30" cy="28" r="18" fill="${boosting ? '#ffb84d' : rpm ? '#ffddb0' : 'var(--part-fill)'}" stroke="var(--part-stroke)" stroke-width="2.5" class="${anim.cls}" style="${anim.style}"/>
        <path d="M 30 14 L 34 28 L 30 42 L 26 28 Z" fill="var(--part-stroke)" class="${anim.cls}" style="${anim.style}"/>
        <text x="30" y="56" text-anchor="middle" class="part-label">${props.label || 'Turbo'}${boosting ? ' 🌀' : ''}</text>
      `;
    }
  },

  // ----------------------------------------------------------- Performance
  nitrous: {
    label: 'Nitrous Boost',
    category: 'Performance',
    w: 70, h: 70,
    terminals: [
      { id: 'in', x: 0, y: 35, role: 'pass_in', name: 'IN' },
      { id: 'out', x: 70, y: 35, role: 'pass_out', name: 'OUT' },
    ],
    defaultProps: { label: 'Nitrous', on: false },
    momentary: true,
    statusHint(props) {
      return props.on
        ? `🔥 SPRAYING — instant +${Math.round((NITROUS_BOOST_MULT - 1) * 100)}% engine power while held!`
        : 'Hold to spray — an instant, huge (but temporary) power spike. No spool-up needed, unlike the turbo.';
    },
    render(props) {
      const on = !!props.on;
      return `
        <rect x="22" y="8" width="26" height="46" rx="8" fill="${on ? '#67e8f9' : 'var(--part-fill)'}" stroke="${on ? '#0e7490' : 'var(--part-stroke)'}" stroke-width="2.5"/>
        <rect x="27" y="2" width="16" height="10" rx="3" fill="var(--part-stroke)"/>
        ${on ? `
          <path d="M 35 58 Q 28 68 35 78 Q 42 68 35 58 Z" fill="#f97316" class="pulse"/>
          <path d="M 35 60 Q 31 66 35 73 Q 39 66 35 60 Z" fill="#fde047" class="pulse"/>
        ` : ''}
        <text x="35" y="90" text-anchor="middle" class="part-label">${props.label || 'Nitrous'}${on ? ' 🔥' : ''}</text>
      `;
    }
  },

  supercharger: {
    label: 'Supercharger',
    category: 'Performance',
    w: 70, h: 60,
    terminals: [
      { id: 'in', x: 0, y: 30, role: 'pass_in', name: 'IN' },
      { id: 'out', x: 70, y: 30, role: 'pass_out', name: 'OUT' },
    ],
    defaultProps: { label: 'Supercharger', on: false },
    toggleable: true,
    statusHint(props, s) {
      if (!props.on) return 'Switched off — bolted on, but freewheeling with no boost.';
      const rpm = (s && s.rpm) || 0;
      return rpm > 0
        ? `Belt-driven and boosting — a steady +${Math.round((SUPERCHARGER_BOOST_MULT - 1) * 100)}% power, no RPM threshold like the turbo needs.`
        : 'Switched on, but no drive power reaching it yet.';
    },
    render(props, s) {
      const boosting = !!props.on && (s && s.rpm) > 0;
      const anim = spinRate(s && s.rpm, 4);
      return `
        <rect x="12" y="10" width="46" height="40" rx="8" fill="${boosting ? '#f0abfc' : props.on ? '#fae8ff' : 'var(--part-fill)'}" stroke="${boosting ? '#a21caf' : 'var(--part-stroke)'}" stroke-width="2.5"/>
        <circle cx="35" cy="30" r="11" fill="none" stroke="${boosting ? '#a21caf' : 'var(--part-stroke)'}" stroke-width="2" class="${anim.cls}" style="${anim.style}"/>
        <line x1="35" y1="30" x2="35" y2="21" stroke="${boosting ? '#a21caf' : 'var(--part-stroke)'}" stroke-width="2" class="${anim.cls}" style="${anim.style}"/>
        <text x="35" y="66" text-anchor="middle" class="part-label">${props.label || 'Supercharger'} — ${props.on ? 'on' : 'off'}</text>
      `;
    }
  },

  // ------------------------------------------------------------ Drivetrain
  // A real clutch is spring-engaged at rest — power flows by default, and
  // pressing the pedal is what *breaks* the connection so you can shift.
  // So this is momentary like the brake pedal, but inverted: connected
  // while NOT pressed. See mechSimulate.js's use of `invertedGate`.
  clutch: {
    label: 'Clutch Pedal',
    category: 'Drivetrain',
    w: 80, h: 60,
    terminals: [
      { id: 'in', x: 0, y: 25, role: 'pass_in', name: 'IN' },
      { id: 'out', x: 80, y: 25, role: 'pass_out', name: 'OUT' },
    ],
    defaultProps: { label: 'Clutch', on: false, efficiency: 97 },
    momentary: true,
    invertedGate: true,
    fields: [{ key: 'efficiency', label: 'Efficiency (%)', type: 'number', min: 85, max: 100, step: 1 }],
    statusHint(props) {
      return props.on
        ? 'Pedal pressed — disengaged, no power passes. Safe to shift.'
        : `Pedal up — engaged, passing ${props.efficiency ?? 97}% of power through.`;
    },
    render(props) {
      const pressed = !!props.on;
      return `
        <rect x="10" y="10" width="60" height="30" rx="6" fill="${pressed ? '#fde68a' : 'var(--part-fill)'}" stroke="var(--part-stroke)" stroke-width="2"/>
        <line x1="40" y1="34" x2="40" y2="10" stroke="var(--part-stroke)" stroke-width="2"/>
        <rect x="30" y="${pressed ? 30 : 20}" width="20" height="8" rx="3" fill="${pressed ? '#f59e0b' : 'var(--wire-hot)'}"/>
        <text x="40" y="46" text-anchor="middle" class="part-label">${props.label || 'Clutch'} — ${pressed ? 'DISENGAGED' : 'engaged'}</text>
      `;
    }
  },

  manualTransmission: {
    label: 'Manual Transmission',
    category: 'Drivetrain',
    w: 130, h: 50,
    terminals: [
      { id: 'in', x: 0, y: 25, role: 'pass_in', name: 'IN' },
      { id: 'out', x: 130, y: 25, role: 'pass_out', name: 'OUT' },
    ],
    defaultProps: { label: 'Manual Trans.', position: 'N', gearCount: 5, gearType: 'Standard', efficiency: 96 },
    cycle(props) {
      const n = Number(props.gearCount) || 5;
      const gears = [];
      for (let i = 1; i <= n; i++) gears.push(String(i));
      return ['N', ...gears, 'R'];
    },
    fields: [
      { key: 'gearCount', label: 'Number of Gears', type: 'select', numeric: true, options: [3, 4, 5, 6, 7, 8] },
      { key: 'gearType', label: 'Gear Type', type: 'select', options: ['Standard', 'Close-Ratio', 'Off-Road'] },
      { key: 'efficiency', label: 'Efficiency (%)', type: 'number', min: 80, max: 100, step: 1 },
    ],
    statusHint(props, s) {
      if (s && s.needsClutch) {
        return '⚠ No engaged Clutch Pedal upstream — a manual gearbox can\'t couple to the engine without one, no matter what gear is selected. Wire a Clutch in between (pedal up = engaged).';
      }
      const pos = props.position || 'N';
      if (pos === 'N') return 'In neutral — no power reaches the output.';
      const ratio = manualGearRatio(pos, props.gearCount, props.gearType);
      return ratio == null
        ? `Gear ${pos} doesn't exist on this ${props.gearCount}-speed box — no power reaches the output.`
        : `In gear ${pos} (${ratio.toFixed(2)}:1) — passing ${props.efficiency ?? 96}% of power through.`;
    },
    render(props) {
      const pos = props.position || 'N';
      return `
        <rect x="8" y="8" width="114" height="34" rx="6" fill="var(--part-fill)" stroke="var(--part-stroke)" stroke-width="2"/>
        <text x="65" y="30" text-anchor="middle" font-size="15" font-weight="800" fill="${pos === 'N' ? 'var(--text-dim)' : 'var(--wire-hot)'}">${pos}</text>
        <text x="65" y="48" text-anchor="middle" class="part-label">${props.label || 'Manual Trans.'}</text>
      `;
    }
  },

  autoTransmission: {
    label: 'Automatic Transmission',
    category: 'Drivetrain',
    w: 130, h: 50,
    terminals: [
      { id: 'in', x: 0, y: 25, role: 'pass_in', name: 'IN' },
      { id: 'out', x: 130, y: 25, role: 'pass_out', name: 'OUT' },
    ],
    defaultProps: { label: 'Auto Trans.', position: 'P', type: 'Traditional', ratio: 2.0 },
    cycle: ['P', 'R', 'N', 'D'],
    fields: [
      { key: 'type', label: 'Transmission Type', type: 'select', options: ['Traditional', 'CVT', 'Dual-Clutch'] },
      { key: 'ratio', label: 'Drive Ratio (D)', type: 'number', min: 0.5, max: 4, step: 0.1 },
    ],
    statusHint(props) {
      const pos = props.position || 'P';
      const eff = autoTransEfficiency(props);
      if (pos === 'D') return `In Drive (${Number(props.ratio || 2).toFixed(1)}:1) — ${props.type || 'Traditional'} passes ${eff}% of power through.`;
      if (pos === 'R') return `In Reverse (${REVERSE_RATIO.toFixed(1)}:1) — passing ${eff}% of power through.`;
      return `In ${pos} — no power reaches the output.`;
    },
    render(props) {
      const pos = props.position || 'P';
      const live = pos === 'D' || pos === 'R';
      return `
        <rect x="8" y="8" width="114" height="34" rx="6" fill="var(--part-fill)" stroke="var(--part-stroke)" stroke-width="2"/>
        <text x="65" y="30" text-anchor="middle" font-size="15" font-weight="800" fill="${live ? 'var(--wire-hot)' : 'var(--text-dim)'}">${pos}</text>
        <text x="65" y="48" text-anchor="middle" class="part-label">${props.label || 'Auto Trans.'}</text>
      `;
    }
  },

  driveshaft: {
    label: 'Driveshaft',
    category: 'Drivetrain',
    w: 100, h: 30,
    terminals: [
      { id: 'in', x: 0, y: 15, role: 'pass_in', name: 'IN' },
      { id: 'out', x: 100, y: 15, role: 'pass_out', name: 'OUT' },
    ],
    defaultProps: { label: 'Driveshaft' },
    render(props, s) {
      const anim = spinRate(s && s.rpm);
      return `
        <line x1="4" y1="15" x2="96" y2="15" stroke="var(--part-stroke)" stroke-width="6" stroke-linecap="round" class="${anim.cls}" style="${anim.style}"/>
      `;
    }
  },

  differential: {
    label: 'Differential',
    category: 'Drivetrain',
    w: 70, h: 70,
    terminals: [
      { id: 'in', x: 0, y: 35, role: 'pass_in', name: 'IN' },
      { id: 'outL', x: 70, y: 10, role: 'pass_out', name: 'LEFT' },
      { id: 'outR', x: 70, y: 60, role: 'pass_out', name: 'RIGHT' },
    ],
    defaultProps: { label: 'Differential', finalDriveRatio: 3.7, efficiency: 96 },
    fields: [
      { key: 'finalDriveRatio', label: 'Final Drive Ratio', type: 'number', min: 2.5, max: 5.5, step: 0.1 },
      { key: 'efficiency', label: 'Efficiency (%)', type: 'number', min: 80, max: 100, step: 1 },
    ],
    statusHint(props) { return `${Number(props.finalDriveRatio || 3.7).toFixed(1)}:1 final drive — splits power evenly to both sides, passing ${props.efficiency ?? 96}% through.`; },
    render(props, s) {
      const anim = spinRate(s && s.rpm);
      return `
        <circle cx="35" cy="35" r="22" fill="var(--part-fill)" stroke="var(--part-stroke)" stroke-width="2.5" class="${anim.cls}" style="${anim.style}"/>
        <text x="35" y="66" text-anchor="middle" class="part-label">${props.label || 'Differential'}</text>
      `;
    }
  },

  axle: {
    label: 'Axle / CV Joint',
    category: 'Drivetrain',
    w: 80, h: 26,
    terminals: [
      { id: 'in', x: 0, y: 13, role: 'pass_in', name: 'IN' },
      { id: 'out', x: 80, y: 13, role: 'pass_out', name: 'OUT' },
    ],
    defaultProps: { label: 'Axle' },
    render(props, s) {
      const anim = spinRate(s && s.rpm);
      return `<line x1="4" y1="13" x2="76" y2="13" stroke="var(--part-stroke)" stroke-width="4" stroke-linecap="round" class="${anim.cls}" style="${anim.style}"/>`;
    }
  },

  // ---------------------------------------------------------------- Brakes
  wheel: {
    label: 'Wheel',
    category: 'Brakes',
    w: 60, h: 78,
    terminals: [
      { id: 'drive', x: 0, y: 30, role: 'drive_in', name: 'Drive' },
      { id: 'brake', x: 60, y: 30, role: 'brake_in', name: 'Brake' },
    ],
    defaultProps: { label: 'Wheel', diameter: 24 },
    fields: [{ key: 'diameter', label: 'Wheel Diameter (in)', type: 'number', min: 13, max: 35, step: 1 }],
    statusHint(props, s) {
      if (s && s.powerLimited) return "Spinning at its power-limited max — the engine doesn't have enough grunt to turn it faster in this gear. More displacement, a turbo, or a shorter gear would help.";
      return null;
    },
    render(props, s) {
      const braking = s && s.braking;
      const spinning = s && s.spinning && !braking;
      const anim = spinning ? spinRate(s && s.rpm) : { cls: '', style: '' };
      // A tire is neutral gray at rest — braking gets its own distinct red,
      // not the Brakes category's default tint (which used to be the exact
      // same shade as "braking", making the two states indistinguishable).
      const fill = braking ? '#fca5a5' : '#e2e5ea';
      const stroke = braking ? '#b91c1c' : '#4b5563';
      return `
        <circle cx="30" cy="30" r="24" fill="${fill}" stroke="${stroke}" stroke-width="3" class="${anim.cls}" style="${anim.style}"/>
        <circle cx="30" cy="30" r="10" fill="${braking ? '#fecaca' : '#c9ced6'}" stroke="${stroke}" stroke-width="1.5"/>
        <circle cx="30" cy="30" r="24" fill="none" stroke="${stroke}" stroke-width="1" stroke-dasharray="4 4" class="${anim.cls}" style="${anim.style}"/>
        <line x1="30" y1="8" x2="30" y2="52" stroke="${stroke}" stroke-width="2" class="${anim.cls}" style="${anim.style}"/>
        <line x1="8" y1="30" x2="52" y2="30" stroke="${stroke}" stroke-width="2" class="${anim.cls}" style="${anim.style}"/>
        <text x="30" y="70" text-anchor="middle" class="part-label">${props.label || 'Wheel'}${braking ? ' (braking)' : spinning ? ' (spinning)' : ''}${s && s.powerLimited ? ' ⚡' : ''}</text>
      `;
    }
  },

  brakePedal: {
    label: 'Brake Pedal',
    category: 'Brakes',
    w: 60, h: 60,
    terminals: [
      { id: 'out', x: 60, y: 40, role: 'source', name: 'OUT' },
    ],
    defaultProps: { label: 'Brake Pedal', on: false },
    momentary: true,
    render(props) {
      const on = !!props.on;
      return `
        <rect x="10" y="${on ? 26 : 10}" width="34" height="${on ? 24 : 40}" rx="5" fill="${on ? '#fca5a5' : 'var(--part-fill)'}" stroke="var(--part-stroke)" stroke-width="2"/>
        <line x1="44" y1="40" x2="58" y2="40" stroke="var(--part-stroke)" stroke-width="3"/>
        <text x="30" y="58" text-anchor="middle" class="part-label">${props.label || 'Brake Pedal'}${on ? ' (pressed)' : ''}</text>
      `;
    }
  },

  masterCylinder: {
    label: 'Master Cylinder',
    category: 'Brakes',
    w: 90, h: 40,
    terminals: [
      { id: 'in', x: 0, y: 20, role: 'pass_in', name: 'IN' },
      { id: 'out', x: 90, y: 20, role: 'pass_out', name: 'OUT' },
    ],
    defaultProps: { label: 'Master Cylinder' },
    render(props, s) {
      const on = s && s.active;
      return `
        <rect x="8" y="8" width="74" height="24" rx="6" fill="${on ? '#fca5a5' : 'var(--part-fill)'}" stroke="${on ? '#b91c1c' : 'var(--part-stroke)'}" stroke-width="2"/>
        <text x="45" y="40" text-anchor="middle" class="part-label">${props.label || 'Master Cyl.'}</text>
      `;
    }
  },

  brakeLine: {
    label: 'Brake Line',
    category: 'Brakes',
    w: 90, h: 22,
    terminals: [
      { id: 'in', x: 0, y: 11, role: 'pass_in', name: 'IN' },
      { id: 'out', x: 90, y: 11, role: 'pass_out', name: 'OUT' },
    ],
    defaultProps: { label: 'Brake Line' },
    render(props, s) {
      const on = s && s.active;
      return `<line x1="4" y1="11" x2="86" y2="11" stroke="${on ? '#dc2626' : 'var(--part-stroke)'}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${on ? '' : '2 3'}"/>`;
    }
  },

  brakeCaliper: {
    label: 'Brake Caliper',
    category: 'Brakes',
    w: 60, h: 44,
    terminals: [
      { id: 'in', x: 0, y: 22, role: 'pass_in', name: 'IN' },
      { id: 'out', x: 60, y: 22, role: 'pass_out', name: 'OUT' },
    ],
    defaultProps: { label: 'Brake Caliper', force: 300 },
    fields: [{ key: 'force', label: 'Braking Force (Nm)', type: 'number', min: 100, max: 1000, step: 25 }],
    render(props, s) {
      const on = s && s.active;
      return `
        <path d="M 14 8 L 46 8 L 46 36 L 14 36 Q 6 22 14 8 Z" fill="${on ? '#fca5a5' : 'var(--part-fill)'}" stroke="${on ? '#b91c1c' : 'var(--part-stroke)'}" stroke-width="2"/>
      `;
    }
  },

  parkingBrake: {
    label: 'Parking Brake',
    category: 'Brakes',
    w: 80, h: 50,
    terminals: [
      { id: 'out', x: 80, y: 25, role: 'source', name: 'OUT' },
    ],
    defaultProps: { label: 'Parking Brake', on: false },
    toggleable: true,
    render(props) {
      const on = !!props.on;
      return `
        <line x1="16" y1="40" x2="16" y2="10" stroke="var(--part-stroke)" stroke-width="3"/>
        <line x1="16" y1="${on ? 14 : 38}" x2="50" y2="${on ? 14 : 38}" stroke="${on ? 'var(--wire-hot)' : 'var(--part-stroke)'}" stroke-width="4" stroke-linecap="round"/>
        <text x="40" y="48" text-anchor="middle" class="part-label">${props.label || 'Parking Brake'} — ${on ? 'ON' : 'off'}</text>
      `;
    }
  },

  absModule: {
    label: 'ABS Module',
    category: 'Brakes',
    w: 76, h: 50,
    terminals: [
      { id: 'in', x: 0, y: 25, role: 'pass_in', name: 'IN' },
      { id: 'out', x: 76, y: 25, role: 'pass_out', name: 'OUT' },
    ],
    defaultProps: { label: 'ABS Module' },
    statusHint(props, s) { return (s && s.active) ? 'Sensing wheel lock-up and modulating brake pressure.' : 'Idle — no braking pressure reaching it.'; },
    render(props, s) {
      const on = s && s.active;
      return `
        <rect x="8" y="10" width="60" height="30" rx="5" fill="var(--part-fill)" stroke="var(--part-stroke)" stroke-width="2"/>
        <circle cx="58" cy="16" r="3.5" fill="${on ? '#dc2626' : '#999'}" class="${on ? 'blink' : ''}"/>
        <text x="38" y="30" text-anchor="middle" font-size="10" font-weight="700" fill="var(--part-stroke)">ABS</text>
      `;
    }
  },

  // --------------------------------------------------------------- Cooling
  radiator: {
    label: 'Radiator',
    category: 'Cooling',
    w: 60, h: 70,
    terminals: [
      { id: 'in', x: 0, y: 35, role: 'pass_in', name: 'IN' },
      { id: 'out', x: 60, y: 35, role: 'pass_out', name: 'OUT' },
    ],
    defaultProps: { label: 'Radiator' },
    render(props, s) {
      const on = s && s.active;
      return `
        <rect x="10" y="6" width="40" height="58" rx="3" fill="${on ? '#e0f7ff' : 'var(--part-fill)'}" stroke="var(--part-stroke)" stroke-width="2"/>
        ${[16,24,32,40,48].map(y => `<line x1="10" y1="${y}" x2="50" y2="${y}" stroke="var(--part-stroke)" stroke-width="1" opacity="0.5"/>`).join('')}
      `;
    }
  },

  waterPump: {
    label: 'Water Pump',
    category: 'Cooling',
    w: 60, h: 60,
    terminals: [{ id: 'in', x: 0, y: 30, role: 'load_in', name: 'IN' }],
    defaultProps: { label: 'Water Pump' },
    render(props, s) {
      const on = s && s.active;
      const anim = spinRate(s && s.rpm);
      return `
        <circle cx="34" cy="28" r="18" fill="${on ? '#a5f3fc' : 'var(--part-fill)'}" stroke="var(--part-stroke)" stroke-width="2.5" class="${anim.cls}" style="${anim.style}"/>
        <text x="34" y="33" text-anchor="middle" font-size="14" font-weight="700" fill="var(--part-stroke)">P</text>
        <text x="34" y="56" text-anchor="middle" class="part-label">${props.label || 'Water Pump'}</text>
      `;
    }
  },

  oilPump: {
    label: 'Oil Pump',
    category: 'Cooling',
    w: 60, h: 60,
    terminals: [{ id: 'in', x: 0, y: 30, role: 'load_in', name: 'IN' }],
    defaultProps: { label: 'Oil Pump' },
    render(props, s) {
      const on = s && s.active;
      const anim = spinRate(s && s.rpm);
      return `
        <circle cx="34" cy="28" r="18" fill="${on ? '#fde68a' : 'var(--part-fill)'}" stroke="var(--part-stroke)" stroke-width="2.5" class="${anim.cls}" style="${anim.style}"/>
        <text x="34" y="33" text-anchor="middle" font-size="14" font-weight="700" fill="var(--part-stroke)">P</text>
        <text x="34" y="56" text-anchor="middle" class="part-label">${props.label || 'Oil Pump'}</text>
      `;
    }
  },

  // ------------------------------------------------------------- Air & Fuel
  airFilter: {
    label: 'Air Filter',
    category: 'Air & Fuel',
    w: 60, h: 40,
    terminals: [
      { id: 'in', x: 0, y: 20, role: 'pass_in', name: 'IN' },
      { id: 'out', x: 60, y: 20, role: 'pass_out', name: 'OUT' },
    ],
    defaultProps: { label: 'Air Filter' },
    render(props, s) {
      const on = s && s.active;
      return `<rect x="8" y="6" width="44" height="28" rx="4" fill="${on ? '#f0fdf4' : 'var(--part-fill)'}" stroke="var(--part-stroke)" stroke-width="2"/>`;
    }
  },

  intakeManifold: {
    label: 'Intake Manifold',
    category: 'Air & Fuel',
    w: 70, h: 34,
    terminals: [
      { id: 'in', x: 0, y: 17, role: 'pass_in', name: 'IN' },
      { id: 'out', x: 70, y: 17, role: 'pass_out', name: 'OUT' },
    ],
    defaultProps: { label: 'Intake Manifold' },
    render(props, s) {
      const on = s && s.active;
      return `<path d="M 6 17 Q 35 4 64 17" fill="none" stroke="${on ? '#65a30d' : 'var(--part-stroke)'}" stroke-width="4" stroke-linecap="round"/>`;
    }
  },

  fuelPump: {
    label: 'Fuel Pump',
    category: 'Air & Fuel',
    w: 60, h: 60,
    terminals: [{ id: 'in', x: 0, y: 30, role: 'load_in', name: 'IN' }],
    defaultProps: { label: 'Fuel Pump' },
    render(props, s) {
      const on = s && s.active;
      const anim = spinRate(s && s.rpm);
      return `
        <circle cx="34" cy="28" r="18" fill="${on ? '#d9f99d' : 'var(--part-fill)'}" stroke="var(--part-stroke)" stroke-width="2.5" class="${anim.cls}" style="${anim.style}"/>
        <text x="34" y="33" text-anchor="middle" font-size="14" font-weight="700" fill="var(--part-stroke)">P</text>
        <text x="34" y="56" text-anchor="middle" class="part-label">${props.label || 'Fuel Pump'}</text>
      `;
    }
  },

  fuelInjector: {
    label: 'Fuel Injector',
    category: 'Air & Fuel',
    w: 50, h: 50,
    terminals: [{ id: 'in', x: 0, y: 25, role: 'load_in', name: 'IN' }],
    defaultProps: { label: 'Fuel Injector' },
    render(props, s) {
      const on = s && s.active;
      const anim = on ? pulseRate(s && s.rpm) : { cls: '', style: '' };
      return `
        <g class="${anim.cls}" style="${anim.style}">
          <rect x="12" y="10" width="26" height="30" rx="4" fill="${on ? '#d9f99d' : 'var(--part-fill)'}" stroke="var(--part-stroke)" stroke-width="2"/>
        </g>
        <text x="25" y="48" text-anchor="middle" class="part-label">${props.label || 'Injector'}</text>
      `;
    }
  },

  exhaustPipe: {
    label: 'Exhaust Pipe',
    category: 'Air & Fuel',
    w: 90, h: 26,
    terminals: [
      { id: 'in', x: 0, y: 13, role: 'pass_in', name: 'IN' },
      { id: 'out', x: 90, y: 13, role: 'pass_out', name: 'OUT' },
    ],
    defaultProps: { label: 'Exhaust Pipe' },
    render(props, s) {
      const on = s && s.active;
      return `<line x1="4" y1="13" x2="86" y2="13" stroke="${on ? '#78716c' : 'var(--part-stroke)'}" stroke-width="6" stroke-linecap="round"/>`;
    }
  },

  catConverter: {
    label: 'Catalytic Converter',
    category: 'Air & Fuel',
    w: 70, h: 40,
    terminals: [
      { id: 'in', x: 0, y: 20, role: 'pass_in', name: 'IN' },
      { id: 'out', x: 70, y: 20, role: 'pass_out', name: 'OUT' },
    ],
    defaultProps: { label: 'Cat. Converter' },
    render(props, s) {
      const on = s && s.active;
      return `<rect x="8" y="6" width="54" height="28" rx="14" fill="${on ? '#fef08a' : 'var(--part-fill)'}" stroke="var(--part-stroke)" stroke-width="2.5"/>`;
    }
  },

  // ---------------------------------------------------------------- Gauges
  speedometer: {
    label: 'Speedometer',
    category: 'Gauges',
    w: 78, h: 84,
    terminals: [{ id: 'in', x: 0, y: 36, role: 'load_in', name: 'IN' }],
    defaultProps: { label: 'Speedometer', wheelDiameter: 24 },
    fields: [{ key: 'wheelDiameter', label: 'Wheel Diameter (in)', type: 'number', min: 13, max: 35, step: 1 }],
    hint: 'Reads the RPM reaching its input and converts it to speed using the wheel size below — wire it to a wheel (or anywhere after the differential) for a real reading.',
    statusHint(props, s) {
      return (s && s.powerLimited) ? "Capped by the engine's power — a bigger engine, a turbo, or shorter gearing would go faster." : null;
    },
    render(props, s) {
      const on = s && s.active;
      const speed = on ? Math.round((s && s.speed) || 0) : 0;
      const angle = -100 + Math.max(0, Math.min(1, speed / 240)) * 200;
      return `
        <circle cx="39" cy="34" r="26" fill="var(--part-fill)" stroke="var(--part-stroke)" stroke-width="2"/>
        <line x1="39" y1="34" x2="39" y2="14" stroke="${on ? 'var(--wire-hot)' : 'var(--part-stroke)'}" stroke-width="2.5" transform="rotate(${angle} 39 34)"/>
        <circle cx="39" cy="34" r="3" fill="var(--part-stroke)"/>
        <text x="39" y="48" text-anchor="middle" font-size="13" font-weight="800" fill="var(--part-stroke)">${on ? speed : '--'}</text>
        <text x="39" y="58" text-anchor="middle" font-size="8" fill="var(--text-dim)">km/h${s && s.powerLimited ? ' ⚡' : ''}</text>
        <text x="39" y="80" text-anchor="middle" class="part-label">${props.label || 'Speedo'}</text>
      `;
    }
  },

  tachometer: {
    label: 'Tachometer',
    category: 'Gauges',
    w: 78, h: 84,
    terminals: [{ id: 'in', x: 0, y: 36, role: 'load_in', name: 'IN' }],
    defaultProps: { label: 'Tachometer' },
    render(props, s) {
      const on = s && s.active;
      const rpm = on ? Math.round((s && s.rpm) || 0) : 0;
      const inRedzone = rpm > 6500;
      const angle = -100 + Math.max(0, Math.min(1, rpm / 8000)) * 200;
      return `
        <circle cx="39" cy="34" r="26" fill="var(--part-fill)" stroke="var(--part-stroke)" stroke-width="2"/>
        <path d="M 60.5 47.5 A 26 26 0 0 0 55.7 15.6" fill="none" stroke="#dc2626" stroke-width="3" opacity="0.55"/>
        <line x1="39" y1="34" x2="39" y2="14" stroke="${inRedzone ? '#dc2626' : on ? '#dc2626' : 'var(--part-stroke)'}" stroke-width="2.5" transform="rotate(${angle} 39 34)" class="${inRedzone ? 'blink' : ''}"/>
        <circle cx="39" cy="34" r="3" fill="var(--part-stroke)"/>
        <text x="39" y="48" text-anchor="middle" font-size="13" font-weight="800" fill="${inRedzone ? '#dc2626' : 'var(--part-stroke)'}">${on ? rpm : '--'}</text>
        <text x="39" y="58" text-anchor="middle" font-size="8" fill="var(--text-dim)">RPM</text>
        <text x="39" y="80" text-anchor="middle" class="part-label">${props.label || 'Tach'}${inRedzone ? ' ⚠' : ''}</text>
      `;
    }
  },

  fuelGauge: {
    label: 'Fuel Gauge',
    category: 'Gauges',
    w: 74, h: 80,
    terminals: [{ id: 'in', x: 0, y: 34, role: 'load_in', name: 'IN' }],
    defaultProps: { label: 'Fuel Gauge', fuelLevel: 65 },
    fields: [{ key: 'fuelLevel', label: 'Fuel Level (%)', type: 'range', min: 0, max: 100, step: 1, formatOption: v => v + '%' }],
    statusHint(props) {
      const lvl = Number(props.fuelLevel) || 0;
      return lvl < 15 ? '⚠ Running on fumes — drag the level up before you\'re stranded.' : `Tank reads ${lvl}% — drag the slider to simulate driving it down.`;
    },
    render(props, s) {
      const on = s && s.active;
      const lvl = Number(props.fuelLevel) || 0;
      const low = lvl < 15;
      const angle = -100 + Math.max(0, Math.min(1, lvl / 100)) * 200;
      const needleColor = !on ? 'var(--part-stroke)' : low ? '#dc2626' : '#16a34a';
      return `
        <circle cx="37" cy="32" r="25" fill="var(--part-fill)" stroke="var(--part-stroke)" stroke-width="2"/>
        <path d="M 14.4 45 A 25 25 0 0 1 21.5 12.5" fill="none" stroke="#dc2626" stroke-width="3" opacity="0.5"/>
        <path d="M 59.6 45 A 25 25 0 0 0 52.5 12.5" fill="none" stroke="#16a34a" stroke-width="3" opacity="0.5"/>
        <text x="16" y="58" font-size="8" fill="var(--text-dim)">E</text>
        <text x="55" y="58" font-size="8" fill="var(--text-dim)">F</text>
        <line x1="37" y1="32" x2="37" y2="12" stroke="${needleColor}" stroke-width="2.5" transform="rotate(${angle} 37 32)" class="${on && low ? 'blink' : ''}"/>
        <circle cx="37" cy="32" r="3" fill="var(--part-stroke)"/>
        <text x="37" y="76" text-anchor="middle" class="part-label">${props.label || 'Fuel'}${on && low ? ' ⚠' : ''}</text>
      `;
    }
  },

  tempGauge: {
    label: 'Coolant Temp Gauge',
    category: 'Gauges',
    w: 74, h: 80,
    terminals: [{ id: 'in', x: 0, y: 34, role: 'load_in', name: 'IN' }],
    defaultProps: { label: 'Temp Gauge', temp: 50 },
    fields: [{ key: 'temp', label: 'Coolant Temp', type: 'range', min: 0, max: 100, step: 1, formatOption: v => (v < 30 ? 'Cold' : v > 75 ? 'HOT ⚠' : 'Normal') }],
    statusHint(props) {
      const t = Number(props.temp) || 0;
      if (t > 75) return '⚠ Running hot — check the Radiator and Water Pump are actually wired in.';
      return t < 30 ? 'Still cold — give the engine a minute to warm up.' : 'Sitting in the normal operating range.';
    },
    render(props, s) {
      const on = s && s.active;
      const t = Number(props.temp) || 0;
      const hot = t > 75;
      const angle = -100 + Math.max(0, Math.min(1, t / 100)) * 200;
      const needleColor = !on ? 'var(--part-stroke)' : hot ? '#dc2626' : t < 30 ? '#2563eb' : '#16a34a';
      return `
        <circle cx="37" cy="32" r="25" fill="var(--part-fill)" stroke="var(--part-stroke)" stroke-width="2"/>
        <path d="M 14.4 45 A 25 25 0 0 1 21.5 12.5" fill="none" stroke="#2563eb" stroke-width="3" opacity="0.5"/>
        <path d="M 59.6 45 A 25 25 0 0 0 52.5 12.5" fill="none" stroke="#dc2626" stroke-width="3" opacity="0.5"/>
        <text x="15" y="58" font-size="8" fill="var(--text-dim)">C</text>
        <text x="56" y="58" font-size="8" fill="var(--text-dim)">H</text>
        <line x1="37" y1="32" x2="37" y2="12" stroke="${needleColor}" stroke-width="2.5" transform="rotate(${angle} 37 32)" class="${on && hot ? 'blink' : ''}"/>
        <circle cx="37" cy="32" r="3" fill="var(--part-stroke)"/>
        <text x="37" y="76" text-anchor="middle" class="part-label">${props.label || 'Temp'}${on && hot ? ' ⚠' : ''}</text>
      `;
    }
  },

};

// Gated pass-throughs whose in/out edge is a simple props.on flag.
export const GATED_PASS_TYPES_MECH = new Set(['clutch']);

// Always electrically... er, mechanically connected end-to-end.
export const ALWAYS_PASS_TYPES_MECH = new Set([
  'flywheel', 'turbo', 'nitrous', 'supercharger', 'driveshaft', 'axle',
  'masterCylinder', 'brakeLine', 'brakeCaliper', 'absModule',
  'radiator', 'airFilter', 'intakeManifold', 'exhaustPipe', 'catConverter',
]);

// Parts that belong to the brake-pressure network rather than the
// drive-power network (used to decide which net lights up their "active"
// glow — they never carry drive power).
export const BRAKE_TYPES_MECH = new Set(['masterCylinder', 'brakeLine', 'brakeCaliper', 'absModule']);

// Simple single-terminal loads: active when their 'in' terminal is
// reachable from the engine.
export const LOAD_TYPES_MECH = new Set([
  'waterPump', 'oilPump', 'fuelPump', 'fuelInjector', 'speedometer', 'tachometer',
  'fuelGauge', 'tempGauge',
]);
