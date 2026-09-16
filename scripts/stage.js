const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const PearCI = require('pear-ci')
const pearRequire = createRequire(require.resolve('pear-ci'))
const Corestore = pearRequire('corestore')
const Hyperdrive = pearRequire('hyperdrive')
const PearLink = pearRequire('pear-link')

async function verifyIdentity({
  primaryKey,
  namespace,
  snapshot,
  storage,
  expectedUpgradeLink
}) {
  if (!Array.isArray(snapshot)) throw new Error('Snapshot must be a JSON array')
  const store = new Corestore(storage, { primaryKey, unsafe: true })
  let drive
  try {
    await store.ready()
    for (const entry of snapshot) {
      if (!Number.isSafeInteger(entry.length) || entry.length < 0) {
        throw new Error('Snapshot contains an invalid core length')
      }
      const key = PearLink.parse(`pear://${entry.key}`).drive.key
      if (!entry.namespace) continue
      const session = store.session({ namespace: Buffer.from(entry.namespace, 'hex') })
      try {
        const core = session.get({ name: entry.name })
        await core.ready()
        if (!core.key.equals(key)) {
          throw new Error(
            'Snapshot belongs to a different primary key; use the original app key'
          )
        }
        await core.close()
      } finally {
        await session.close()
      }
    }
    drive = new Hyperdrive(store.namespace(namespace))
    await drive.ready()
    const link = `pear://${drive.core.id}`
    if (expectedUpgradeLink) {
      const expected = PearLink.parse(expectedUpgradeLink).drive.key
      if (!expected || !drive.key.equals(expected)) {
        throw new Error(
          `Staging identity produces ${link}, which differs from the expected upgrade link`
        )
      }
    }
    return link
  } finally {
    await drive?.close()
    await store.close()
  }
}

async function stage() {
  const primaryKey = Buffer.from(process.env.PRIMARY_KEY, 'hex')
  const namespace = process.env.NAMESPACE
  const snapshotPath = process.env.SNAPSHOT_PATH
  const storage = path.join(process.env.RUNNER_TEMP, 'pear-stage-store')
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
  const link = await verifyIdentity({
    primaryKey,
    namespace,
    snapshot,
    storage,
    expectedUpgradeLink: process.env.EXPECTED_UPGRADE_LINK
  })
  console.log(`Stage drive: ${link}`)
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `pear-link=${link}\n`)
  const ci = new PearCI(
    primaryKey,
    namespace,
    snapshotPath,
    process.env.TARGET,
    storage,
    process.env.DRY_RUN === 'true'
  )
  ci.on('diff', (diff) => console.log(diff))
  ci.on('syncing', ({ key, length }) => console.log(`Syncing ${key} to length ${length}`))
  ci.on('mirrored', () => console.log('Waiting for seed peers to replicate the staged files'))
  ci.on('synced', () => console.log('Seed peers synced'))
  try {
    await ci.stage()
  } finally {
    await ci.close()
  }
}

module.exports = { verifyIdentity }

if (require.main === module) {
  stage().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
