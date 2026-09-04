# Contributing to AutoCircuit Builder

Thanks for considering it! This is a small hobby project, so the bar to
contribute is deliberately low — no build step, no framework, no CI to
wrestle with.

## Running it locally

The app itself is plain HTML/CSS/JavaScript — no install, no build step.
Browsers block ES modules from loading over `file://`, so serve the folder
over plain HTTP instead:

```bash
python -m http.server 8420
```

Then open **http://localhost:8420**.

The **🌍 Community** tab needs the backend in [`server/`](server/) to
actually publish/like/comment (it's the one part of the app that isn't
purely static). To run it locally:

```bash
cd server
npm install
# set DATABASE_URL to a Postgres instance (Neon's free tier works well —
# see server/README.md and schema.sql for the schema)
npm start
```

You don't need the backend running to work on the Electrical or Mechanical
workbenches — only the Community tab talks to it.

## Project layout

```
index.html         entry point, both workbenches
style.css           all styling — CSS variables drive the per-tab color themes
js/
  main.js           app bootstrap, tab switching
  state.js           shared state/store
  parts.js            electrical part definitions
  simulate.js          electrical reachability-graph solver
  mechParts.js        mechanical part definitions
  mechSimulate.js       mechanical reachability-graph solver
  mechEfficiency.js       the "Power & Efficiency" panel
  canvas.js           drag/wire/render logic (shared by both workbenches)
  examples.js / mechExamples.js   built-in example circuits
  community.js         Community tab (talks to server/)
  achievements.js       local 11-badge achievement system
  history.js            undo/redo
  sound.js               sound effects
  exportImage.js          canvas → PNG export
server/              Community tab's backend (Express + Postgres)
```

## What's useful to work on

- **New parts** — electrical or mechanical. Adding one is mostly: a part
  definition object (icon, terminals, props, a `statusHint`) in `parts.js` /
  `mechParts.js`, plus wiring it into the relevant solver in `simulate.js` /
  `mechSimulate.js` if it does anything beyond just passing power through.
- **New example circuits** — a good example is often more useful to a
  newcomer than a feature. See `examples.js` / `mechExamples.js`.
- **Bug reports** — if something behaves in a way a real circuit/drivetrain
  wouldn't, that's a real bug here, not just a nitpick. Open an issue with
  the exact parts/wiring that reproduce it.
- Check the [issue tracker](../../issues) for anything labeled
  **good first issue**.

## Before opening a PR

- Keep it framework-free and dependency-free (the whole point of this
  project is that it's just HTML/CSS/JS you can read top to bottom).
- Match the existing comment style — this codebase explains *why*, not just
  *what*, especially in the solver files.
- If you touch `simulate.js` or `mechSimulate.js`, a quick scratch script
  that imports the function directly and asserts the expected before/after
  behavior is the fastest way to prove a fix — no build step needed, e.g.:

  ```bash
  node -e "import('./js/mechSimulate.js').then(({computeDrivelineSummary}) => {
    console.log(computeDrivelineSummary({ components: [...], wires: [...] }));
  })"
  ```

- Small, focused PRs are much easier to review than large ones.

## Questions

Open an issue — there's no separate mailing list or chat for this project.
