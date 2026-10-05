#!/usr/bin/env node
/**
 * Checks the PUBLISHED artifact against every supported AI SDK major.
 *
 * The package's .d.ts files are emitted once, against the `ai` version in
 * devDependencies. Compiling the source against each major cannot catch a
 * declaration that only one major accepts, so this script tests what users
 * install instead:
 *
 *   1. `npm pack` the package once, which builds it (or reuse --tarball <path>).
 *   2. For each AI SDK version, create a throwaway consumer project, install that
 *      same tarball plus that `ai` version, and copy tests_compat/ai-sdk/consumer.ts.
 *   3. Run `tsc --noEmit` (strict, skipLibCheck) in each consumer.
 *
 * Usage:
 *   npm run test:ai-sdk-compat
 *   node scripts/check-ai-sdk-compat.mjs --tarball ./bedrock-agentcore-0.4.5.tgz
 *   node scripts/check-ai-sdk-compat.mjs --ai 6.0.172,7 --keep
 *
 * --ai takes exact versions or bare majors (a bare major N means ^N.0.0). The
 * default covers the oldest v6 the repo builds with plus the latest v6 and v7.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const consumerSource = join(root, 'tests_compat', 'ai-sdk', 'consumer.ts')
const typescriptVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).devDependencies.typescript

const { values } = parseArgs({
  options: {
    tarball: { type: 'string' },
    ai: { type: 'string', default: '6.0.172,6,7' },
    keep: { type: 'boolean', default: false },
  },
})

const workDir = mkdtempSync(join(tmpdir(), 'ai-sdk-compat-'))
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

function packTarball() {
  console.log('Packing bedrock-agentcore (npm runs the build first)...')
  const out = run('npm', ['pack', '--json', '--pack-destination', workDir], root)
  // The `prepare` build logs to stdout before npm prints the JSON report.
  return join(workDir, JSON.parse(out.slice(out.indexOf('\n[') + 1))[0].filename)
}

function checkVersion(tarball, spec) {
  const range = /^\d+$/.test(spec) ? `^${spec}.0.0` : spec
  const dir = join(workDir, `ai-${spec}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify(
      {
        name: `ai-sdk-${spec}-consumer`,
        private: true,
        type: 'module',
        dependencies: { 'bedrock-agentcore': `file:${tarball}`, ai: range },
        devDependencies: { typescript: typescriptVersion, '@types/node': '^20.0.0' },
      },
      null,
      2
    )
  )
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          skipLibCheck: true,
          noEmit: true,
          types: ['node'],
        },
        files: ['consumer.ts'],
      },
      null,
      2
    )
  )
  copyFileSync(consumerSource, join(dir, 'consumer.ts'))

  run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', '--loglevel=error'], dir)
  const aiVersion = JSON.parse(readFileSync(join(dir, 'node_modules', 'ai', 'package.json'), 'utf8')).version

  try {
    run('npx', ['tsc', '-p', 'tsconfig.json'], dir)
    console.log(`  PASS  ai@${aiVersion}`)
    return true
  } catch (error) {
    const errors = `${error.stdout || ''}${error.stderr || ''}`.split('\n')
    const shown = errors.filter((line) => /error TS|is not assignable to type 'string/.test(line)).slice(0, 12)
    console.log(`  FAIL  ai@${aiVersion}\n${shown.map((line) => `        ${line.slice(0, 300)}`).join('\n')}`)
    console.log('        (rerun with --keep to inspect the full tsc output)')
    return false
  }
}

let ok = true
try {
  const tarball = values.tarball ? resolve(values.tarball) : packTarball()
  console.log(`Checking ${tarball} against AI SDK ${values.ai}:`)
  for (const spec of values.ai.split(',').map((s) => s.trim())) {
    ok = checkVersion(tarball, spec) && ok
  }
} finally {
  if (values.keep) console.log(`Kept consumer projects in ${workDir}`)
  else rmSync(workDir, { recursive: true, force: true })
}
process.exit(ok ? 0 : 1)
