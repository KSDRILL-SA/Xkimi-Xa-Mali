# Due Diligence Pack

**Security posture, fund custody, and controls.**

| | |
|---|---|
| Audience | Sponsoring bank; Netcash risk; the Foundation's auditor |
| Prepared | 2026-08-14 |
| Verified against | The repository as at commit `893af3a` |
| Live status | **Pre-production.** No live transaction has been processed. |

> **On honesty in this document.** Everything claimed below is verifiable in the
> repository, and clause 8 states what has *not* been done. A due diligence pack
> that only lists strengths is not read as strong; it is read as incomplete.

---

## 1. What the Foundation is

A closed savings collective of **at most fifty members**, all known to one another
and admitted only by invitation with an existing member vouching for them. It is
not offered to the public, not advertised, and does not accept money from anyone
outside its membership.

This matters for risk assessment in two ways: there is **no anonymous customer
acquisition**, and the **maximum exposure is bounded** — fifty members at a
ceiling of R10 000 per month each.

| | |
|---|---|
| Membership cap | 50 (enforced in code) |
| Contribution range | R100 – R10 000 per month, in R50 steps |
| Theoretical maximum monthly collection | R500 000 |
| Collection method (today) | **None.** Members pay by transfer or in cash; an administrator records each payment against the member and the month, with proof of payment attached |
| Collection method (intended) | DebiCheck authenticated debit order. Built and dormant — the application was declined; see `collections-application-brief.md` |

---

## 2. Custody of funds

| Question | Answer |
|---|---|
| Where is the money held? | The Foundation's **ABSA** account, into which members pay directly. When a collections partner is appointed, collections settle into the Capitec Business account of KSDRILL SA (Pty) Ltd, held **in custody for the Foundation's members** under constitution clause 1.4A |
| Does the constitution say so? | Clause 6.1 as signed on 2026-08-24 names only the Capitec account. The amendment reconciling it is drafted in `resolution-2026-09-banking.md` and **is not yet signed** |
| Is it ever in a personal account? | **No.** Not a member's, not a leader's |
| Who can move it? | Only against a **Goal** agreed by the members |
| Can one leader move it alone? | **No** |
| Is there a double-entry ledger? | Yes — `LedgerEntry`, with account and direction |
| Can a payout be deleted from the record? | **No.** The audit log is append-only |
| Does the Foundation lend at interest? | No |
| Does it promise investment returns? | No |
| Does it take deposits from the public? | **No** — closed membership; see clause 1 |

---

## 3. Access control

| Control | Implementation |
|---|---|
| Authentication | Credential-based with hashed passwords; 12-character minimum on registration |
| Authorisation | Role-based access control |
| Session invalidation on privilege change | `roleVersion` counter — changing a user's roles invalidates their existing sessions rather than leaving elevated sessions live |
| Account lockout | Failed-attempt counter with time-bounded lock |
| Rate limiting | On authentication routes, invitation validation, and password reset |
| Administrative separation | Admin console is a separate application with its own front door |
| Privileged action recording | Every administrative action recorded with actor identity and timestamp |

---

## 4. Data protection

| Control | Implementation |
|---|---|
| Transport | TLS |
| SA ID numbers at rest | **Encrypted** — envelope encryption |
| Bank account numbers at rest | **Encrypted** — envelope encryption |
| Passwords | Hashed |
| Key rotation | Supported by the envelope format; documented three-step runbook |
| Decryption scope | At point of use only — mandate submission and identity verification |
| Logging of sensitive fields | Identifiers are not written to logs |
| POPIA consent | Captured with timestamp at registration |

Full processing register: `popia-compliance.md`.

---

## 5. Integrity of the financial record

| Control | Why it matters |
|---|---|
| **Append-only audit log** | No administrative action can be removed, including by the person who took it |
| **Double-entry ledger** | Movements balance; a one-sided entry is not representable |
| **Idempotency on financial operations** | 72-hour key TTL; a retry cannot collect twice |
| **One active mandate per member** | Enforced by a partial unique database index, not application logic — a race cannot create two |
| **Bounded retries** | Maximum of three collection attempts |
| **Webhook replay protection** | Each gateway event recorded once; duplicates are not reprocessed |
| **Webhook authenticity** | Signature verification against a shared secret; source IP restriction available |
| **Gateway desync detection** | Divergence between local and gateway state raises an alert rather than proceeding on a stale view |
| **Infrastructure failures distinguished from declines** | A member is never recorded as having failed to pay because a gateway was down |

---

## 6. Assurance activities completed

