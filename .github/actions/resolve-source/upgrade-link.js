const fs = require('node:fs')

function upgradeLink(packagePath, override = '', write = false) {
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  const link = override === '' ? pkg.upgrade : override
  const valid = /^pear:\/\/(?:[ybndrfg8ejkmcpqxot1uwisza345h769]{52}|[a-fA-F0-9]{64})$/

  if (typeof link !== 'string' || link !== link.trim() || !valid.test(link)) {
    throw new Error(
      'Set a valid Pear upgrade link in package.json or provide upgrade-key; refusing to build without OTA updates'
    )
  }

  if (write && pkg.upgrade !== link) {
    pkg.upgrade = link
    fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n')
  }
  return link
}

module.exports = upgradeLink

if (require.main === module) {
  const link = upgradeLink(
    process.argv[2] || 'package.json',
    process.env.UPGRADE_KEY || '',
    process.argv.includes('--write')
  )
  console.log(`Upgrade link: ${link}`)
}
