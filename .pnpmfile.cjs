// TODO: Write a marker to package.json instead?
const enforceSingleVersion = [
    "effect",
    "@fp-ts/optic",
    "@effect/schema",
    "@effect-app/core",
    "@effect-app/infra-adapters",
    "@effect-app/fluent-extensions",
    "@effect-app/schema",
    "@effect-app/infra",
    "@effect-app/prelude",
    "@effect-app/react",
    "@effect-app/vue",
    "vue",
    "date-fns"
]

function afterAllResolved(lockfile, context) {
    context.log(`Checking duplicate packages`)
    const packagesKeys = Object.keys(lockfile.packages);
    const found = {}
    for (let p of packagesKeys) {
        for (let x of enforceSingleVersion) {
            if (p.startsWith(`/${x}/`)) {
                if (found[x]) {
                    found[x] += 1
                } else {
                    found[x] = 1
                }
            }
        }
    }
    let msg = ''
    for (let p in found) {
        const count = found[p]
        if (count > 1) {
            msg += `${p} found ${count} times\n`
        }
    }
    if (msg) {
        throw new Error(msg)
    }
    return lockfile
}

module.exports = {
    hooks: {
        afterAllResolved
    }
}
