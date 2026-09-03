// mechSimulate.js — the mechanical panel's solver. Same reachability-graph
// idea as simulate.js, but there's no "ground" to close a loop against:
// mechanical power just needs to be reachable from a running Engine (the
// drive network), and braking just needs to be reachable from a pressed
// Brake Pedal or engaged Parking Brake (the brake network). No fuses or
// relay feedback loops here, so a single pass is enough — no iteration.
import {
  PART_DEFS_MECH, GATED_PASS_TYPES_MECH, ALWAYS_PASS_TYPES_MECH, BRAKE_TYPES_MECH, LOAD_TYPES_MECH,
  manualGearRatio, engineRpm, estimatedPower, speedFromRpm, rpmFromSpeed, topSpeedFromPower,
  REVERSE_RATIO, TURBO_SPOOL_RPM, TURBO_BOOST_MULT, NITROUS_BOOST_MULT, SUPERCHARGER_BOOST_MULT,
  autoTransEfficiency,
} from './mechParts.js';

function key(compId, terminalId) { return compId + ':' + terminalId; }
const EMPTY_SET = new Set();

function buildGraph(components, wires, disabledManualTrans = EMPTY_SET) {
  const adj = new Map();
  function ensure(k) { if (!adj.has(k)) adj.set(k, new Set()); return adj.get(k); }
  function addEdge(k1, k2) { ensure(k1).add(k2); ensure(k2).add(k1); }

  for (const w of wires) {
    addEdge(key(w.a.compId, w.a.terminal), key(w.b.compId, w.b.terminal));
  }
  for (const c of components) {
    if (GATED_PASS_TYPES_MECH.has(c.type)) {
      const def = PART_DEFS_MECH[c.type];
      const engaged = def.invertedGate ? !c.props.on : c.props.on;
      if (engaged) addEdge(key(c.id, 'in'), key(c.id, 'out'));
    } else if (c.type === 'manualTransmission') {
      // Must agree with computeRpmNet's manualGearRatio check below — a
      // stale gear position left over from lowering the gear count (e.g.
      // '7' after switching to a 5-speed box) has to count as neutral in
      // *both* graphs, or the wheel ends up "spinning" at 0 RPM. Also
      // requires an actually-engaged Clutch somewhere in the powered path
      // (see computeDisabledManualTrans) — a manual gearbox can't couple to
      // a running engine at all without one, in this simulator same as in
      // a real car.
      if (!disabledManualTrans.has(c.id) && manualGearRatio(c.props.position || 'N', c.props.gearCount, c.props.gearType) != null) {
        addEdge(key(c.id, 'in'), key(c.id, 'out'));
      }
    } else if (c.type === 'autoTransmission') {
      const pos = c.props.position || 'P';
      if (pos === 'D' || pos === 'R') addEdge(key(c.id, 'in'), key(c.id, 'out'));
    } else if (c.type === 'differential') {
      addEdge(key(c.id, 'in'), key(c.id, 'outL'));
      addEdge(key(c.id, 'in'), key(c.id, 'outR'));
      addEdge(key(c.id, 'outL'), key(c.id, 'outR'));
    } else if (ALWAYS_PASS_TYPES_MECH.has(c.type)) {
      addEdge(key(c.id, 'in'), key(c.id, 'out'));
    }
  }
  return adj;
}

function bfs(seeds, adj) {
  const visited = new Set(seeds);
  const queue = [...seeds];
  while (queue.length) {
    const cur = queue.shift();
    const neighbors = adj.get(cur);
    if (!neighbors) continue;
    for (const n of neighbors) {
      if (!visited.has(n)) { visited.add(n); queue.push(n); }
    }
  }
  return visited;
}

