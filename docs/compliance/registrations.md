# Registrations & External Applications

**The things that cannot be done from a keyboard.**

| | |
|---|---|
| Owner | `[NAME]` |
| Status | None started as at 2026-08-14 |
| Purpose | One register, in dependency order, of every external registration, application, and professional engagement |

> **How to use this.** The items are in the order they unblock each other. Doing
> them out of order mostly means being turned away and coming back. Items 1 and 2
> gate almost everything else.
>
> Costs and timeframes are indicative and must be confirmed — do not budget from
> this table alone.

---

## The dependency chain

```
1. Decide legal form ──► 2. Adopt constitution ──► 3. Entity registration (if any)
                                   │
                                   ├──► 4. NASASA membership
                                   ├──► 5. Bank account ──► 7. Netcash onboarding
                                   ├──► 6. SARS registration
                                   └──► 8. Information Officer registration
```

---

## 1. Decide the legal form — **start here**

**This decision changes every item below it.** Do not open a bank account or
approach Netcash before it is settled.

| Option | What it is | Registration | Cost | Suitability |
|---|---|---|---|---|
| **Voluntary association** (*universitas*) | A common-law legal person created by the members adopting a constitution. Can own property and hold a bank account in its own name. | **None required** | Attorney review only | **Most likely the right answer.** This is what most stokvels are |
| Non-Profit Company (NPC) | Registered with CIPC | CIPC | Registration fee + annual returns | Heavier; brings ongoing compliance |
| Trust | Registered with the Master of the High Court | Master | Higher | Usually excessive for a savings collective |
| NPO registration | Voluntary registration with Dept. of Social Development | DSD | Free | Optional overlay; mainly for donor credibility |

### The point worth taking to the attorney

A **voluntary association with a properly drafted constitution is already a legal
person** — it has perpetual succession, can hold assets in its own name, and is
distinct from its members. Banks open accounts for them routinely, and it needs
no registration with anybody.

The drafted constitution (`constitution.md`) has been written with those
characteristics in mind. If the attorney confirms a voluntary association is
sufficient, **item 3 disappears entirely** and the cost and time of this whole
programme drops sharply.

⚠️ **Name caution.** "Foundation" ordinarily suggests a trust or NPC. Using it for a
voluntary association is not unlawful, but confirm with the attorney that the name
will not mislead a bank or the Regulator. If it is a problem, the fix is a
clarifying line in the constitution, not a rename.

| | |
|---|---|
| **Action** | Engage a South African attorney with financial services or NPO experience |
| **Deliverable** | Written advice on legal form; review and adoption of the constitution |
| **Blocks** | Everything |
| **Indicative** | One to two consultations |

---

## 2. Adopt the constitution

Once reviewed, the members sign it at a general meeting.

| | |
|---|---|
| **Prerequisite** | Item 1; the twelve open decisions listed at the end of `constitution.md` |
| **Most important open decision** | **Clause 10.3 — exit entitlement on resignation.** Settle this before anyone needs it |
| **Deliverable** | Signed constitution; minute of the adopting meeting |
| **Blocks** | Items 3, 4, 5, 6 |

---

## 3. Entity registration — *only if item 1 requires it*

| | |
|---|---|
| **Body** | CIPC (NPC) or Master of the High Court (trust) |
| **Needs** | Constitution / founding documents; ID documents of office bearers |
| **Deliverable** | Registration number, for every `[REGISTRATION NUMBER]` placeholder in this pack |
| **Note** | **Skip entirely if a voluntary association is confirmed** |

---

## 4. NASASA membership

The **National Stokvel Association of South Africa** is the recognised
self-regulatory body for stokvels. Membership is the ordinary route to relying on
the stokvel exemption from the Banks Act.

| | |
|---|---|
| **Body** | NASASA |
| **Needs** | Constitution; member register; office bearer details |
| **Deliverable** | Membership number → `constitution.md` clause 1.4 |
| **Why it matters** | It is the clean answer to "what law lets you hold other people's money?" — and both a bank and Netcash may ask |
| **Confirm** | Current membership requirements, fees, and whether the exemption carries any deposit ceiling that applies at your scale |

---

## 5. Bank account in the entity's name

| | |
|---|---|
| **Prerequisite** | Items 1, 2, and 3 if applicable |
| **Needs** | Constitution; resolution authorising the account and naming signatories; FICA documents for each signatory (ID, proof of address); proof of the entity's address |
| **Recommend** | **More than one required signatory.** The constitution says no single leader can move money; the bank mandate should say the same, or the control exists only in software |
| **Deliverable** | Account details → `constitution.md` clause 6.1 and `due-diligence-pack.md` clause 2 |
| **Blocks** | Item 7 |

