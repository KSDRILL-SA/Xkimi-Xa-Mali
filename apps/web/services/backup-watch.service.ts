import { env } from '@/lib/env'

/**
 * Watching the backup from outside the thing that runs it.
 *
 * `.github/workflows/backup.yml` alerts loudly when a backup run **fails**. It
 * has no way to alert when a run never happens, because the alert is a job in
 * the same workflow — if nothing is scheduled, nothing runs, and nothing speaks.
 * The file's own header warns that a backup which fails silently is worse than
 * none, "because it is believed"; a backup that stops being *scheduled* is that
 * same failure with no error anywhere to find.
 *
 * And it is not hypothetical. GitHub disables scheduled workflows after roughly
 * 60 days without repository activity. The moment this system is finished enough
 * to stop being committed to every week is the moment its backups quietly stop —
 * the precise point at which the records matter most and nobody is looking.
 *
 * So the watcher lives here, in the app, which keeps running on its own
 * schedule whatever GitHub does to its. It asks GitHub one question: when did
 * the Backup workflow last complete successfully?
 *
 * **It never reads the backup itself, and could not.** The artefact is encrypted
 * to a public key whose private half is deliberately not in CI. This checks that
 * a run happened, not that its contents are good — the restore drill is the only
 * thing that can tell you that, and it is still owed.
 */

/** Beyond this, a daily backup has missed too many turns to be a blip. */
export const MAX_BACKUP_AGE_HOURS = 50

/** How long to wait on GitHub before giving up and reporting that we cannot see. */
const REQUEST_TIMEOUT_MS = 10_000

export type BackupStatus =
  /** A successful run inside the window. */
  | { state: 'fresh'; lastSuccessAt: string; ageHours: number }
  /** Runs exist, but the most recent success is too old — or there is none. */
  | { state: 'stale'; lastSuccessAt: string | null; ageHours: number | null }
  /**
   * The check could not be performed. Deliberately its own state: "we cannot
   * see the backup" must never be reported as "the backup is fine", and it is
   * not the same alarm as "the backup has stopped".
   */
  | { state: 'unknown'; reason: string }

type WorkflowRun = { status: string; conclusion: string | null; updated_at: string }

/** Remove the credential from anything that is about to be reported to a human. */
function scrub(text: string, token: string): string {
  return token ? text.split(token).join('[redacted]') : text
}

/**
 * Ask GitHub when the Backup workflow last succeeded.
 *
 * Returns `unknown` rather than throwing for every failure mode — no token, a
 * rate limit, GitHub being down, a renamed workflow. The caller turns that into
 * a quieter alert than a genuine staleness, because an outage at GitHub and a
 * dead backup schedule warrant different responses and only one of them is
 * urgent tonight.
 */
export async function checkBackupFreshness(now: Date = new Date()): Promise<BackupStatus> {
  const repo = env.BACKUP_REPO
  const token = env.BACKUP_WATCH_TOKEN

  if (!repo || !token) {
    return {
      state: 'unknown',
      reason: 'BACKUP_REPO or BACKUP_WATCH_TOKEN is not set, so the backup cannot be watched.',
    }
  }

  // `backup.yml` by file name rather than by display name: the workflow's `name:`
  // is prose and may be reworded, while the path is what the repository is
  // actually keyed on.
  const url =
    `https://api.github.com/repos/${repo}/actions/workflows/backup.yml/runs` +
    `?status=success&per_page=1`

  let payload: { workflow_runs?: WorkflowRun[] }
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    })

    if (!res.ok) {
      // The status only. A body from GitHub can echo the request, and the
      // request carries the token.
      return { state: 'unknown', reason: `GitHub returned ${res.status} for the workflow history.` }
    }

    payload = (await res.json()) as { workflow_runs?: WorkflowRun[] }
  } catch (err) {
    // Scrubbed. This reason is carried into an alert that goes out by email to
    // every administrator, and an error thrown from deep in a fetch stack can
    // quote the request it was given — which carries the token in a header.
    // Unlikely, and cheap to make impossible.
    const raw = err instanceof Error ? err.message : String(err)
    return { state: 'unknown', reason: `Could not reach GitHub: ${scrub(raw, token)}` }
  }

  const runs = payload.workflow_runs ?? []
  const latest = runs[0]

  if (!latest) {
    // Not `unknown`. GitHub answered, and the answer was that this workflow has
    // never completed successfully — which is a real finding, not a blind spot.
    return { state: 'stale', lastSuccessAt: null, ageHours: null }
  }

  const lastSuccessAt = latest.updated_at
  const ageHours = (now.getTime() - new Date(lastSuccessAt).getTime()) / 3_600_000

  return ageHours > MAX_BACKUP_AGE_HOURS
    ? { state: 'stale', lastSuccessAt, ageHours }
    : { state: 'fresh', lastSuccessAt, ageHours }
}
