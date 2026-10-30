import { expect, it, vi } from 'vitest'
import { downloadAsset, githubRequest, listReleases } from './release-services.mjs'

it('downloads a signed GitHub asset without forwarding repository credentials', async () => {
  vi.stubEnv('GITHUB_TOKEN', 'dummy-repository-token')
  const fetch = vi.fn().mockResolvedValueOnce({ status: 302, headers: { get: () => 'https://release-assets.githubusercontent.com/dummy' } }).mockResolvedValueOnce({ ok: true, headers: { get: () => '4' }, arrayBuffer: async () => Buffer.from('test') })
  vi.stubGlobal('fetch', fetch)
  expect((await downloadAsset({ id: 123 })).toString()).toBe('test')
  expect(fetch.mock.calls[0][1].headers.authorization).toBe('Bearer dummy-repository-token')
  expect(fetch.mock.calls[1][1].headers).toBeUndefined()
})

it.each(['http://release-assets.githubusercontent.com/dummy', 'https://other.example/dummy'])('refuses an unexpected asset redirect %s', async location => {
  const fetch = vi.fn().mockResolvedValue({ status: 302, headers: { get: () => location } })
  vi.stubGlobal('fetch', fetch)
  await expect(downloadAsset({ id: 123 })).rejects.toThrow()
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('reads all reservation pages and supports an empty dispatch response', async () => {
  const github = vi.fn().mockResolvedValueOnce(Array.from({ length: 100 }, (_, id) => ({ id }))).mockResolvedValueOnce([{ id: 101 }])
  expect(await listReleases(github)).toHaveLength(101)
  expect(github).toHaveBeenLastCalledWith('GET', '/releases?per_page=100&page=2')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 204 }))
  expect(await githubRequest('POST', '/actions/workflows/ci.yml/dispatches', { ref: 'beta' })).toBeUndefined()
})
