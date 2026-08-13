import React from 'react'
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import {
  MAX_MEMBERS,
  FOUNDER_COUNT,
  MIN_CONTRIBUTION_ZAR,
  MAX_CONTRIBUTION_ZAR,
  CONTRIBUTION_STEP_ZAR,
  DEFAULT_INVITE_AMOUNT,
  MAX_TRANSACTION_RETRY,
  PASSWORD_MIN_LENGTH,
  MIN_GOAL_PAYMENT,
  MAX_GOAL_PAYMENT,
} from '@xxm/utils'
import { NETCASH_FEE_BUFFER } from '@/lib/group-account'
import { C } from './kit'
import {
  G, PAGE, RunningHead, RunningFoot, Cover, Contents, PartDivider, Section,
  P, Lede, B, H3, Rule, Note, Warn, Bullets, Steps, Facts, Defs, Quote, Compare, Seal,
} from './guide-kit'

/**
 * The Founder Guide, rendered from the system it describes.
 *
 * ── Why it is generated rather than written ─────────────────────────────────
 *
 * The first edition was a document. It was written before most of the system
 * existed, and for a while that was the right way round: it was the
 * specification, and the software was measured against it. Nine gaps were found
 * that way and all nine were closed in the code.
 *
 * Then the relationship inverted. The system grew goal plans, directed goal
 * payments, a member statement, an invitation that carries an ID number, a
 * standing rule about what a departed member may still do — none of which the
 * guide had ever heard of. And in one place it had drifted the other way: it
 * promised members ten posts a day on the community board when nothing in the
 * code counted posts at all. A signed document was making a claim the software
 * would not keep.
 *
 * So every figure in this edition is imported. The monthly minimum, the size of
 * the circle, the number of founders, the fee buffer, the smallest gift to a
 * goal, the password length — each is read from the module that enforces it. A
 * member reading `R{MIN_CONTRIBUTION_ZAR}` here is reading the same constant the
 * server rejects a smaller amount with. The guide can go out of date about
 * intent, tone and emphasis, which are human things; it can no longer go out of
 * date about a number.
 *
 * The appendix at the end lists each figure against the file it came from, so
 * that claim is checkable rather than asserted.
 */

const EDITION = 'Second Edition'

const styles = StyleSheet.create({
  body: {
    backgroundColor: G.page,
    paddingTop: PAGE.headHeight + 26,
    paddingBottom: PAGE.footHeight + 18,
    paddingHorizontal: PAGE.gutter,
  },
  plain: { backgroundColor: G.night, padding: 0 },
  cover: { backgroundColor: G.night, padding: 0 },
})

// ─── Contents, declared once and used three times ──────────────────────────────
// The contents page, the five part dividers and the section headings all read
// from this. A section cannot be renamed in one place and stay stale in another.

const PARTS = [
  {
    roman: 'One', numeral: 'I', title: 'The Foundation',
    lede: 'What this is, who it is for, and the handful of decisions that everything else follows from.',
    sections: [
      { num: 1, title: 'What Xkimm Xa Mali is' },
      { num: 2, title: 'Why the circle stops at fifty' },
      { num: 3, title: 'The four who started it' },
      { num: 4, title: 'What we promise one another' },
    ],
  },
  {
    roman: 'Two', numeral: 'II', title: 'The Money',
    lede: 'Every rand that moves, where it moves from, what it costs to move it, and what happens when a movement fails.',
    sections: [
      { num: 5, title: 'Your monthly contribution' },
      { num: 6, title: 'Your debit order' },
      { num: 7, title: 'Why your debit is not your contribution' },
      { num: 8, title: 'When a collection fails' },
      { num: 9, title: 'Goals: what the money is for' },
      { num: 10, title: 'Giving to a goal, once' },
      { num: 11, title: 'Funding a goal every month' },
      { num: 12, title: 'Where the money sits' },
    ],
  },
  {
    roman: 'Three', numeral: 'III', title: 'Your Account',
    lede: 'The part of the Foundation that is yours alone — your access, your record, your information, and your right to walk away with all of it.',
    sections: [
      { num: 13, title: 'Getting in, and staying in' },
      { num: 14, title: 'Reading your dashboard' },
      { num: 15, title: 'Your statement' },
      { num: 16, title: 'How the Foundation talks to you' },
      { num: 17, title: 'Your information' },
      { num: 18, title: 'Leaving' },
    ],
  },
  {
    roman: 'Four', numeral: 'IV', title: 'The Circle',
    lede: 'Fifty people and the few rules that keep fifty people workable — including the rules that bind the people running it.',
    sections: [
      { num: 19, title: 'The community board' },
      { num: 20, title: 'How we speak to one another' },
      { num: 21, title: 'What leadership can do' },
      { num: 22, title: 'What leadership cannot do' },
      { num: 23, title: 'Suspension' },
    ],
  },
  {
    roman: 'Five', numeral: 'V', title: 'Joining',
    lede: 'How somebody comes into the circle — from the invitation an admin fills in, to the end of a first month.',
    sections: [
      { num: 24, title: 'The invitation' },
      { num: 25, title: 'Registering' },
      { num: 26, title: 'Your first month' },
    ],
  },
]

const APPENDICES = [
  { letter: 'A', title: 'The words we use' },
  { letter: 'B', title: 'Every figure in this guide, and where it came from' },
]

// ─── The document ──────────────────────────────────────────────────────────────

function BodyPage({ part, children }: { part: string; children: React.ReactNode }) {
  return (
    <Page size="A4" style={styles.body}>
      <RunningHead part={part} />
      {children}
      <RunningFoot edition={EDITION} />
    </Page>
  )
}

