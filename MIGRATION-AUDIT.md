# Migration Audit — Boilerplate vs Scanner/Configurator

Date: 2026-05-23
Author: Phase 1 audit, see PLAN in conversation history.

## Summary

- ~13 generic items to backport (architecture patterns, e2e helpers, scripts, API scaffolding)
- ~6 templatize items (remove company names, generic example workflow)
- ~8 drop (project-specific only: carriers, bauhaus, empasa, abas, manufacturers, printers)
- ~6 review items (need deeper inspection before classification)

Sources:
- BOILERPLATE: `/home/patroza/pj/effect-app/boilerplate` (target)
- SCANNER: `/home/patroza/pj/macs/scanner` (primary source)
- CONFIGURATOR: `/home/patroza/pj/macs/configurator` (cross-ref)

---

## Surface: AGENTS.md

### Present in
- BOILERPLATE: 138 lines (basic patterns + per-package validation)
- SCANNER: 176 lines (adds flow-doc discipline, schema defaults, e2e-state-pattern ref, resource layout)
- CONFIGURATOR: 135 lines (no net-new content vs boilerplate)

### Deltas

| Section | Source | Verdict | Notes |
|---|---|---|---|
| Flow-doc mandatory reading | SC | TEMPLATIZE | Generic workflow discipline; strip Mako/Empasa/EasyLife refs |
| E2E state pattern reference | SC | GENERIC | "Walk once, seed variants" reusable |
| Resource and controller layout | SC | GENERIC | Order: List, List*, Get, Get*, commands alphabetically |
| Vue conventions (Array$ shadowing) | SC | GENERIC | Nuxt gotcha |
| Schema defaults: withConstructorDefault vs withDecodingDefault | SC | GENERIC | Critical Effect-TS warning |
| Mandatory validation (from repo root) | SC | GENERIC | Cross-package deps require root-level check |
| `pnpm check` auto-nuxt-prepare note | SC | GENERIC | Nuxt-specific gotcha |
| Command pattern + command-input-validation | SC | TEMPLATIZE | Replace scanner examples |

### Action
Upgrade AGENTS.md with schema-defaults, flow-doc discipline (templatized), root-level validation. Cross-link to ported `docs/architecture/*` docs.

---

## Surface: docs/architecture/

### Present in
- BOILERPLATE: 0 files (missing)
- SCANNER: 19 files
- CONFIGURATOR: 1 file (import-rules.md)

### Deltas

| File | Verdict | Notes |
|---|---|---|
| import-rules.md | GENERIC | Namespace/barrel/cross-workflow rules |
| resource-and-controller-layout.md | GENERIC | Declaration order |
| command-pattern.md | TEMPLATIZE | Replace scanner examples |
| command-input-validation.md | TEMPLATIZE | Replace scanner examples |
| query-shape-list-vs-get.md | GENERIC | Get vs List decision tree |
| database-query-guidelines.md | GENERIC | Projection, count/page pushdown |
| vue-conventions.md | GENERIC | Array$ shadowing, TaggedUnion |
| e2e-state-pattern.md | GENERIC | Walk once, seed via API |
| e2e.md | GENERIC | POM, command() helper, timeouts |
| list-layout.md | TEMPLATIZE | Per-item action slot patterns |
| streams-and-progress.md | GENERIC | OperationProgress shape |
| flow-documentation.md | TEMPLATIZE | Generic framework; remove company refs |
| index.md | REVIEW | Likely TOC of 19 docs |
| e2e-toast-wait-audit.md | REVIEW | Audit artifact or best-practice |
| configuration-and-tenancy.md | DROP | Three-companies-per-env model |
| workflow.md | DROP | Mako/Empasa/EasyLife routing |
| abas-payload-testing-plan.md | DROP | ABAS-specific |
| omega-form.md | DROP | OmegaForm internal tool |
| packstations-and-printers.md | DROP | Carrier/hardware-specific |

### Action
Backport 11 generic docs. Templatize 4. Drop 5. Inspect index.md and toast-wait audit.

---

## Surface: docs/flows/, docs/how-we-build.md, docs/documentation-strategy.md

