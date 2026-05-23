/**
 * TS Language Service plugin.
 *
 * Behaviors:
 *
 * 1. (opt-in) For unresolved identifiers (TS2304 / TS2552) listed in `mappings`,
 *    prepend a code-fix that inserts a namespace import from the configured module.
 *    Disabled by default; enable with `"enableNamespaceImport": true`.
 *
 * 2. For each unresolved-identifier code-fix list, drop a "hidden" module fix
 *    (e.g. `effect`, `effect/Result`, `@effect/foo`) only when a *corresponding*
 *    "preferred" module fix exists for the same identifier. Correspondence is
 *    computed by index-pairing `prefer[i]` ↔ `hide[i]` and substituting the
 *    package prefix:
 *      - hide `effect/Result` → preferred `effect-app/Result` (drop only if
 *        TS actually suggested `effect-app/Result`; otherwise keep
 *        `effect/Result` because `Result` lives only at `effect/Result`).
 *      - hide `effect/Option` → preferred `effect-app/Option` (both exist,
 *        drop the hide).
 *      - hide `effect` (root) → preferred `effect-app` (root). Drop only when
 *        the preferred root fix exists.
 *    This avoids steering the user toward a preferred package that does not
 *    actually expose the symbol at the same path.
 *
 * 3. Reorder import code-fixes by `moveUpPatterns` / `moveDownPatterns` (regex
 *    against module specifier). Higher-indexed `moveUp` patterns win. Fixes whose
 *    module matches no `moveUp` pattern but matches a `moveDown` pattern sink to
 *    the bottom. Mirrors the previous `ts-plugin-sort-import-suggestions` patch.
 *
 * 4. `overrides`: per-symbol forced-winner module. If the unresolved identifier
 *    has an override and a fix with that module specifier exists, it is moved to
 *    the top of the import-fix sub-list.
 *
 * 5. Mutates completion entry `sortText` so auto-import suggestions in the
 *    completion popup follow the same `moveUpPatterns` / `moveDownPatterns`
 *    ordering. Mirrors the original `ts-plugin-sort-import-suggestions` package.
 *
 * 6. (opt-in) Suggestion diagnostic for namespace destructuring such as
 *    `const { copy } = Utils` where `Utils` is a `import * as Utils` namespace.
 *    Encourages direct named imports instead. Configure via `destructureNamespace`.
 *
 * 6b. (opt-in) Suggestion diagnostics for forbidden barrel re-exports:
 *      - `export * from "..."` (or `export * as X from "..."`) in any file
 *        whose basename matches one of `forbiddenBarrelBasenames` (rule 1:
 *        company roots like `Mako.ts`, `Empasa.ts`, `EasyLife.ts`).
 *      - `export * as X from "./X.js"` self re-exports (rule 2) — the
 *        `X.ts` wrapper around a same-named submodule is just a hidden
 *        barrel.
 *    Configure via `forbiddenBarrels`.
 *
 * 7. (opt-in) Refactor "Convert to workflow namespace import" on import
 *    declarations that cross workflow boundaries — e.g.
 *    `import { Order } from "../Standard/models.js"` from a file inside
 *    `EasyLife/Dropshipping/` is rewritten to
 *    `import * as StandardModels from "../Standard/models.js"` plus every
 *    reference in the file. Same logic covers `models.ts`, `events.ts`,
 *    `core.ts`, and `services/DBContext.ts` (and `services/*Repo.ts`,
 *    which retargets to `services/DBContext.ts`).
 *
 *    Workflow scope = nearest ancestor directory containing the
 *    `workflowMarker` file (default `services/DBContext.ts`). The refactor
 *    fires only when:
 *      - target scope is a sibling of source scope (e.g. Bauhaus → Standard), OR
 *      - target scope is a descendant of source scope (parent reaching into
 *        a child, e.g. EasyLife company-level → EasyLife/Standard).
 *    It does NOT fire for:
 *      - same scope (sibling files within one workflow — rule 4),
 *      - child → parent (narrower scope importing from broader scope; named
 *        imports remain idiomatic for parent helpers).
 *
 *    Configure via `crossWorkflowNamespace.modules`.
 *
 * tsconfig:
 *   "plugins": [{
 *     "name": "ts-plugin-prefer-namespace-import",
 *     "enableNamespaceImport": false,
 *     "mappings": { "Effect": "effect-app/Effect" },
 *     "preferOver": [
 *       { "prefer": ["effect-app", "@effect-app/"], "hide": ["effect", "@effect/"] }
 *     ],
 *     "sortImports": {
 *       "enabled": true,
 *       "moveUpPatterns": ["^\\./", "effect-app", "^@effect-app/", "effect", "^@effect/"],
 *       "moveDownPatterns": ["^node_modules/"],
 *       "overrides": { "effect-app": ["Array", "Option", "Either"] }
 *     },
 *     "destructureNamespace": {
 *       "enabled": true,
 *       "ignoreNames": ["match"]
 *     },
 *     "forbiddenBarrels": {
 *       "enabled": true,
 *       "forbiddenBarrelBasenames": ["Mako.ts", "Empasa.ts", "EasyLife.ts"]
 *     },
 *     "crossWorkflowNamespace": {
 *       "enabled": true,
 *       "workflowMarker": "services/DBContext.ts",
 *       "modules": [
 *         { "specifierPattern": "/services/[A-Z]\\w*Repo(\\.(?:js|ts))?$", "targetBasename": "DBContext.ts", "aliasSuffix": "DB" },
 *         { "specifierPattern": "/services/DBContext(\\.(?:js|ts))?$", "aliasSuffix": "DB" },
 *         { "specifierPattern": "/models(\\.(?:js|ts))?$", "aliasSuffix": "Models" },
 *         { "specifierPattern": "/events(\\.(?:js|ts))?$", "aliasSuffix": "Events" },
 *         { "specifierPattern": "/core(\\.(?:js|ts))?$", "aliasSuffix": "Core" }
 *       ]
 *     }
 *   }]
 */