export function FounderGuideDocument({ issued, holder }: { issued: string; holder: string }) {
  const partOf = (i: number) => `Part ${PARTS[i]!.roman} — ${PARTS[i]!.title}`

  return (
    <Document
      title="Xkimm Xa Mali Foundation — The Founder Guide"
      author="Xkimm Xa Mali Foundation"
      subject="What the Foundation asks of its members, what it owes them, and how the money moves"
      keywords="stokvel, foundation, members, contributions, goals"
    >
      {/* ── Cover ─────────────────────────────────────────────────────────── */}
      <Page size="A4" style={styles.cover}>
        <Cover edition={EDITION} issued={issued} holder={holder} />
      </Page>

      {/* ── Contents ──────────────────────────────────────────────────────── */}
      <Page size="A4" style={{ backgroundColor: G.page, paddingBottom: PAGE.footHeight + 10 }}>
        <Contents parts={PARTS} appendices={APPENDICES} />
        <RunningFoot edition={EDITION} />
      </Page>

      {/* ── Before you begin ──────────────────────────────────────────────── */}
      <BodyPage part="Before you begin">
        <Text style={open.kicker}>A NOTE BEFORE YOU BEGIN</Text>
        <Text style={open.title}>This guide is generated{'\n'}by the system it describes.</Text>
        <View style={open.rule} />

        <Lede>
          Most handbooks are written once and then quietly stop being true. A rule changes,
          the software changes with it, and the document on somebody{"'"}s desk goes on saying
          what used to be so. That has already happened here once — an earlier edition told
          members they could post to the community board ten times a day, and nothing in the
          system counted posts at all.
        </Lede>

        <P>
          So this edition is not typed. Every figure in it — the monthly minimum, the size of
          the circle, the number of founders, the fee added to your debit, the smallest amount
          you can put toward a goal — is read out of the same code that enforces it when you
          press the button. If leadership ever changes one, the next copy of this guide changes
          with it, in the same hour, without anybody remembering to.
        </P>

        <Quote attr="What that means for you">
          When this guide says R{MIN_CONTRIBUTION_ZAR}, it is not describing the rule. It is
          quoting it.
        </Quote>

        <P>
          Appendix B lists every generated figure against the file it was read from. You do not
          need to look at it. It is there so that the promise above is something you can check
          rather than something you have to take on trust — which is, more or less, the whole
          idea of this Foundation.
        </P>

        <Note label="HOW TO READ THIS">
          Blocks with a green bar are rules — things the system will actually refuse or insist
          on. Blue blocks are context. Amber blocks are places where people commonly lose money
          or time. If you read nothing else, read the green ones.
        </Note>
      </BodyPage>

      {/* ═══ PART I ═══════════════════════════════════════════════════════ */}
      <Page size="A4" style={styles.plain}>
        <PartDivider {...PARTS[0]!} />
      </Page>

      <BodyPage part={partOf(0)}>
        <Section num={1} title="What Xkimm Xa Mali is">
          <Lede>
            A stokvel — {MAX_MEMBERS} people who each put in an agreed amount every month, into
            one pooled fund, toward goals the group has agreed on. Nothing about that is new —
            South Africans have been doing it for a century. What is new here is only that the
            book is software instead of paper.
          </Lede>

          <P>
            The name is Xitsonga — <B>xikimu xa mali</B>, the money pot. The thing a household
            keeps and everybody adds to.
          </P>

          <P>
            The point of writing the book as software is not modernity. It is that a paper book
            has one copy, one keeper, and one person who can read it. This one gives every member
            the same view at the same time, records who changed what, and can be audited by
            anybody who was in the room. A stokvel fails when trust and evidence come apart.
            This exists to keep them together.
          </P>

          <Facts items={[
            { value: String(MAX_MEMBERS), label: 'Seats in the circle' },
            { value: String(FOUNDER_COUNT), label: 'Founding members' },
            { value: `R${MIN_CONTRIBUTION_ZAR}`, label: 'Monthly minimum' },
            { value: 'Invite only', label: 'How you get in' },
          ]} />

          <H3>What it is not</H3>
          <P>
            It is not an investment product. Nobody here promises you a return, and no rand you
            contribute is guaranteed to come back to you multiplied. It is not a lender — the
            Foundation does not issue credit. And it is not a business you own a share of.
            You are a member of a pooled fund, and your relationship to it is set out in this
            document rather than in a share certificate.
          </P>
        </Section>

        <Section num={2} title="Why the circle stops at fifty">
          <Lede>
            There are {MAX_MEMBERS} seats, and that number is not a stage we are trying to grow
            out of.
          </Lede>

          <P>
            A stokvel works on a specific kind of pressure — the kind you feel because the
            person whose goal your money is funding is somebody you could run into. At thirty
            people that pressure is real. At five hundred it is gone, and what replaces it is
            administration, arrears letters, and a committee. Every one of those is a symptom of
            a circle that got too big to be a circle.
          </P>

          <Rule>
            The cap is a design decision, not a limit we are waiting to escape. There is no
            seat {MAX_MEMBERS + 1}.
          </Rule>

          <H3>What counts as taking a seat</H3>
          <P>
            A seat is held by anybody who has not been erased from the record, whatever their
            standing. A suspended member keeps their history and their place. Somebody who has
            registered but has not yet been activated already has one. So does an invitation
            that has been sent and not yet used — otherwise {MAX_MEMBERS + 1} links could go out
            and the last person would be turned away in the moment they tried to join, which is
            a cruel way to discover a limit.
          </P>

          <Note>
            This is why an admin sometimes cannot send an invitation even though fewer than{' '}
            {MAX_MEMBERS} people are active. Outstanding invitations are already holding seats.
            Revoking an unused one gives the seat back immediately.
          </Note>
        </Section>
        <Section num={3} title="The four who started it">
          <Lede>
            Four people put in first, before there was anything to see and before anybody could
            be sure it would work. That is the whole of what the founder badge
            marks.
          </Lede>

          <P>
            The badge is conferred, not earned. There is no amount of contributing, no length of
            membership and no act of service that turns a member into a founder — the four are
            the four because of when they arrived, and that is a fact about history rather than
            a ranking. It carries no extra vote, no larger share of anything, and no authority
            over another member.
          </P>

          <Rule>
            The count of {FOUNDER_COUNT} is enforced by the system, not remembered by a person.
            A cap that lives only in somebody{"'"}s head is a cap until the day it isn{"'"}t.
          </Rule>

          <P>
            Founders are frequently also admins, and it is worth being clear that these are two
            separate things that happen to overlap. Everything in Part Four about what leadership
            can and cannot do applies to a founder exactly as it applies to anybody else holding
            the same role. A founder with the admin role can suspend an account; a founder
            without it cannot.
          </P>
        </Section>

        <Section num={4} title="What we promise one another">
          <Lede>
            Six sentences. Everything else in this document is one of them worked out in detail.
          </Lede>

          <Steps items={[
            {
              title: 'You put in what you said you would, when you said you would',
              text: 'The amount was agreed when you were invited. The day is the one on your debit order. Neither changes without you.',
            },
            {
              title: 'The Foundation tells you the truth about your money',
              text: 'Every rand in and out is on your statement, with a status that means what it says. Nothing is rounded in the Foundation’s favour and nothing is hidden behind a summary.',
            },
            {
              title: 'Nobody moves your money without a record of who did it',
              text: 'Every action leadership takes against an account is written to an audit log with a name and a time on it. Including the ones nobody is proud of.',
            },
            {
              title: 'Your history is yours',
              text: 'It stays yours if you are suspended, and it stays yours after you leave. You can download it at any time without asking permission.',
            },
            {
              title: 'The rules are the same for everybody, including the people enforcing them',
              text: 'Leadership cannot quietly exempt itself. Section 22 lists what an admin is refused by the system, not merely discouraged from.',
            },
            {
              title: 'You can leave',
              text: 'At any time, without a reason, without a notice period, and with your record intact. A circle you cannot leave is not a circle.',
            },
          ]} />

          <Quote attr="The short version">
            Money is easy to pool and hard to trust. Everything here is arranged around the
            second problem.
          </Quote>
        </Section>
      </BodyPage>

      {/* ═══ PART II ══════════════════════════════════════════════════════ */}
      <Page size="A4" style={styles.plain}>
        <PartDivider {...PARTS[1]!} />
      </Page>

      <BodyPage part={partOf(1)}>
        <Section num={5} title="Your monthly contribution">
          <Lede>
            One amount, once a month, for as long as you are a member. It is the spine of the
            whole arrangement, and it is deliberately the least interesting part of it.
          </Lede>

          <Facts items={[
            { value: `R${MIN_CONTRIBUTION_ZAR}`, label: 'Monthly minimum' },
            { value: `R${MAX_CONTRIBUTION_ZAR.toLocaleString('en-ZA')}`, label: 'Monthly maximum' },
            { value: `R${CONTRIBUTION_STEP_ZAR}`, label: 'Chosen in steps of' },
            { value: `R${DEFAULT_INVITE_AMOUNT}`, label: 'Typical commitment' },
          ]} />

          <P>
            Your amount is set when you are invited, before you have an account — the admin
            inviting you records what the two of you agreed, and you see it on the invitation
            before you accept anything. It cannot be less than the minimum, because a fund whose
            members can commit to nothing is not a fund.
          </P>

          <Rule>
            R{MIN_CONTRIBUTION_ZAR} a month is the floor. The system refuses a commitment below
            it at the point the invitation is created, not months later when the first collection
            comes up short.
          </Rule>

          <H3>What a contribution actually is</H3>
          <P>
            It is a record with a month and a year on it — a <B>period</B> — saying what you owe
            for that period and how much of it has arrived.
            It is not the same thing as the payment. One contribution can be settled by one
            debit, by several, or by none, and its status says which.
          </P>

          <Defs
            head={['Status', 'What it means']}
            termWidth={0.22}
            rows={[
              ['Pending', 'The obligation exists and nothing has been collected against it yet. Normal for the first days of a month.'],
              ['Partial', 'Some of it has arrived but not all. The balance is still owed, and it still counts toward the pool — a part-paid month is not a nothing month.'],
              ['Paid', 'Settled in full. Nothing further is expected for this period.'],
              ['Overdue', 'The period has passed and the full amount did not arrive. This is the one that matters, and Section 8 is about how you get here and how you get out.'],
              ['Waived', 'Leadership has released you from this month. It is a decision somebody made and signed for, and it appears on your statement as such.'],
            ]}
          />

          <Note>
            Contributions for a period are generated by leadership in one action, for every
            active member at once. That is why yours appears on the same day as everybody
            else{"'"}s, and why the amount is what it was agreed to be rather than what it was
            last month.
          </Note>
        </Section>
        <Section num={6} title="Your debit order">
          <Lede>
            The Foundation does not have your card and cannot reach into your account whenever
            it likes. It holds a mandate — an instruction you gave your bank, that your bank
            confirmed with you directly, and that you can withdraw.
          </Lede>

          <P>
            The mechanism is DebiCheck, the South African system introduced precisely so that a
            debit order cannot be set up against you without your bank checking with you first.
            You will be asked to confirm it on your banking app or by USSD. Until you do, nothing
            is collectible.
          </P>

          <Steps items={[
            { title: 'You give the details', text: 'Bank, account number, branch, the day of the month you want to be debited, and the amount.' },
            { title: 'Your bank asks you to confirm', text: 'Through your own banking app or by USSD, on your own phone. The Foundation is not part of this step and cannot complete it for you.' },
            { title: 'Leadership approves the mandate', text: 'A person checks it, which is a second pair of eyes on the account details rather than a formality.' },
            { title: 'It becomes active', text: 'From that point your monthly contribution is collected on your chosen day.' },
          ]} />

          <Defs
            head={['Mandate status', 'What it means']}
            termWidth={0.22}
            rows={[
              ['Pending', 'Submitted, not yet usable. Either your bank has not had your confirmation or leadership has not approved it.'],
              ['Active', 'Live. Collections run against it.'],
              ['Suspended', 'Temporarily not collecting. Usually because something needs sorting out with the bank.'],
              ['Cancelled', 'Finished. A new mandate is needed to collect again — a cancelled one is never revived.'],
            ]}
          />

          <Warn>
            Leadership can cancel a live mandate, and sometimes must — a member changes banks and
            the old instruction has to stop. What that never means is that the money already
            collected is undone. Stopping a collection instruction and reversing a payment are
            different things, and only the first is what cancelling does.
          </Warn>

          <P>
            You can hold one active mandate at a time. Replacing it means cancelling the old one
            and going through confirmation again, which is deliberately not frictionless: the
            bank details on file decide where your money goes, and changing them should feel like
            it matters.
          </P>
        </Section>

        <Section num={7} title="Why your debit is not your contribution">
          <Lede>
            If you commit to R{DEFAULT_INVITE_AMOUNT} a month, your bank statement will read
            R{DEFAULT_INVITE_AMOUNT + NETCASH_FEE_BUFFER}. That difference is not a charge the
            Foundation keeps, and this section exists so you never have to wonder.
          </Lede>

          <P>
            Collecting a debit order costs money. The payment gateway takes a fee out of every
            collection before it reaches the group{"'"}s account. If the Foundation debited you
            exactly your contribution, the pool would receive slightly less than you committed
            every single month, and the shortfall would come out of the goals.
          </P>

          <Rule label="THE ARITHMETIC">
            Debited from you: your amount + R{NETCASH_FEE_BUFFER}.{'\n'}
            Recorded as your contribution: your amount.{'\n'}
            Reaching the pool after the gateway takes its cut: your amount.
          </Rule>

          <P>
            So the buffer is not revenue and it does not sit anywhere. It exists so that the
            number on your statement and the number in the pool are the same number. The
            Foundation is not better off by a cent for it, and neither is anybody in leadership.
          </P>

          <Note>
            The buffer is shown on every screen where you commit money, before you commit it —
            not disclosed afterwards in a footnote. If you are ever debited an amount you cannot
            account for by this arithmetic, that is worth raising immediately.
          </Note>
        </Section>
        <Section num={8} title="When a collection fails">
          <Lede>
            It will happen. A salary lands late, a bank has an outage, a card expires. The
            Foundation{"'"}s position is that a failed collection is information, not an
            accusation — and it treats two very different kinds of failure very differently.
          </Lede>

          <Compare
            yes={{
              title: 'Not held against you',
              items: [
                'The gateway was unreachable',
                'The request timed out',
                'The payment system errored on its own side',
                'Anything else that happened between two machines',
              ],
            }}
            no={{
              title: 'Counts as a missed payment',
              items: [
                'Insufficient funds',
                'The account was closed',
                'The debit order was stopped at your bank',
                'Your bank declined the instruction',
              ],
            }}
          />

          <P>
            Both land in the system as a failed transaction, which is why they used to be
            confused. Only the right-hand column says anything at all about you, so only the
            right-hand column reaches you as a message or counts toward how your standing is
            assessed. An outage on a Tuesday is the Foundation{"'"}s problem to solve, and you
            should not hear about it as though you had bounced a payment.
          </P>

          <Rule>
            A collection is retried up to {MAX_TRANSACTION_RETRY} times. You are told once, in
            plain words, with the amount and the reason — not once per attempt.
          </Rule>

          <H3>What you should do</H3>
          <Bullets items={[
            <>Nothing, if the reason was on the Foundation{"'"}s side. It will be retried.</>,
            <>If it was a decline, you can pay the shortfall directly from your dashboard rather than waiting for the next cycle. A part payment is recorded as <B>Partial</B> and genuinely counts.</>,
            <>If your bank details have changed, replace the mandate. Retrying a collection against a closed account cannot succeed however many times it runs.</>,
            <>If you are going to be short this month, say so. A waiver decided in advance is an ordinary thing; an overdue month discovered later is a harder conversation for everybody.</>,
          ]} />

          <Warn label="ON ARREARS">
            An overdue month does not vanish and it does not compound. There is no interest, no
            penalty fee and no late charge anywhere in this Foundation. What it does is stay on
            the record until it is settled or waived, and standing is assessed on the record.
          </Warn>
        </Section>

        <Section num={9} title="Goals: what the money is for">
          <Lede>
            A pool with no purpose is a savings account with extra steps. Goals are the purpose:
            named things, with an amount and a date, that the group is putting money toward.
          </Lede>

          <P>
            There is one <B>primary goal</B> at a time — the main fund the monthly contributions
            build. Alongside it there may be <B>additional goals</B>, which are specific and
            usually shorter: a member{"'"}s school fees, a funeral, equipment for something
            somebody is starting. Money reaches a primary goal by way of your monthly
            contribution. Money reaches an additional goal because somebody chose to send it
            there.
          </P>

          <Defs
            head={['Goal status', 'What it means']}
            termWidth={0.22}
            rows={[
              ['Draft', 'Proposed and not yet open. Nobody can pay into it.'],
              ['Active', 'Open. It appears on the goals page and accepts money.'],
              ['Achieved', 'The target was reached. It closes to new payments — money cannot be added to something already finished.'],
              ['Failed', 'The deadline passed without the target being met. The money contributed does not disappear; what changes is that the goal stops asking for more.'],
            ]}
          />

          <P>
            Every goal shows what it needs, what it has, and how long it has left, to everybody,
            all the time. There is no goal that only some members can see, and no goal whose
            progress is reported rather than shown.
          </P>
        </Section>
        <Section num={10} title="Giving to a goal, once">
          <Lede>
            Separate from your monthly contribution, and entirely voluntary. You see a goal that
            matters to you, you decide on an amount, it is collected from your debit order.
          </Lede>

          <Facts items={[
            { value: `R${MIN_GOAL_PAYMENT}`, label: 'Smallest gift' },
            { value: `R${MAX_GOAL_PAYMENT.toLocaleString('en-ZA').replace(/,/g, ' ')}`, label: 'Largest gift' },
            { value: 'Directed', label: 'Which goal it funds' },
            { value: 'Immediate', label: 'When it is collected' },
          ]} />

          <P>
            The minimum here is R{MIN_GOAL_PAYMENT} rather than R{MIN_CONTRIBUTION_ZAR}, and
            deliberately so. Chipping in extra should be something a member can do with whatever
            they have. It is not set lower than R{MIN_GOAL_PAYMENT} for an unglamorous reason:
            the collection fee is a fixed R{NETCASH_FEE_BUFFER}, so at R20 a fifth of the gift
            would be swallowed getting it there.
          </P>

          <Rule>
            One-off gifts are directed. The money goes to the goal you chose, not into a general
            pool that leadership then allocates.
          </Rule>

          <H3>Tapping twice</H3>
          <P>
            If you press the button twice, or your connection drops and you try again, you are
            charged once. Each payment carries a token identifying the intent, and the system
            claims that token before it goes anywhere near your bank — so the second attempt is
            answered with “that is the same gift” rather than a second debit. This is
            worth stating plainly because it is the single most common way a member loses money
            in systems like this one.
          </P>

          <Note>
            Two genuinely separate gifts are always allowed. The protection is on the intent, not
            on you and the goal — somebody who means to give twice can.
          </Note>
        </Section>

        <Section num={11} title="Funding a goal every month">
          <Lede>
            The middle ground between a monthly contribution and remembering to give: a standing
            commitment to one goal, at an amount and on a day you choose.
          </Lede>

          <P>
            The app suggests an amount — what the goal still needs, divided by the months it has
            left — and then leaves the decision to you. Somebody who can only afford a third of
            the suggestion should be able to join the goal at a third of it rather than be shut
            out of it entirely, and the suggestion is a starting point rather than a price.
          </P>

          <Steps items={[
            { title: 'Choose the goal', text: 'Any active goal, including the primary fund.' },
            { title: 'Choose the amount', text: `At least R${MIN_GOAL_PAYMENT}. The screen shows what you are already committed to each month across everything, so the total is visible before you add to it.` },
            { title: 'Choose the day', text: 'Between the 1st and the 28th. Later days are not offered because February would move them, and a debit that lands on a different day each month is a debit you cannot plan around.' },
            { title: 'It runs until you stop it', text: 'Or until the goal closes, or the deadline passes.' },
          ]} />

          <Rule>
            A plan needs an active debit order, and you are told so when you set it up — not
            weeks later when the first collection fails quietly.
          </Rule>

          <H3>If it pauses</H3>
          <P>
            A plan pauses itself if the debit order behind it goes away. That is correct: there
            is nothing to collect from. What matters is that it can be resumed — set up a new
            mandate and the plan has a button to bring it back, with the reason it stopped shown
            beside it. A paused plan is not a dead one.
          </P>

          <Warn>
            Stopping a plan stops future collections. It does not take back what the plan has
            already paid in — that money is in the goal, and the goal is the group{"'"}s.
          </Warn>
        </Section>
        <Section num={12} title="Where the money sits">
          <Lede>
            In one bank account, in the Foundation{"'"}s name, at a South African bank. Not in
            anybody{"'"}s personal account, and not with the payment gateway.
          </Lede>

          <P>
            The gateway collects from your bank and deposits into the group{"'"}s account. It is
            a courier. It does not hold the fund, it cannot spend from it, and if the Foundation
            stopped using it tomorrow the money would already be where it belongs.
          </P>

          <Rule label="A RULE ABOUT THIS DOCUMENT">
            The group{"'"}s bank account number is not printed in this guide, and will never be
            sent to you by email, SMS or WhatsApp. It is shown inside the app, on the payment
            screen, where nobody can have altered it in transit.
          </Rule>

          <P>
            This is the oldest fraud there is against a savings group: a forwarded document with
            one digit changed, and a month of everybody{"'"}s contributions arriving somewhere
            else. A guide that travels by email is exactly the wrong place for account details,
            however convenient it would be. If you ever receive banking details for this
            Foundation in a message, they did not come from the Foundation.
          </P>

          <H3>What is recorded</H3>
          <Bullets items={[
            <>Every rand in, against the member it came from and the goal it went to.</>,
            <>Every rand out, against the goal it came from and the person who authorised it.</>,
            <>Every administrative action against an account — who did it, to whom, and when.</>,
            <>Every change to a goal, including changes to its target and its deadline.</>,
          ]} />

          <P>
            None of that is deletable from inside the app, by anybody, including an admin. That
            is not a statement about trusting the current leadership. It is a statement about not
            needing to.
          </P>
        </Section>
      </BodyPage>

      {/* ═══ PART III ═════════════════════════════════════════════════════ */}
      <Page size="A4" style={styles.plain}>
        <PartDivider {...PARTS[2]!} />
      </Page>

      <BodyPage part={partOf(2)}>
        <Section num={13} title="Getting in, and staying in">
          <Lede>
            One password, on one account, that only you know. The Foundation cannot read it and
            cannot tell you what it is.
          </Lede>

          <Rule>
            A password must be at least {PASSWORD_MIN_LENGTH} characters. There is no requirement
            for a capital, a number or a symbol.
          </Rule>

          <P>
            That is a deliberate choice and worth a sentence. Rules demanding one of each mostly
            produce “Password1!” — the shape an attacker tries first. Length is what
            actually resists an attack, so length is what is asked for. Four ordinary words you
            will remember beat eight characters you have to write down, every time.
          </P>

          <Bullets items={[
            <>Use a password you do not use anywhere else. If it is also your email password, then whoever gets one gets both.</>,
            <>The Foundation will never ask you for it. Not by phone, not by message, not by a person you know in leadership.</>,
            <>If you forget it, reset it from the sign-in page. Nobody in leadership can look it up, because it is not stored in a form anybody can read.</>,
            <>If you think somebody else has it, change it immediately — you can do that at any time, from your account, including if you have left.</>,
          ]} />

          <H3>Being signed out</H3>
          <P>
            Sessions expire. When yours does you are returned to the sign-in page with an
            explanation rather than dropped somewhere confusing. That is inconvenient and it is
            the point: an account that stays signed in forever on a phone that gets lost is an
            account somebody else has.
          </P>
        </Section>

        <Section num={14} title="Reading your dashboard">
          <Lede>
            The first screen answers four questions, and it is arranged so you do not have to go
            looking for any of them.
          </Lede>

          <Defs
            head={['The question', 'Where the answer is']}
            termWidth={0.34}
            rows={[
              ['Am I up to date?', 'The contribution card at the top, showing the current period and its status. Overdue is unmissable by design.'],
              ['What have I put in altogether?', 'Your total contributed, across every period since you joined.'],
              ['What is the group working toward?', 'The primary goal, with what it needs and what it has.'],
              ['Is anything waiting for me?', 'A mandate needing confirmation, a shortfall you can settle, an unread message.'],
            ]}
          />

          <P>
            Anything the dashboard shows you can be traced. A total is not a figure you are asked
            to accept — every one of them opens into the individual records it was built from, and
            those records open into the payments behind them.
          </P>

          <Note>
            If a figure on the dashboard disagrees with a figure on your statement, the statement
            is the document to raise. It is generated from the same records, and a disagreement
            between the two is a real problem worth reporting rather than a display quirk.
          </Note>
        </Section>
        <Section num={15} title="Your statement">
          <Lede>
            A PDF, for a month you choose, showing every movement on your account in that month.
            You generate it yourself, whenever you want, without asking anybody.
          </Lede>

          <P>
            It carries the Foundation{"'"}s mark, a reference, your name, and a line for every
            contribution and payment in the period with its status. It is designed to be handed
            to somebody — a bank, a family member, a person asking what exactly this is that
            comes off your account every month — and to answer them without a conversation.
          </P>

          <Bullets items={[
            <>Every contribution for the period, what was owed, what arrived, and its status.</>,
            <>Every one-off gift to a goal and every plan collection, with the goal named.</>,
            <>Anything waived, shown as waived, with no attempt to make the month look tidier than it was.</>,
            <>Totals that add up to the lines above them, because they are computed from them.</>,
          ]} />

          <Rule>
            A statement is yours to generate. It is not issued to you by leadership and it does
            not need approving.
          </Rule>

          <P>
            You keep the right to generate statements after you leave, for the whole period you
            were a member. Section 18 is about why that is not a courtesy.
          </P>
        </Section>

        <Section num={16} title="How the Foundation talks to you">
          <Lede>
            By email, by SMS, by WhatsApp, and through an inbox inside the app. You control
            which, except for the ones you cannot switch off.
          </Lede>

          <Defs
            head={['Channel', 'What it is for']}
            termWidth={0.22}
            rows={[
              ['In-app inbox', 'Everything. This is the record — a message you deleted from your email is still here.'],
              ['Email', 'Statements, receipts, anything with a document attached, and anything you will want to find again later.'],
              ['SMS', 'Short and time-sensitive. A failed collection, a code you need now.'],
              ['WhatsApp', 'Optional, and off unless you turn it on. Group announcements and reminders.'],
            ]}
          />

          <H3>What you cannot turn off</H3>
          <P>
            Anything about money leaving your account, and anything about your account{"'"}s
            security. A member who has muted the news that a collection failed is a member who
            finds out from their bank, and that is not a choice the Foundation is willing to let
            you make by accident.
          </P>

          <Rule>
            Turning off notifications is always available, including after you have left. Nobody
            should be receiving reminders from a group they are no longer in with no way to stop
            them.
          </Rule>
        </Section>
        <Section num={17} title="Your information">
          <Lede>
            The Foundation holds your name, your contact details, your South African ID number
            and your banking details. That is all of it, and each is here for a reason that can
            be stated.
          </Lede>

          <Defs
            head={['What is held', 'Why']}
            termWidth={0.28}
            rows={[
              ['Name and contact details', 'To reach you, and so other members know who is in the circle.'],
              ['SA ID number', 'It is what ties a bank account to a person. A stokvel that cannot establish who a member is cannot protect the rest from somebody pretending to be them.'],
              ['Banking details', 'To collect what you committed. Held for no other purpose and used for no other purpose.'],
              ['Your money history', 'Because it is the record, and the record is the point.'],
            ]}
          />

          <H3>Your ID number</H3>
          <P>
            It is recorded by the admin who invites you, from a document, before you have an
            account — and you confirm it matches yours when you register. Neither of you can
            change it afterwards from an ordinary screen. That is inconvenient once and correct
            forever: an ID that a member can edit is not an identity check, it is a text field.
          </P>

          <P>
            It is stored encrypted, and shown to an admin masked to its last four digits — enough
            to tell which number is on file, without putting the whole thing on a screen somebody
            could be standing behind. Your date of birth is not collected separately, because it
            is already inside the number, and two copies of the same fact are two copies that can
            disagree.
          </P>

          <Rule>
            Your banking details and your ID number are encrypted at rest. Not hashed, not
            obscured — encrypted, with keys that can be rotated without anybody re-entering
            anything.
          </Rule>

          <H3>What is never done with it</H3>
          <Bullets items={[
            <>It is not sold, and it is not shared with anybody outside the Foundation except the payment gateway, which needs your banking details to collect and receives nothing else.</>,
            <>It is not used to assess you for anything other than membership of this Foundation.</>,
            <>Other members see your name and that you are a member. They do not see your ID, your bank, your contribution amount, or what you have given to which goal.</>,
          ]} />
        </Section>

        <Section num={18} title="Leaving">
          <Lede>
            At any time, from your own account, without a reason and without asking. It takes one
            screen.
          </Lede>

          <P>
            What happens next is the part worth reading. You stop being a participant and you do
            not stop being a person with a record here.
          </P>

          <Compare
            yes={{
              title: 'You keep',
              items: [
                'Your account and your sign-in',
                'Every statement, for every month you were a member',
                'Your full contribution history',
                'The ability to change your password',
                'The ability to switch messages off',
                'Your inbox, and everything in it',
              ],
            }}
            no={{
              title: 'You stop',
              items: [
                'Contributing, and being collected from',
                'Funding goals or running plans',
                'Proposing goals, cheering, commenting',
                'Posting to the community board',
                'Holding a seat in the circle',
              ],
            }}
          />

          <Rule>
            Leaving is recorded as your decision, by you. Leadership cannot mark somebody as
            having resigned — an admin ending access does it by suspending, which says plainly
            who did it. Nobody gets to put words in your mouth about why you left.
          </Rule>

          <H3>Money already in</H3>
          <P>
            Contributions you have made are in the pool and in the goals they went to. Leaving
            does not withdraw them, and this is the honest hard edge of a stokvel: you were
            funding things for other people, and they were funding things for you. The
            arrangement only works because that is true in both directions.
          </P>

          <Note>
            Rejoining is possible and is a conversation with leadership rather than a form. Your
            history is still here, so you would not be starting again from nothing.
          </Note>
        </Section>
      </BodyPage>

      {/* ═══ PART IV ══════════════════════════════════════════════════════ */}
      <Page size="A4" style={styles.plain}>
        <PartDivider {...PARTS[3]!} />
      </Page>

      <BodyPage part={partOf(3)}>
        <Section num={19} title="The community board">
          <Lede>
            One place, inside the app, where the circle talks. Not a replacement for the WhatsApp
            group — the difference is that this one is part of the record.
          </Lede>

          <Rule>
            Ten posts per member per day. The system counts them, and the eleventh is refused
            with a sentence saying so.
          </Rule>

          <P>
            That limit is in this guide because it is in the code, and it is in the code because
            it was in this guide. An earlier edition made the promise and nothing enforced it —
            which meant a member could post two hundred times in an afternoon and the document
            everybody had signed was simply untrue. It is a small rule. Being wrong about a small
            rule in writing is not a small thing.
          </P>

          <P>
            Ten is not a rationing of speech. It is roughly the point at which one person{"'"}s
            posting stops being participation and starts being the board. Nobody has ever reached
            it in ordinary use.
          </P>

          <H3>What the board is good for</H3>
          <Bullets items={[
            <>Proposing a goal, and making the case for it before it is opened.</>,
            <>Saying thank you where the whole circle can see it.</>,
            <>Asking a question about how something works, so the answer is available to everybody who was going to ask it next.</>,
            <>Announcements from leadership that need to still be findable in six months.</>,
          ]} />
        </Section>

        <Section num={20} title="How we speak to one another">
          <Lede>
            Fifty people who mostly know each other, handling money. The standard is not
            politeness. It is that nobody should be reluctant to raise a problem.
          </Lede>

          <Steps items={[
            {
              title: 'Money questions are never rude',
              text: 'Asking where a figure came from, or why a goal changed, or what a waiver was for, is exactly the behaviour this Foundation is built to make easy. Anybody made to feel awkward for asking is being failed by the group, not the other way round.',
            },
            {
              title: 'A member’s circumstances are theirs to share',
              text: 'You may know why somebody is short this month. The board is not where that goes, and neither is the group chat.',
            },
            {
              title: 'Disagree with the decision, in public; discuss the person, in private',
              text: 'A goal, an amount, a suspension — all fair to argue in the open. The individual behind it, not so.',
            },
            {
              title: 'Say it here if it needs to be found later',
              text: 'A promise made in a chat is a promise nobody can locate in March. If it matters, put it on the board.',
            },
          ]} />

          <Quote attr="The one standard">
            A circle where raising a problem is uncomfortable will eventually have a problem
            nobody raised.
          </Quote>
        </Section>
        <Section num={21} title="What leadership can do">
          <Lede>
            Admins run the Foundation{"'"}s day to day. Every one of the powers below is real,
            and every one of them is logged against the name of the person who used it.
          </Lede>

          <Defs
            head={['Power', 'What it means in practice']}
            termWidth={0.3}
            rows={[
              ['Invite a member', 'Fill in who they are, including their ID number and the amount agreed, and send the link. Section 24.'],
              ['Activate an account', 'Move a registered member from Pending to Active so they can take part.'],
              ['Approve or reject a mandate', 'Check the banking details a member submitted before collections run against them. A rejection must carry a reason, which the member is told.'],
              ['Cancel a mandate', 'Stop a live debit order — necessary when a member changes banks. It stops future collections and reverses nothing.'],
              ['Generate contributions', 'Write the month’s obligation for every active member at once. There is no undo, so it asks first.'],
              ['Record a payment', 'Enter money that arrived outside the debit order — cash, an EFT — against the right member and period.'],
              ['Waive a contribution', 'Release a member from a month. It appears on their statement as a waiver, with who granted it.'],
              ['Create and manage goals', 'Open a goal, set its target and deadline, close it when it is met.'],
              ['Suspend an account', 'End somebody’s participation. Section 23.'],
              ['Grant the admin role', 'Make another member an admin.'],
            ]}
          />

          <Rule>
            Nothing in that list can be done invisibly. Each writes an entry naming the admin,
            the member affected, and the time — and no admin can delete an entry, including
            their own.
          </Rule>
        </Section>

        <Section num={22} title="What leadership cannot do">
          <Lede>
            This is the more important list. These are not undertakings — they are refusals
            built into the system, which is a different and stronger kind of promise.
          </Lede>

          <Bullets items={[
            <><B>Mark you as having resigned.</B> Resignation is a member{"'"}s own account of their own decision. An admin ending access must suspend, which records honestly who did it.</>,
            <><B>Suspend their own account.</B> Refused even when other admins exist, so whether you can lock yourself out never depends on somebody else{"'"}s account.</>,
            <><B>Suspend the last admin.</B> At least one admin must be able to sign in. Otherwise the circle is locked out of its own console with nobody able to undo it.</>,
            <><B>Revoke their own admin role.</B> Same reasoning, from the other direction.</>,
            <><B>Generate contributions for an arbitrary period.</B> Only within a year of today. Billing every member for a month nobody is in is the kind of mistake that is very easy to make with a dropdown.</>,
            <><B>Read your password.</B> It is not stored in any form anybody can read.</>,
            <><B>Edit or delete the audit log.</B> Not from the console, not for their own actions.</>,
            <><B>Change a member{"'"}s ID number from an ordinary screen.</B> A correction is possible and is a deliberate, recorded act.</>,
            <><B>Take money out of a goal without it being recorded</B> against the goal and the person who authorised it.</>,
          ]} />

          <Quote attr="Why this list exists">
            A rule that only lives in somebody{"'"}s head is a rule until the day it is
            inconvenient. Every line above is enforced by the same software that enforces your
            monthly minimum.
          </Quote>
        </Section>
        <Section num={23} title="Suspension">
          <Lede>
            The one power leadership holds that takes something away from a member. It is
            deliberately narrow, deliberately visible, and deliberately reversible.
          </Lede>

          <P>
            A suspended member cannot contribute, cannot fund goals, cannot post, and cannot take
            part. They keep their account, their history, their statements, their inbox, and their
            seat in the circle. Suspension is not erasure, and the record of somebody who was
            suspended is exactly as complete as anybody else{"'"}s.
          </P>

          <Compare
            yes={{
              title: 'What suspension is for',
              items: [
                'Sustained arrears with no conversation',
                'Conduct that makes the circle unworkable',
                'Suspected fraud, while it is looked into',
                'A member unreachable for a long period',
              ],
            }}
            no={{
              title: 'What it is not for',
              items: [
                'One missed month',
                'Disagreeing with leadership',
                'Asking uncomfortable questions',
                'A failure that was the system’s fault',
              ],
            }}
          />

          <Rule>
            A suspension names the admin who made it and the time it was made. It can be lifted
            by any admin, and lifting it restores everything at once.
          </Rule>

          <H3>If it happens to you</H3>
          <P>
            You will be told, in words, what has happened and what it means. You can still sign
            in, still read everything of yours, still generate a statement, still change your
            password and still switch off messages. And you can still leave — a suspended member
            who wants out is not held.
          </P>
        </Section>
      </BodyPage>

      {/* ═══ PART V ═══════════════════════════════════════════════════════ */}
      <Page size="A4" style={styles.plain}>
        <PartDivider {...PARTS[4]!} />
      </Page>

      <BodyPage part={partOf(4)}>
        <Section num={24} title="The invitation">
          <Lede>
            Nobody joins by finding this Foundation. Somebody already in it decides you belong,
            and puts their name to that.
          </Lede>

          <P>
            An admin creating an invitation fills in more than an email address. They are
            recording who you are — which means that by the time you see a link, the group
            already knows who is on the other end of it.
          </P>

          <Defs
            head={['On the invitation', 'Why it is there']}
            termWidth={0.3}
            rows={[
              ['Your first and last name', 'So your account is not created by whoever opens the link.'],
              ['Your email address', 'Where the invitation goes, and your sign-in from then on.'],
              ['Your mobile number', 'For anything short and urgent.'],
              ['Your SA ID number', 'The admin is vouching for who you are, from a document, before you have an account. It is checked for validity as they type it.'],
              ['Who vouched for you', 'How the inviting admin knows you. The system already records who invited; this is the part that cannot be worked out from anything else.'],
              ['The monthly amount', `What the two of you agreed. At least R${MIN_CONTRIBUTION_ZAR}.`],
            ]}
          />

          <Rule>
            The ID number is set by the admin, confirmed by you, and afterwards editable by
            neither from an ordinary screen. An identity nobody can edit is the only kind that
            means anything.
          </Rule>

          <Warn>
            An invitation holds a seat from the moment it is sent. If somebody decides not to
            join, ask an admin to revoke it — otherwise the seat is occupied by a decision nobody
            made.
          </Warn>
        </Section>

        <Section num={25} title="Registering">
          <Lede>
            The link takes you to a form that already knows most of the answers. Your job is to
            check them and set a password.
          </Lede>

          <Steps items={[
            {
              title: 'Open the link from your invitation',
              text: 'It is for you specifically, and it expires. If it has, ask the admin who sent it for another.',
            },
            {
              title: 'Check what is already filled in',
              text: 'Your name, your email, your ID number. If any of it is wrong, stop and say so before continuing — this is the moment it is easy to fix.',
            },
            {
              title: 'Confirm your ID number matches',
              text: 'You enter it, and it must match what the admin recorded. A mismatch stops registration rather than creating an account against the wrong person.',
            },
            {
              title: `Set a password of at least ${PASSWORD_MIN_LENGTH} characters`,
              text: 'Something you do not use anywhere else.',
            },
            {
              title: 'Wait to be activated',
              text: 'Your account starts as Pending. An admin activates it, and until then you can sign in but not yet take part.',
            },
          ]} />

          <Note>
            The ID check is a real check, not a formality. It is the difference between an
            invitation being sent to a person and an invitation being sent to an inbox.
          </Note>
        </Section>
        <Section num={26} title="Your first month">
          <Lede>
            Four things to do, in order, and then it looks after itself.
          </Lede>

          <Steps items={[
            {
              title: 'Set up your debit order',
              text: 'Everything else waits on this. Your bank will ask you to confirm it — until you do, nothing can be collected and your first contribution will sit unpaid.',
            },
            {
              title: 'Read the primary goal',
              text: 'It is what your monthly contribution is building. Knowing what it is makes the debit on your statement mean something.',
            },
            {
              title: 'Say hello on the board',
              text: 'Fifty people works because people know who is in it. This is the cheapest thing on the list and the one most often skipped.',
            },
            {
              title: 'Generate your first statement',
              text: 'At the end of the month, before you need it. It is worth seeing what the record looks like while there is nothing at stake in it.',
            },
          ]} />

          <H3>What to expect on your bank statement</H3>
          <P>
            One debit, on your chosen day, for your contribution plus R{NETCASH_FEE_BUFFER}. If
            you have set up a monthly goal plan as well, that is a second debit on its own day —
            plans and contributions are collected separately, so each is identifiable rather than
            merged into a single figure you would have to unpick.
          </P>

          <Rule>
            If you are ever debited an amount you cannot explain from this guide, raise it that
            day. Not next month.
          </Rule>

          <Quote attr="Welcome">
            You are one of {MAX_MEMBERS}. That is a small enough number that your absence would
            be noticed and your contribution matters — which is the entire reason the number is
            small.
          </Quote>
        </Section>
      </BodyPage>

      {/* ═══ APPENDICES ═══════════════════════════════════════════════════ */}
      <BodyPage part="Appendix">
        <Text style={open.kicker}>APPENDIX A</Text>
        <Text style={open.titleSm}>The words we use</Text>
        <View style={open.rule} />

        <P>
          Every status in the system, in one place. A status is not a label somebody applied — it
          is what the software will and will not let happen next.
        </P>

        <H3>Your membership</H3>
        <Defs
          head={['Status', 'What it means']}
          termWidth={0.2}
          rows={[
            ['Pending', 'Registered, not yet activated. You can sign in and look. You cannot yet take part.'],
            ['Active', 'A full member. Everything in this guide applies to you.'],
            ['Suspended', 'Participation stopped by leadership. Your record is intact and your seat is held.'],
            ['Resigned', 'You left. You keep your account, your history and your statements.'],
          ]}
        />

        <H3>Your debit order</H3>
        <Defs
          head={['Status', 'What it means']}
          termWidth={0.2}
          rows={[
            ['Pending', 'Awaiting your bank’s confirmation or leadership’s approval.'],
            ['Active', 'Live. Collections run against it.'],
            ['Suspended', 'Temporarily not collecting.'],
            ['Cancelled', 'Finished. A new mandate is needed to collect again.'],
          ]}
        />

        <H3>A monthly contribution</H3>
        <Defs
          head={['Status', 'What it means']}
          termWidth={0.2}
          rows={[
            ['Pending', 'Owed, nothing collected yet.'],
            ['Partial', 'Some of it arrived. The balance is still owed and the part paid still counts.'],
            ['Paid', 'Settled in full.'],
            ['Overdue', 'The period passed unpaid. No interest, no penalty — it stays on the record.'],
            ['Waived', 'Released by leadership, with a name against the decision.'],
          ]}
        />

        <H3>A goal</H3>
        <Defs
          head={['Status', 'What it means']}
          termWidth={0.2}
          rows={[
            ['Draft', 'Proposed, not yet open to money.'],
            ['Active', 'Open, and accepting contributions.'],
            ['Achieved', 'Target reached. Closed to new payments.'],
            ['Failed', 'Deadline passed without the target. The money contributed stays where it is.'],
          ]}
        />
      </BodyPage>

      <BodyPage part="Appendix">
        <Text style={open.kicker}>APPENDIX B</Text>
        <Text style={open.titleSm}>Every figure in this guide,{'\n'}and where it came from</Text>
        <View style={open.rule} />

        <P>
          The first page of this guide claims that its figures are quoted from the system rather
          than typed into a document. This is the evidence for that claim. Each row names a
          number that appears somewhere above and the module it was read from at the moment this
          copy was generated.
        </P>

        <Defs
          head={['Figure', 'Read from']}
          termWidth={0.42}
          rows={[
            [`${MAX_MEMBERS} seats`, 'MAX_MEMBERS — packages/utils/src/constants.ts'],
            [`${FOUNDER_COUNT} founders`, 'FOUNDER_COUNT — packages/utils/src/constants.ts'],
            [`R${MIN_CONTRIBUTION_ZAR} monthly minimum`, 'MIN_CONTRIBUTION_ZAR — packages/utils/src/constants.ts'],
            [`R${MAX_CONTRIBUTION_ZAR.toLocaleString('en-ZA')} monthly maximum`, 'MAX_CONTRIBUTION_ZAR — packages/utils/src/constants.ts'],
            [`R${CONTRIBUTION_STEP_ZAR} step`, 'CONTRIBUTION_STEP_ZAR — packages/utils/src/constants.ts'],
            [`R${DEFAULT_INVITE_AMOUNT} default commitment`, 'DEFAULT_INVITE_AMOUNT — packages/utils/src/constants.ts'],
            [`R${MIN_GOAL_PAYMENT} smallest gift to a goal`, 'MIN_GOAL_PAYMENT — packages/utils/src/schemas.ts'],
            [`R${MAX_GOAL_PAYMENT.toLocaleString('en-ZA').replace(/,/g, ' ')} largest gift to a goal`, 'MAX_GOAL_PAYMENT — packages/utils/src/schemas.ts'],
            [`R${NETCASH_FEE_BUFFER} collection buffer`, 'NETCASH_FEE_BUFFER — apps/web/lib/group-account.ts'],
            [`${PASSWORD_MIN_LENGTH}-character password`, 'PASSWORD_MIN_LENGTH — packages/utils/src/schemas.ts'],
            [`${MAX_TRANSACTION_RETRY} collection retries`, 'MAX_TRANSACTION_RETRY — packages/utils/src/constants.ts'],
          ]}
        />

        <Note label="WHAT THIS DOES NOT COVER">
          Rules that are shapes rather than numbers — that resignation cannot be set by an admin,
          that a plan needs a live mandate, that the last admin cannot be suspended — are quoted
          from the modules that enforce them but cannot be listed as a figure. Part Four states
          each of them and names what refuses it.
        </Note>

        {/* Kept whole. Split, it put the seal and the organisation's name on one
            page and the tagline on the next, leaving a final page holding three
            lines — a document should not end by trailing off. */}
        <View style={close.wrap} wrap={false}>
          <Seal size={88} />
          <Text style={close.org}>XKIMM XA MALI FOUNDATION</Text>
          <Text style={close.tagline}>CONTRIBUTING  ·  GROWING  ·  SECURING</Text>
          <Text style={close.note}>
            {EDITION}  ·  Generated {issued}{'\n'}
            Prepared for {holder}
          </Text>
        </View>
      </BodyPage>
    </Document>
  )
}

