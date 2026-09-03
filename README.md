# AutoCircuit Builder

**🚀 Live: [autocircuit-builder.onrender.com](https://autocircuit-builder.onrender.com)**

A tiny, browser-based tool with **two workbenches** for building and
simulating how a car actually works:

- **⚡ Electrical** — battery to headlight, ignition systems, relays, diodes.
- **⚙️ Mechanical** — engine, clutch, transmission, differential, wheels,
  and a separate braking system, plus cooling and fuel/air accessories.

Think "Tinkercad Circuits," but for a whole car, and deliberately kept
small: no install, no account, no CAD-style complexity. Drag parts onto a
canvas, wire them together, and watch it react live — no "Run" button.

The look is intentionally playful rather than another gray enterprise-SaaS
UI — bold gradient tabs, chunky pill buttons, bouncy hover motion, a rounded
display font (Fredoka + Nunito), the parts palette/canvas/inspector floating
as separate rounded, shadowed cards over the page background instead of
edge-to-edge flat panes — while staying out of the way of actually reading a
circuit. Each workbench has its own color mood, too: Electrical
runs warm violet/pink/amber, Mechanical shifts the whole chrome — buttons,
focus rings, the active tab, even the canvas background — to a cool
blue/teal "machine shop" palette, just by re-pointing a couple of shared CSS
variables per tab. First-time visitors get a friendly welcome screen instead
of being dropped cold onto a blank grid, an empty canvas offers a big
"✨ Load an example" button instead of staying silently blank, and the
instant any part first powers on — a bulb lighting, a wheel starting to
spin, a relay clicking over — it gets a small confetti-colored spark burst,
once, right when it happens (never while you're just dragging something
that was already on). Every category — Power, Lights, Performance, Gauges,
and so on — carries a real, saturated hue rather than a faint pastel tint,
so the canvas itself looks colorful before anything's even powered on; and
several lights let you pick their exact color yourself, so no two builds
have to look alike.

The app itself is plain HTML/CSS/JavaScript — no build step, no framework,
no dependencies. The one exception is the **🌍 Community** tab (see below),
which needs a small deployed backend, because "other people can see it" is
the one thing a purely static, no-backend app can never do on its own.

## Running it

Browsers block ES modules from loading over `file://`, so serve the folder
over plain HTTP. Easiest way, from this folder:

```bash
python -m http.server 8420
```

Then open **http://localhost:8420** in a browser.

(If you're using this inside Claude Code, the Browser pane already knows how
to launch this via `.claude/launch.json` — just ask to preview it.)

## 🌍 Community

Publish a build — title, your name, an optional description — and it shows
up for *everyone*, with a live-rendered preview of the actual circuit (the
same part artwork the canvas uses, statically laid out — no screenshots, no
image hosting). Anyone can:

- **❤️ Like** it (one like per browser, toggle to unlike).
- **💬 Comment** on it.
- **🚗 Load it into their own canvas** to remix — this is the one place in
  the app where someone else's work becomes the starting point for yours.

There's no login — publishing or commenting just asks for a display name,
and hands back a one-time delete link this browser remembers, so you (and
only you) can take down your own posts later. Filter the feed by workbench
or sort by newest/most-liked from the toolbar.

This tab talks to a small separately-deployed backend (Express + Postgres —
see [`server/README.md`](server/README.md)) rather than `localStorage`,
since likes and comments have to be visible to people who never opened your
browser. If that backend isn't configured or is unreachable, the tab says
so plainly instead of silently failing — everything else in the app keeps
working exactly as before regardless.

## Electrical panel

28 parts across 7 color-coded categories — Power, Control, Lights, Motors,
Accessories, Sensors, Passive. Wires carry current from the battery through
switches/fuses/relays to loads; ground is implicit (every "Ground" part and
the battery's `−` are one shared net, like a real chassis). Fuses (and now
**Circuit Breakers**, same overload math, heavier-duty default ratings) blow
on overload, relays and diodes behave correctly, and interaction styles vary
by part — latching switches, a press-and-hold push button, a 4-position
ignition switch. A **Voltmeter** reads a live 12.6V once it has a complete
circuit. Five built-in examples, including a full ignition + starter system.

**Pick your own colors.** Headlight, Taillight, Turn Signal, Fog Light,
Warning Light, and the new **LED Accent Light** all have a color picker in
the inspector — the glow, fill, and even the derived darker outline
(computed from whatever you pick) all follow. Build the same headlight
circuit five times with five different colors; nothing about the simulation
changes, just the look.

## Mechanical panel

31 parts across 7 categories — Engine, **Performance**, Drivetrain, Brakes,
Cooling, Air & Fuel, Gauges. There's no "ground" here; instead there are
**two independent networks**: the *drive network* (reachable from a running Engine, through a
gear other than Neutral/Park) spins wheels and accessories, and the *brake
network* (reachable from a pressed Brake Pedal or engaged Parking Brake)
applies braking — which visually overrides wheel spin even mid-drive, just
like in a real car. Three built-in examples: a full drivetrain-plus-brakes
build, an engine-accessories/exhaust build, and a turbo/redline showcase.

**Top speed is now actually limited by engine power** — this used to be
missing entirely: speed was pure RPM × gearing × wheel size, so a tiny
3-cylinder 1000cc engine geared tall enough could hit 290+ km/h, and a
Turbocharger was purely decorative. Now every configuration's horsepower
(from cylinders × displacement) sets a real power-limited top speed
(`topSpeedFromPower` — roughly power^(1/3), since aerodynamic drag scales
with the cube of speed), and a spooled-up turbo genuinely adds +30% power,
raising it. Whichever wheel-size or gear-ratio trick you try, the car can't
exceed what its engine could actually do — verified with a Node test
harness across a dozen configurations, not just eyeballed in the browser.
Both the Speedometer and the Wheel itself show a small ⚡ and a "power
-limited" hint when they're capped, so it's clear *why* you've hit a wall.

**📊 Power & Efficiency graph** (toolbar button, Mechanical tab) — a live
panel showing exactly where that power goes: a waterfall chart of Engine →
Clutch → Transmission → Differential → (Turbo boost, if spooled up), each
with its own configurable efficiency rating (Clutch and Manual Transmission
are direct number fields; an Automatic's efficiency comes from its Type —
Traditional/CVT/Dual-Clutch — since a torque converter genuinely loses more
power than a dual-clutch box), plus a speed-vs-RPM curve for whichever gear
is currently engaged, with the power-limit ceiling drawn in and a dot
marking exactly where you are on it right now. It reuses the exact same
math the live gauges use (`computeDrivelineSummary` in
[`js/mechSimulate.js`](js/mechSimulate.js)), so the graph and the
Speedometer can never disagree, and it stays live while open — drag the
throttle or shift gears and watch it move.

**⛽ Estimated fuel economy**, in the same panel, right below the speed
curve — km/L and L/100km, built from the engine's displacement and that
*exact* drivetrain efficiency percentage the waterfall above already shows
(a leakier clutch/gearbox genuinely costs you mileage here too, not just
power). Three dropdowns — **drive type** (Highway/City), **traffic**
(Light/Moderate/Heavy), and **road quality** (Smooth/Average/Rough) — each
apply their own multiplier, stacked the same multiplicative way the
performance mods do, and are remembered across visits. Same displacement
and efficiency, worst case (city, heavy traffic, rough road) against best
case (highway, light traffic, smooth road) can be a 3x swing in mileage —
the point isn't to be a real fuel-consumption model, just to make "how and
where you drive" visibly matter as much as the car itself does.

**The Clutch Pedal works like a real one.** It's spring-engaged at rest —
power flows by default — and *pressing and holding* it is what disengages
the drivetrain so you can shift, exactly like a real clutch (this used to be
backwards: a plain toggle that defaulted to disengaged). Release it and
drive resumes.

**Gauges show real numbers, not just a needle.** The Engine has a Throttle
slider — drag it and the Tachometer reads actual RPM live, glowing red and
flashing past 6500 RPM. A Speedometer reads whatever RPM reaches it and
converts it to km/h using its own configurable wheel size, so wiring it to a
wheel (post-differential) gives a genuine road speed. Every spinning or
pulsing part — flywheel, driveshaft, differential, wheels, pumps, injectors
— now animates at a speed that actually matches its RPM, instead of every
part looping at the same fixed rate regardless of how fast the engine is
turning. A Turbocharger spools up and starts "boosting" past ~3500 RPM, and
the Engine itself flags when it's nearing redline.

**Key parts are configurable**, and it actually changes the numbers:
- **Engine**: cylinders and displacement (cc) drive an estimated-horsepower
  readout; idle RPM, redline, and throttle drive the actual RPM.
- **Manual Transmission**: number of gears (3–8) regenerates its gear
  selector on the fly; gear type (Standard / Close-Ratio / Off-Road) changes
  the ratio spread between 1st and top gear.
- **Automatic Transmission**: type (Traditional / CVT / Dual-Clutch) is a
  label, but its Drive ratio is a real number you can tune directly.
- **Differential**: final drive ratio (2.5–5.5) — same formula real cars
  quote it in.
- **Brake Caliper**: braking force rating (Nm).
- **Speedometer**: wheel diameter, used for its RPM→speed conversion.

All of these feed the same RPM-propagation math that drives the gauges, so
changing a gear ratio or wheel size visibly changes the speedometer reading
— not just cosmetic.

**⛽🌡️ A new Performance category, for going too fast on purpose.** Wire in a
**Nitrous Boost** and hold it (from the canvas or the inspector's "Hold to
Test" button) for an instant, huge +60% power spike with no RPM
requirement — release it and it's gone. A **Supercharger** is the opposite
personality: flip it on and it adds a steady +20% the moment the engine's
running, no spool-up threshold like the Turbo needs. All three boosts stack
multiplicatively if you're reckless enough to fit them all (verified: a
turbo'd, nitrous'd 6-cylinder went from 216 hp to 402 hp with both active at
once, top speed 265 → 310 km/h). Two new gauges round out the dash: a
**Fuel Gauge** and **Coolant Temp Gauge**, both with a slider you can drag
directly to watch the needle move and the warning zone light up red.

## Shared toolkit (both panels)

- **Search + collapsible categories** in the parts palette once it gets long.
- **🕓 Recently Used strip** — a rainbow-gradient shelf above the categories
  that remembers the last 8 unique part types you placed (click-to-add or
  drag), most-recent-first. It's session-only by design — a fresh visit
  starts clean, same as the palette always did — but during a build it means
  never re-opening/scrolling a category for a part you already reached for once.
- **Duplicate** any selected part — `⧉ Duplicate` in the inspector or
  `Ctrl+D` — clones it a little offset from the original (props and all,
  minus its wires, so you decide how the copy connects) and selects the copy
  so you can keep going. Fully undo-able like everything else.
- **📸 Export** — toolbar button that saves the current canvas as a real
  PNG image at full resolution, matching whichever theme is active (every
  color is read live off the canvas, not hardcoded), so it's easy to share a
  build outside the app or drop it in a writeup.
- **Rotate** parts (button, or press `R`) and **zoom** in/out for bigger,
  more complex builds. Nudge a selected part into exact position with the
  **arrow keys** (hold `Shift` for a bigger step) instead of only free-hand
  dragging.
- **Undo/redo** (Ctrl+Z / Ctrl+Y) — each tab keeps its own independent
  history, so switching tabs never mixes them up.
- **Save/Load** a build as `.json`; each panel also autosaves to the
  browser's local storage independently.
- Terminals glow while you're dragging a wire, to show where you can drop it.
- **A "Keyboard shortcuts" reference** lives in the ❓ Help modal alongside
  the how-to-build walkthrough.

**The canvas pans and zooms like Tinkercad/Figma**, not just the old
+/− buttons: click-and-drag on any empty patch of grid grabs and pans the
whole view (cursor turns to a hand), and the mouse wheel/trackpad zooms in
and out anchored right under the cursor, from 25% up to 350%. The dotted
background grid scales right along with the zoom instead of staying a fixed
size. **Reset** now restores both zoom *and* pan together, so it can't leave
you staring at an empty patch of canvas after you've panned off into empty
space. Every part also got a full, invisible click target spanning its
whole footprint — previously you had to land the cursor on an actual drawn
line or letter, which made small or sparse-looking parts frustrating to
click precisely.

**Selecting a running part no longer accidentally shuts it off.** Clicking
any toggleable/cyclable part — a switch, the ignition, an Engine — used to
select *and* flip its state in the same click, which meant you couldn't
click something that was already on just to look at it without turning it
off. Now the first click only selects it (opens the inspector); a second
click, once it's already selected, is what toggles or cycles it. Dragging a
part to move it, and momentary press-and-hold parts (push buttons, the
clutch pedal), are unaffected — this only changes plain click-to-toggle.

## Themes

The 🎨 **Theme** button in the top bar (persists across reloads, applied
before first paint so there's no flash-of-wrong-theme) switches between five
full palettes, not just a light/dark toggle:

- **☀️ Light** and **🌙 Dark** — the conventional pair.
- **🌆 Cyberpunk** — near-black with cyan/magenta/acid-yellow accents, and
  the app's most overtly "themed" mode: a subtle static CRT scanline
  overlay, chromatic-aberration (RGB-split) text on headings and the brand
  mark, a slow ~4s ambient neon glow "breathing" on the loudest buttons and
  the active tab, and a one-shot glitch-skew wiggle on hover — a quick
  single pass, not a loop. Deliberately nothing here flashes or strobes:
  every effect is either static or moves on a multi-second cycle, and
  `prefers-reduced-motion` turns all of it off regardless.
- **📐 Blueprint** — deep engineering-blue background with white "ink" lines
  and a dotted grid, styled after an actual blueprint sheet.
- **🍬 Candy** — soft pink/white with a hot-pink accent.

Every color in [`style.css`](style.css) — including what used to be
hardcoded hex values scattered through buttons, inputs, the efficiency
graph's SVG, category icons, and more — now reads from a shared set of CSS
custom properties (`--bg`, `--text`, `--accent`, `--card-bg`, ...), so a
theme is just one `:root[data-theme="x"]` block redefining those tokens;
nothing downstream has to know a theme system exists. This is layered
underneath each panel's own `data-mood` (Electrical's warm violet vs.
Mechanical's cool blue "machine shop" mood from before) rather than
replacing it, so all 5 themes × 2 moods combine correctly — including
edge cases like Blueprint's near-white accent needing its own
`--text-on-accent` override so button text stays legible, which itself gets
reset back to white under Mechanical's blue mood (whose accent is never
white) rather than inheriting Blueprint's override.

## 🔊 Sound & 🏆 Achievements

The app has an audible personality now — every synthesized (not a single
audio file, just Web Audio API oscillators, matching the "no dependencies"
rule) tone for placing a part, flipping a switch, deleting something,
powering on for the first time, publishing, and unlocking an achievement.
The 🔊 button in the topbar mutes it all, remembered across visits.

**🏆 Achievements** is a small, purely local badge system — 11 of them,
spanning both workbenches and the Community tab: your first part, your
first power-on, starting an Engine, hitting 250+ km/h, duplicating,
exporting, trying all 5 themes, publishing, liking someone else's build,
commenting, and remixing a community build into your own canvas. Nothing
here is shared with anyone (unlike the Community tab's genuinely public
data) — it's just a fun trail of breadcrumbs nudging you toward the corners
of the app you haven't poked at yet. The 🏆 N/11 button in the topbar opens
the full list; unlocking one pops a gold, distinct-from-the-usual-status
toast and a little fanfare instead of a plain message.

## Usability

- The parts palette collapses to a single row below 900px width instead of
  keeping its 258px desktop column; on very small screens (phones) it now
  gets a taller, auto-filling grid instead of the cramped fixed-height strip
  it used to be, so fewer categories require scrolling to see.
- Every icon-only button (theme picker, zoom in/out, modal close buttons)
  carries an `aria-label` or visible text plus a `title` tooltip.
- Keyboard focus is visible (`:focus-visible`) on every interactive control —
  buttons, palette items, category headers, inputs — without showing on
  mouse/touch clicks, and `prefers-reduced-motion` disables the decorative
  motion (wiggle, bounce, spark bursts) for anyone who's asked for it.

## How the simulation works (for the curious)

Neither panel runs real physics — that would be the "AutoCAD/Simulink-grade"
complexity this tool exists to avoid. Both instead model their domain as a
graph and do reachability from a source, which is simple to reason about yet
produces convincing behavior:

- [`js/simulate.js`](js/simulate.js) (electrical): wires, closed
  switches/push buttons/sensors, unblown fuses, energized relay contacts, an
  ignition switch's position, and diodes (as one-way edges) are graph edges.
  Reachability from the battery's `+` (and any running alternator) gives the
  powered net; from the shared ground gives the ground net. Fuse overload is
  checked by temporarily removing each fuse and seeing which loads lose
  power without it. A few fixed-point iterations handle relay chains.
- [`js/mechSimulate.js`](js/mechSimulate.js) (mechanical): the same
  reachability idea, but simpler — no ground to close a loop against, no
  fuses, and no feedback loops, so it's a single pass. Two independent BFS
  traversals (from Engine/brake sources) give the drive net and brake net. A
  third, *weighted* traversal from each running engine multiplies an RPM
  value by every gear/final-drive ratio it passes through, which is what the
  gauges actually read.

Both panels share one interaction/rendering engine
([`js/state.js`](js/state.js), [`js/canvas.js`](js/canvas.js),
[`js/history.js`](js/history.js), [`js/ui.js`](js/ui.js)) via factory
functions — each is instantiated twice in [`js/main.js`](js/main.js), once
per panel, so drag/wire/select/rotate/zoom/undo only had to be written once.

## Project layout

```
index.html          page shell — tabs, both panels' toolbars/palettes/canvases, help modal
style.css            styling — category color system, animations, layout
js/state.js           factory: a panel's data model (components, wires, selection) + persistence
js/canvas.js          factory: SVG rendering + drag/wire/select/rotate/zoom interaction
js/history.js         factory: snapshot-based undo/redo
js/ui.js              factory: palette, inspector, toolbar, examples menu
js/parts.js            electrical parts library
js/simulate.js         electrical solver
js/examples.js         electrical example circuits
js/mechParts.js         mechanical parts library
js/mechSimulate.js      mechanical solver
js/mechExamples.js      mechanical example builds
js/mechEfficiency.js    the live Power & Efficiency graph panel
js/exportImage.js       canvas → downloadable PNG snapshot
js/community.js         the Community tab: publish/browse/like/comment/remix
js/communityConfig.js   one line pointing the Community tab at its backend
js/sound.js             tiny synthesized (Web Audio API) sound effects
js/achievements.js      the local 11-badge achievement system
js/main.js             bootstraps both panels + shared tabs/help/toast
server/                 the Community tab's backend (Express + Postgres) — see server/README.md
```

No build tooling, by design — open the files and you can see the whole
app. The one thing that isn't purely static files is `server/`, the small
deployed backend the Community tab talks to (see the section above);
everything else here still needs nothing but a plain file server.

### Adding a new part

Every part is one entry in a `PART_DEFS` object (`js/parts.js` for
electrical, `js/mechParts.js` for mechanical): a size, a list of terminals,
default properties, and a `render()` function returning its SVG. Give it a
`category` from the matching `CATEGORY_COLORS` object and it's automatically
colored and searchable. Add its type to the domain's `LOAD_TYPES` set if it
should light up/spin/pulse when powered, or to `GATED_PASS_TYPES` if it's a
simple switch-like part — no changes to the simulator are needed for either.
A part can also declare `toggleable`, `momentary`, or `cycle: [...]` (or a
`cycle(props)` function, for a cycle whose options depend on another field —
see the manual transmission's gear count) to pick up click-to-toggle,
press-and-hold, or click-to-cycle interaction for free.

**Configurable properties** (cylinders, gear count, braking force, a light's
color, ...) are declared in a part's `fields` array — each entry is `{ key,
label, type: 'number'|'select'|'range'|'color', ... }` and the inspector
panel renders and wires it up automatically (`js/ui.js`'s `renderField`);
nothing else needs to change. `statusHint(props, compState)` lets a part
show a live one-line readout under its controls (e.g. the engine's estimated
horsepower and current RPM); a compState's `warning` string surfaces as a
warning banner the same way a blown fuse does.
