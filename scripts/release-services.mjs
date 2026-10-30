import assert from 'node:assert/strict'

export async function githubRequest (method, suffix, body) {
  const response = await fetch(`https://api.github.com/repos/ciqol/resenv${suffix}`, {
    method, headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, redirect: 'error', signal: AbortSignal.timeout(30000)
  })
  if (response.status === 404 && method === 'GET' && /^\/git\/ref\/tags\//.test(suffix)) return null
  assert.ok(response.ok, `GitHub ${method} ${suffix} failed (${response.status})`)
  return response.json()
}

export async function registryMetadata () {
  const response = await fetch('https://registry.npmjs.org/@ciqol%2fresenv', { redirect: 'error', signal: AbortSignal.timeout(30000) })
  if (response.ok) return response.json()
  assert.equal(response.status, 404, `Registry lookup failed (${response.status})`)
  return null
}

export async function listReleases (github = githubRequest) {
  const releases = []
  for (let page = 1; page <= 100; page++) {
    const batch = await github('GET', `/releases?per_page=100&page=${page}`)
    releases.push(...batch)
    if (batch.length < 100) return releases
  }
  assert.fail('Release history exceeds the supported pagination bound')
}

export async function uploadAsset (release, name, bytes) {
  assert.ok(Number.isSafeInteger(release.id) && release.id > 0)
  const response = await fetch(`https://uploads.github.com/repos/ciqol/resenv/releases/${release.id}/assets?name=${encodeURIComponent(name)}`, {
    method: 'POST', headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'content-type': 'application/octet-stream' },
    body: bytes, redirect: 'error', signal: AbortSignal.timeout(120000)
  })
  assert.ok(response.ok, `Release asset upload failed (${response.status})`)
  return response.json()
}

export async function downloadAsset (asset) {
  assert.ok(Number.isSafeInteger(asset.id) && asset.id > 0)
  const response = await fetch(`https://api.github.com/repos/ciqol/resenv/releases/assets/${asset.id}`, {
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/octet-stream' }, redirect: 'manual', signal: AbortSignal.timeout(30000)
  })
  let payload = response
  if (response.status === 302) {
    const url = new URL(response.headers.get('location'))
    assert.equal(url.protocol, 'https:')
    assert.ok(['release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(url.hostname))
    // Never forward the repository token to the asset host.
    payload = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(120000) })
  }
  assert.ok(payload.ok, `Release asset download failed (${payload.status})`)
  assert.ok(Number(payload.headers.get('content-length') ?? 0) < 64 * 1024 * 1024, 'Release asset exceeds size limit')
  const bytes = Buffer.from(await payload.arrayBuffer())
  assert.ok(bytes.length < 64 * 1024 * 1024, 'Release asset exceeds size limit')
  return bytes
}