// Propagates an actual RPM value outward from each running engine, scaling
// by gear/final-drive ratios along the way, so gauges can show a real
// number instead of just an on/off needle. Reuses the same edge rules as
// buildGraph, but as a weighted graph (multiplier per edge) walked with a
// value-carrying BFS instead of a plain reachability one.
function computeRpmNet(components, wires, disabledManualTrans = EMPTY_SET) {
  const adj = new Map();
  function ensure(k) { if (!adj.has(k)) adj.set(k, []); return adj.get(k); }
  function addEdge(k1, k2, mult) { ensure(k1).push({ to: k2, mult }); ensure(k2).push({ to: k1, mult: 1 / mult }); }

  for (const w of wires) addEdge(key(w.a.compId, w.a.terminal), key(w.b.compId, w.b.terminal), 1);
  for (const c of components) {
    if (GATED_PASS_TYPES_MECH.has(c.type)) {
      const def = PART_DEFS_MECH[c.type];
      const engaged = def.invertedGate ? !c.props.on : c.props.on;
      if (engaged) addEdge(key(c.id, 'in'), key(c.id, 'out'), 1);
    } else if (c.type === 'manualTransmission') {
      const ratio = manualGearRatio(c.props.position || 'N', c.props.gearCount, c.props.gearType);
      if (!disabledManualTrans.has(c.id) && ratio != null) addEdge(key(c.id, 'in'), key(c.id, 'out'), 1 / ratio);
    } else if (c.type === 'autoTransmission') {
      const pos = c.props.position || 'P';
      if (pos === 'D') addEdge(key(c.id, 'in'), key(c.id, 'out'), 1 / (Number(c.props.ratio) || 2));
      else if (pos === 'R') addEdge(key(c.id, 'in'), key(c.id, 'out'), 1 / REVERSE_RATIO);
    } else if (c.type === 'differential') {
      const fd = Number(c.props.finalDriveRatio) || 3.7;
      addEdge(key(c.id, 'in'), key(c.id, 'outL'), 1 / fd);
      addEdge(key(c.id, 'in'), key(c.id, 'outR'), 1 / fd);
    } else if (ALWAYS_PASS_TYPES_MECH.has(c.type)) {
      addEdge(key(c.id, 'in'), key(c.id, 'out'), 1);
    }
  }

  const rpmAt = new Map();
  const queue = [];
  for (const c of components) {
    if (c.type === 'engine' && c.props.on) {
      const k = key(c.id, 'out');
      rpmAt.set(k, engineRpm(c.props));
      queue.push(k);
    }
  }
  while (queue.length) {
    const cur = queue.shift();
    const curRpm = rpmAt.get(cur);
    for (const { to, mult } of (adj.get(cur) || [])) {
      if (!rpmAt.has(to)) { rpmAt.set(to, curRpm * mult); queue.push(to); }
    }
  }
  return rpmAt;
}

// First instance of `type` that's actually receiving power right now (not
// just present on the canvas) — used to build a representative drivetrain
// "path" for the efficiency stages without needing full path tracing,
// which is exact for the typical single-path builds this tool is for.
// `disabledIds` excludes components whose internal edge got suppressed for
// a reason `driveNet` reachability alone can't see — a manual transmission
// with no engaged Clutch upstream, say, whose `in` terminal is still
// powered by the wire leading into it even though nothing passes through.
function findEngaged(components, type, driveNet, disabledIds = EMPTY_SET) {
  return components.find(c => c.type === type && !disabledIds.has(c.id) && driveNet.has(key(c.id, 'in')));
}

// A manual transmission can't do anything without an actually-engaged
// Clutch somewhere in the powered path feeding it — in a real car that's
// not optional equipment, it's how the gearbox couples to the engine at
// all. Runs reachability once with every manual transmission's edge
// tentatively live to see whether an engaged clutch is anywhere in that
// preliminary drive network; if not, every manual transmission in the
// build gets disabled for the *real* pass. (If the build has zero Clutch
// parts and zero manual transmissions, this is just an empty set — no
// behavior change for automatics, which model their torque converter/
// dual-clutch internally and never needed an external clutch part.)
function computeDisabledManualTrans(components, wires, driveSeeds) {
  const manualTransIds = components.filter(c => c.type === 'manualTransmission').map(c => c.id);
  if (!manualTransIds.length) return EMPTY_SET;
  const prelimNet = bfs(driveSeeds, buildGraph(components, wires));
  const hasEngagedClutchInPath = components.some(c =>
    c.type === 'clutch' && prelimNet.has(key(c.id, 'in')) && prelimNet.has(key(c.id, 'out'))
  );
  return hasEngagedClutchInPath ? EMPTY_SET : new Set(manualTransIds);
}

