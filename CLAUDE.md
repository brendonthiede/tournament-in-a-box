# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Browser-only React 16 app (Create React App via `react-scripts` 3, wrapped with `@rescripts`) that generates FIRST LEGO League tournament schedules and a zip of printable PDFs, CSVs, and a closing-ceremony PPTX. No backend. Served from GitHub Pages; an Electron/wine build exists but is untested.

## Commands

Requires Node 16 and yarn classic (v1). `yarn install` first.

```sh
yarn start                                   # dev server on :3000
yarn build                                   # production build to build/
CI=true yarn test                            # run all tests once (jsdom)
CI=true yarn test src/App.test.js            # single test file
yarn deploy                                  # build + push build/ to gh-pages (master only, needs repo write access)
yarn electron-pack                           # electron-builder, Windows + Linux targets
```

The only test is a smoke render of `App`. `.rescriptsrc.js` + `.webpack.config.js` set webpack `target: 'electron-renderer'` for every build, including the web one.

## Known breakage on master

- `src/index.js` imports `./registerServiceWorker`, which was deleted in commit 49c8035. The app will not compile until that import and call are removed. `public/service-worker.js` is now a one-shot self-unregistering worker and must stay as-is so old installs stop caching.
- `App.js` has its own `VERSION` constant that must be bumped alongside `package.json` `version`; it is stamped into saved `.schedule` files.

## Architecture

**State lives in one object.** `EventParams` (`src/api/EventParams.js`) is the whole event: teams, sessions, breaks, awards, sponsors, PDF page format. `App.js` holds a single instance in React state and passes it down; children mutate it in place and call back so `App` re-renders. There is no store or reducer.

**Three screens, one `display` string in `App` state:** `Initialise` → `Customise` → `Review`. `populateFLL()` on `EventParams` creates the default FLL session set (opening/closing/lunch breaks, 3 match rounds, N practice rounds, judging) from team count and start/end times.

**Scheduling** (`src/scheduling/Scheduler.js`) is a randomized retry loop, not a solver. `App.generate()` runs up to 500 iterations of:

1. `buildAllTables()` lays out time slots (`Instance`s) per session, pushing past breaks via `EventParams.timeInc`.
2. `fillAllTables()` shuffles teams in, then `swapFill` fixes gaps by first-order swaps.
3. `evaluate()` counts empty slots into `event.errors`; loop exits when zero.

`EventParams.canDo(team, instance)` is the single feasibility check (travel time `minTravel`, extra-time teams, judging exclusion, team-specific windows). Breaks apply to specific sessions through `SessionParams.applies(id)`; `universal` breaks apply to all.

**Session types** are singletons in `src/api/SessionTypes.js` (`TYPES.JUDGING`, `MATCH_ROUND`, `BREAK`, ...). `priority` controls build order; match rounds are laid out after everything else and chained end to end.

**Save/load** is `JSON.stringify(state, freeze)` / `JSON.parse(str, thaw)` from `src/scheduling/utilities.js`. Every persisted class needs a `static freeze/thaw` pair registered in both switch tables there, or it silently loads as a plain object. `SessionType.thaw` resolves by name back to the `TYPES` singleton.

**Outputs** (`src/outputs/`): each `Make*Pdf(event)` builds a `PdfDoc` (pdfmake wrapper in `src/templates/PdfDoc.js`) and returns `{filename, getBlobPromise}`. `Zipper` bundles everything with JSZip; `SingleOutput` downloads one. Both hold a parallel `funcs` array and `SingleOutput.funcNames` must stay in the same order, since `OutputGenView` indexes into them by position. The numeric last arg to `zipPDF` is a suggested print count, appended to the filename.

**Images** are precomputed base64 in `src/resources/images.json` (national sponsor logos) so pdfmake/pptxgenjs can embed them without async loading. Add logos there, not as imports.

**Times** are `DateTime` objects holding minutes since start of Day 1 plus a shared `days` label array; multi-day events are just `mins > 1440`.
