const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const upgradeLink = require('./upgrade-link')

const commit = execFileSync('git', ['-C', 'source', 'rev-parse', 'HEAD'], {
  encoding: 'utf8'
}).trim()
const link = upgradeLink('source/package.json', process.env.UPGRADE_KEY || '')

fs.appendFileSync(process.env.GITHUB_OUTPUT, `commit=${commit}\nupgrade-link=${link}\n`)
