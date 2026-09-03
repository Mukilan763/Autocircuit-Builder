// mechEfficiency.js — the mechanical panel's live "Power & Efficiency"
// graph: a power-loss waterfall (engine → clutch → transmission →
// differential → turbo) and a speed-vs-RPM curve for whatever gear is
// currently engaged, both built from computeDrivelineSummary() so they
// never disagree with the gauges on the canvas.
import { computeDrivelineSummary } from './mechSimulate.js';
import { computeFuelEconomy, DRIVE_TYPE_MULT, TRAFFIC_MULT, ROAD_QUALITY_MULT } from './mechParts.js';
import { unlock } from './achievements.js';

const CONDITIONS_KEY = 'autocircuit-fuel-conditions';
const DRIVE_TYPE_LABELS = { highway: '🛣️ Highway', city: '🏙️ City' };
const TRAFFIC_LABELS = { light: '🟢 Light traffic', moderate: '🟡 Moderate traffic', heavy: '🔴 Heavy traffic' };
const ROAD_QUALITY_LABELS = { smooth: '🛤️ Smooth road', average: '〰️ Average road', rough: '🪨 Rough road' };

function loadConditions() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONDITIONS_KEY));
    if (saved && saved.driveType) return saved;
  } catch (e) { /* fall through to defaults */ }
  return { driveType: 'highway', traffic: 'light', roadQuality: 'smooth' };
}
function saveConditions(c) { localStorage.setItem(CONDITIONS_KEY, JSON.stringify(c)); }

const STAGE_COLORS = {
  engine: '#7c5cff',
  clutch: '#6366f1',
  trans: '#a855f7',
  diff: '#c026d3',
  turbo: '#f97316',
};

function waterfallHTML(summary) {
  let cum = 1;
  const rows = summary.stages.map((s, i) => {
    if (i > 0) cum *= s.pct / 100;
    return { ...s, hp: Math.max(1, Math.round(summary.baseHp * cum)) };
  });
  const maxHp = Math.max(...rows.map(r => r.hp), 1);
  return rows.map(r => {
    const widthPct = Math.max(6, (r.hp / maxHp) * 100);
    const color = STAGE_COLORS[r.key] || '#a78bfa';
    const tag = r.key === 'engine' ? '' : r.key === 'turbo' ? ` <b>+${r.pct - 100}%</b>` : ` <b>${r.pct}%</b>`;
    return `
      <div class="eff-row">
        <span class="eff-row-label">${escapeHtml(r.label)}${tag}</span>
        <div class="eff-row-track"><div class="eff-row-fill" style="width:${widthPct}%;background:${color}"></div></div>
        <span class="eff-row-value">${r.hp} hp</span>
      </div>`;
  }).join('');
}