"use strict";

const path = require("path");
const fs = require("fs");

const CANNOT_FIND_NAME = 2304;
const CANNOT_FIND_NAME_DID_YOU_MEAN = 2552;

const DESTRUCTURE_NAMESPACE_CODE = 90101;
const FORBIDDEN_BARREL_ROOT_CODE = 90102;
const FORBIDDEN_BARREL_SELF_CODE = 90103;

const REFACTOR_NAME = "PreferNamespaceImport";
const ACTION_CONVERT_TO_WORKFLOW_NAMESPACE = "convertToWorkflowNamespace";

const DEFAULT_WORKFLOW_MODULES = [
  { specifierPattern: "/services/[A-Z]\\w*Repo(\\.(?:js|ts))?$", targetBasename: "DBContext.ts", aliasSuffix: "DB" },
  { specifierPattern: "/services/DBContext(\\.(?:js|ts))?$", aliasSuffix: "DB" },
  { specifierPattern: "/models(\\.(?:js|ts))?$", aliasSuffix: "Models" },
  { specifierPattern: "/events(\\.(?:js|ts))?$", aliasSuffix: "Events" },
  { specifierPattern: "/core(\\.(?:js|ts))?$", aliasSuffix: "Core" },
];

function init(modules) {
  const ts = modules.typescript;

  function create(info) {
    const log = (msg) => info.project.projectService.logger.info(`[prefer-namespace-import] ${msg}`);
    const cfg = info.config || {};
    const enableNamespaceImport = cfg.enableNamespaceImport === true;
    const mappings = cfg.mappings || {};
    const preferOver = Array.isArray(cfg.preferOver) ? cfg.preferOver : [];

    const sortCfg = cfg.sortImports || {};
    const sortEnabled = sortCfg.enabled !== false; // default true
    // Sort patterns: reverse so later entries become higher priority (matches the
    // semantics of the old patch: `findLastIndex` over the original array).
    const moveUpRegexes = sortEnabled
      ? (sortCfg.moveUpPatterns || []).map((p) => new RegExp(p)).slice().reverse()
      : [];
    const moveDownRegexes = sortEnabled
      ? (sortCfg.moveDownPatterns || []).map((p) => new RegExp(p)).slice().reverse()
      : [];

    // overrides config shape: { [moduleSpecifier]: [symbolName, ...] }
    // Index for fast lookup: symbolName -> moduleSpecifier
    const overrideBySymbol = new Map();
    if (sortEnabled && sortCfg.overrides && typeof sortCfg.overrides === "object") {
      for (const [moduleSpec, symbols] of Object.entries(sortCfg.overrides)) {
        if (!Array.isArray(symbols)) continue;
        for (const sym of symbols) overrideBySymbol.set(sym, moduleSpec);
      }
    }

    const destructureCfg = cfg.destructureNamespace || {};
    const destructureEnabled = destructureCfg.enabled === true;
    const destructureIgnore = new Set(Array.isArray(destructureCfg.ignoreNames) ? destructureCfg.ignoreNames : []);

    const barrelCfg = cfg.forbiddenBarrels || {};
    const barrelEnabled = barrelCfg.enabled === true;
    const forbiddenBarrelBasenames = new Set(
      Array.isArray(barrelCfg.forbiddenBarrelBasenames) ? barrelCfg.forbiddenBarrelBasenames : [],
    );

    const xWfCfg = cfg.crossWorkflowNamespace || {};
    const xWfEnabled = xWfCfg.enabled === true;
    const xWfMarker = xWfCfg.workflowMarker || "services/DBContext.ts";
    const xWfModules = (Array.isArray(xWfCfg.modules) ? xWfCfg.modules : DEFAULT_WORKFLOW_MODULES).map((m) => ({
      regex: new RegExp(m.specifierPattern),
      targetBasename: m.targetBasename || undefined,
      aliasSuffix: m.aliasSuffix || "",
    }));

    log(
      `started; enableNamespaceImport=${enableNamespaceImport} mappings=${JSON.stringify(mappings)} `
        + `preferOver=${JSON.stringify(preferOver)} sortImports.enabled=${sortEnabled} `
        + `moveUp=${(sortCfg.moveUpPatterns || []).join(",")} `
        + `moveDown=${(sortCfg.moveDownPatterns || []).join(",")} `
        + `overrides=${JSON.stringify(sortCfg.overrides || {})} `
        + `destructureNamespace=${destructureEnabled} crossWorkflowNamespace=${xWfEnabled} `
        + `workflowMarker=${xWfMarker} modules=${xWfModules.length} `
        + `forbiddenBarrels=${barrelEnabled} forbiddenBarrelBasenames=${JSON.stringify([...forbiddenBarrelBasenames])}`,
    );

    const proxy = Object.create(null);
    for (const k of Object.keys(info.languageService)) {
      const v = info.languageService[k];
      proxy[k] = (...args) => v.apply(info.languageService, args);
    }

    const ls = info.languageService;

    // --- Completion entry sort tweak (auto-import popup ordering). ---
    proxy.getCompletionsAtPosition = (fileName, position, options, ...rest) => {
      const prior = ls.getCompletionsAtPosition(fileName, position, options, ...rest);
      if (!prior) return prior;
      if (
        moveUpRegexes.length === 0
        && moveDownRegexes.length === 0
        && preferOver.length === 0
      ) return prior;
      // Per-rule, per-symbol presence maps for "on-target preferred" and
      // "on-target (any) submodule". Lets us mirror the code-fix policy in
      // the popup: demote preferred-root always, demote off-target submodule
      // when on-target submodule exists, demote hide when on-target
      // preferred submodule exists.
      const onTargetPreferredByName = preferOver.map(() => new Set());
      const onTargetAnyByName = preferOver.map(() => new Set());
      for (const e of prior.entries) {
        const src = e.source;
        if (!src || !isSubmoduleSpec(src)) continue;
        preferOver.forEach((rule, ri) => {
          const prefer = Array.isArray(rule.prefer) ? rule.prefer : [];
          const hide = Array.isArray(rule.hide) ? rule.hide : [];
          if (matchesAnyPattern(src, prefer) && extractFirstSubSegment(src, prefer) === e.name) {
            onTargetPreferredByName[ri].add(e.name);
            onTargetAnyByName[ri].add(e.name);
          } else if (matchesAnyPattern(src, hide) && extractFirstSubSegment(src, hide) === e.name) {
            onTargetAnyByName[ri].add(e.name);
          }
        });
      }

      prior.entries = prior.entries.map((e) => {
        const newEntry = { ...e };
        const source = e.source;
        if (source) {
          let demote = false;
          preferOver.forEach((rule, ri) => {
            if (demote) return;
            const prefer = Array.isArray(rule.prefer) ? rule.prefer : [];
            const hide = Array.isArray(rule.hide) ? rule.hide : [];
            const inPrefer = prefer.length > 0 && matchesAnyPattern(source, prefer);
            const inHide = hide.length > 0 && matchesAnyPattern(source, hide);
            if (!inPrefer && !inHide) return;
            const isSub = isSubmoduleSpec(source);
            if (inPrefer && !isSub) { demote = true; return; }
            if (isSub && onTargetAnyByName[ri].has(e.name)) {
              const patterns = inPrefer ? prefer : hide;
              if (extractFirstSubSegment(source, patterns) !== e.name) { demote = true; return; }
            }
            if (inHide && onTargetPreferredByName[ri].has(e.name)) { demote = true; }
          });
          if (demote) {
            newEntry.sortText = e.sortText + "9";
          } else if (moveUpRegexes.some((re) => re.test(source))) {
            // Lex-decrement final char to bubble up.
            newEntry.sortText = e.sortText.slice(0, -1)
              + String.fromCharCode(e.sortText.slice(-1).charCodeAt(0) - 1) + "1";
          } else if (moveDownRegexes.some((re) => re.test(source))) {
            newEntry.sortText = newEntry.sortText + "1";
          }
        }
        return newEntry;
      });
      return prior;
    };

    // --- Code-fix list rewrite (lightbulb / quickfix ordering + filtering). ---
    proxy.getCodeFixesAtPosition = (fileName, start, end, errorCodes, formatOptions, preferences) => {
      const prior = ls.getCodeFixesAtPosition(fileName, start, end, errorCodes, formatOptions, preferences) || [];

      const relevantCodes = errorCodes.filter(
        (c) => c === CANNOT_FIND_NAME || c === CANNOT_FIND_NAME_DID_YOU_MEAN,
      );
      if (relevantCodes.length === 0) return prior;

      const program = ls.getProgram();
      const sourceFile = program && program.getSourceFile(fileName);
      if (!sourceFile) return prior;

      const name = getIdentifierText(ts, sourceFile, start, end);
      if (!name) return prior;

      let fixes = prior.slice();

      // 1. Inject configured namespace import (opt-in, default off).
      if (enableNamespaceImport && Object.prototype.hasOwnProperty.call(mappings, name)) {
        const moduleSpecifier = mappings[name];
        if (!alreadyImported(ts, sourceFile, name, moduleSpecifier)) {
          const { insertPos, prefix, suffix } = getImportInsertion(ts, sourceFile);
          const newImport = `import * as ${name} from "${moduleSpecifier}"`;
          fixes.unshift({
            fixName: "preferNamespaceImport",
            description: `Add namespace import: ${newImport}`,
            changes: [
              {
                fileName,
                textChanges: [
                  { span: { start: insertPos, length: 0 }, newText: `${prefix}${newImport}${suffix}` },
                ],
              },
            ],
          });
        }
      }

      // 2. Prefer-namespace policy. Symbol-aware filter:
      //      a. Drop preferred-root named imports always
      //         (never `import { X } from "effect-app"`).
      //      b. Drop off-target submodule fixes (tail ≠ symbol) when an
      //         on-target submodule for the symbol exists. Example: for
      //         symbol `Result`, drop `effect-app/Schema` if `effect/Result`
      //         is on offer.
      //      c. Drop hide fixes (any spec matching `hide` patterns) only
      //         when an on-target preferred submodule (`<prefer-pkg>/<symbol>`)
      //         actually exists. Keeps `effect` / `effect/Result` visible
      //         when `effect-app/Result` does not exist.
      if (preferOver.length > 0) {
        fixes = applyPreferNamespaceFilters(fixes, preferOver, name, log);
      }

      // 3. Reorder import fixes by moveUp/moveDown patterns (in-place over import-fix slots).
      // 4. Apply per-symbol override (move override-matched fix to top of import-fix sub-list).
      if (moveUpRegexes.length > 0 || moveDownRegexes.length > 0 || overrideBySymbol.has(name)) {
        fixes = reorderImportFixes(fixes, name, moveUpRegexes, moveDownRegexes, overrideBySymbol);
      }

      return fixes;
    };

    // --- Suggestion diagnostics: namespace destructure + forbidden barrels. ---
    if (destructureEnabled || barrelEnabled) {
      proxy.getSuggestionDiagnostics = (fileName) => {
        const prior = ls.getSuggestionDiagnostics(fileName) || [];
        const program = ls.getProgram();
        const sourceFile = program && program.getSourceFile(fileName);
        if (!sourceFile || sourceFile.isDeclarationFile) return prior;
        const extra = [];

        if (destructureEnabled) {
          const namespaceImports = collectNamespaceImports(ts, sourceFile);
          if (namespaceImports.size > 0) {
            const visit = (node) => {
              if (
                ts.isVariableDeclaration(node)
                && node.name
                && ts.isObjectBindingPattern(node.name)
                && node.initializer
                && ts.isIdentifier(node.initializer)
              ) {
                const nsName = node.initializer.text;
                const info = namespaceImports.get(nsName);
                if (info && !destructureIgnore.has(nsName)) {
                  const start = node.getStart(sourceFile);
                  extra.push({
                    file: sourceFile,
                    start,
                    length: node.getEnd() - start,
                    messageText:
                      `Avoid destructuring namespace import "${nsName}". `
                      + `Import helpers directly from "${info.moduleSpecifier}".`,
                    category: ts.DiagnosticCategory.Suggestion,
                    code: DESTRUCTURE_NAMESPACE_CODE,
                    source: "prefer-namespace-import",
                  });
                }
              }
              ts.forEachChild(node, visit);
            };
            visit(sourceFile);
          }
        }

        if (barrelEnabled) {
          collectForbiddenBarrelDiagnostics(ts, sourceFile, forbiddenBarrelBasenames, extra);
        }

        return extra.length === 0 ? prior : prior.concat(extra);
      };
    }

    // --- Refactor: convert cross-workflow named import to *<Workflow><Suffix> namespace. ---
    if (xWfEnabled) {
      const planRefactor = (fileName, positionOrRange) => {
        const program = ls.getProgram();
        const sourceFile = program && program.getSourceFile(fileName);
        if (!sourceFile) return undefined;
        const pos = typeof positionOrRange === "number" ? positionOrRange : positionOrRange.pos;
        const importDecl = findImportDeclAt(ts, sourceFile, pos);
        if (!importDecl) return undefined;
        return planWorkflowRefactor(ts, program, sourceFile, importDecl, {
          modules: xWfModules,
          workflowMarker: xWfMarker,
          log,
        });
      };

      proxy.getApplicableRefactors = (fileName, positionOrRange, ...rest) => {
        const prior = ls.getApplicableRefactors(fileName, positionOrRange, ...rest) || [];
        const plan = planRefactor(fileName, positionOrRange);
        if (!plan) return prior;
        return prior.concat([
          {
            name: REFACTOR_NAME,
            description: "Prefer namespace import",
            actions: [
              {
                name: ACTION_CONVERT_TO_WORKFLOW_NAMESPACE,
                description: plan.actionDescription,
              },
            ],
          },
        ]);
      };

      proxy.getEditsForRefactor = (
        fileName,
        formatOptions,
        positionOrRange,
        refactorName,
        actionName,
        preferences,
      ) => {
        if (refactorName !== REFACTOR_NAME) {
          return ls.getEditsForRefactor(
            fileName,
            formatOptions,
            positionOrRange,
            refactorName,
            actionName,
            preferences,
          );
        }
        if (actionName !== ACTION_CONVERT_TO_WORKFLOW_NAMESPACE) return undefined;
        const plan = planRefactor(fileName, positionOrRange);
        if (!plan) return undefined;
        return plan.buildEdits();
      };
    }

    return proxy;
  }

  return { create };
}

