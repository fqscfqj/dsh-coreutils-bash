import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const profile = process.argv[2] || process.env.DSH_PROFILE_DIR
if (!profile) throw new Error('Pass the DSH profile directory or set DSH_PROFILE_DIR')
const requireFromProfile = createRequire(resolve(profile, 'package.json'))
for (const entry of ['executor', 'terminal']) {
  const url = pathToFileURL(requireFromProfile.resolve(`dsh-coreutils-bash/${entry}`))
  const plugin = await import(url.href)
  assert.ok(plugin.Config && Array.isArray(plugin.inject), `invalid ${entry} plugin exports`)
  console.log(`${entry}: ${plugin.name}`)
}