function curveSVG(summary) {
  const W = 480, H = 230, padL = 46, padR = 14, padT = 14, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxRpm = summary.redline || 7000;
  const maxSpeed = Math.max(summary.topSpeedKmh, summary.currentSpeed, ...(summary.curve || []).map(p => p.speed), 20) * 1.18;

  const X = rpm => padL + (rpm / maxRpm) * plotW;
  const Y = speed => padT + plotH - Math.max(0, Math.min(1, speed / maxSpeed)) * plotH;

  const gridLines = [0.25, 0.5, 0.75].map(f => {
    const y = padT + plotH * (1 - f);
    return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + plotW}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 4"/>
            <text x="${padL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--text-dim)">${Math.round(maxSpeed * f)}</text>`;
  }).join('');

  const hasCurve = summary.curve && summary.curve.length > 1;
  const pathD = hasCurve ? summary.curve.map((p, i) => `${i === 0 ? 'M' : 'L'} ${X(p.rpm).toFixed(1)} ${Y(p.speed).toFixed(1)}`).join(' ') : '';
  const capY = Y(summary.topSpeedKmh);

  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Speed versus RPM chart">
      ${gridLines}
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="var(--border)" stroke-width="1.5"/>
      <line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="var(--border)" stroke-width="1.5"/>
      <line x1="${padL}" y1="${capY.toFixed(1)}" x2="${padL + plotW}" y2="${capY.toFixed(1)}" stroke="var(--danger)" stroke-width="1.5" stroke-dasharray="6 4"/>
      <text x="${padL + plotW}" y="${(capY - 6).toFixed(1)}" text-anchor="end" font-size="10" font-weight="700" fill="var(--danger)">power limit — ${Math.round(summary.topSpeedKmh)} km/h</text>
      ${hasCurve ? `<path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
      ${hasCurve ? `<path d="${pathD} L ${X(summary.curve[summary.curve.length - 1].rpm).toFixed(1)} ${(padT + plotH).toFixed(1)} L ${X(summary.curve[0].rpm).toFixed(1)} ${(padT + plotH).toFixed(1)} Z" fill="var(--accent)" opacity="0.1"/>` : ''}
      ${summary.inGear ? `<circle cx="${X(summary.currentRpm).toFixed(1)}" cy="${Y(summary.currentSpeed).toFixed(1)}" r="6.5" fill="var(--accent-2)" stroke="var(--card-bg)" stroke-width="2.5"/>` : ''}
      <text x="${padL}" y="${H - 6}" font-size="10" fill="var(--text-dim)">${Math.round(summary.idle || 0)} RPM (idle)</text>
      <text x="${padL + plotW}" y="${H - 6}" text-anchor="end" font-size="10" fill="var(--text-dim)">${Math.round(maxRpm)} RPM (redline)</text>
    </svg>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function selectHTML(id, labels, current) {
  const opts = Object.entries(labels)
    .map(([value, label]) => `<option value="${value}"${value === current ? ' selected' : ''}>${label}</option>`)
    .join('');
  return `<select id="${id}" class="select">${opts}</select>`;
}

// The fuel-economy section — its own conditions selectors (drive type,
// traffic, road quality) plus the resulting estimate, all built from
// computeFuelEconomy() so a build's displacement and its *actual* drivetrain
// efficiency (the same number the waterfall above shows) both feed it,
// rather than fuel economy being some disconnected, separately-tuned figure.
function fuelEconomyHTML(summary, conditions) {
  const { l100km, kmPerLiter } = computeFuelEconomy(summary.displacementCc, summary.overallEfficiency, conditions);
  return `
    <h4>⛽ Estimated fuel economy</h4>
    <p class="panel-hint" style="margin-bottom:8px">How and where you drive changes this as much as the car itself does.</p>
    <div class="fuel-conditions">
      ${selectHTML('fuel-drive-type', DRIVE_TYPE_LABELS, conditions.driveType)}
      ${selectHTML('fuel-traffic', TRAFFIC_LABELS, conditions.traffic)}
      ${selectHTML('fuel-road', ROAD_QUALITY_LABELS, conditions.roadQuality)}
    </div>
    <div class="eff-stats cols-2">
      <div class="eff-stat"><span class="eff-stat-value">${kmPerLiter.toFixed(1)}</span><span class="eff-stat-label">km per liter</span></div>
      <div class="eff-stat"><span class="eff-stat-value">${l100km.toFixed(1)}</span><span class="eff-stat-label">liters / 100km</span></div>
    </div>
  `;
}

function buildBody(summary, conditions) {
  if (!summary.hasEngine) {
    return `<p class="eff-empty">🔧 Add an <strong>Engine</strong> to the canvas to see its power and efficiency here.</p>`;
  }
  if (!summary.running) {
    const power = summary.baseHp != null ? `≈ ${summary.baseHp} hp at this displacement.` : '';
    return `<p class="eff-empty">⚡ Turn the Engine on to see live power, drivetrain efficiency, and the speed curve. ${power}</p>`;
  }
  const gearNote = summary.inGear
    ? `Currently in <strong>${escapeHtml(summary.gearLabel)}</strong> — the pink dot marks where you are on the curve right now.`
    : summary.gearLabel
      ? `<strong>${escapeHtml(summary.gearLabel)}</strong> selected — shift into a gear to see the speed curve.`
      : `No transmission in this build yet — add one (and a differential) to see the speed curve.`;

  return `
    <div class="eff-stats">
      <div class="eff-stat"><span class="eff-stat-value">${summary.baseHp}</span><span class="eff-stat-label">base hp</span></div>
      <div class="eff-stat"><span class="eff-stat-value">${summary.effectiveHp}</span><span class="eff-stat-label">at the wheels</span></div>
      <div class="eff-stat"><span class="eff-stat-value">${summary.overallEfficiency}%</span><span class="eff-stat-label">drivetrain efficiency</span></div>
      <div class="eff-stat"><span class="eff-stat-value">${Math.round(summary.topSpeedKmh)}</span><span class="eff-stat-label">km/h top speed</span></div>
    </div>
    <h4>Power loss through the drivetrain</h4>
    <div class="eff-waterfall">${waterfallHTML(summary)}</div>
    <h4>Speed vs. RPM in the current gear</h4>
    <p class="panel-hint" style="margin-bottom:6px">${gearNote}</p>
    <div class="eff-chart">${curveSVG(summary)}</div>
    ${fuelEconomyHTML(summary, conditions)}
  `;
}

export function createEfficiencyPanel({ store, dom }) {
  let conditions = loadConditions();

  function render() {
    const summary = computeDrivelineSummary(store.state);
    dom.body.innerHTML = buildBody(summary, conditions);
    if (summary.topSpeedKmh >= 250) unlock('speed-demon');
  }

  dom.openBtn.addEventListener('click', () => {
    render();
    dom.modal.classList.add('open');
  });
  dom.closeBtn.addEventListener('click', () => dom.modal.classList.remove('open'));
  dom.modal.addEventListener('click', e => { if (e.target === dom.modal) dom.modal.classList.remove('open'); });

  // The three condition <select>s live inside dom.body's regenerated
  // innerHTML, so a listener bound directly to them would be lost on every
  // re-render — delegating from the stable parent instead survives that.
  dom.body.addEventListener('change', e => {
    const field = { 'fuel-drive-type': 'driveType', 'fuel-traffic': 'traffic', 'fuel-road': 'roadQuality' }[e.target.id];
    if (!field) return;
    conditions = { ...conditions, [field]: e.target.value };
    saveConditions(conditions);
    render();
  });

  // Keep it live while it's open, so dragging the throttle updates the graph.
  store.onChange(() => { if (dom.modal.classList.contains('open')) render(); });

  return { render };
}