// --- Helpers for namespace destructure / dbcontext rewrite. ---

function collectForbiddenBarrelDiagnostics(ts, sourceFile, forbiddenBasenames, out) {
  const basename = path.basename(sourceFile.fileName);
  const sourceStem = basename.replace(/\.tsx?$/, "");
  const isCompanyRoot = forbiddenBasenames.has(basename);

  // "Pure barrel" = every top-level statement is an `export ... from "..."`
  // re-export. Used to decide whether a plain `export * from "./X/..."` in
  // an `X.ts` wrapper is a self-barrel (flag) vs. a file that happens to
  // also expose its own helpers (don't flag).
  const isPureBarrel = sourceFile.statements.every(
    (s) => ts.isExportDeclaration(s) && !!s.moduleSpecifier,
  );

  for (const stmt of sourceFile.statements) {
    if (!ts.isExportDeclaration(stmt)) continue;
    if (!stmt.moduleSpecifier || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const isStar = !stmt.exportClause || ts.isNamespaceExport(stmt.exportClause);
    if (!isStar) continue;
    const spec = stmt.moduleSpecifier.text;
    const start = stmt.getStart(sourceFile);
    const length = stmt.getEnd() - start;
    // Rule 1: company-root barrels.
    if (isCompanyRoot) {
      out.push({
        file: sourceFile,
        start,
        length,
        messageText:
          `Avoid \`export *\` in company root "${basename}". `
          + `Re-exporting submodules here forces the whole tree to load. `
          + `Import the concrete submodule path instead (rule 1).`,
        category: ts.DiagnosticCategory.Suggestion,
        code: FORBIDDEN_BARREL_ROOT_CODE,
        source: "prefer-namespace-import",
      });
      continue;
    }
    // Rule 2: self re-export — `X.ts` re-exports from `./X.js` (aliased
    // form always flagged) or from `./X/...` when the file is a pure
    // barrel wrapper.
    const isAliasedSelf = stmt.exportClause
      && ts.isNamespaceExport(stmt.exportClause)
      && (spec === `./${sourceStem}.js` || spec === `./${sourceStem}.ts` || spec === `./${sourceStem}` || spec.startsWith(`./${sourceStem}/`));
    const isPureBarrelSelfSubtree = isPureBarrel
      && (spec === `./${sourceStem}.js` || spec === `./${sourceStem}.ts` || spec.startsWith(`./${sourceStem}/`));
    if (isAliasedSelf || isPureBarrelSelfSubtree) {
      out.push({
        file: sourceFile,
        start,
        length,
        messageText:
          `Avoid self re-export: "${basename}" re-exports from "${spec}". `
          + `Move concrete exports into ${basename} or import the submodule directly (rule 2).`,
        category: ts.DiagnosticCategory.Suggestion,
        code: FORBIDDEN_BARREL_SELF_CODE,
        source: "prefer-namespace-import",
      });
    }
  }
}

function collectNamespaceImports(ts, sourceFile) {
  const out = new Map();
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const clause = stmt.importClause;
    if (!clause || !clause.namedBindings) continue;
    const nb = clause.namedBindings;
    if (!ts.isNamespaceImport(nb)) continue;
    const spec = stmt.moduleSpecifier;
    if (!spec || !ts.isStringLiteral(spec)) continue;
    out.set(nb.name.text, { moduleSpecifier: spec.text, node: nb });
  }
  return out;
}