// The car's power-limited top speed, and how it got there: the strongest
// running engine's horsepower, run through whichever clutch/transmission/
// differential are actually engaged (each bleeding a bit of power per its
// efficiency rating), then boosted +30% if a spooled-up turbo is anywhere
// in the drive network. This is what actually keeps a small or inefficient
// drivetrain from being geared into an impossible top speed — see
// topSpeedFromPower's comment. Shared by simulate() (so the live gauges
// reflect it) and computeDrivelineSummary() (so the graph shows the exact
// same numbers).
function computeEffectivePower(components, driveNet, rpmNet, disabledManualTrans = EMPTY_SET) {
  let engine = null;
  let baseHp = 0;
  for (const c of components) {
    if (c.type === 'engine' && c.props.on && estimatedPower(c.props) > baseHp) {
      engine = c;
      baseHp = estimatedPower(c.props);
    }
  }
  const stages = [{ key: 'engine', label: 'Engine', pct: 100 }];
  if (!engine) return { baseHp: 0, effectiveHp: 0, boosted: false, topSpeedKmh: 0, stages, overallEfficiency: 100 };

  let mult = 1;
  const clutch = findEngaged(components, 'clutch', driveNet);
  if (clutch) {
    const pct = Number(clutch.props.efficiency) || 97;
    mult *= pct / 100;
    stages.push({ key: 'clutch', label: clutch.props.label || 'Clutch', pct });
  }
  const manual = findEngaged(components, 'manualTransmission', driveNet, disabledManualTrans);
  const auto = manual ? null : findEngaged(components, 'autoTransmission', driveNet);
  if (manual) {
    const pct = Number(manual.props.efficiency) || 96;
    mult *= pct / 100;
    stages.push({ key: 'trans', label: manual.props.label || 'Transmission', pct });
  } else if (auto) {
    const pct = autoTransEfficiency(auto.props);
    mult *= pct / 100;
    stages.push({ key: 'trans', label: auto.props.label || 'Transmission', pct });
  }
  const diff = findEngaged(components, 'differential', driveNet);
  if (diff) {
    const pct = Number(diff.props.efficiency) || 96;
    mult *= pct / 100;
    stages.push({ key: 'diff', label: diff.props.label || 'Differential', pct });
  }

  // Performance mods each apply independently and stack multiplicatively —
  // a turbo'd, supercharged car on nitrous is a deliberately silly (but
  // consistent) thing this simulator lets you build.
  let boostMult = 1;
  let boosted = false;
  const turbo = findEngaged(components, 'turbo', driveNet);
  if (turbo) {
    const rpm = rpmNet.get(key(turbo.id, 'in'));
    if (rpm && rpm > TURBO_SPOOL_RPM) {
      boostMult *= TURBO_BOOST_MULT;
      boosted = true;
      stages.push({ key: 'turbo', label: 'Turbo boost', pct: Math.round(TURBO_BOOST_MULT * 100) });
    }
  }
  const supercharger = findEngaged(components, 'supercharger', driveNet);
  if (supercharger && supercharger.props.on) {
    boostMult *= SUPERCHARGER_BOOST_MULT;
    boosted = true;
    stages.push({ key: 'supercharger', label: 'Supercharger', pct: Math.round(SUPERCHARGER_BOOST_MULT * 100) });
  }
  const nitrous = findEngaged(components, 'nitrous', driveNet);
  if (nitrous && nitrous.props.on) {
    boostMult *= NITROUS_BOOST_MULT;
    boosted = true;
    stages.push({ key: 'nitrous', label: '🔥 Nitrous', pct: Math.round(NITROUS_BOOST_MULT * 100) });
  }

  const effectiveHp = baseHp * mult;
  const boostedHp = effectiveHp * boostMult;

  return {
    baseHp, effectiveHp: boostedHp, boosted, engine,
    topSpeedKmh: topSpeedFromPower(boostedHp),
    stages, overallEfficiency: Math.round(mult * 100), // drivetrain losses only — boosts are a separate power gain, not an efficiency
  };
}

