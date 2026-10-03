// Local oxlint JS plugin: keep the `TaggedRequestFor("...")` literal in every
// RPC resource in sync with the file path, and auto-fix it.
//
// This replaces the old `codegen:start {preset: meta}` block. The module name
// (the `${moduleName}.${tag}` RPC wire prefix) stays a string LITERAL in source
// — so `id`/`moduleName` keep precise literal types everywhere they are consumed
// (notably the frontend, which imports these files as source) — but the literal
// is derived and corrected by `oxlint --fix` instead of a codegen generator.

const STRIP_ROOTS = new Set([])
const STRIP_SUFFIXES = [".Queries", ".Commands"]

/** Derive the RPC module name from a resource file path. Mirrors
 * api/src/resources/lib/moduleName.ts. Returns undefined when not derivable. */
function moduleNameFromPath(filePath) {
  const norm = filePath.replace(/\\/g, "/")
  const i = norm.lastIndexOf("src/")
  if (i === -1) return undefined
  let rel = norm.substring(i + "src/".length).replace(/\.(ts|tsx|mts|cts|js|mjs|cjs)$/, "")
  for (const suffix of STRIP_SUFFIXES) {
    if (rel.endsWith(suffix)) {
      rel = rel.slice(0, -suffix.length)
      break
    }
  }
  const segments = rel.split("/")
  const start = segments.length > 0 && STRIP_ROOTS.has(segments[0]) ? 1 : 0
  const out = []
  for (let k = start; k < segments.length; k++) {
    const segment = segments[k]
    if (segment === "resources") continue
    if (out.length === 0 || out[out.length - 1] !== segment) out.push(segment)
  }
  return out.join("/")
}

// `TaggedRequestFor(...)` call, with an optional single string literal argument.
// Negative lookbehind keeps it from matching `makeTaggedRequestFor(` or a
// `{ TaggedRequestFor }` destructure (no `(` follows there anyway).
const CALL_RE = /(?<![\w.])TaggedRequestFor\(\s*(?:(["'])((?:\\.|(?!\1)[^\\])*)\1)?\s*\)/g

const rule = {
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: { description: "Keep TaggedRequestFor(\"...\") in sync with the resource file path" }
  },
  create(context) {
    return {
      Program(program) {
        const filename = context.physicalFilename
        // Only resource files declare RPC modules; skip the lib wrapper itself.
        if (!/[\\/]resources[\\/]/.test(filename) || /[\\/]resources[\\/]lib[\\/]/.test(filename)) return
        const moduleName = moduleNameFromPath(filename)
        if (moduleName === undefined || moduleName === "") return

        const source = context.sourceCode.getText()
        const re = new RegExp(CALL_RE.source, CALL_RE.flags)
        let match
        while ((match = re.exec(source)) !== null) {
          const expected = `TaggedRequestFor(${JSON.stringify(moduleName)})`
          if (match[0] === expected) continue
          const start = match.index
          const end = match.index + match[0].length
          context.report({
            node: program,
            message: match[2] === undefined
              ? `TaggedRequestFor() is missing its module name; expected ${JSON.stringify(moduleName)}`
              : `TaggedRequestFor("${match[2]}") does not match the file path; expected ${JSON.stringify(moduleName)}`,
            fix(fixer) {
              return fixer.replaceTextRange([start, end], expected)
            }
          })
        }
      }
    }
  }
}

export default {
  meta: { name: "rpc-module-name" },
  rules: {
    "module-name": rule
  }
}
