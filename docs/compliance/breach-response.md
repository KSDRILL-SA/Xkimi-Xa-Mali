# Breach Response Runbook

**Section 22, Protection of Personal Information Act**

| | |
|---|---|
| Owner | The Information Officer |
| Audience | Whoever is holding the phone when it happens |
| Status | Complete |

> **Written to be read badly.** Nobody reads a runbook carefully during an
> incident. This one is ordered so that following it from the top, skimming, still
> produces the right outcome. The legal obligations are in Part 2; do not let
> them delay Part 1.

---

## The obligation in one paragraph

If there are **reasonable grounds to believe** that a member's personal
information has been **accessed or acquired by an unauthorised person**, the
Foundation **must** notify the **Information Regulator** and **every affected
member**, as soon as reasonably possible after discovery. There is no materiality
threshold to hide behind and no exemption for small organisations. Delay is
itself a contravention.

**"Reasonable grounds to believe" is a lower bar than proof.** You do not get to
wait for certainty.

---

## Part 1 — First hour

Do these in order. Do not wait for a meeting.

### 1. Stop the bleeding

- Revoke the credential, key, or session that is being abused.
- If a member account is compromised: suspend it.
- If an administrator account is compromised: suspend it and **change the role**,
  which invalidates their sessions via the `roleVersion` counter.
- If a service key is exposed: rotate it. For the encryption key ring, follow the
  three-step rotation runbook — **do not skip to step three**.
- If the database is exposed: restrict network access before anything else.

### 2. Preserve the evidence

**Do not clean up before you have recorded what happened.**

- Do **not** delete logs, and do not delete the audit log — you cannot, by design,
  and you should not try.
- Capture: what was accessed, by whom, from where, and over what period.
- Export the relevant `AuditLog` and `LoginHistory` rows **now**, before retention
  or rotation touches them.
- Screenshot alerts and monitoring views; they age out.

### 3. Write down the time

Start a plain text file with timestamps. When you discovered it, what you did,
when. The Regulator will ask, and memory of an incident is unreliable within days.

### 4. Tell the Information Officer

If that is not you, tell them now, before you assess anything.

---

## Part 2 — First day

### 5. Assess scope

Answer these, in writing:

| Question | Why |
|---|---|
| What categories of information? | ID numbers and bank account numbers are the serious ones |
| Was the information **encrypted**? | ID numbers and bank account numbers are encrypted at rest. If only ciphertext was taken and the key was not, harm is materially lower — **say so, but still notify** |
| How many members are affected? | Determines the scale of notification |
| Which members, by name? | You must notify each |
| Over what period? | |
| Is it ongoing? | If yes, return to Part 1 |
| Is the unauthorised person identifiable? | Must be disclosed to members if known |

### 6. Decide: is it notifiable?

Notify if there are **reasonable grounds to believe** unauthorised access or
acquisition occurred.

**Notify.** If you are debating it, the answer is notify. The cost of an
unnecessary notification is embarrassment. The cost of a missed one is a
contravention, and — in a fifty-person collective where everyone knows each
other — a breach of trust that does not repair.

Record the reasoning either way, with the date.

### 7. Notify the Information Regulator

| | |
|---|---|
| Email | `inforeg@inforegulator.org.za` |
| Address | JD House, 27 Stiemens Street, Braamfontein, Johannesburg, 2001 |
| Timing | As soon as reasonably possible after discovery |

Include: what happened, when, what information, how many members, what you have
done, and what you will do.

### 8. Notify affected members

**In writing**, to each affected member. Section 22 requires the notification to
describe:

- (a) the **possible consequences** for that member;
- (b) the **measures the Foundation intends to take**, or has taken;
- (c) **what the member can do** to mitigate harm; and
- (d) the **identity of the unauthorised person**, if known.

Send by email, and — given this is a fifty-person circle of people who know each
other — say it in the group as well. A formal email alone will read as evasive
here in a way it would not at a large company.

**Do not minimise, and do not speculate upward.** State what is known, state what
is not yet known, and say when you will next update them.

---

## Part 3 — After

### 9. Remediate

- Fix the underlying cause, not only the symptom.
- Add a regression test if the cause was a defect. A breach that can recur is not
  closed.
- Rotate anything that might have been exposed, even where you believe it was not.

### 10. Record

Keep a permanent record of the incident: what happened, the assessment, who was
notified and when, and what was changed. Retain it indefinitely.

### 11. Review

At the next general meeting, tell the members what happened and what changed. In a
collective this size, that is not optional in any sense that matters.

---

## Notification template

> **Subject: Important — a security incident affecting your information**
>
> Dear `[NAME]`,
>
> On `[DATE]` we discovered that `[WHAT HAPPENED]`. We believe this affected
> `[WHAT INFORMATION]` belonging to you.
>
> **What this could mean for you.** `[POSSIBLE CONSEQUENCES — be concrete]`
>
> **What we have done.** `[MEASURES TAKEN]`
>
> **What we suggest you do.** `[MITIGATION — e.g. change your password, watch your
> bank statements, contact your bank]`
>
> `[IF KNOWN: We believe the person responsible is …]`
>
> We have notified the Information Regulator, as the law requires.
>
> We are sorry. You trusted us with this information and we did not protect it
> well enough. If you have questions, contact `[INFORMATION OFFICER]` at
> `[CONTACT]`. We will update you again by `[DATE]`.
>
> `[NAME]`
> Information Officer, Xkimm Xa Mali Foundation

---

## What counts as a breach

Not exhaustive, but these are the realistic ones here:

| Scenario | Notifiable? |
|---|---|
| Administrator account compromised | **Yes** — that account can read member data |
| Database exposed to the internet | **Yes** |
| Encryption key ring leaked | **Yes** — this is the serious one; the encryption of ID and bank numbers depends on it |
| Laptop with production access stolen | **Probably** — assess what it could reach |
| Member's own account compromised by their own password reuse | Assess — the Foundation's systems were not breached, but that member's data was accessed |
| An email sent to the wrong member containing another member's details | **Yes** — small, but it is unauthorised access |
| Backup file left in a public location | **Yes** |
| A defect that let one member see another's record | **Yes** |
| Failed login attempts from an unknown IP, no access gained | **No** — no access or acquisition occurred. Log it, watch it |
| A vulnerability found and fixed with no evidence of exploitation | **No** — but record the assessment |

---

## Contacts

| Role | Name | Contact |
|---|---|---|
| Information Officer | `[NAME]` | `[CONTACT]` |
| Deputy | `[NAME]` | `[CONTACT]` |
| Attorney | `[NAME]` | `[CONTACT]` |
| Netcash support | — | `[CONTACT]` |
| Hosting provider support | — | `[CONTACT]` |
| Information Regulator | — | `inforeg@inforegulator.org.za` |

**Fill these in before you need them.** Looking up an attorney's number during an
incident is how the first hour gets lost.
