// Compile KorkoBoardV2.sol and write:
//   ../contract/KorkoBoardV2.json          ABI + bytecode used by the backend and deploy script
//   ../contract/standard-input-v2.json     exact input to verify the source code on Snowtrace
// Usage: cd backend/chain/tools && npm install && npm run compile
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const solc = require('solc')
const here = path.dirname(fileURLToPath(import.meta.url))
const contractDir = path.join(here, '..', 'contract')
const NAME = 'KorkoBoardV2'

const sources = { [`${NAME}.sol`]: { content: fs.readFileSync(path.join(contractDir, `${NAME}.sol`), 'utf8') } }

// Add every imported OpenZeppelin file, recursively, so the standard input is self-contained.
function collect(file, content) {
  const imports = [...content.matchAll(/import\s+(?:\{[^}]*\}\s+from\s+)?"([^"]+)"/g)].map((m) => m[1])
  for (const imp of imports) {
    const resolved = imp.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(file), imp)) : imp
    if (sources[resolved]) continue
    const text = fs.readFileSync(require.resolve(resolved), 'utf8')
    sources[resolved] = { content: text }
    collect(resolved, text)
  }
}
collect(`${NAME}.sol`, sources[`${NAME}.sol`].content)

const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'cancun',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
}
const output = JSON.parse(solc.compile(JSON.stringify(input)))
const errors = (output.errors || []).filter((e) => e.severity === 'error')
for (const e of output.errors || []) console.error(e.formattedMessage)
if (errors.length) process.exit(1)

const c = output.contracts[`${NAME}.sol`][NAME]
fs.writeFileSync(path.join(contractDir, `${NAME}.json`), JSON.stringify({
  contractName: NAME, compiler: `solc ${solc.version()}`, abi: c.abi, bytecode: '0x' + c.evm.bytecode.object,
}, null, 1) + '\n')
fs.writeFileSync(path.join(contractDir, 'standard-input-v2.json'), JSON.stringify(input) + '\n')
console.log(`${NAME}: ${c.evm.bytecode.object.length / 2} bytes, ${Object.keys(sources).length} source files, solc ${solc.version()}`)