### Present in
- BOILERPLATE: 0
- SCANNER: 20+ company-specific flow docs + framework docs
- CONFIGURATOR: 0

### Deltas

| File | Verdict | Notes |
|---|---|---|
| docs/flows/README.md | TEMPLATIZE | Index + glossary skeleton; strip company list |
| docs/flows/{easy-life,empasa,mako}/*.md | DROP | Concrete business rules per company |
| docs/flows/shared/ | REVIEW | One-Pick / Multi-Pick possibly generic picking patterns |
| docs/flows/e2e-coverage-gaps.md, e2e-duplicate-walks.md | DROP | Scanner-suite audit artifacts |
| docs/how-we-build.md | TEMPLATIZE | PM/eng workflow framework, swap examples |
| docs/documentation-strategy.md | DROP | Scanner's wiki→flows migration plan |

### Action
Seed `docs/flows/` w/ templated README + TEMPLATE.md. Port how-we-build.md w/ generic examples. Drop concrete content + scanner-migration doc.

---

## Surface: wiki/

### Present in
- BOILERPLATE: Arch.md, Home.md
- SCANNER: ~20 domain files (carriers, workflows, glossary)
- CONFIGURATOR: Home.md, Intro.md

### Deltas

| File | Verdict | Notes |
|---|---|---|
| Arch.md, Home.md | KEEP | Already in boilerplate |
| Carrier docs (DHL/DPD/GEL/GLS/Dachser/Schenker) | DROP | Project-specific |
| Mako_Processes, manufacturing, markisen, one-pick | DROP | Now in docs/flows/ |
| BoyScout, Bauhaus-CDC-Model, TDR, article-hold | DROP | Domain-specific |
| glossary.md | TEMPLATIZE | Empty skeleton for downstream |
| UserGuide, easy-life-orderinfo, priority, user-management | DROP | Operational docs |

### Action
Optional wiki (per user decision). If kept: add Glossary-TEMPLATE.md. Drop all domain content.

---

## Surface: e2e/helpers/

### Present in
- BOILERPLATE: 4 files (@types, fillInputs, runtime, shared)
- SCANNER: 13+ files + `seed/`
- CONFIGURATOR: not inspected

### Deltas

| File | Verdict | Notes |
|---|---|---|
| @types/*.d.ts | GENERIC | Selector type stubs |
| runtime.ts | GENERIC | Compare; upgrade boilerplate if richer |
| shared.ts | GENERIC | Merge |
| fillInputs.ts | GENERIC | Compare |
| act.ts | GENERIC | Wait-for-settle helper |
| command.ts | GENERIC | **Critical**: resource-schema → button/toast factory |
| setupPort.ts | GENERIC | Port allocation; useful for multi-instance dev |
| loggedInUsers.ts | GENERIC | Login state |
| clientFix.ts | TEMPLATIZE | Strip company-specific fixes |
| triggerServerReload.ts | GENERIC | Test isolation |
| companyPorts.ts | DROP | Three-company map |
| dropshipping.ts | DROP | Workflow-specific |
| import.ts | DROP | Workflow-specific |
| omegaFieldError.ts | DROP | Internal tool |
| seed/ | REVIEW | Generic API client factories vs workflow data |

### Action
Backport 7+ generic helpers. Inspect `seed/`; port scaffold + drop concrete data builders.

---

## Surface: scripts/

### Present in
- BOILERPLATE: 3 files (clean-dist, extract, humanlog)
- SCANNER: 15+ files
- CONFIGURATOR: not detailed

### Deltas

| File | Verdict | Notes |
|---|---|---|
| clean-data.sh | GENERIC | DB/cache reset |
| close-all.sh | GENERIC | Bulk process kill |
| generate-tsconfig-paths.ts | GENERIC | Auto-gen tsconfig paths from workspaces |
| bump-cache-buster.sh | GENERIC | FE cache invalidation |
| libs.sh | GENERIC | Library mgmt |
| convert-bauhaus.ts | DROP | Mako-specific |
| generate-test-names.js | REVIEW | Likely generic |
| omega-debugger.sh | DROP | OmegaForm tool |
| update-main-ruleset-fe-checks.sh | DROP | Mako carriers |
| update-test-options.js | REVIEW | Inspect |
| clean-yaml.js | REVIEW | Purpose unclear |
| ts-plugins/ | REVIEW | If mature, backport |

### Action
Backport 5+ generic scripts. Inspect 4 review items.

---

## Surface: api/src/

### Present in
- BOILERPLATE: skeleton (config/, lib/, models/, resources/, services/DBContext; hello-world + Accounts Controllers)
- SCANNER: full domain (EasyLife/Empasa/Mako/MultiPick/OnePick + core/, cli/, crontab/, migrations/, messages/, Background.*)
- CONFIGURATOR: different shape (backend/, components/)

### Deltas

| Path | Verdict | Notes |
|---|---|---|
| main.ts | GENERIC | Compare; upgrade boilerplate if scanner richer (Background layers, crontab) |
| config.ts | GENERIC | Compare |
| router.ts, routes.ts | GENERIC | Align method patterns |
| api.ts | GENERIC | Compare registry |
| lib/ | GENERIC | Merge utilities |
| models/ (shared/) | GENERIC | Port OperationProgress + shared base schemas |
| resources/ | GENERIC | Base classes, error views, resolvers |
| services/DBContext.ts | GENERIC | Multi-company support; trim to single-tenant for boilerplate |
| services/ | TEMPLATIZE | Generic service patterns (UserRepo, helpers); strip company services |
| core/ | GENERIC | User context, core services scaffolding |
| migrations/ | GENERIC | Add empty dir + README |
| crontab/ | GENERIC | Add empty dir + README |
| cli/ | GENERIC | Add empty dir + README |
| messages.ts | GENERIC | Event/message registry pattern |
| Background.*.ts | GENERIC | Background task scaffold (one example) |
| {EasyLife,Empasa,Mako,MultiPick,OnePick}/ | DROP | Domains |
| scale/, scripts/ | DROP | Mako tooling |

### Action
Backport scaffolding dirs (migrations, crontab, cli, core) + generic main/config/lib/resources/services patterns. Single example workflow only.

---

## Surface: tsconfig.*

### Present in
- BOILERPLATE: base, src, all, plugins (4)
- SCANNER: base, src, all, all2, api, packages, plugins (7)
- CONFIGURATOR: similar to boilerplate

### Deltas

| File | Verdict | Notes |
|---|---|---|
| base, src, all, plugins | KEEP | Align line-by-line w/ scanner |
| api.json | GENERIC | Separate api + internal-packages build |
| packages.json | GENERIC | Workspace-aliased packages (#resources etc) |
| all2.json | REVIEW | Investigate purpose |

### Action
Backport tsconfig.api.json + tsconfig.packages.json. Inspect all2.json; drop if redundant.

---

## Surface: Root `package.json`

### Present in
- BOILERPLATE: ~47 scripts, overrides for eslint-plugin-vue, patches: typescript + ts-plugin-sort-import-suggestions + tanstack
- SCANNER: ~55+ scripts, overrides pin effect@4.0.0-beta.70 family, patches: madge + tanstack + effect@4.0.0-beta.70, node engine `>= 24.11.0`

### Deltas

| Item | Verdict | Notes |
|---|---|---|
| `dev.log` (humanlog tail) | GENERIC | Dev log helper |
| `make-bauhaus-sample` | DROP | Mako-specific |
| `paths:gen`, `paths:check` | GENERIC | Auto-gen tsconfig paths |
| `restart-api` | GENERIC | Dev workflow |
| `subtree:effect` | GENERIC | Effect repo subtree sync (see Direction C below) |
| `circular-api` | GENERIC | Detect circular deps |
| `build:tsgo`, `check:tsgo` | REVIEW | tsgo alternative compiler |
| `l`, `ul` | REVIEW | Lint shortcuts |
| `update-test-options`, `upgrade` | REVIEW | Generic or specific? |
| `pnpm.overrides` effect-beta pin pattern | GENERIC | Pin all effect-family at one version |
| `engines.node >= 24.11.0` | GENERIC | Backport |

### Action
Backport 4-6 dev scripts + effect-beta override pattern + node engine pin.

---

## Surface: patches/

### Deltas

| Patch | Project | Verdict | Notes |
|---|---|---|---|
| @tanstack__query-core | all 3 | KEEP | Shared |
| ts-plugin-sort-import-suggestions | BLPT | KEEP | Boilerplate tool |
| typescript | BLPT | KEEP | Boilerplate-specific |
| effect@4.0.0-beta.70 | SC | TEMPLATIZE | Pattern for pinning beta; don't ship the file |
| madge | SC | DROP | Scanner tool |
| primevue | CFG | DROP | Configurator-specific |

### Action
Keep boilerplate's 3 patches. Document effect-beta pinning pattern in README.

---

## Surface: postmortems/

| Item | Verdict | Notes |
|---|---|---|
| postmortems/ dir | TEMPLATIZE | Add empty dir + TEMPLATE.md |
| SA-231-postmortem.md | DROP | Scanner incident |

### Action
Create `postmortems/TEMPLATE.md` w/ structure: Date, Incident, Root Cause, Lessons, Action Items.

---

## Surface: Top-level config files

### Deltas

| File | Verdict | Notes |
|---|---|---|
| flake.nix | REVIEW | Scanner dropped JDK; verify boilerplate still needs |
| dprint.jsonc | GENERIC | Align |
| vite.config.base.ts vs vite.base.ts | REVIEW | Naming differs; pick one convention |
| vitest.config.ts | GENERIC | Align |
| wallaby.base.cjs | GENERIC | Align |
| tsplus.config.json | REVIEW | Only in scanner; verify if ts-plus is in use |

### Action
Align naming. Decide on JDK + ts-plus inclusion.

---

## Surface: repos/

| Item | Verdict | Notes |
|---|---|---|
| repos/effect-v4 | GENERIC | Reference clone per AGENTS rule |

### Action
Verify subtree presence + version sync. Document update procedure (linked to `subtree:effect` script).

---

## Cross-cutting observations

1. **AGENTS.md is highest-impact single change**: schema-defaults warning + flow-doc discipline + root-level validation.
2. **docs/architecture/ gap is second-highest**: 11 generic docs missing entirely.
3. **`command(rsc)` e2e helper is the keystone test pattern** — backport first.
4. **api/src scaffolding (migrations/crontab/cli/core)** is structure-only; no code to write, just directory + README stubs.
5. **Company/workflow specifics are cleanly isolated** in scanner — safe to drop without affecting generic patterns.
6. **No breaking changes expected** to boilerplate's existing minimal code; this is pure additive (plus a few alignment renames).

---

## Recommended Backport Order

1. AGENTS.md upgrade (schema-defaults, flow-doc, root validation)
2. `docs/architecture/` — 11 generic docs (via Direction C / effa docs once tooling exists, otherwise direct copy)
3. `e2e/helpers/command.ts` (critical pattern)
4. api/src scaffolding (empty dirs + README stubs: migrations, crontab, cli, core)
5. `docs/flows/README.md` + `TEMPLATE.md` (templated)
6. Root scripts (paths:gen, clean-data, close-all, restart-api, circular-api)
7. tsconfig.api.json + tsconfig.packages.json
8. Top-level config alignment (vite naming, tsplus, flake)
9. `postmortems/TEMPLATE.md`
10. Wiki: optional. If kept, glossary template only.

Effort estimate: 200-300 lines of new docs, 10-15 script/config files, 4 empty scaffolding dirs. No breaking changes.

---

## Open follow-ups (for Phase 2 inputs to architecture-docs seed)

Files marked GENERIC + TEMPLATIZE above are the input set for seeding `effect-app/architecture-docs` repo (see PLAN, Direction C). They are NOT to be copied directly into boilerplate — they belong upstream first, then `effa docs sync` pulls them down.

Files marked DROP stay where they are.

---

## REVIEW resolutions (2026-05-23, user-confirmed)

User decisions:
- `docs/flows/*` → project-local. Skip entirely from boilerplate; no template, no README. Each project owns its own flows.
- `scripts/*` → skip most. **Only port `scripts/ts-plugins/`** (= `prefer-namespace-import` plugin). Defer rest until proven generic.
- `tsconfig.all2.json` → DROP.
- `tsplus.config.json` → DROP (scanner not using ts-plus actively).

Inspection results for the remaining items:

| Item | Verdict | Notes |
|---|---|---|
| `docs/architecture/index.md` | TEMPLATIZE | Sectioned TOC: "Process & documentation (read first)" + "Technical architecture". Port as skeleton; drop scanner-specific bullets (ABAS, workflow.md, packstations). Lives in shared architecture-docs repo. |
| `docs/architecture/e2e-toast-wait-audit.md` | GENERIC | Documents the `command(resource)` helper API, settle-signal ranking, exception cases. Reusable spec for the e2e helper. Belongs in shared architecture-docs alongside e2e.md. |
| `docs/flows/shared/` (One-Pick / Multi-Pick) | DROP | Per user: flows are project-local. |
| `scripts/generate-test-names.js`, `update-test-options.js`, `clean-yaml.js` | DROP | Per user: defer all scripts. |
| `scripts/ts-plugins/prefer-namespace-import` | GENERIC | Single plugin enforcing namespace-import-discipline (matches `docs/architecture/import-rules.md`). Backport. |
| `tsconfig.all2.json` | DROP | User decision. |
| `tsplus.config.json` | DROP | User decision. |
| vite naming (`vite.config.base.ts` BLPT vs `vite.base.ts` SC) | KEEP BLPT | Boilerplate's `vite.config.base.ts` is the more conventional name. Scanner can rename when it next refactors. No change in boilerplate. |
| `flake.nix` JDK | KEEP IN BLPT | Boilerplate retains JDK21 — useful for any project that may need it. Scanner removed it as project-specific cleanup. No-op in boilerplate. |
| root `package.json`: `build:tsgo` / `check:tsgo` | DROP | Experimental tsgo compiler. Defer until stable. |
| root `package.json`: `l`, `ul` (effect-app link/unlink) | GENERIC | Shortcuts for the `effect-app` CLI. Backport once effa CLI is wired in. |
| root `package.json`: `upgrade` | DROP | Scanner stub (`echo hi`). |
| root `package.json`: `update-test-options` | DROP | Tied to dropped script. |
| root `package.json`: `subtree:effect` | DEFER | Tied to `repos/effect-v4` strategy. Decide once Direction C tooling firmed up. |

### Final Phase 3 input set

After resolutions, items destined for shared architecture-docs repo (Direction C upstream):

**Architecture docs (GENERIC)**: import-rules, resource-and-controller-layout, query-shape-list-vs-get, database-query-guidelines, vue-conventions, e2e-state-pattern, e2e.md, streams-and-progress, e2e-toast-wait-audit, index (templatized).

**Architecture docs (TEMPLATIZE)**: command-pattern, command-input-validation, list-layout, flow-documentation (note: framework only; concrete flows stay project-local).

**Other doc-like (GENERIC)**: docs/how-we-build.md (templatized).

**AGENTS.md upgrades**: schema-defaults, mandatory-validation-from-root, references to ported architecture docs.

**Code/tooling (direct backport, not via shared docs repo)**:
- e2e/helpers: command.ts, act.ts, runtime.ts, shared.ts, fillInputs.ts, setupPort.ts, loggedInUsers.ts, triggerServerReload.ts, @types/*.d.ts (see new e2e-utils sync section below)
- scripts/ts-plugins/prefer-namespace-import
- api/src scaffolding dirs (migrations, crontab, cli, core) with READMEs
- tsconfig.api.json, tsconfig.packages.json
- postmortems/TEMPLATE.md
- patches: effect-beta pinning pattern documented in README
- root package.json: effect-beta override pattern, node engine pin, `l`/`ul` scripts

**Dropped definitively**: all company/workflow code, carrier docs, ts-plus config, tsgo scripts, scanner-specific scripts, wiki domain content, configurator-specific patches.

---

## E2E utility sync strategy

Same shape problem as docs: helpers like `command.ts` and `act.ts` should evolve in any project but propagate back. Difference: code, not prose. Higher merge-conflict risk; needs tests.

### Constraints

- Helper depends on project APIs (resource schemas, intl, runtime). Cannot be a black-box library — needs adaptation points.
- Type signatures evolve w/ Effect-TS version. Lockstep w/ effect/* versions.
- Audit doc (`e2e-toast-wait-audit.md`) describes the helper's contract. Doc + code must move together.

### Option matrix

| Approach | Pros | Cons |
|---|---|---|
| `@effect-app/e2e-helpers` npm package | Versioned, normal upgrade UX | Can't edit in-place; adaptation needs hooks/plugins; release cadence overhead |
| Git subtree of `effect-app/e2e-helpers` | Edit in tree; bidirectional via `git subtree push` | Subtree push UX hostile; history pollution |
| `effa e2e sync` CLI (mirror of `effa docs`) | Edit in tree; bidirectional; lockfile pin | Two CLIs to maintain — but shared core w/ `effa docs` |
| Copy-and-fork (status quo) | Zero ceremony | Drift forever |

### Pick: extend `effa docs` mechanism → generalize to `effa sync`

One CLI w/ subcommands for different artifact families.

```
effa sync docs            # alias for effa docs sync
effa sync e2e             # pulls e2e/helpers/* from shared repo
effa sync push e2e        # pushes local edits upstream
effa sync status          # all artifact families
```

### Shared repo layout

Either single repo w/ multiple roots:

```
effect-app/shared/
  docs/architecture/
  e2e/helpers/
  ts-plugins/             # also covers prefer-namespace-import
  scaffolding/api/        # empty-dir READMEs for migrations/crontab/cli/core
```

Or separate repos per artifact family. Recommend **single repo** — simpler git ops, single lockfile, one PR can update doc + helper together (which is required when contract changes).

### Lockfile shape (project-side)

```json
// .shared.json
{
  "repo": "github.com/effect-ts-app/shared",
  "ref": "abc1234",
  "artifacts": {
    "docs/architecture": "docs/architecture",
    "e2e/helpers": "e2e/helpers",
    "scripts/ts-plugins": "ts-plugins"
  },
  "exclude": [
    "e2e/helpers/companyPorts.ts"
  ]
}
```

Per-artifact mapping = repo-path → project-path. Excludes opt out of files inappropriate for the project.

### Adaptation problem (e2e specific)

`command.ts` references project-local intl + resource registry. Solution: thin adapter file stays in project, helper imports from `#e2e/helpers/adapter.ts` (path alias the helper expects). Helper itself is fully generic. Project provides:

```
e2e/helpers/adapter.ts   # NOT synced — project-local
  export { intl } from "../../frontend/utils/intl"
  export { resources } from "../../api/src/api"
```

Helper consumes via `import { intl, resources } from "./adapter.js"`. Sync replaces `command.ts` / `act.ts`, leaves `adapter.ts` alone (in `.shared.json` exclude or by convention — adapter never lives in shared repo).

### Versioning + type-safety guard

CI in shared repo runs against pinned Effect version. Project's `effa sync e2e` warns if project's effect version mismatches shared repo's tested version. No auto-update on mismatch.

### Edit workflow

```
$ vim e2e/helpers/command.ts
$ effa sync status
  M e2e/helpers/command.ts (local ahead)
$ effa sync push e2e -m "add settle-signal for stream commands"
  → PR on effect-app/shared
```

If contract change → engineer must include `docs/architecture/e2e-toast-wait-audit.md` edit in same PR (CI rule on shared repo: changed helper API requires doc change).

### Execution order (folded into PLAN)

1. Direction C step 0 (create shared repo) → make it multi-artifact from day one, not docs-only.
2. Seed `docs/architecture/` first (Phase 3 step 2).
3. Seed `e2e/helpers/` second (next sub-phase).
4. Seed `ts-plugins/` third.
5. `effa sync` CLI: build `docs sync` first; generalize to multi-artifact when adding `e2e sync`.

### Risks specific to e2e

- Helper change breaks downstream tests silently → mitigate w/ shared-repo CI that runs against pinned downstream project (e.g., scanner) as integration check.
- Type drift across Effect versions → lockfile records effect version; mismatch warns.
- Adapter API churn → keep adapter surface tiny + stable (intl, resources, runtime — that's it).

