const fs = require('node:fs')
const { execFileSync } = require('node:child_process')

const runners = {
  'snake-linux-x64-appimage': 'ubuntu-latest',
  'snake-linux-arm64-appimage': 'ubuntu-24.04-arm',
  'snake-darwin-arm64-app.zip': 'macos-latest',
  'snake-darwin-x64-app.zip': 'macos-26-intel',
  'snake-win32-x64-msix': 'windows-latest'
}

function selectArtifacts(run, artifacts, repository) {
  if (
    run.path !== '.github/workflows/build.yml' ||
    run.event !== 'workflow_dispatch' ||
    run.head_branch !== 'main' ||
    run.head_repository?.full_name !== repository ||
    run.status !== 'completed'
  ) {
    throw new Error('Expected a completed desktop build from this repository main branch')
  }
  const matrix = artifacts
    .filter(({ name, expired }) => expired === false && Object.hasOwn(runners, name))
    .map(({ name }) => ({ artifact: name, runner: runners[name] }))
  if (!matrix.length) throw new Error('No supported desktop app artifacts in this run')
  return matrix
}

if (require.main === module) {
  const { GH_REPO: repository, RUN_ID: runId, GITHUB_OUTPUT: output } = process.env
  if (!/^[1-9][0-9]*$/.test(runId || '')) throw new Error('Invalid workflow run ID')
  const endpoint = `repos/${repository}/actions/runs/${runId}`
  const api = (...args) =>
    JSON.parse(execFileSync('gh', ['api', ...args], { encoding: 'utf8' }))
  const run = api(endpoint)
  const artifacts = api(`${endpoint}/artifacts?per_page=100`, '--paginate', '--slurp').flatMap(
    (page) => page.artifacts
  )
  const matrix = selectArtifacts(run, artifacts, repository)
  fs.appendFileSync(output, `matrix=${JSON.stringify(matrix)}\nrun-id=${runId}\n`)
}

module.exports = selectArtifacts
