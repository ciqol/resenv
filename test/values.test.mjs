import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isEnvironment, copyEnvironment, hasErrorCode } from '../dist/values.cjs'

test('environment validation accepts strings and unset values but rejects malformed worker data', () => {
  for (const value of [{}, { EMPTY: '', UNSET: undefined }, Object.assign(Object.create(null), { TOKEN: 'dummy-value' })]) {
    assert.equal(isEnvironment(value), true)
  }
  for (const value of [null, undefined, 'dummy-value', [], ['dummy-value'], { TOKEN: 1 }, { TOKEN: false }, { TOKEN: null }, { TOKEN: {} }, { TOKEN: ['dummy-value'] }]) {
    assert.equal(isEnvironment(value), false)
  }
})

test('environment copies retain special own names without inheriting or changing the source', () => {
  const source = Object.assign(Object.create({ INHERITED: 'must-not-copy' }), { TOKEN: 'dummy-value', UNSET: undefined })
  Object.defineProperty(source, '__proto__', { value: 'dummy-proto-value', enumerable: true })
  Object.defineProperty(source, 'HIDDEN', { value: 'must-not-copy' })
  const result = copyEnvironment(source)
  assert.equal(Object.getPrototypeOf(result), null)
  assert.deepEqual(Object.keys(result), ['TOKEN', 'UNSET', '__proto__'])
  assert.equal(result.__proto__, 'dummy-proto-value')
  result.TOKEN = 'dummy-replacement'
  assert.equal(source.TOKEN, 'dummy-value')
  assert.equal(Object.getPrototypeOf(source).INHERITED, 'must-not-copy')
})

test('error-code matching handles Error objects and ignores malformed thrown values', () => {
  assert.equal(hasErrorCode(Object.assign(new Error('dummy-detail'), { code: 'ESRCH' }), 'ESRCH'), true)
  assert.equal(hasErrorCode({ code: 'EPERM' }, 'ESRCH'), false)
  for (const err of [null, undefined, 'ESRCH', ['ESRCH'], {}, { code: 1 }]) {
    assert.equal(hasErrorCode(err, 'ESRCH'), false)
  }
})
