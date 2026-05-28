# Database Normalization

| | |
|---|---|
| **Purpose** | Proves the schema satisfies 1NF, 2NF, and 3NF across every domain layer, and documents deliberate denormalization choices |
| **Normal Form Target** | Third Normal Form (3NF) throughout |
| **Related Docs** | [01-erd.md](./01-erd.md) · [03-schema-design.md](./03-schema-design.md) |

---

## Normalization Primer

| Normal Form | Requirement |
|---|---|
| **1NF** | Every column holds one atomic value. No repeating groups. Every row is uniquely identifiable. |
| **2NF** | Satisfies 1NF. Every non-key attribute is fully functionally dependent on the entire primary key (eliminates partial dependency — matters only when PK is composite). |
| **3NF** | Satisfies 2NF. Every non-key attribute depends only on the primary key, not on another non-key attribute (eliminates transitive dependency). |

---

## Diagram 1 — Normalization Journey Overview

```mermaid
flowchart LR
    subgraph RAW["Unnormalized — what it could look like"]
        R1["A single member record with\nembedded bank accounts as arrays\nembedded contribution history as arrays\nembedded mandate details inline\nrepeated role names as strings"]
    end

    subgraph NF1["After 1NF — Atomic values, no repeating groups"]
        N1A["users table — one row per user"]
        N1B["bank_accounts table — one row per account"]
        N1C["payment_mandates table — one row per mandate"]
        N1D["contributions table — one row per contribution period"]
        N1E["roles stored separately — not as comma-separated string"]
    end

    subgraph NF2["After 2NF — No partial dependencies"]
        N2A["user_roles junction table\neliminating partial dependency\non composite key userId + roleId"]
        N2B["contributions uniqueness constraint\nuserId + periodMonth + periodYear\neach attribute fully depends on all three"]
    end

    subgraph NF3["After 3NF — No transitive dependencies"]
        N3A["bank_accounts.bankName and branchCode\nstored on bank_accounts not derived\nfrom accountNumber"]
        N3B["contributions.amountDue\nstored explicitly not derived\nfrom mandate.amount at query time"]
        N3C["notifications.channel\ndenormalized from template for query efficiency\njustified denormalization — see below"]
    end

    RAW --> NF1 --> NF2 --> NF3
```

---

## Domain Analysis — Identity Layer

### `users` table

```mermaid
flowchart TD
    subgraph USERS_NF["users — Normalization Analysis"]
        PK_U["Primary Key: id\ncuid — globally unique"]

        NF1_U["1NF Check\nid — atomic single value\nemail — atomic single value\nphone — atomic single value\naddress — JSON object\nThis is intentional denormalization\naddress is always read and written as a unit\nnever queried by street or city separately\nIf address fields were queried individually\nthey would need their own table"]

        NF2_U["2NF Check\nSingle-column primary key\n2NF is automatically satisfied\nNo composite key means no partial dependency possible"]

        NF3_U["3NF Check\nNo non-key attribute determines another\nstatus does not determine email\nemail does not determine phone\npopiaConsentAt depends only on id\nNo transitive dependencies"]

        VERDICT_U["Verdict: 3NF satisfied\nJSON address field is justified denormalization"]
    end
```

### `roles` and `user_roles` tables

```mermaid
flowchart TD
    subgraph ROLES_NF["roles and user_roles — Normalization Analysis"]
        ISSUE["Original design risk\nIf roles were stored as a comma-separated\nstring in users.role\nthat would violate 1NF\ne.g. roles equals ADMIN,MEMBER"]

        SOLUTION["Solution applied\nRoles extracted to separate roles table\nJunction table user_roles holds the\nmany-to-many relationship\nOne row per userId per roleId"]

        NF1_R["1NF: roles.name is atomic\nuser_roles composite PK is unique per pair"]
        NF2_R["2NF: user_roles has composite PK\nNo non-key attributes in user_roles\nNothing to be partially dependent"]
        NF3_R["3NF: roles.name depends only on id\nNo transitive dependency"]
        VERDICT_R["Verdict: 3NF satisfied"]
    end
```

---

## Domain Analysis — Banking Layer

```mermaid
flowchart TD
    subgraph BANKING_NF["bank_accounts and payment_mandates — Normalization Analysis"]
        ORIGINAL_RISK["Risk if denormalized\nIf mandate stored bankName and branchCode inline\nupdating a bank's name would require updating\nevery mandate row — update anomaly"]

        SOLUTION_B["Solution applied\nBank details live on bank_accounts\nMandate references bank_accounts.id FK\nUpdating bank details updates one row only"]

        NF1_B["1NF: bank_accounts\nEach column is atomic\nbankName is a single string\nbranchCode is a single string\naccountNumber is a single encrypted string\nNo multi-value fields"]

        NF2_B["2NF: bank_accounts\nSingle-column PK — automatically satisfied\npayment_mandates\nSingle-column PK — automatically satisfied"]

        NF3_B["3NF: bank_accounts\nbankName does not determine branchCode\nbranchCode does not determine bankName\nEach depends only on id\nNo transitive dependency\npayment_mandates\namount does not determine debitDay\nstatus does not determine amount\nAll non-key attributes depend only on id"]

        VERDICT_B["Verdict: 3NF satisfied"]
    end
```

---

## Domain Analysis — Contributions and Transactions Layer

