import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// `vi.hoisted`, because `vi.mock` is lifted above every other statement in the
// file — a plain `const` above it is still in its temporal dead zone when the
// factory runs.
const { envValues } = vi.hoisted(() => ({
  envValues: {} as Record<string, string | undefined>,
}))

vi.mock('@/lib/env', () => ({ env: envValues }))

import { checkBackupFreshness, MAX_BACKUP_AGE_HOURS } from '@/services/backup-watch.service'

const NOW = new Date('2026-08-14T08:00:00Z')

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 3_600_000).toISOString()
}

function githubReturns(runs: Array<{ updated_at: string }>) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ workflow_runs: runs }),
  })) as unknown as typeof fetch
}

beforeEach(() => {
  envValues.BACKUP_REPO = 'owner/repo'
  envValues.BACKUP_WATCH_TOKEN = 'tok_test'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('watching a backup that may have stopped being scheduled', () => {
  it('is fresh when a run succeeded last night', async () => {
    vi.stubGlobal('fetch', githubReturns([{ updated_at: hoursAgo(6) }]))

    const status = await checkBackupFreshness(NOW)

    expect(status.state).toBe('fresh')
  })

  it('is stale once the backup has missed too many nights', async () => {
    vi.stubGlobal('fetch', githubReturns([{ updated_at: hoursAgo(MAX_BACKUP_AGE_HOURS + 1) }]))

    const status = await checkBackupFreshness(NOW)

    expect(status.state).toBe('stale')
  })

  it('tolerates one late or skipped night without crying wolf', async () => {
    // A daily backup at 03:30 checked at 08:00 is ~28h old on a normal day and
    // ~52h if one night is missed. The window sits between, so a single blip is
    // not an alarm but a stopped schedule is.
    vi.stubGlobal('fetch', githubReturns([{ updated_at: hoursAgo(30) }]))

    expect((await checkBackupFreshness(NOW)).state).toBe('fresh')
  })

  it('treats "never succeeded" as a finding, not as a blind spot', async () => {
    // GitHub answered. The answer is that this workflow has never completed
    // successfully, which is real news rather than an inability to see.
    vi.stubGlobal('fetch', githubReturns([]))

    const status = await checkBackupFreshness(NOW)

    expect(status).toMatchObject({ state: 'stale', lastSuccessAt: null })
  })

  it('reports "cannot see" rather than "fine" when the token is missing', async () => {
    // The distinction the whole service turns on. An unwatched backup must never
    // be reported as a healthy one.
    envValues.BACKUP_WATCH_TOKEN = undefined
    const fetchSpy = githubReturns([])
    vi.stubGlobal('fetch', fetchSpy)

    const status = await checkBackupFreshness(NOW)

    expect(status.state).toBe('unknown')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('reports "cannot see" when the repository is not configured', async () => {
    envValues.BACKUP_REPO = undefined

    expect((await checkBackupFreshness(NOW)).state).toBe('unknown')
  })

  it('reports "cannot see" when GitHub refuses, and never says fine', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })))

    const status = await checkBackupFreshness(NOW)

    expect(status.state).toBe('unknown')
    expect(status.state).not.toBe('fresh')
  })

  it('reports "cannot see" when GitHub is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ENOTFOUND api.github.com') }))

    expect((await checkBackupFreshness(NOW)).state).toBe('unknown')
  })

  it('never puts the token in the reason it reports', async () => {
    // The reason travels into an alert emailed to every administrator. The error
    // thrown here deliberately quotes the token, which is what an error raised
    // from inside a fetch stack can do when it echoes the request it was given.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('request failed: Bearer tok_test') }))

    const status = await checkBackupFreshness(NOW)

    expect(status.state).toBe('unknown')
    if (status.state !== 'unknown') throw new Error('expected unknown')
    expect(status.reason).not.toContain('tok_test')
    expect(status.reason).toContain('[redacted]')
  })

  it('sends the token as a bearer credential and asks only for successes', async () => {
    const fetchSpy = githubReturns([{ updated_at: hoursAgo(2) }])
    vi.stubGlobal('fetch', fetchSpy)

    await checkBackupFreshness(NOW)

    const [url, init] = (fetchSpy as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(url).toContain('/repos/owner/repo/actions/workflows/backup.yml/runs')
    expect(url).toContain('status=success')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok_test')
  })

  it('asks by workflow file name, not by its display name', async () => {
    // The `name:` in the workflow is prose and may be reworded; the path is what
    // the repository is keyed on.
    const fetchSpy = githubReturns([{ updated_at: hoursAgo(2) }])
    vi.stubGlobal('fetch', fetchSpy)

    await checkBackupFreshness(NOW)

    const [url] = (fetchSpy as unknown as { mock: { calls: [string][] } }).mock.calls[0]
    expect(url).toContain('backup.yml')
    expect(url).not.toContain('Backup%20')
  })
})
