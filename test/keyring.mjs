import assert from 'node:assert/strict'
import { createSystem } from '../dist/doppler/system.cjs'

// Run only inside the disposable Secret Service session created by CI.
assert.equal(process.platform, 'linux')
assert.ok(process.env.DBUS_SESSION_BUS_ADDRESS)
assert.ok(process.env.RESENV_TEST_KEYRING_HOME?.startsWith(process.env.RUNNER_TEMP + '/'))
const system = createSystem()
assert.equal(system.canStore, true)
assert.equal(system.read(), undefined)
try {
  system.write('dp.ct.dummy0123456789')
  assert.equal(system.read(), 'dp.ct.dummy0123456789')
  system.write('dp.ct.replacement0123456789')
  assert.equal(system.read(), 'dp.ct.replacement0123456789')
} finally {
  system.remove()
}
assert.equal(system.read(), undefined)
process.env.DBUS_SESSION_BUS_ADDRESS = `unix:path=${process.env.RESENV_TEST_KEYRING_HOME}/missing-bus`
assert.throws(() => system.read(), { code: 'DOPPLER_KEYRING_UNAVAILABLE' })
assert.throws(() => system.write('dp.ct.dummy0123456789'), { code: 'DOPPLER_KEYRING_UNAVAILABLE' })
console.log('Isolated Linux keyring: absent, write/readback, replace, delete and unavailable service passed.')
