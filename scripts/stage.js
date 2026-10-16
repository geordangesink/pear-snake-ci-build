const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const PearCI = require('pear-ci')
const pearRequire = createRequire(require.resolve('pear-ci'))
const PearLink = pearRequire('pear-link')

async function stage() {
  const snapshotPath = process.env.SNAPSHOT_PATH
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
  if (!Array.isArray(snapshot)) throw new Error('Snapshot must be a JSON array')

  const ci = new PearCI(
    Buffer.from(process.env.PRIMARY_KEY, 'hex'),
    process.env.NAMESPACE,
    snapshotPath,
    process.env.TARGET,
    path.join(process.env.RUNNER_TEMP, 'pear-stage-store'),
    process.env.DRY_RUN === 'true'
  )
  ci.on('diff', (diff) => console.log(diff))
  try {
    await ci.ready()
    const link = `pear://${ci.drive.core.id}`
    const expected = PearLink.parse(process.env.EXPECTED_UPGRADE_LINK).drive.key
    if (!expected || !ci.drive.key.equals(expected)) {
      throw new Error(
        `Staging identity produces ${link}, which differs from the expected upgrade link`
      )
    }
    console.log(`Stage drive: ${link}`)
    await ci.stage()
  } finally {
    await ci.close()
  }
}

stage().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