function findImportDeclAt(ts, sourceFile, pos) {
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    if (pos >= stmt.getStart(sourceFile) && pos <= stmt.getEnd()) return stmt;
  }
  return undefined;
}

function planWorkflowRefactor(ts, program, sourceFile, importDecl, opts) {
  const spec = importDecl.moduleSpecifier;
  if (!spec || !ts.isStringLiteral(spec)) return undefined;
  const clause = importDecl.importClause;
  if (!clause || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) return undefined;
  if (clause.namedBindings.elements.length === 0) return undefined;

  // Pick the first matching module rule by specifier pattern.
  const rule = opts.modules.find((m) => m.regex.test(spec.text));
  if (!rule) return undefined;

  const sourceDir = path.dirname(sourceFile.fileName);
  const targetAbsolute = path.resolve(sourceDir, stripModuleExt(spec.text));

  // Workflow scopes: nearest ancestor dir containing the marker file.
  const sourceScope = findWorkflowScope(sourceDir, opts.workflowMarker);
  const targetScope = findWorkflowScope(path.dirname(targetAbsolute), opts.workflowMarker);
  if (!sourceScope || !targetScope) return undefined;
  if (sourceScope === targetScope) return undefined; // same workflow → keep as-is.
  // "Cross-workflow" is restricted to sibling workflows or parent→child
  // (broader workflow reaching into a narrower one). Child→parent imports
  // (narrower workflow reaching outward) stay as named imports — keeps
  // shared/parent helpers ergonomic, and we don't want a `EasyLifeDB`
  // namespace inside files that already live under `EasyLife/...`.
  if (isAncestorDir(targetScope, sourceScope)) return undefined;

  const workflowSegment = path.basename(targetScope);
  const alias = `${workflowSegment}${rule.aliasSuffix}`;
  const newSpec = rule.targetBasename ? rewriteSpecifierBasename(spec.text, rule.targetBasename) : spec.text;
  const newBasename = rule.targetBasename || path.basename(spec.text);

  return {
    actionDescription: `Convert to namespace import "${alias}" from ${newBasename}`,
    buildEdits: () => buildWorkflowNamespaceEdits(ts, program, sourceFile, importDecl, { alias, newSpec, log: opts.log }),
  };
}