---

## 6. SARS registration

| | |
|---|---|
| **Body** | SARS |
| **Question to settle** | Whether the Foundation must register for income tax, and how interest earned on the pool is treated |
| **Note** | Stokvel tax treatment is not intuitive and depends on the structure. This is a question for the accountant, not a form to guess at |
| **Also settle here** | The retention periods left open in `popia-compliance.md` clause 6 — they are driven by accounting obligations |

---

## 7. Netcash merchant onboarding

| | |
|---|---|
| **Prerequisite** | Items 1, 2, 5 |
| **Needs** | Entity registration documents; FICA for the entity and office bearers; bank account in the entity's name; signed service agreement |
| **Not needed** | **ISV agreement — confirmed not required** |
| **Take to the meeting** | `mandate-lifecycle.md` and `due-diligence-pack.md` |
| **Ask for** | A **supervised live dry run** — a small number of mandates, observed |
| **Already in place** | DebiCheck template configured; webhook signature verification; replay protection; desync alerting |
| **Say plainly** | No live transaction has been processed. Do not imply otherwise — they can see your volume is zero |

---

## 8. Information Officer registration

| | |
|---|---|
| **Body** | Information Regulator (South Africa) |
| **Cost** | **Free**, via the Regulator's online portal |
| **Needs** | Entity details; the appointed person's details |
| **Note** | Under POPIA the head of the body **is** the Information Officer by law. Registration and a written appointment are what remain |
| **Deliverable** | Reference → `constitution.md` clause 9.4, `popia-compliance.md`, `paia-manual.md` |
| **Effort** | Low. One of the cheapest statutory gaps to close |

---

## 9. Publish the PAIA manual

| | |
|---|---|
| **Prerequisite** | Items 1, 8 |
| **Action** | Complete the bracketed fields in `paia-manual.md`; publish at a stable public URL; record that URL in clause 8 of the manual |
| **Confirm** | The current prescribed request form and fee schedule with the Regulator |

---

## 10. Professional engagements

| Engagement | For | Priority |
|---|---|---|
| **Attorney** — financial services / NPO | Legal form; constitution review; FICA position; confirmation of the exemption | **First** |
| **Accountant** | Tax position; financial year end; retention periods; whether statements are reviewed or audited | Second |
| **External penetration test** | Independent security assurance beyond the internal audit | Optional, before scale |

---

## 11. Engineering items — not external, but blocking production

Listed here so the whole picture is in one place. These are mine to close, not
yours.

| # | Item | Severity |
|---|---|---|
| 1 | ~~Documented backup and restore procedure~~ | ✅ `../backup-and-restore.md` |
| 2 | ~~Written breach response runbook (POPIA s22)~~ | ✅ `breach-response.md` |
| 3 | ~~Cross-border transfer disclosure~~ | ✅ Live on the privacy page |
| 4 | ~~Retention enforcement job (report-only)~~ | ✅ Monthly survey |
| 5 | ~~Data-subject-request log~~ | ✅ Admin console → Data Requests |
| 6 | ~~Publish the PAIA manual~~ | ✅ `/paia`, linked in the footer |
| 7 | ~~Audit log not actually append-only~~ | ✅ Database trigger; the first drill found the property was only a convention |
| 8 | **The production restore drill** — development drilled 2026-08-15; production data and the `age` round trip not yet | **High — should block go-live** |
| 9 | Decide on `REQUIRE_PASSWORD_POLICY_RESET` | Medium |

---

## Status board

| # | Item | Status | Blocked by |
|---|---|---|---|
| 1 | Legal form decided | ☐ Not started | — |
| 2 | Constitution adopted | ☐ Drafted, not adopted | 1 |
| 3 | Entity registered (if needed) | ☐ Not started | 1, 2 |
| 4 | NASASA membership | ☐ Not started | 2 |
| 5 | Bank account | ☐ Not started | 2, 3 |
| 6 | SARS position settled | ☐ Not started | 1 |
| 7 | Netcash onboarding | ☐ Not started | 5 |
| 8 | Information Officer registered | ☐ Not started | 1 |
| 9 | PAIA manual published | ☑ Live at `/paia` — fill in the details once item 1 and 8 land | 1, 8 |
| 10 | Attorney engaged | ☐ Not started | — |
| 11 | Accountant engaged | ☐ Not started | — |
| 12 | Backup & restore documented | ☑ Done | — |
| 13 | Development restore drill | ☑ Run 2026-08-15 — found 3 defects | — |
| 14 | **Production restore drill + `age` round trip** | ☐ Not started | — (engineering) |