| Activity | Date | Outcome |
|---|---|---|
| Full-stack audit | 2026-06-05 | Security, auth, frontend and schema findings remediated |
| Dependency vulnerability remediation | 2026-07-24 | **63 → 0** |
| Performance audit | 2026-07-26 | Request path healthy; background job optimisations applied |
| **Adversarial security audit** | 2026-07-27 | 5 findings, all remediated |
| Authentication and role hardening | 2026-08-09 | Session invalidation, role integrity |
| Encryption key rotation capability | 2026-08-08 | Envelope format with documented runbook |
| Operational alerting | 2026-08-08 | Severity-routed alerting to a human |
| End-to-end integration sweep | 2026-08-14 | Both applications; 3 defects found and fixed |

**Automated test coverage: 1 542 tests, passing.** Typecheck, lint, test and build
gates are run before any change is merged.

---

## 7. Operational readiness

| Capability | Status |
|---|---|
| Alerting with severity routing | ✅ Deployed |
| Error monitoring | ✅ Sentry |
| Runbook | ✅ `docs/runbook.md` |
| Key rotation runbook | ✅ Documented, three steps |
| Environment setup plan | ✅ `docs/environment-setup-plan.md` |
| Database migrations under version control | ✅ Every schema change is a reviewed, versioned migration in `packages/database/prisma/migrations` |
| Backup and restore procedure | ✅ `docs/backup-and-restore.md` — encrypted, off-site, scheduled |
| Disaster recovery test | ✅ **Restore-proven.** Drill run and documented; 40 tables, 623 rows recovered |

---

## 8. What has not been done

Stated deliberately.

*Last reviewed 2026-09-05. Four items on the previous version of this list have
since been closed and are recorded at the end, because a due-diligence document
that only ever grows is not being maintained.*

| # | Gap | Materiality |
|---|---|---|
| 1 | **No collection has ever been processed.** The DebiCheck application was declined; contributions are paid by members and recorded by an administrator | **High** — the Foundation has no collections history, which is the substance of the decline |
| 2 | **The emergency restore cannot be performed on the machine holding the key.** Backups are written by a PostgreSQL 18 client; the office machine has a 16 client and refuses the archive format. Needs a PG 18 client or Docker, and that install is not finished | **High** — the backup is sound and currently unopenable by its own custodian |
| 3 | The private key exists in one place only | **High** — a second custody copy is an outstanding owner action |
| 4 | `REQUIRE_PASSWORD_POLICY_RESET` remains **off** — existing passwords predating the 12-character policy have not been force-reset | Medium |
| 5 | No penetration test by an external firm | Medium — internal adversarial audits were done, including one reading the provider's own service terms against the code. That is not the same thing |
| 6 | Retention policy not enforced by any mechanism | Medium |
| 7 | Operator data processing agreements not confirmed | Medium |
| 8 | Cross-border transfer disclosed only as of 2026-08-14 | Low — now remediated |

Item 1 is the Foundation's position, not a defect it can repair alone: it is
asking to begin. Items 2 and 3 are genuine engineering gaps in the one control
that matters most if everything else fails, and should be closed regardless of
what any external party asks for.

### Closed since the previous version

| Was | Now |
|---|---|
| Not deployed to production | Deployed. Three applications live on `xkimixamali.co.za` |
| No documented backup and restore procedure | `docs/backup-and-restore.md`; encrypted, off-site, scheduled, and running |
| No disaster recovery test | Restore drill **passed** — 40 tables, 623 rows, verified identical; automated monthly |
| Netcash live dry run outstanding | Moot. The application was declined; see `collections-application-brief.md` |

---

## 9. Regulatory position

| | |
|---|---|
| Legal form | `[TO BE CONFIRMED]` |
| Registration number | `[TO BE CONFIRMED]` |
| Self-regulatory body | `[NASASA OR OTHER — TO BE CONFIRMED]` |
| Basis for not requiring a banking licence | Stokvel exemption; closed membership; no deposits from the general public |
| POPIA Information Officer | `[TO BE APPOINTED AND REGISTERED]` |
| PAIA manual | ✅ Drafted — `paia-manual.md` |
| Constitution | ✅ Drafted — `constitution.md` |
| FICA obligations | `[TO BE CONFIRMED WITH ATTORNEY]` |
| Tax registration | `[TO BE CONFIRMED]` |

Progress against each: `registrations.md`.

---

## 10. Contact

| | |
|---|---|
| Foundation | Xkimi Xa Mali Foundation |
| Office bearer for this enquiry | `[NAME, OFFICE]` |
| Email | `[EMAIL]` |
| Telephone | `[TELEPHONE]` |
| Information Officer | `[NAME]` |
