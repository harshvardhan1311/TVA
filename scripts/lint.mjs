/*
 * Lint runner for TVA.
 *
 * `oxlint` on its own walks the project directory, but on this machine the
 * walker returns zero files (the repo lives under an ancestor .gitignore that
 * lists `Downloads/`, and the walk silently yields nothing even outside it).
 * A false-green lint is worse than no lint, so this runner enumerates `src`
 * itself and hands oxlint an explicit file list, which it does honour.
 *
 * Usage: node scripts/lint.mjs   (also wired to `npm run lint`)
 */

import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SOURCE_DIRS = ['src', 'scripts']
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const SKIP = new Set(['node_modules', 'dist', 'coverage'])

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')))) out.push(full)
  }
  return out
}

const targets = SOURCE_DIRS.flatMap((dir) => walk(join(ROOT, dir))).filter((f) => !f.endsWith('.d.ts'))

if (targets.length === 0) {
  console.error('lint: no source files found under src/ — refusing to report success.')
  process.exit(1)
}

console.log(`lint: ${targets.length} files`)

const result = spawnSync('oxlint', targets, { cwd: ROOT, stdio: 'inherit', shell: true })

if (result.error) {
  console.error(`lint: could not run oxlint — ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