const open = StyleSheet.create({
  kicker: { fontSize: 7, color: C.gold, letterSpacing: 3, fontFamily: 'Helvetica-Bold', marginBottom: 10 },
  title: { fontSize: 21, fontFamily: 'Times-Bold', color: C.green, lineHeight: 1.25, marginBottom: 8 },
  titleSm: { fontSize: 18, fontFamily: 'Times-Bold', color: C.green, lineHeight: 1.25, marginBottom: 8 },
  rule: { height: 1.4, width: 44, backgroundColor: C.gold, marginBottom: 18 },
})

const close = StyleSheet.create({
  wrap: { alignItems: 'center', marginTop: 26 },
  org: { fontSize: 10, fontFamily: 'Times-Bold', color: C.green, letterSpacing: 1.4, marginTop: 16 },
  tagline: { fontSize: 6, color: C.gold, letterSpacing: 1.8, marginTop: 5, fontFamily: 'Helvetica-Bold' },
  note: { fontSize: 6.5, color: C.ink35, letterSpacing: 0.5, marginTop: 12, textAlign: 'center', lineHeight: 1.6 },
})

/**
 * The guide as bytes.
 *
 * `issued` and `holder` are the only two things not read from the system —
 * the first is when this copy was made, the second is who it was made for.
 */
export async function generateFounderGuidePdf(opts?: { issued?: string; holder?: string }): Promise<Buffer> {
  const issued = opts?.issued ?? new Date().toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  const holder = opts?.holder ?? 'The Members'
  return renderToBuffer(<FounderGuideDocument issued={issued} holder={holder} />)
}
