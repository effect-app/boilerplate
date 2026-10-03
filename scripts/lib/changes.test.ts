// Pins the change-detection rules. If a case here flips, detection drifted —
// fix before shipping, because validate-changed/agent-pre-push gate on these.
//
// Run: node --test scripts/lib/changes.test.ts
import assert from "node:assert/strict"
import { test } from "node:test"
import { classify, deriveGates, filterFiles } from "./changes.ts"

// ── exclusion filter ────────────────────────────────────────────────────────
test("filterFiles drops docs/wiki/infra/root-markdown", () => {
  assert.deepEqual(
    filterFiles(["api/x.ts", "docs/a.md", "wiki/b.md", ".infra/c.yaml", "README.md", "api/y.ts"]),
    ["api/x.ts", "api/y.ts"]
  )
})

test("filterFiles keeps package markdown so format gates fire", () => {
  assert.deepEqual(
    filterFiles([
      "api/src/Workflow/README.md",
      "frontend/README.md",
      "e2e/README.md",
      "docs/plan.md",
      "AGENTS.md"
    ]),
    [
      "api/src/Workflow/README.md",
      "frontend/README.md",
      "e2e/README.md"
    ]
  )
})

test("filterFiles drops repos/ in registry mode", () => {
  assert.deepEqual(filterFiles(["api/x.ts", "repos/effect/y.ts"], { linkedSource: false }), ["api/x.ts"])
})

test("filterFiles keeps repos/ when linkedSource forced", () => {
  assert.deepEqual(filterFiles(["api/x.ts", "repos/effect/y.ts"], { linkedSource: true }), [
    "api/x.ts",
    "repos/effect/y.ts"
  ])
})

// ── classify (split step) ───────────────────────────────────────────────────
test("classify: api bucket", () => {
  const s = classify(["api/src/foo.ts", "Dockerfile"])
  assert.equal(s.api, true)
  assert.equal(s.fe, false)
  assert.equal(s.e2e, false)
  assert.equal(s.shared, false)
})

test("classify: fe bucket", () => {
  const s = classify(["frontend/composables/x.ts", "Dockerfile.fe"])
  assert.equal(s.fe, true)
  assert.equal(s.api, false)
})

test("classify: e2e bucket", () => {
  const s = classify(["e2e/tests/home.spec.ts"])
  assert.equal(s.e2e, true)
})

test("classify: shared root configs", () => {
  for (
    const f of [
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "tsconfig.all.json",
      "tsconfig.base.json",
      "patches/madge.patch",
      "scripts/install-patched-compilers.ts",
      "scripts/tsgo-or-tsc.ts"
    ]
  ) {
    assert.equal(classify([f]).shared, true, `${f} should be shared`)
  }
})

test("classify: repos/ shared only when linked", () => {
  assert.equal(classify(["repos/effect/x.ts"], { linkedSource: false }).shared, false)
  assert.equal(classify(["repos/effect/x.ts"], { linkedSource: true }).shared, true)
})

// ── deriveGates ─────────────────────────────────────────────────────────────
test("deriveGates: api change rebuilds api compile but not fe", () => {
  const gates = deriveGates(["api/src/foo.ts"])
  assert.equal(gates.api_rebuild, true)
  assert.equal(gates.api_image_rebuild, true)
  assert.equal(gates.fe_rebuild, false)
  assert.equal(gates.e2e, false)
  assert.equal(gates.code, true)
})

test("deriveGates: package markdown triggers lint, not images", () => {
  const gates = deriveGates(["api/src/Workflow/README.md"])
  assert.equal(gates.api, true)
  assert.equal(gates.api_image_rebuild, false)
})

test("deriveGates: shared forces every rebuild", () => {
  const gates = deriveGates(["package.json"])
  assert.equal(gates.shared, true)
  assert.equal(gates.api_rebuild, true)
  assert.equal(gates.fe_rebuild, true)
})

test("deriveGates: workflow-only change is not code", () => {
  const gates = deriveGates([".github/workflows/publish-wiki.yml"])
  assert.equal(gates.code, false)
})