function isAncestorDir(maybeAncestor, descendant) {
  if (maybeAncestor === descendant) return false;
  const prefix = maybeAncestor.endsWith(path.sep) ? maybeAncestor : maybeAncestor + path.sep;
  return descendant.startsWith(prefix);
}

function findWorkflowScope(startDir, marker) {
  let dir = startDir;
  while (true) {
    if (fs.existsSync(path.join(dir, marker))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function buildWorkflowNamespaceEdits(ts, program, sourceFile, importDecl, opts) {
  const checker = program.getTypeChecker();
  const { alias, newSpec } = opts;
  const clause = importDecl.importClause;
  const namedBindings = clause.namedBindings;
  const importedNames = namedBindings.elements.map((el) => ({
    localName: el.name.text,
    propName: (el.propertyName && el.propertyName.text) || el.name.text,
    element: el,
  }));

  // Determine if an existing `import * as <alias> from "<newSpec>"` exists.
  const existingAlias = sourceFile.statements.find((s) => {
    if (!ts.isImportDeclaration(s)) return false;
    const m = s.moduleSpecifier;
    if (!m || !ts.isStringLiteral(m)) return false;
    if (stripModuleExt(m.text) !== stripModuleExt(newSpec)) return false;
    const c = s.importClause;
    return !!(c && c.namedBindings && ts.isNamespaceImport(c.namedBindings) && c.namedBindings.name.text === alias);
  });

  const textChanges = [];

  // Replace (or delete) the old import declaration.
  const importStart = importDecl.getStart(sourceFile);
  const importEnd = importDecl.getEnd();
  if (existingAlias) {
    // Delete the entire line including trailing newline if present.
    const fullText = sourceFile.text;
    let end = importEnd;
    if (fullText[end] === "\r") end++;
    if (fullText[end] === "\n") end++;
    textChanges.push({ span: { start: importStart, length: end - importStart }, newText: "" });
  } else {
    const typeKw = clause.isTypeOnly ? "type " : "";
    const newImport = `import ${typeKw}* as ${alias} from "${newSpec}"`;
    textChanges.push({ span: { start: importStart, length: importEnd - importStart }, newText: newImport });
  }

  // Rewrite each usage of imported names within this file.
  for (const { localName, propName, element } of importedNames) {
    const localSym = checker.getSymbolAtLocation(element.name);
    if (!localSym) continue;
    const aliasedSym = (localSym.flags & ts.SymbolFlags.Alias) ? safeAliased(checker, localSym) : undefined;
    rewriteReferences(ts, sourceFile, localName, (id) => {
      if (id.getStart(sourceFile) >= importStart && id.getEnd() <= importEnd) return null; // skip the import itself
      const usageSym = checker.getSymbolAtLocation(id);
      if (!usageSym) return null;
      if (usageSym !== localSym && usageSym !== aliasedSym) return null;
      // Compute replacement text considering shorthand assignments and rename forms.
      const parent = id.parent;
      if (parent && ts.isShorthandPropertyAssignment(parent) && parent.name === id) {
        return { start: id.getStart(sourceFile), length: id.getEnd() - id.getStart(sourceFile), newText: `${localName}: ${alias}.${propName}` };
      }
      if (parent && ts.isImportSpecifier(parent)) return null;
      if (parent && ts.isExportSpecifier(parent)) return null;
      return { start: id.getStart(sourceFile), length: id.getEnd() - id.getStart(sourceFile), newText: `${alias}.${propName}` };
    }, textChanges);
  }

  // De-dup / sort textChanges by start.
  textChanges.sort((a, b) => a.span.start - b.span.start);

  return {
    edits: [
      {
        fileName: sourceFile.fileName,
        textChanges,
      },
    ],
  };
}

function rewriteReferences(ts, sourceFile, name, transform, out) {
  const visit = (node) => {
    if (ts.isIdentifier(node) && node.text === name) {
      const r = transform(node);
      if (r) out.push({ span: { start: r.start, length: r.length }, newText: r.newText });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function safeAliased(checker, sym) {
  try {
    return checker.getAliasedSymbol(sym);
  } catch {
    return undefined;
  }
}

function stripModuleExt(p) {
  if (p.endsWith(".js") || p.endsWith(".ts")) return p.slice(0, -3);
  return p;
}

function rewriteSpecifierBasename(spec, newBasename) {
  // Preserve trailing ".js" / ".ts" if original had it.
  const ext = spec.endsWith(".js") ? ".js" : spec.endsWith(".ts") ? ".ts" : "";
  const trimmed = ext ? spec.slice(0, -3) : spec;
  const lastSlash = trimmed.lastIndexOf("/");
  const dir = lastSlash >= 0 ? trimmed.slice(0, lastSlash + 1) : "";
  const target = newBasename.endsWith(".js") || newBasename.endsWith(".ts")
    ? newBasename.slice(0, -3)
    : newBasename;
  return `${dir}${target}${ext}`;
}

function reorderImportFixes(fixes, symbolName, moveUpRegexes, moveDownRegexes, overrideBySymbol) {
  // Collect indexes + module specs for fixes that look like import fixes.
  const slots = [];
  const tagged = [];
  fixes.forEach((f, i) => {
    const mod = extractImportModule(f);
    if (mod) {
      slots.push(i);
      tagged.push({ fix: f, mod });
    }
  });
  if (tagged.length <= 1 && !overrideBySymbol.has(symbolName)) return fixes;

  // Sort by descending priority key.
  tagged.sort((a, b) => orderKey(b.mod, moveUpRegexes, moveDownRegexes) - orderKey(a.mod, moveUpRegexes, moveDownRegexes));

  // Override: pull override-target to the top.
  const overrideMod = overrideBySymbol.get(symbolName);
  if (overrideMod) {
    const oi = tagged.findIndex((t) => t.mod === overrideMod);
    if (oi > 0) {
      const [hit] = tagged.splice(oi, 1);
      tagged.unshift(hit);
    }
  }

  const out = fixes.slice();
  slots.forEach((idx, j) => {
    out[idx] = tagged[j].fix;
  });
  return out;
}

function orderKey(moduleSpec, moveUpRegexes, moveDownRegexes) {
  // Mirrors the `compare` from the old TS patch.
  const def = moveDownRegexes.length;
  let idx = moveUpRegexes.findLastIndex((re) => re.test(moduleSpec)) + def + 1;
  if (idx === def) {
    idx = moveDownRegexes.findLastIndex((re) => re.test(moduleSpec));
  }
  if (idx === -1) idx = def;
  return idx;
}

function applyPreferNamespaceFilters(fixes, rules, symbolName, log) {
  const tagged = fixes.map((fix) => ({ fix, module: extractImportModule(fix) }));
  const dropIdx = new Set();

  for (const rule of rules) {
    const prefer = Array.isArray(rule.prefer) ? rule.prefer : [];
    const hide = Array.isArray(rule.hide) ? rule.hide : [];
    if (prefer.length === 0 && hide.length === 0) continue;

    const onTargetPreferredExists = tagged.some((t) => {
      if (!t.module || !isSubmoduleSpec(t.module)) return false;
      if (!matchesAnyPattern(t.module, prefer)) return false;
      return extractFirstSubSegment(t.module, prefer) === symbolName;
    });
    const onTargetSubmoduleExists = onTargetPreferredExists || tagged.some((t) => {
      if (!t.module || !isSubmoduleSpec(t.module)) return false;
      if (!matchesAnyPattern(t.module, hide)) return false;
      return extractFirstSubSegment(t.module, hide) === symbolName;
    });

    tagged.forEach((t, i) => {
      if (!t.module) return;
      const inPrefer = prefer.length > 0 && matchesAnyPattern(t.module, prefer);
      const inHide = hide.length > 0 && matchesAnyPattern(t.module, hide);
      if (!inPrefer && !inHide) return;
      const isSub = isSubmoduleSpec(t.module);

      if (inPrefer && !isSub) {
        dropIdx.add(i);
        if (log) log(`drop preferred root "${t.module}"`);
        return;
      }
      if (isSub && onTargetSubmoduleExists) {
        const patterns = inPrefer ? prefer : hide;
        const tail = extractFirstSubSegment(t.module, patterns);
        if (tail !== symbolName) {
          dropIdx.add(i);
          if (log) log(`drop off-target submodule "${t.module}" (symbol=${symbolName})`);
          return;
        }
      }
      if (inHide && onTargetPreferredExists) {
        dropIdx.add(i);
        if (log) log(`drop hide "${t.module}" (on-target preferred submodule for ${symbolName} exists)`);
      }
    });
  }

  if (dropIdx.size === 0) return fixes;
  return tagged.filter((_, i) => !dropIdx.has(i)).map((t) => t.fix);
}

function extractFirstSubSegment(spec, patterns) {
  for (const p of patterns) {
    if (p.endsWith("/")) {
      if (!spec.startsWith(p)) continue;
      const rest = spec.slice(p.length); // "<pkg>" or "<pkg>/<sub>/..."
      const firstSlash = rest.indexOf("/");
      if (firstSlash < 0) return undefined; // root of scoped pkg
      const afterPkg = rest.slice(firstSlash + 1);
      const nextSlash = afterPkg.indexOf("/");
      return nextSlash < 0 ? afterPkg : afterPkg.slice(0, nextSlash);
    }
    if (spec === p) return undefined; // bare root
    if (spec.startsWith(p + "/")) {
      const rest = spec.slice(p.length + 1);
      const slash = rest.indexOf("/");
      return slash < 0 ? rest : rest.slice(0, slash);
    }
  }
  return undefined;
}

function isSubmoduleSpec(spec) {
  if (spec.startsWith("@")) return spec.split("/").length > 2;
  return spec.includes("/");
}

function matchesAnyPattern(spec, patterns) {
  for (const p of patterns) {
    if (p.endsWith("/")) {
      if (spec.startsWith(p)) return true;
    } else {
      if (spec === p || spec.startsWith(p + "/")) return true;
    }
  }
  return false;
}

function extractImportModule(fix) {
  if (!fix) return undefined;
  const isImport = fix.fixName === "import" || fix.fixName === "preferNamespaceImport";
  if (!isImport) return undefined;
  const descMatch = fix.description && /from\s+["']([^"']+)["']/.exec(fix.description);
  if (descMatch) return descMatch[1];
  if (Array.isArray(fix.changes)) {
    for (const ch of fix.changes) {
      if (!Array.isArray(ch.textChanges)) continue;
      for (const tc of ch.textChanges) {
        const m = /from\s+["']([^"']+)["']/.exec(tc.newText || "");
        if (m) return m[1];
      }
    }
  }
  return undefined;
}

function getIdentifierText(ts, sourceFile, start, end) {
  const node = findTokenAt(ts, sourceFile, start);
  if (node && ts.isIdentifier(node)) return node.text;
  const text = sourceFile.text.slice(start, end);
  return /^[A-Za-z_$][\w$]*$/.test(text) ? text : undefined;
}

function findTokenAt(ts, sourceFile, pos) {
  function visit(node) {
    if (pos < node.getStart(sourceFile) || pos >= node.getEnd()) return undefined;
    let found;
    node.forEachChild((child) => {
      if (found) return;
      const f = visit(child);
      if (f) found = f;
    });
    return found || node;
  }
  return visit(sourceFile);
}

function alreadyImported(ts, sourceFile, name, moduleSpecifier) {
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const spec = stmt.moduleSpecifier;
    if (!spec || !ts.isStringLiteral(spec)) continue;
    if (spec.text !== moduleSpecifier) continue;
    const clause = stmt.importClause;
    if (!clause) continue;
    if (clause.name && clause.name.text === name) return true;
    const bindings = clause.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings) && bindings.name.text === name) return true;
    if (ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) {
        if (el.name.text === name) return true;
      }
    }
  }
  return false;
}

function getImportInsertion(ts, sourceFile) {
  let lastImportEnd = -1;
  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt) || ts.isImportEqualsDeclaration(stmt)) {
      lastImportEnd = stmt.end;
    } else if (lastImportEnd !== -1) {
      break;
    }
  }
  if (lastImportEnd !== -1) {
    return { insertPos: lastImportEnd, prefix: "\n", suffix: "" };
  }
  return { insertPos: 0, prefix: "", suffix: "\n" };
}

module.exports = init;
