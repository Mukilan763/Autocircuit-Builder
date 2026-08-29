// simulate.js — a simplified DC circuit solver.
// Not a real SPICE engine: it treats switches/fuses/relays/diodes as edges
// in a graph and does reachability from the battery, which is exactly
// enough to make lights turn on, motors spin, diodes block backfeed, and
// fuses blow believably.
import { PART_DEFS, GATED_PASS_TYPES, ALWAYS_PASS_TYPES, LOAD_TYPES, FUSE_LIKE_TYPES } from './parts.js';

function key(compId, terminalId) { return compId + ':' + terminalId; }

function buildGraph(components, wires, relayStates, blownFuses, excludeFuseId) {
  const adj = new Map();
  function ensure(k) { if (!adj.has(k)) adj.set(k, new Set()); return adj.get(k); }
  function addEdge(k1, k2) { ensure(k1).add(k2); ensure(k2).add(k1); }
  function addDirected(from, to) { ensure(from).add(to); ensure(to); }

  for (const w of wires) {
    addEdge(key(w.a.compId, w.a.terminal), key(w.b.compId, w.b.terminal));
  }
  for (const c of components) {
    if (GATED_PASS_TYPES.has(c.type)) {
      if (c.props.on) addEdge(key(c.id, 'in'), key(c.id, 'out'));
    } else if (ALWAYS_PASS_TYPES.has(c.type)) {
      addEdge(key(c.id, 'in'), key(c.id, 'out'));
    } else if (c.type === 'ignitionSwitch') {
      const pos = c.props.position || 'off';
      if (pos !== 'off') addEdge(key(c.id, 'com'), key(c.id, pos));
    } else if (c.type === 'junction') {
      addEdge(key(c.id, 'a'), key(c.id, 'b'));
      addEdge(key(c.id, 'b'), key(c.id, 'c'));
      addEdge(key(c.id, 'a'), key(c.id, 'c'));
    } else if (c.type === 'diode') {
      addDirected(key(c.id, 'anode'), key(c.id, 'cathode'));
    } else if (FUSE_LIKE_TYPES.has(c.type)) {
      if (c.id !== excludeFuseId && !blownFuses.has(c.id)) {
        addEdge(key(c.id, 'in'), key(c.id, 'out'));
      }
    } else if (c.type === 'relay') {
      const energized = !!relayStates[c.id];
      if (energized) addEdge(key(c.id, 'com'), key(c.id, 'no'));
      else addEdge(key(c.id, 'com'), key(c.id, 'nc'));
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

function getSeeds(components) {
  const posSeeds = [];
  const gndSeeds = [];
  for (const c of components) {
    if (c.type === 'battery') {
      posSeeds.push(key(c.id, 'pos'));
      gndSeeds.push(key(c.id, 'neg'));
    } else if (c.type === 'ground') {
      gndSeeds.push(key(c.id, 'gnd'));
    } else if (c.type === 'alternator' && c.props.on) {
      posSeeds.push(key(c.id, 'out'));
      gndSeeds.push(key(c.id, 'gnd'));
    }
  }
  return { posSeeds, gndSeeds };
}

function computeActiveLoads(components, powerNet, groundNet) {
  const active = new Set();
  for (const c of components) {
    if (!LOAD_TYPES.has(c.type)) continue;
    const pwrKey = key(c.id, 'pwr');
    const gndKey = key(c.id, 'gnd');
    if (powerNet.has(pwrKey) && groundNet.has(gndKey)) active.add(c.id);
  }
  return active;
}

export function simulate(state) {
  const { components, wires } = state;
  const { posSeeds, gndSeeds } = getSeeds(components);
  const relayComps = components.filter(c => c.type === 'relay');
  const fuseComps = components.filter(c => FUSE_LIKE_TYPES.has(c.type));

  let relayStates = {};
  for (const r of relayComps) relayStates[r.id] = false;
  const blownFuses = new Set();

  let powerNet = new Set(posSeeds);
  let groundNet = new Set(gndSeeds);

  // Fixed-point loop: relay energization can depend on other relays' contacts
  // (or an ignition switch, or an alternator), and blowing a fuse can
  // de-energize a relay downstream. A handful of iterations is always
  // enough for the small-to-medium circuits this tool supports.
  for (let iter = 0; iter < 8; iter++) {
    const adj = buildGraph(components, wires, relayStates, blownFuses);
    powerNet = bfs(posSeeds, adj);
    groundNet = bfs(gndSeeds, adj);

    let changed = false;
    const newRelayStates = { ...relayStates };
    for (const r of relayComps) {
      const energized = powerNet.has(key(r.id, 'coilA')) && groundNet.has(key(r.id, 'coilB'));
      if (energized !== relayStates[r.id]) changed = true;
      newRelayStates[r.id] = energized;
    }
    relayStates = newRelayStates;

    // Check for newly-overloaded fuses using this iteration's network.
    const activeLoads = computeActiveLoads(components, powerNet, groundNet);
    let blewOne = false;
    for (const f of fuseComps) {
      if (blownFuses.has(f.id)) continue;
      const adjNoFuse = buildGraph(components, wires, relayStates, blownFuses, f.id);
      const powerNoFuse = bfs(posSeeds, adjNoFuse);
      let draw = 0;
      for (const c of components) {
        if (!LOAD_TYPES.has(c.type) || !activeLoads.has(c.id)) continue;
        const dependsOnFuse = !powerNoFuse.has(key(c.id, 'pwr'));
        if (dependsOnFuse) draw += Number(c.props.current) || 0;
      }
      if (draw > Number(f.props.rating)) {
        blownFuses.add(f.id);
        blewOne = true;
      }
    }
    if (!changed && !blewOne) break;
  }

  // Final settle with the confirmed blown-fuse set.
  const adjFinal = buildGraph(components, wires, relayStates, blownFuses);
  powerNet = bfs(posSeeds, adjFinal);
  groundNet = bfs(gndSeeds, adjFinal);
  const activeLoads = computeActiveLoads(components, powerNet, groundNet);

  const compStates = {};
  for (const c of components) {
    if (LOAD_TYPES.has(c.type)) {
      compStates[c.id] = { active: activeLoads.has(c.id) };
    } else if (FUSE_LIKE_TYPES.has(c.type)) {
      const blown = blownFuses.has(c.id);
      const noun = c.type === 'circuitBreaker' ? 'breaker' : 'fuse';
      compStates[c.id] = {
        blown,
        warning: blown ? `Blown from overload. Lower the connected load’s current, or raise this ${noun}’s rating.` : null,
      };
    } else if (c.type === 'relay') {
      compStates[c.id] = { energized: !!relayStates[c.id] };
    } else {
      compStates[c.id] = {};
    }
  }

  const terminalStatus = {};
  for (const c of components) {
    const def = PART_DEFS[c.type];
    for (const t of def.terminals) {
      const k = key(c.id, t.id);
      terminalStatus[k] = {
        powered: powerNet.has(k),
        grounded: groundNet.has(k),
      };
    }
  }

  const wireStatus = {};
  for (const w of wires) {
    const ka = key(w.a.compId, w.a.terminal);
    const st = terminalStatus[ka] || {};
    wireStatus[w.id] = st.powered ? 'hot' : (st.grounded ? 'ground' : 'off');
  }

  return { compStates, terminalStatus, wireStatus, blownFuses };
}