function getSeeds(components) {
  const driveSeeds = [];
  const brakeSeeds = [];
  for (const c of components) {
    if (c.type === 'engine' && c.props.on) driveSeeds.push(key(c.id, 'out'));
    else if (c.type === 'brakePedal' && c.props.on) brakeSeeds.push(key(c.id, 'out'));
    else if (c.type === 'parkingBrake' && c.props.on) brakeSeeds.push(key(c.id, 'out'));
  }
  return { driveSeeds, brakeSeeds };
}

export function simulate(state) {
  const { components, wires } = state;
  const { driveSeeds, brakeSeeds } = getSeeds(components);
  const disabledManualTrans = computeDisabledManualTrans(components, wires, driveSeeds);
  const adj = buildGraph(components, wires, disabledManualTrans);
  const driveNet = bfs(driveSeeds, adj);
  const brakeNet = bfs(brakeSeeds, adj);
  const rpmNet = computeRpmNet(components, wires, disabledManualTrans);
  const { topSpeedKmh } = computeEffectivePower(components, driveNet, rpmNet, disabledManualTrans);

  const compStates = {};
  for (const c of components) {
    if (c.type === 'wheel') {
      const rawRpm = rpmNet.get(key(c.id, 'drive'));
      const capRpm = topSpeedKmh > 0 ? rpmFromSpeed(topSpeedKmh, c.props.diameter) : Infinity;
      const cappedRpm = rawRpm != null ? Math.min(rawRpm, capRpm) : undefined;
      compStates[c.id] = {
        spinning: driveNet.has(key(c.id, 'drive')),
        braking: brakeNet.has(key(c.id, 'brake')),
        rpm: cappedRpm != null ? Math.round(cappedRpm) : undefined,
        powerLimited: rawRpm != null && rawRpm > capRpm + 1,
      };
    } else if (c.type === 'tachometer') {
      compStates[c.id] = { active: driveNet.has(key(c.id, 'in')), rpm: Math.round(rpmNet.get(key(c.id, 'in')) || 0) };
    } else if (c.type === 'speedometer') {
      const active = driveNet.has(key(c.id, 'in'));
      const rpm = rpmNet.get(key(c.id, 'in')) || 0;
      const kinematic = speedFromRpm(rpm, c.props.wheelDiameter);
      const speed = topSpeedKmh > 0 ? Math.min(kinematic, topSpeedKmh) : kinematic;
      compStates[c.id] = { active, speed, powerLimited: kinematic > speed + 0.5 };
    } else if (LOAD_TYPES_MECH.has(c.type)) {
      compStates[c.id] = { active: driveNet.has(key(c.id, 'in')) };
    } else if (c.type === 'engine') {
      compStates[c.id] = { rpm: engineRpm(c.props) };
    } else if (c.type === 'brakePedal' || c.type === 'parkingBrake') {
      compStates[c.id] = {}; // these render straight off their own props.on
    } else if (c.type === 'manualTransmission') {
      compStates[c.id] = {
        active: driveNet.has(key(c.id, 'in')) && driveNet.has(key(c.id, 'out')),
        needsClutch: disabledManualTrans.has(c.id),
      };
    } else {
      const net = BRAKE_TYPES_MECH.has(c.type) ? brakeNet : driveNet;
      compStates[c.id] = { active: net.has(key(c.id, 'in')) };
    }

    // Attach the actual RPM at each part's drive-side terminal wherever one
    // exists, so spin/pulse animations can run at a speed that matches —
    // instead of every spinning part looping at the same fixed rate no
    // matter how fast the engine is actually turning.
    if (c.type !== 'engine' && c.type !== 'wheel') {
      const rpmVal = rpmNet.get(key(c.id, 'in'));
      if (rpmVal != null) compStates[c.id].rpm = Math.round(rpmVal);
    }
  }

  const terminalStatus = {};
  for (const c of components) {
    const def = PART_DEFS_MECH[c.type];
    for (const t of def.terminals) {
      const k = key(c.id, t.id);
      terminalStatus[k] = {
        powered: driveNet.has(k),
        grounded: brakeNet.has(k),
      };
    }
  }

  const wireStatus = {};
  for (const w of wires) {
    const ka = key(w.a.compId, w.a.terminal);
    const st = terminalStatus[ka] || {};
    wireStatus[w.id] = st.powered ? 'hot' : (st.grounded ? 'ground' : 'off');
  }

  return { compStates, terminalStatus, wireStatus };
}

