import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { listReleases, registryMetadata } from './release-services.mjs'

assert.equal(process.argv.length, 3, 'Usage: node scripts/release-context.mjs <versions-file>')
const versions = Object.keys((await registryMetadata())?.versions ?? {})
versions.push(...(await listReleases()).map(release => release.tag_name))
writeFileSync(process.argv[2], JSON.stringify(versions))