```mermaid
flowchart TD
    subgraph CONTRIB_NF["contributions and transactions — Normalization Analysis"]
        KEY_DECISION["Key design decision\ncontributions.amountDue is stored explicitly\neven though mandate.amount exists\nThis is deliberate — the contribution captures\nthe amount owed at the time of that period\nMandate amount can change for future periods\nThe historical record must not change"]

        NF1_C["1NF: contributions\nAll columns are single atomic values\nperiodMonth and periodYear are separate integers\nnot a single date field — enables efficient\nmonth-year queries without date parsing\ntransactions\ngatewayResponse stored as JSON blob\nThis is 1NF-compliant — the JSON is treated\nas a single opaque value, never queried by key"]

        NF2_C["2NF: contributions\nComposite unique constraint on userId + periodMonth + periodYear\nbut the primary key is a single id column\nSo 2NF is automatically satisfied\nThe unique constraint is a business rule\nnot the PK — no partial dependency possible\ntransactions\nSingle-column PK — automatically satisfied"]

        NF3_C["3NF: contributions\nstatus does not determine amountDue\namountPaid does not determine status\nstatus is computed from amountPaid vs amountDue\nbut is stored explicitly for query performance\nThis is justified denormalization — see below\ntransactions\ngatewayRef does not determine amount\ntype does not determine status\nAll attributes depend only on id"]

        JUSTIFIED_DENORM["Justified denormalization\ncontributions.status is derivable from\namountPaid compared to amountDue\nbut computing it on every query would require\na case expression on every row in every query\nStoring it explicitly allows a simple WHERE status equals OVERDUE\nA trigger or service method keeps it in sync\nThis is a well-known controlled denormalization\npattern for OLTP systems"]

        VERDICT_C["Verdict: 3NF satisfied with one justified denormalization"]
    end
```

---

## Domain Analysis — Notification Layer

```mermaid
flowchart TD
    subgraph NOTIF_NF["notification_templates and notifications — Normalization Analysis"]
        TEMPLATE_DESIGN["Design decision\nSMS templates, email templates, and push templates\nare stored in a single notification_templates table\nwith a channel discriminator column\nAlternative was three separate tables\nChosen approach reduces query complexity"]

        NF1_N["1NF: notification_templates\nbody is a single template string with placeholders\ne.g. Good morning username, R amount will be debited tonight\nThe payload column on notifications holds\nthe variable data as JSON — treated as opaque blob\nnot queried by individual key in SQL"]

        NF2_N["2NF: both tables\nSingle-column primary key on both\nAutomatically satisfied"]

        NF3_N["3NF: notifications\nchannel is denormalized from notification_templates.channel\nThis means notifications.channel and template.channel\nare always equal — a transitive dependency\nJustification: the notification must retain its channel\neven if the template is updated or reassigned\nIt also allows querying by channel without a join\nThis is a controlled and documented denormalization"]

        VERDICT_N["Verdict: 3NF with one justified controlled denormalization"]
    end
```

---

## Domain Analysis — Goals Layer

```mermaid
flowchart TD
    subgraph GOALS_NF["goals and goal_progress — Normalization Analysis"]
        NF1_G["1NF: goals\nAll columns atomic\ncurrentAmount is stored explicitly\nnot derived from summing goal_progress\nJustified — avoids aggregate query on every goal view\ngoal_progress\nEach row is a single funding event\nOne amount per row, one timestamp per row"]

        NF3_G["3NF: goals\nstatus does not determine targetAmount\nlockedAt depends only on the lock event, not on status\nlockedById depends only on who locked, not on lockedAt\nNo transitive dependency\ngoal_progress\nOnly goalId FK and amount and recordedAt\nNothing to be transitively dependent"]

        VERDICT_G["Verdict: 3NF satisfied"]
    end
```

---

## Domain Analysis — Audit Layer

```mermaid
flowchart TD
    subgraph AUDIT_NF["audit_logs — Normalization Analysis"]
        DESIGN["Design choice\naudit_logs is an append-only event store\nIt deliberately stores entity and entityId as strings\nrather than having typed FK columns per entity type\nThis is a generic audit pattern — the alternative\nwould be 15 separate audit tables, one per entity\nor nullable FK columns for every entity type"]

        NF1_A["1NF: all columns atomic\nentity is a string e.g. PaymentMandate\nentityId is a string — the cuid of the entity\npayload is JSON — treated as opaque audit record\nnever queried by individual JSON key"]

        NF3_A["3NF: entity does not determine userId\nipAddress does not determine action\nAll non-key columns depend only on id\nNo transitive dependency"]

        VERDICT_A["Verdict: 3NF satisfied\nGeneric audit pattern is a justified design choice"]
    end
```

---

## Denormalization Summary

| Table | Denormalized Column | Why Justified |
|---|---|---|
| `users` | `address` as JSON | Address is always read/written as a unit; never queried by individual field |
| `contributions` | `status` column | Avoid case expression on every ledger query; kept in sync by service layer |
| `contributions` | `amountDue` column | Historical snapshot; mandate amount can change for future periods |
| `goals` | `currentAmount` column | Avoid aggregate sum on every goal view; updated on each funding event |
| `notifications` | `channel` column | Retain channel even if template changes; avoids join on every inbox query |
| `audit_logs` | `entity` and `entityId` as strings | Generic audit pattern; avoids 15 separate audit tables |
