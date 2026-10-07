import { beforeEach, expect, test, vi } from 'vitest'
import type * as Index from './index.js'
import { ResenvError, resolveEnv } from './index.js'

vi.mock('./index.js', async importOriginal => {
  const original = await importOriginal<typeof Index>()
  return { ...original, resolveEnv: vi.fn() }
})

beforeEach(() => {
  vi.resetModules()
  vi.mocked(resolveEnv).mockReset()
})

test('matching preloads resolve once and pass the selected mode', async () => {
  const { resolvePreload } = await import('./preload.js')
  resolvePreload('doppler')
  resolvePreload('doppler')
  expect(resolveEnv).toHaveBeenCalledTimes(1)
  expect(vi.mocked(resolveEnv).mock.calls[0]?.[0] === process.env).toBe(true)
  expect(vi.mocked(resolveEnv).mock.calls[0]?.[1]).toEqual({ inPlace: true, doppler: true })
})

test('an active preload blocks the CLI from resolving values again', async () => {
  const { assertNoPreload, resolvePreload } = await import('./preload.js')
  expect(assertNoPreload).not.toThrow()
  resolvePreload('commands')
  expect(vi.mocked(resolveEnv).mock.calls[0]?.[1]).toEqual({ inPlace: true, commands: true })
  expect(assertNoPreload).toThrowError(expect.objectContaining({ code: 'CONFLICTING_PRELOADS' }))
})

test('mixing preload modes exits before a second resolution', async () => {
  const { resolvePreload } = await import('./preload.js')
  const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('dummy-exit') })
  resolvePreload('doppler')
  expect(() => resolvePreload('commands')).toThrow('dummy-exit')
  expect(resolveEnv).toHaveBeenCalledTimes(1)
  expect(exit).toHaveBeenCalledWith(1)
  expect(write).toHaveBeenCalledWith(expect.stringContaining('CONFLICTING_PRELOADS'))
})

test('resolution failures produce one safe diagnostic and exit before startup', async () => {
  const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('dummy-exit') })
  for (const err of [new ResenvError('DOPPLER_ACCESS_DENIED', 'Dummy access denied'), new Error('dummy-sensitive-provider-detail')]) {
    write.mockClear()
    vi.resetModules()
    const preload = await import('./preload.js')
    vi.mocked(resolveEnv).mockImplementationOnce(() => { throw err })
    expect(() => preload.resolvePreload('doppler')).toThrow('dummy-exit')
    expect(write).toHaveBeenCalledTimes(1)
    expect(write.mock.calls[0]?.[0]).not.toContain('dummy-sensitive')
  }
})
