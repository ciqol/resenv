import assert from 'node:assert/strict'
import { test } from 'vitest'
import { references } from './references.js'

const env = { TOKEN: 'doppler://my-app/dev/API_KEY', DOPPLER_TOKEN: 'unused' }

test('Doppler reference grammar rejects executable text and ambiguous selectors', () => {
  for (const value of ['doppler://UPPER/dev/KEY', 'doppler://p/dev/KEY?host=elsewhere', 'doppler://p/dev/KEY#other', 'doppler://p/../KEY', 'doppler://p/dev/$(echo bad)', 'doppler://user@p/dev/KEY', 'doppler://p:443/dev/KEY', 'doppler://p/dev/%00', 'doppler://p/dev/%ZZ']) {
    assert.throws(() => references({ TOKEN: value }), { code: 'DOPPLER_INVALID_REFERENCE' })
  }
  assert.deepEqual(references({ PLAIN: 'literal', TOKEN: 'doppler://p/dev/payments%2Fapi.key' }), [
    { name: 'TOKEN', project: 'p', config: 'dev', key: 'payments/api.key' }
  ])
  assert.throws(() => references(Object.fromEntries(Array.from({ length: 129 }, (_, index) => [`KEY${index}`, env.TOKEN]))), { code: 'DOPPLER_TOO_MANY_REFERENCES' })
})
