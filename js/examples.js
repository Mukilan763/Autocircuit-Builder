// examples.js — ready-made circuits a beginner can load and immediately play
// with (click the switch) to see how the simulation behaves.
import { PART_DEFS } from './parts.js';

// Merges each part's defaultProps underneath whatever the example overrides,
// so adding a new field to a part later doesn't leave older examples with
// missing/undefined properties.
function comp(id, type, x, y, props) {
  return { id, type, x, y, props: { ...PART_DEFS[type].defaultProps, ...props } };
}
function wire(id, aComp, aTerm, bComp, bTerm) {
  return { id, a: { compId: aComp, terminal: aTerm }, b: { compId: bComp, terminal: bTerm } };
}

export const EXAMPLES = {

  headlight: {
    name: 'Headlight Circuit',
    build() {
      return {
        components: [
          comp('b1', 'battery', 40, 60, { label: 'Battery' }),
          comp('g1', 'ground', 50, 220, { label: 'Ground' }),
          comp('sw1', 'switch', 200, 90, { label: 'Headlight Switch', on: false }),
          comp('f1', 'fuse', 360, 95, { rating: 10, label: 'Fuse' }),
          comp('h1', 'headlight', 520, 85, { label: 'Headlight', current: 5 }),
        ],
        wires: [
          wire('w1', 'b1', 'pos', 'sw1', 'in'),
          wire('w2', 'sw1', 'out', 'f1', 'in'),
          wire('w3', 'f1', 'out', 'h1', 'pwr'),
          wire('w4', 'h1', 'gnd', 'b1', 'neg'),
          wire('w5', 'b1', 'neg', 'g1', 'gnd'),
        ],
        nextId: 1000,
      };
    },
    blurb: 'Click the switch to turn the headlight on and off.'
  },

  horn: {
    name: 'Horn Circuit',
    build() {
      return {
        components: [
          comp('b1', 'battery', 40, 60, { label: 'Battery' }),
          comp('g1', 'ground', 50, 220, { label: 'Ground' }),
          comp('sw1', 'switch', 200, 90, { label: 'Horn Button', on: false }),
          comp('f1', 'fuse', 360, 95, { rating: 15, label: 'Fuse' }),
          comp('hn1', 'horn', 520, 85, { label: 'Horn', current: 5 }),
        ],
        wires: [
          wire('w1', 'b1', 'pos', 'sw1', 'in'),
          wire('w2', 'sw1', 'out', 'f1', 'in'),
          wire('w3', 'f1', 'out', 'hn1', 'pwr'),
          wire('w4', 'hn1', 'gnd', 'b1', 'neg'),
          wire('w5', 'b1', 'neg', 'g1', 'gnd'),
        ],
        nextId: 1000,
      };
    },
    blurb: 'Press the button — the horn should light up and pulse.'
  },

  relay: {
    name: 'Turn Signal with Relay',
    build() {
      return {
        components: [
          comp('b1', 'battery', 30, 40, { label: 'Battery' }),
          comp('g1', 'ground', 40, 200, { label: 'Ground' }),
          comp('sw1', 'switch', 180, 60, { label: 'Ignition', on: false }),
          comp('f1', 'fuse', 340, 65, { rating: 10, label: 'Fuse' }),
          comp('rl1', 'relay', 480, 40, { label: 'Signal Relay' }),
          comp('sw2', 'switch', 480, 220, { label: 'Turn Signal Stalk', on: false }),
          comp('i1', 'indicator', 680, 65, { label: 'Turn Signal', current: 1.5 }),
        ],
        wires: [
          wire('w1', 'b1', 'pos', 'sw1', 'in'),
          wire('w2', 'sw1', 'out', 'f1', 'in'),
          wire('w3', 'f1', 'out', 'rl1', 'com'),
          wire('w4', 'rl1', 'no', 'i1', 'pwr'),
          wire('w5', 'i1', 'gnd', 'b1', 'neg'),
          wire('w6', 'b1', 'neg', 'g1', 'gnd'),
          // coil circuit: ignition feeds coil+, stalk switch grounds coil-
          wire('w7', 'f1', 'out', 'rl1', 'coilA'),
          wire('w8', 'rl1', 'coilB', 'sw2', 'in'),
          wire('w9', 'sw2', 'out', 'b1', 'neg'),
        ],
        nextId: 1000,
      };
    },
    blurb: 'Turn the ignition ON, then flip the stalk switch — the relay clicks over and powers the signal.'
  },

  ignition: {
    name: 'Ignition & Starter System',
    build() {
      return {
        components: [
          comp('b1', 'battery', 20, 30, { label: 'Battery' }),
          comp('g1', 'ground', 30, 190, { label: 'Ground' }),
          comp('ign1', 'ignitionSwitch', 170, 40, { label: 'Ignition', position: 'off' }),
          comp('fa1', 'fuse', 400, 20, { rating: 15, label: 'ACC Fuse' }),
          comp('acc1', 'accessory', 540, 8, { label: 'Radio', current: 3 }),
          comp('fe1', 'fuse', 400, 90, { rating: 10, label: 'ECU Fuse' }),
          comp('ecu1', 'ecu', 540, 78, { label: 'ECU', current: 0.5 }),
          comp('rl1', 'relay', 400, 220, { label: 'Starter Relay' }),
          comp('d1', 'diode', 340, 330, { label: 'Flyback Diode' }),
          comp('st1', 'starter', 600, 195, { label: 'Starter Motor', current: 90 }),
        ],
        wires: [
          wire('w1', 'b1', 'pos', 'ign1', 'com'),
          wire('w2', 'ign1', 'acc', 'fa1', 'in'),
          wire('w3', 'fa1', 'out', 'acc1', 'pwr'),
          wire('w4', 'acc1', 'gnd', 'b1', 'neg'),
          wire('w5', 'ign1', 'on', 'fe1', 'in'),
          wire('w6', 'fe1', 'out', 'ecu1', 'pwr'),
          wire('w7', 'ecu1', 'gnd', 'b1', 'neg'),
          wire('w8', 'ign1', 'start', 'rl1', 'coilA'),
          wire('w9', 'rl1', 'coilB', 'b1', 'neg'),
          wire('w10', 'd1', 'anode', 'rl1', 'coilB'),
          wire('w11', 'd1', 'cathode', 'rl1', 'coilA'),
          wire('w12', 'b1', 'pos', 'rl1', 'com'),
          wire('w13', 'rl1', 'no', 'st1', 'pwr'),
          wire('w14', 'st1', 'gnd', 'b1', 'neg'),
          wire('w15', 'b1', 'neg', 'g1', 'gnd'),
        ],
        nextId: 1000,
      };
    },
    blurb: 'Cycle the ignition through ACC → ON → START. START energizes the relay, which feeds the starter straight from the battery.'
  },

  overload: {
    name: 'Fuse Overload Demo',
    build() {
      return {
        components: [
          comp('b1', 'battery', 40, 60, { label: 'Battery' }),
          comp('g1', 'ground', 50, 220, { label: 'Ground' }),
          comp('sw1', 'switch', 200, 90, { label: 'Starter Switch', on: false }),
          comp('f1', 'fuse', 360, 95, { rating: 10, label: 'Undersized Fuse' }),
          comp('st1', 'starter', 520, 80, { label: 'Starter Motor', current: 80 }),
        ],
        wires: [
          wire('w1', 'b1', 'pos', 'sw1', 'in'),
          wire('w2', 'sw1', 'out', 'f1', 'in'),
          wire('w3', 'f1', 'out', 'st1', 'pwr'),
          wire('w4', 'st1', 'gnd', 'b1', 'neg'),
          wire('w5', 'b1', 'neg', 'g1', 'gnd'),
        ],
        nextId: 1000,
      };
    },
    blurb: 'A starter draws far more current than a 10A fuse can handle — flip the switch and watch it blow.'
  },

};
