// mechExamples.js — ready-made mechanical circuits to load and play with.
import { PART_DEFS_MECH } from './mechParts.js';

// Merges each part's defaultProps underneath whatever the example overrides,
// so adding a new field to a part later doesn't leave older examples with
// missing/undefined properties.
function comp(id, type, x, y, props) {
  return { id, type, x, y, props: { ...PART_DEFS_MECH[type].defaultProps, ...props } };
}
function wire(id, aComp, aTerm, bComp, bTerm) {
  return { id, a: { compId: aComp, terminal: aTerm }, b: { compId: bComp, terminal: bTerm } };
}

export const MECH_EXAMPLES = {

  drivetrain: {
    name: 'Drivetrain & Brakes',
    build() {
      return {
        components: [
          comp('e1', 'engine', 20, 30, { label: 'Engine', throttle: 35 }),
          comp('cl1', 'clutch', 180, 55, { label: 'Clutch' }),
          comp('mt1', 'manualTransmission', 300, 55, { label: 'Gearbox', position: 'N' }),
          comp('ds1', 'driveshaft', 470, 65, { label: 'Driveshaft' }),
          comp('d1', 'differential', 610, 40, { label: 'Differential' }),
          comp('w1', 'wheel', 740, 8, { label: 'Left Wheel' }),
          comp('w2', 'wheel', 740, 130, { label: 'Right Wheel' }),
          comp('sp1', 'speedometer', 610, 150, { label: 'Speedometer' }),
          comp('bp1', 'brakePedal', 20, 270, { label: 'Brake Pedal' }),
          comp('mc1', 'masterCylinder', 140, 290, { label: 'Master Cylinder' }),
          comp('bl1', 'brakeLine', 280, 260, { label: 'Brake Line' }),
          comp('cal1', 'brakeCaliper', 410, 250, { label: 'Caliper' }),
          comp('bl2', 'brakeLine', 280, 340, { label: 'Brake Line' }),
          comp('cal2', 'brakeCaliper', 410, 330, { label: 'Caliper' }),
        ],
        wires: [
          wire('w1e', 'e1', 'out', 'cl1', 'in'),
          wire('w2e', 'cl1', 'out', 'mt1', 'in'),
          wire('w3e', 'mt1', 'out', 'ds1', 'in'),
          wire('w4e', 'ds1', 'out', 'd1', 'in'),
          wire('w5e', 'd1', 'outL', 'w1', 'drive'),
          wire('w6e', 'd1', 'outR', 'w2', 'drive'),
          wire('w7e', 'w1', 'drive', 'sp1', 'in'),
          wire('w8e', 'bp1', 'out', 'mc1', 'in'),
          wire('w9e', 'mc1', 'out', 'bl1', 'in'),
          wire('w10e', 'mc1', 'out', 'bl2', 'in'),
          wire('w11e', 'bl1', 'out', 'cal1', 'in'),
          wire('w12e', 'cal1', 'out', 'w1', 'brake'),
          wire('w13e', 'bl2', 'out', 'cal2', 'in'),
          wire('w14e', 'cal2', 'out', 'w2', 'brake'),
        ],
        nextId: 1000,
      };
    },
    blurb: 'Start the engine and shift into gear — the clutch is engaged by default, so the wheels spin right away and the speedometer reads real km/h. Hold the clutch pedal to disengage and shift safely, drag the throttle to speed up, or press the brake pedal to stop even mid-gear.'
  },

  accessories: {
    name: 'Engine Accessories & Exhaust',
    build() {
      return {
        components: [
          comp('e1', 'engine', 20, 40, { label: 'Engine', throttle: 25 }),
          comp('wp1', 'waterPump', 200, 10, { label: 'Water Pump' }),
          comp('rad1', 'radiator', 320, 5, { label: 'Radiator' }),
          comp('fp1', 'fuelPump', 200, 100, { label: 'Fuel Pump' }),
          comp('fi1', 'fuelInjector', 320, 105, { label: 'Injector' }),
          comp('af1', 'airFilter', 200, 190, { label: 'Air Filter' }),
          comp('im1', 'intakeManifold', 320, 195, { label: 'Intake' }),
          comp('ep1', 'exhaustPipe', 200, 270, { label: 'Exhaust Pipe' }),
          comp('cc1', 'catConverter', 340, 260, { label: 'Cat. Converter' }),
          comp('tach1', 'tachometer', 200, 340, { label: 'Tachometer' }),
        ],
        wires: [
          wire('w1', 'e1', 'out', 'wp1', 'in'),
          wire('w2', 'wp1', 'in', 'rad1', 'in'),
          wire('w3', 'e1', 'out', 'fp1', 'in'),
          wire('w4', 'e1', 'out', 'fi1', 'in'),
          wire('w5', 'e1', 'out', 'af1', 'in'),
          wire('w6', 'af1', 'out', 'im1', 'in'),
          wire('w7', 'e1', 'out', 'ep1', 'in'),
          wire('w8', 'ep1', 'out', 'cc1', 'in'),
          wire('w9', 'e1', 'out', 'tach1', 'in'),
        ],
        nextId: 1000,
      };
    },
    blurb: 'Start the engine — the water pump, fuel system, intake, exhaust, and tachometer all come alive together.'
  },

  turbo: {
    name: 'Turbo Boost & Redline',
    build() {
      return {
        components: [
          comp('e1', 'engine', 20, 40, {
            label: 'Turbo Engine', throttle: 55, cylinders: 6, displacement: 3000, redlineRPM: 7500,
          }),
          comp('tb1', 'turbo', 190, 55, { label: 'Turbo' }),
          comp('fw1', 'flywheel', 300, 50, { label: 'Flywheel' }),
          comp('cl1', 'clutch', 400, 65, { label: 'Clutch' }),
          comp('mt1', 'manualTransmission', 520, 60, { label: 'Gearbox', position: '3', gearType: 'Close-Ratio' }),
          comp('ds1', 'driveshaft', 690, 70, { label: 'Driveshaft' }),
          comp('d1', 'differential', 830, 45, { label: 'Differential' }),
          comp('w1', 'wheel', 960, 10, { label: 'Left Wheel' }),
          comp('w2', 'wheel', 960, 135, { label: 'Right Wheel' }),
          comp('tach1', 'tachometer', 190, 170, { label: 'Tachometer' }),
          comp('sp1', 'speedometer', 320, 170, { label: 'Speedometer' }),
        ],
        wires: [
          wire('w1', 'e1', 'out', 'tb1', 'in'),
          wire('w2', 'tb1', 'out', 'fw1', 'in'),
          wire('w3', 'fw1', 'out', 'cl1', 'in'),
          wire('w4', 'cl1', 'out', 'mt1', 'in'),
          wire('w5', 'mt1', 'out', 'ds1', 'in'),
          wire('w6', 'ds1', 'out', 'd1', 'in'),
          wire('w7', 'd1', 'outL', 'w1', 'drive'),
          wire('w8', 'd1', 'outR', 'w2', 'drive'),
          wire('w9', 'e1', 'out', 'tach1', 'in'),
          wire('w10', 'w1', 'drive', 'sp1', 'in'),
        ],
        nextId: 1000,
      };
    },
    blurb: 'A 6-cylinder turbo engine already spooled up and in 3rd gear. Push the throttle slider past 70% and watch the turbo spin, the tach glow red near redline, and the wheels blur faster — or try Close-Ratio vs Off-Road gearing on the box.'
  },

};
