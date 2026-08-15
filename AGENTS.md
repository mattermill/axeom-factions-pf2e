# AGENTS.md — Axeom Factions PF2e

Guidance for agents working on this repo. This is a **Foundry VTT module**
(`axeom-factions-pf2e`) adding faction reputation tracking for the
Pathfinder 2e system.

## Scope

- All work happens inside this module's directory
  (`/Data/modules/axeom-factions-pf2e`). Nothing outside it should be edited.
- The PF2e system this module targets lives at `/Data/systems/pf2e`. It's
  fine — often necessary — to read it for reference (sheet markup, CSS
  variables, hooks it fires, actor/item data shapes), but never edit files
  there. It's a separate package with its own release cycle.
- Foundry's API docs: https://foundryvtt.com/api/index.html. Check them
  (and the pf2e system source) before writing custom logic — see
  "Foundry-first" below.

## Foundry-first

Prefer Foundry's built-in APIs, hooks, and UI patterns over inventing
parallel mechanisms. Concretely, in rough order of preference:

- Data persistence → **actor/item flags** (`getFlag`/`setFlag`/`unsetFlag`
  under the `axeom-factions-pf2e` namespace), not module-local state or
  external storage. Flags sync to all clients and survive reloads for free.
- UI surfaces → **`ApplicationV2` + `HandlebarsApplicationMixin`**
  (see `scripts/main.js`), with `static PARTS`, `static DEFAULT_OPTIONS.actions`
  for click handlers (`data-action="..."`), and `foundry.applications.handlebars.loadTemplates`
  for partials — not hand-rolled rendering or manual `addEventListener` wiring
  where an `actions` entry would do.
- Integration points → **`Hooks.on`/`Hooks.once`** (`init`, `renderSidebar`,
  `updateActor`, etc.), not polling or monkey-patching core classes.
- User feedback → **`ui.notifications`** and **`Dialog`**, not custom toasts
  or `window.confirm`/`alert`.
- Always gate mutations on **`actor.isOwner`** (or the relevant permission
  check) before writing flags — other connected clients render the same code
  path without owner permission.

Only build something custom when Foundry genuinely has no equivalent.

## Runtime model — no build step

This module ships plain files straight to the browser: `module.json` lists
`scripts/main.js` under `"scripts"` (classic script, not `"esmodules"`) and
`styles/theme.css` under `"styles"`. There is no bundler, no transpiler, no
`package.json`. That's intentional — it keeps the runtime footprint minimal
and startup fast. Consequences:

- No top-level `import`/`export` in `scripts/main.js` — rely on the globals
  Foundry exposes (`game`, `foundry.*`, `Hooks`, `ui`, `Dialog`, ...).
- Don't introduce a build step (webpack/vite/esbuild, TypeScript compile,
  Sass, etc.) without checking first — it cuts against the speed/low-footprint
  priority below.
- Handlebars partials are registered explicitly via `loadTemplates` in the
  `init` hook; new partials need to be added there.

## Performance & UX priorities

- **Speed and low runtime footprint come first.** Avoid unnecessary
  re-renders, heavy dependencies, or work done outside the code path that
  needs it (see the comments in `FactionTrackerApp` about deriving state
  fresh from flags rather than keeping a shadow copy).
- **The experience should feel slick** — but delight is budgeted, not
  free, so it's targeted at the interactions that can afford it:
  - **If an action fires more than ~50 times in a typical 3–4 hour session,
    don't animate it.** At that frequency, animation reads as latency, not
    delight.
  - Interactions that occur more sparsely should animate when it makes
    sense to.
  - Standard motion curve for anything that does animate:
    `cubic-bezier(0.75, 0, 0.25, 1)`, `300ms`.
  - Exception to the frequency rule: buttons/pressable controls always get
    an immediate `transform: scale(0.97)` active/press state, regardless of
    how often they're used — it's cheap tactile feedback, not "an animation"
    in the delight sense.

## CSS architecture

- Everything this module styles is wrapped in an **`.axeom`** class at the
  root of every template (see `templates/FactionPanel.hbs`). Utility classes
  only take effect under `.axeom` — this is what keeps the module's styles
  from leaking into (or being affected by) core Foundry UI or other modules.
- This module is the first of a planned suite, so CSS needs to stay modular
  and reusable across modules, not bespoke per-module. The approach is a
  small first-party "mini-tailwind" utility system, split by concern:
  - `layout.css` — flex/grid/positioning utilities
  - `utilities.css` — spacing, sizing, display, misc single-purpose utilities
  - `type.css` — typography utilities
  - `color.css` — color/background utilities, palette variables
  - `module.css` — styles specific to _this_ module's components (faction
    banners, event log, etc.) — not shared, not utility-shaped
- Add utility classes as they're needed rather than pre-building a full
  system; keep them small and composable like Tailwind's.
- **Current state note:** the styles directory hasn't been split this way
  yet — `styles/theme.css` (the file `module.json` loads) currently
  `@import`s a single `styles/axeom.css` containing all utilities. Treat the
  five-file split above as the target layout for new work; migrate existing
  rules into it as they're touched rather than leaving new utilities bolted
  onto `axeom.css`.

## Foundry module conventions to keep following

- `module.json`: pin `compatibility.minimum`/`verified` to real tested core
  versions (no legacy `minimumCoreVersion`); declare the `pf2e` system
  relationship with its own `compatibility.minimum` (already done).
- Use the module ID constant (`MODULE_ID` in `scripts/main.js`) for every
  flag namespace and template path — never hardcode the string twice.
- Template paths are always `modules/axeom-factions-pf2e/templates/...`,
  matching how Foundry serves module files over HTTP.
- Keep `languages/en.json` in sync with any user-facing strings (it's
  currently stale from the module's original template scaffold and needs
  real Axeom keys as strings are localized).