// Everything the efficiency graph needs: the power-loss waterfall (engine →
// clutch → transmission → differential → turbo boost) and a speed-vs-RPM
// curve for the currently engaged gear, both built from the exact same
// formulas simulate() uses so the graph never disagrees with the gauges.
export function computeDrivelineSummary(state) {
  const { components, wires } = state;
  const anyEngine = components.find(c => c.type === 'engine');
  if (!anyEngine) return { hasEngine: false };

  const { driveSeeds } = getSeeds(components);
  const disabledManualTrans = computeDisabledManualTrans(components, wires, driveSeeds);
  const adj = buildGraph(components, wires, disabledManualTrans);
  const driveNet = bfs(driveSeeds, adj);
  const rpmNet = computeRpmNet(components, wires, disabledManualTrans);
  const power = computeEffectivePower(components, driveNet, rpmNet, disabledManualTrans);

  if (!power.engine) {
    return { hasEngine: true, running: false, baseHp: estimatedPower(anyEngine.props) };
  }
  const engine = power.engine;

  const manual = findEngaged(components, 'manualTransmission', driveNet, disabledManualTrans);
  const auto = manual ? null : findEngaged(components, 'autoTransmission', driveNet);
  // A manual transmission exists but got disabled for lack of an engaged
  // Clutch upstream — distinct from "no transmission at all" so the panel
  // can say exactly what's missing instead of a generic message.
  const transNeedsClutch = !manual && components.some(c => c.type === 'manualTransmission' && disabledManualTrans.has(c.id));
  const diff = findEngaged(components, 'differential', driveNet);
  const diffRatio = diff ? (Number(diff.props.finalDriveRatio) || 3.7) : 1;

  let gearRatio = null;
  let gearLabel = null;
  if (manual) {
    gearRatio = manualGearRatio(manual.props.position || 'N', manual.props.gearCount, manual.props.gearType);
    gearLabel = (manual.props.position || 'N') === 'N' ? 'Neutral' : `Gear ${manual.props.position}`;
  } else if (auto) {
    const pos = auto.props.position || 'P';
    if (pos === 'D') { gearRatio = Number(auto.props.ratio) || 2; gearLabel = 'Drive'; }
    else if (pos === 'R') { gearRatio = REVERSE_RATIO; gearLabel = 'Reverse'; }
    else gearLabel = pos === 'P' ? 'Park' : 'Neutral';
  }

  const wheel = components.find(c => c.type === 'wheel') || components.find(c => c.type === 'speedometer');
  const wheelDiameter = wheel ? (Number(wheel.props.diameter ?? wheel.props.wheelDiameter) || 24) : 24;

  const idle = Number(engine.props.idleRPM) || 800;
  const redline = Number(engine.props.redlineRPM) || 7000;
  const curve = [];
  if (gearRatio) {
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const rpm = idle + ((redline - idle) * i) / steps;
      const wheelRpm = rpm / (gearRatio * diffRatio);
      const kinematic = speedFromRpm(wheelRpm, wheelDiameter);
      curve.push({ rpm: Math.round(rpm), speed: Math.min(kinematic, power.topSpeedKmh) });
    }
  }

  const currentRpm = engineRpm(engine.props);
  const currentWheelRpm = gearRatio ? currentRpm / (gearRatio * diffRatio) : 0;
  const currentSpeed = gearRatio ? Math.min(speedFromRpm(currentWheelRpm, wheelDiameter), power.topSpeedKmh) : 0;

  return {
    hasEngine: true, running: true,
    baseHp: Math.round(power.baseHp), effectiveHp: Math.round(power.effectiveHp),
    overallEfficiency: power.overallEfficiency, boosted: power.boosted,
    stages: power.stages, topSpeedKmh: power.topSpeedKmh,
    idle, redline, curve, gearLabel, inGear: !!gearRatio, transNeedsClutch,
    currentRpm, currentSpeed,
    displacementCc: Number(engine.props.displacement) || 2000,
  };
}
