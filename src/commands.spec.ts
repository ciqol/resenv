import { spawnSync } from 'node:child_process'
import type { SpawnSyncReturns } from 'node:child_process'
import { expect, test, vi } from 'vitest'
import { resolveCommands } from './commands.js'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))

const run = vi.mocked(spawnSync)
const debug = Object.assign(vi.fn(), { enabled: false })
const posix = test.skipIf(process.platform === 'win32')

function result (overrides: Partial<SpawnSyncReturns<Buffer<ArrayBuffer>>> = {}): SpawnSyncReturns<Buffer<ArrayBuffer>> {
  return { pid: 0, output: [], status: 0, signal: null, stdout: Buffer.from('dummy-result\n\n'), stderr: Buffer.alloc(0), ...overrides }
}

test('a plain environment is copied without invoking a command or validating its deadline', () => {
  const env = { TOKEN: 'literal', UNSET: undefined }
  run.mockClear()
  expect(resolveCommands(env, { commandTimeoutMs: 0 }, debug)).toEqual(env)
  expect(run).not.toHaveBeenCalled()
})

posix('all command expressions and deadlines are validated before spawning', () => {
  run.mockClear()
  for (const commandTimeoutMs of [-1, 0, 1.5, NaN, Infinity, 2147483648]) {
    expect(() => resolveCommands({ TOKEN: '$(dummy)' }, { commandTimeoutMs }, debug)).toThrowError(expect.objectContaining({ code: 'INVALID_OPTIONS' }))
  }
  for (const invalid of ['$()', '$(incomplete', 'prefix$(embedded)']) {
    expect(() => resolveCommands({ FIRST: '$(dummy)', SECOND: invalid }, {}, debug)).toThrowError(expect.objectContaining({ code: 'INVALID_COMMAND_VALUE' }))
  }
  expect(run).not.toHaveBeenCalled()
})

posix('command output stays literal, trims only trailing LF and clears captured buffers', () => {
  const output = result({ stdout: Buffer.from(' $(must-not-run) \n\n'), stderr: Buffer.from('dummy-stderr') })
  run.mockReturnValueOnce(output)
  const env = { TOKEN: '$(dummy)', PLAIN: 'keep' }
  expect(resolveCommands(env, { commandTimeoutMs: 1234 }, debug)).toEqual({ TOKEN: ' $(must-not-run) ', PLAIN: 'keep' })
  expect(env.TOKEN).toBe('$(dummy)')
  expect(run).toHaveBeenLastCalledWith('/bin/sh', ['-c', 'dummy'], expect.objectContaining({ env, timeout: 1234, maxBuffer: 65536, detached: true }))
  expect(output.stdout.every(byte => byte === 0)).toBe(true)
  expect(output.stderr.every(byte => byte === 0)).toBe(true)
})

posix('invalid UTF-8 and null bytes fail and clear captured buffers', () => {
  for (const stdout of [Buffer.from([0xff]), Buffer.from('before\0after')]) {
    const output = result({ stdout })
    run.mockReturnValueOnce(output)
    expect(() => resolveCommands({ TOKEN: '$(dummy)' }, {}, debug)).toThrowError(expect.objectContaining({ code: 'INVALID_ENV_VALUE' }))
    expect(stdout.every(byte => byte === 0)).toBe(true)
  }
})

posix('timeouts and failed commands clean up their process groups without leaking output', () => {
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => { throw Object.assign(new Error('dummy-sensitive-cleanup'), { code: 'ESRCH' }) })
  for (const [error, code] of <readonly (readonly [NodeJS.ErrnoException | undefined, string])[]>[[Object.assign(new Error('dummy-sensitive-timeout'), { code: 'ETIMEDOUT' }), 'COMMAND_TIMEOUT'], [undefined, 'COMMAND_FAILED']]) {
    const output = result({ pid: 123, status: 1, error, stdout: Buffer.from('dummy-sensitive-stdout'), stderr: Buffer.from('dummy-sensitive-stderr') })
    run.mockReturnValueOnce(output)
    expect(() => resolveCommands({ TOKEN: '$(dummy)' }, {}, debug)).toThrowError(expect.objectContaining({ code }))
    expect(kill).toHaveBeenLastCalledWith(-123, 'SIGKILL')
    expect(output.stdout.every(byte => byte === 0)).toBe(true)
    expect(output.stderr.every(byte => byte === 0)).toBe(true)
  }
})

posix('unexpected cleanup or spawn failures produce safe errors', () => {
  vi.spyOn(process, 'kill').mockImplementation(() => { throw Object.assign(new Error('dummy-sensitive-cleanup'), { code: 'EPERM' }) })
  run.mockReturnValueOnce(result({ pid: 123, signal: 'SIGTERM', status: null }))
  expect(() => resolveCommands({ TOKEN: '$(dummy)' }, {}, debug)).toThrowError(expect.objectContaining({ code: 'COMMAND_CLEANUP_FAILED' }))
  run.mockImplementationOnce(() => { throw new Error('dummy-sensitive-spawn') })
  expect(() => resolveCommands({ TOKEN: '$(dummy)' }, {}, debug)).toThrowError(expect.objectContaining({ code: 'COMMAND_FAILED' }))
})
