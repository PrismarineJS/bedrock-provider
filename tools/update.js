const cp = require('child_process')
const { join } = require('path')

const get = (url, out) => cp.execSync(`curl -o ${out} ${url}`)

function fetchLatestStable() {
  const path = join(__dirname, 'versions.json')
  get('https://raw.githubusercontent.com/minecraft-linux/mcpelauncher-versiondb/master/versions.json', path)
  const versions = require(path)
  for (let i = versions.length - 1; i > 0; i--) {
    const v = versions[i]
    if (!v.beta) return v.version_name
  }
}

function main() {
  const latest = fetchLatestStable()
  console.log('->', latest)
  const latestVer = latest.split('.').slice(0, -1).join('.') // get rid of the last .build
  console.log('Generating for', latestVer)
  cp.execSync('cd ../data && bedrock-extractor generate-maps ' + latestVer)
}

main()