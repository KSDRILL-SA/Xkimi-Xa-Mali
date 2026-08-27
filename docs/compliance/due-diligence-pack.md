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
| Collection method | DebiCheck authenticated debit order via Netcash |

---

## 2. Custody of funds

| Question | Answer |
|---|---|
| Where is the money held? | A bank account **in the Foundation's name** at `[BANK]` |
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
| Database migrations under version control | ✅ 16 migrations |
| Backup and restore procedure | **GAP — see clause 8** |
| Disaster recovery test | **GAP — see clause 8** |

---

## 8. What has not been done

Stated deliberately.

| # | Gap | Materiality |
|---|---|---|
| 1 | **No live transaction has ever been processed.** The platform is pre-production | **High** — the Foundation has no operating history |
| 2 | **Netcash live dry run outstanding** | **High** — the integration is implemented and tested, never exercised live |
| 3 | Not deployed to production | High |
| 4 | **No documented backup and restore procedure** | **High** — this holds members' financial records |
| 5 | No disaster recovery test | Medium |
| 6 | `REQUIRE_PASSWORD_POLICY_RESET` remains **off** — existing passwords predating the 12-character policy have not been force-reset | Medium |
| 7 | No penetration test by an external firm | Medium — an internal adversarial audit was done, which is not the same thing |
| 8 | Retention policy not enforced by any mechanism | Medium |
| 9 | Operator data processing agreements not confirmed | Medium |
| 10 | Cross-border transfer disclosed only as of 2026-08-14 | Low — now remediated |

Items 1–3 are sequencing, not defects: the Foundation is asking to begin, not
claiming to have begun. **Item 4 is a genuine engineering gap and should be closed
before production**, regardless of what any external party asks for.

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
