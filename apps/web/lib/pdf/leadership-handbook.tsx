import React from 'react'
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import {
  MAX_MEMBERS, FOUNDER_COUNT, MIN_CONTRIBUTION_ZAR, PASSWORD_MIN_LENGTH,
} from '@xxm/utils'
import { NETCASH_FEE_BUFFER } from '@/lib/group-account'
import { registerGuideFonts } from './guide-assets'
import {
  G, PAGE, RunningHead, RunningFoot, GhostNumeral, EdgeTab, Contents, PartDivider,
  Kicker, Heading, H2, Lede, P, HB, HeroPanel, Advice, Stats, IconList,
  JourneyRail, Table, Compare, Quote, DiamondRule, NightGround, Guilloche, Diamond,
} from './guide-kit'
import { XmmMark } from './kit'

/**
 * The Leadership Handbook — the companion to the Founder Guide.
 *
 * The guide answers "what does the Foundation owe me and ask of me" for a
 * member. This answers the other half: what leadership actually does, week to
 * week, and what the relationship between an admin and a member is made of.
 *
 * It is a separate document rather than a part of the guide because the two
 * have different readers and different jobs. Every member should read the
 * guide. Only the people running the Foundation need this — and they need it in
 * one place, because the alternative is four brothers each remembering a
 * slightly different version of how a waiver works.
 *
 * Same voice and same design language as the guide, for the same reason: no
 * file names, no field names, nothing that assumes the reader builds software.
 * Three of the four do not.
 */

const VERSION = '1.0'
const RELEASED = 'August 2026'

const zar = (n: number) => `R${n.toLocaleString('en-ZA').replace(/,/g, ' ')}`

// ─── Structure, and the page numbers it implies ────────────────────────────────

const RAW_PARTS = [
  {
    roman: 'I', numeral: 'I', title: 'The Shape of It', italic: 'What Leadership Is',
    conviction: 'Leadership here is not a rank. It is a set of jobs somebody has to do, ',
    convictionTail: 'done where everyone can see them.',
    label: 'Where authority comes from',
    sections: [
      { num: 1, title: 'What This Handbook Is' },
      { num: 2, title: 'The Two Sides' },
      { num: 3, title: 'What Binds You Too' },
    ],
  },
  {
    roman: 'II', numeral: 'II', title: 'Bringing Someone In', italic: 'From Link to Member',
    conviction: 'Nobody joins by finding us. Somebody already inside decides they belong, ',
    convictionTail: 'and puts their name to it.',
    label: 'The way in',
    sections: [
      { num: 4, title: 'The Invitation, and What You Vouch For' },
      { num: 5, title: 'From Link to Active Member' },
      { num: 6, title: 'Approving a Debit Order' },
    ],
  },
  {
    roman: 'III', numeral: 'III', title: 'The Month', italic: 'The Work That Repeats',
    conviction: 'Most of leadership is one month done properly, ',
    convictionTail: 'and then done again.',
    label: 'The rhythm',
    sections: [
      { num: 7, title: 'Opening the Month' },
      { num: 8, title: 'When the Money Arrives' },
      { num: 9, title: 'When It Does Not' },
      { num: 10, title: 'Waiving, and Money That Came Another Way' },
    ],
  },
  {
    roman: 'IV', numeral: 'IV', title: 'Looking After People', italic: 'The Harder Half',
    conviction: 'A member in trouble is a member, not a debtor. ',
    convictionTail: 'Everything in this part follows from that.',
    label: 'When something is wrong',
    sections: [
      { num: 11, title: 'Suspension, and What It Is Not' },
      { num: 12, title: 'When a Member Leaves' },
      { num: 13, title: 'Correcting What Is on File' },
    ],
  },
  {
    roman: 'V', numeral: 'V', title: 'The Pool and the Record', italic: 'What You Are Holding',
    conviction: 'You are not trusted because you are honest. You are trusted because ',
    convictionTail: 'nothing you do can be hidden.',
    label: 'Accountability',
    sections: [
      { num: 14, title: 'Goals: Opening, Funding, Closing' },
      { num: 15, title: 'What the System Will Refuse You' },
      { num: 16, title: 'The Record, and the Handover' },
    ],
  },
]

/** Cover 1, contents 2, then a divider and one page per section. */
const PAGES = (() => {
  const sectionPage = new Map<number, number>()
  let p = 3
  for (const part of RAW_PARTS) {
    p++
    for (const s of part.sections) sectionPage.set(s.num, p++)
  }
  return { sectionPage, total: p }
})()

const TOTAL = PAGES.total
const pg = (n: number) => PAGES.sectionPage.get(n)!

const CONTENTS_PARTS = RAW_PARTS.map((part) => ({
  roman: part.roman,
  title: part.title,
  sections: part.sections.map((s) => ({ ...s, page: pg(s.num) })),
}))

// ─── Page shells ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  body: { backgroundColor: G.page, paddingTop: 92, paddingBottom: 56, paddingHorizontal: PAGE.gutter },
  dark: { backgroundColor: G.night, padding: 0 },
})

function Section({
  num, title, kicker, plain, italic, children,
}: {
  num: number; title: string; kicker: string; plain: string; italic?: string
  children: React.ReactNode
}) {
  return (
    <Page size="A4" style={styles.body}>
      <RunningHead where={`${String(num).padStart(2, '0')} · ${title}`} doc="LEADERSHIP HANDBOOK" />
      <EdgeTab />
      <GhostNumeral n={pg(num)} />
      <Kicker>{kicker}</Kicker>
      <Heading plain={plain} italic={italic} />
      {children}
      <RunningFoot doc="LEADERSHIP HANDBOOK" />
    </Page>
  )
}

const cov = StyleSheet.create({
  page: { flex: 1, height: '100%', position: 'relative' },
  inner: { flex: 1, paddingHorizontal: 56, paddingTop: 52, paddingBottom: 46 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  conf: { alignItems: 'flex-end' },
  confA: { fontFamily: 'Geist', fontSize: 6.3, fontWeight: 600, color: G.gold, letterSpacing: 2 },
  confB: { fontFamily: 'Geist', fontSize: 5.5, color: G.greenSoft, letterSpacing: 1.6, marginTop: 4 },
  eyebrow: { fontFamily: 'Geist', fontSize: 6.6, fontWeight: 600, color: G.gold, letterSpacing: 3, marginBottom: 13 },
  title: { fontSize: 41, fontFamily: 'Times-Bold', color: '#FFFFFF', lineHeight: 1.1 },
  titleGold: { fontFamily: 'Times-BoldItalic', color: G.gold },
  rule: { height: 1.6, width: 128, backgroundColor: G.gold, marginTop: 19, marginBottom: 17 },
  blurb: { fontFamily: 'Geist', fontSize: 8.6, color: '#C6D9CF', lineHeight: 1.78, maxWidth: 396 },
  note: {
    borderWidth: 0.8, borderColor: 'rgba(212,175,55,0.45)', borderRadius: 3,
    paddingHorizontal: 16, paddingVertical: 13, marginTop: 22, maxWidth: 404,
  },
  noteText: { fontSize: 9.4, fontFamily: 'Times-Italic', color: '#FFFFFF', lineHeight: 1.5 },
  plinth: {
    borderTopWidth: 0.7, borderTopColor: 'rgba(212,175,55,0.35)', paddingTop: 13,
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 20,
  },
  pLabel: { fontFamily: 'Geist', fontSize: 5.5, color: G.greenSoft, letterSpacing: 1.6, marginBottom: 5 },
  pValue: { fontSize: 9, fontFamily: 'Times-Bold', color: '#FFFFFF', letterSpacing: 0.4 },
})

// ─── The document ──────────────────────────────────────────────────────────────

export function LeadershipHandbookDocument({ holder }: { holder: string }) {
  return (
    <Document
      title="Xkimi Xa Mali Foundation — The Leadership Handbook"
      author="Xkimi Xa Mali Foundation"
      subject="How leadership runs the Foundation, and what it owes the members"
    >
      {/* ═══ COVER ════════════════════════════════════════════════════════ */}
      <Page size="A4" style={styles.dark}>
        <View style={cov.page}>
          <NightGround />
          <Guilloche cx={640} cy={340} />
          <View style={cov.inner}>
            <View style={cov.top}>
              <XmmMark size={58} />
              <View style={cov.conf}>
                <Text style={cov.confA}>PRIVATE &amp; CONFIDENTIAL</Text>
                <Text style={cov.confB}>LEADERSHIP ONLY</Text>
              </View>
            </View>

            <View style={{ marginTop: 66 }}>
              <Text style={cov.eyebrow}>XKIMI XA MALI FOUNDATION</Text>
              <Text style={cov.title}>The Leadership{'\n'}<Text style={cov.titleGold}>Handbook</Text></Text>
              <View style={cov.rule} />
              <Text style={cov.blurb}>
                The companion to the Founder Guide. That book tells a member what the Foundation
                owes them and asks of them. This one is the other half: what leadership actually
                does, month to month, and what the relationship between an admin and a member is
                made of.
              </Text>

              <View style={cov.note}>
                <Text style={cov.noteText}>
                  “The rules that protect members also bind us.”
                </Text>
              </View>
            </View>

            <View style={{ flex: 1 }} />
            <View style={cov.plinth}>
              <View>
                <Text style={cov.pLabel}>VERSION</Text>
                <Text style={cov.pValue}>{VERSION}</Text>
              </View>
              <View>
                <Text style={cov.pLabel}>RELEASED</Text>
                <Text style={cov.pValue}>{RELEASED.toUpperCase()}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={cov.pLabel}>PREPARED FOR</Text>
                <Text style={cov.pValue}>{holder.toUpperCase()}</Text>
              </View>
            </View>
          </View>
        </View>
      </Page>

      {/* ═══ CONTENTS ═════════════════════════════════════════════════════ */}
      <Page size="A4" style={styles.body}>
        <RunningHead where="Contents" doc="LEADERSHIP HANDBOOK" />
        <GhostNumeral n={2} />
        <Kicker>WHAT IS INSIDE</Kicker>
        <Heading plain="Contents" />
        <Contents parts={CONTENTS_PARTS} />
        <View style={{ marginTop: 14 }}>
          <Advice tone="green" label="Read the Founder Guide first">
            This handbook assumes it. Where the guide explains a rule to a member, this explains
            how you carry it out — and the two are written to agree, sentence for sentence.
          </Advice>
        </View>
        <RunningFoot doc="LEADERSHIP HANDBOOK" />
      </Page>

      {/* ═══ PART I ═══════════════════════════════════════════════════════ */}
      <Page size="A4" style={styles.dark}>
        <PartDivider {...RAW_PARTS[0]!} plain={RAW_PARTS[0]!.title} />
      </Page>

      <Section num={1} title="What This Handbook Is" kicker="BEFORE ANYTHING ELSE"
        plain="One Book, So There Is" italic="One Answer">
        <Lede>
          There are {FOUNDER_COUNT} of you and there will never be many more. That is small enough
          to run on conversation, and small enough for four honest people to end up with four
          different ideas of how a waiver works.
        </Lede>

        <P>
          This exists so there is one answer. Not because anyone is expected to forget, but
          because the member on the other side of the decision deserves the same treatment
          whichever of you they happen to reach.
        </P>

        <HeroPanel title="The one thing to carry out of this book" glyph="scale">
          Every power you hold is <HB>recorded against your name</HB>, and none of it can be
          hidden — not from the other leaders, not from the member it touched. That is not a
          restriction placed on you. It is the reason a member can hand you their money at all.
        </HeroPanel>

        <H2>How to use it</H2>
        <IconList items={[
          { glyph: 'book', title: 'Read it beside the Founder Guide', text: <>Every rule here has a matching page there, written for the member. If the two ever disagree, the guide is what the member was promised and this is what needs correcting.</> },
          { glyph: 'clock', title: 'Come back to the month', text: <>Part Three is the work that repeats. The rest you will need occasionally; that part you will need every month.</> },
          { glyph: 'users', title: 'Decide together where it says so', text: <>Some things below are marked as decisions for all of you rather than whoever is at the screen. Those are the ones that are hard to undo.</> },
        ]} />
      </Section>

      <Section num={2} title="The Two Sides" kicker="THE RELATIONSHIP"
        plain="What a Member Brings," italic="What You Bring">
        <Lede>
          The whole arrangement is an exchange, and it is worth naming both halves plainly before
          any of the detail.
        </Lede>

        {/* A table rather than the two-column Compare: that component marks its
            right-hand column with a prohibition icon, which is right for "what
            it is not for" and badly wrong here — it made everything leadership
            owes a member read as something forbidden. Paired as rows, the two
            halves also line up, which is the actual point. */}
        <Table
          head={['The member brings', 'You bring, in return']}
          widths={[0.5, 0.5]}
          rows={[
            ['An agreed amount, every month, on an agreed day', 'A record of every rand of it they can check for themselves'],
            ['Permission at their own bank to collect it', 'A collection that never exceeds what they approved'],
            ['Their real identity, vouched for by one of you', 'Their details kept encrypted, and shown to nobody else'],
            ['Their patience when a Goal takes time', 'The truth about a bad month, early'],
            ['Their voice on the board when something is wrong', 'An answer, without making them feel awkward for asking'],
          ]}
        />

        <H2>Where the power actually sits</H2>
        <P>
          You can open a month, approve a debit order, waive an obligation and stop somebody
          taking part. That is real power over people{"'"}s money and standing. What you cannot do
          is exercise any of it quietly — every one writes an entry naming you, and the member is
          told in words they can read.
        </P>

        <Quote attr="The test for any decision">
          Would you be comfortable if this member read the record of it tomorrow, with your name
          against it?
        </Quote>
      </Section>

      <Section num={3} title="What Binds You Too" kicker="NO EXEMPTIONS"
        plain="The Rules That Protect Them" italic="Bind You">
        <Lede>
          You are members first. Every leader contributes on the same terms, through the same
          collection, under the same minimum — and the guide says so to every member who reads it.
        </Lede>

        <Stats items={[
          { value: String(MIN_CONTRIBUTION_ZAR), prefix: 'R', label: 'Minimum, for you too' },
          { value: String(NETCASH_FEE_BUFFER), prefix: 'R', label: 'Same collection fee' },
          { value: String(PASSWORD_MIN_LENGTH), label: 'Same password rule' },
          { value: String(MAX_MEMBERS), label: 'Same one seat each' },
        ]} />

        <IconList items={[
          { glyph: 'lock', title: 'No way past the record', text: <>There is no screen that edits history and no way to remove an entry, including your own. If you do something you regret, the fix is another entry explaining it — never a quiet deletion.</> },
          { glyph: 'shield', title: 'No way to act alone on the pool', text: <>All {FOUNDER_COUNT} leaders are signatories on the account. Money leaves it for a Goal the circle agreed, and one of you cannot move it.</> },
          { glyph: 'scale', title: 'No special standing', text: <>A leader who misses a month is a member who missed a month. The badge, the record and the conversation are the same.</> },
        ]} />

        <Advice tone="rose" label="The one that catches people out">
          You cannot suspend your own account, and you cannot suspend the last remaining leader
          who can still sign in. Both are refused outright. It is not a rule you are trusted to
          keep — the system simply will not do it.
        </Advice>
      </Section>

      {/* ═══ PART II ══════════════════════════════════════════════════════ */}
      <Page size="A4" style={styles.dark}>
        <PartDivider {...RAW_PARTS[1]!} plain={RAW_PARTS[1]!.title} />
      </Page>

      <Section num={4} title="The Invitation, and What You Vouch For" kicker="THE FIRST DECISION"
        plain="You Are Not Sending a Link," italic="You Are Vouching">
        <Lede>
          Filling in an invitation is the moment you tell the other {FOUNDER_COUNT - 1} that you
          know who this person is. Everything after it rests on that.
        </Lede>

        <Table
          head={['What you record', 'Why you, and not them']}
          widths={[0.3, 0.7]}
          rows={[
            ['Their name', 'So the account cannot be created by whoever opens the link.'],
            ['Their email', 'Where the invitation goes, and how they sign in afterwards.'],
            ['Their mobile', 'For the short and urgent things.'],
            ['Their ID number', 'Read it off a document, in front of you. This is the part you are vouching for, and neither of you can change it afterwards from an ordinary screen.'],
            ['How you know them', 'Recorded because it cannot be worked out from anything else — and because in a year nobody will remember.'],
            ['The monthly amount', `What the two of you agreed. At least ${zar(MIN_CONTRIBUTION_ZAR)}.`],
          ]}
        />

        <Advice tone="gold" label="A seat is taken the moment you send it">
          An outstanding invitation holds one of the {MAX_MEMBERS} places, whether or not it is
          ever used. If somebody decides not to join, revoke it — otherwise the circle is a
          person smaller than you think.
        </Advice>

        <Advice tone="green" label="Who to invite">
          Somebody you would be comfortable sitting across from if a month went badly. That test
          is better than any amount they can afford.
        </Advice>
      </Section>

      <Section num={5} title="From Link to Active Member" kicker="THE SEQUENCE"
        plain="Four Steps," italic="In This Order">
        <JourneyRail stops={[
          { glyph: 'invite', title: 'You invite', text: 'Their details recorded, the link sent to them.' },
          { glyph: 'users', title: 'They register', text: 'They confirm their ID matches and set a password.' },
          { glyph: 'shield', title: 'You activate', text: 'The account moves from Pending to Active.' },
          { glyph: 'bank', title: 'They set up the debit order', text: 'Their bank confirms it with them directly.' },
        ]} />

        <H2>What can go wrong, and what to do</H2>
        <Table
          head={['What happens', 'What it means', 'What you do']}
          widths={[0.26, 0.42, 0.32]}
          rows={[
            ['Their ID does not match', 'Registration stops. The check is working.', 'Confirm the number against the document and correct the invitation.'],
            ['The link expired', 'They took too long, which is ordinary.', 'Send a fresh one.'],
            ['They registered but nothing happens', 'They are Pending and waiting on you.', 'Activate them.'],
            ['They are active but nothing is collected', 'No debit order yet, or their bank has not had their confirmation.', 'Tell them. Nothing can be collected until they confirm at their own bank.'],
          ]}
        />

        <Advice tone="gold" label="The step everyone forgets">
          The debit order. A member can be fully registered, activated and visibly a member, and
          still have nothing collectible. Their first month sits unpaid through nobody{"'"}s fault
          — check it in their first week rather than at the end of the month.
        </Advice>
      </Section>

      <Section num={6} title="Approving a Debit Order" kicker="A SECOND PAIR OF EYES"
        plain="What You Are Actually" italic="Checking">
        <Lede>
          A member submits their bank details and their bank confirms the permission with them.
          Your approval is the step between those two and the first collection.
        </Lede>

        <P>
          It is not a formality. The details on that mandate decide where money is taken from, and
          a digit wrong there is a failed collection every month until somebody notices — or worse,
          a collection against an account that is not theirs.
        </P>

        <IconList items={[
          { glyph: 'bank', title: 'Check the account belongs to them', text: <>The name on the account and the name on the member should be the same person. If they are not, ask before approving.</> },
          { glyph: 'card', title: 'Check the amount and the day', text: <>Against what was agreed at the invitation. A member who set up R100 when you agreed R200 is not a problem — it is a conversation, before it is approved.</> },
          { glyph: 'clock', title: 'Do it promptly', text: <>Nothing can be collected while it waits, and the member cannot tell the difference between “waiting for approval” and “nobody is looking”.</> },
        ]} />

        <Advice tone="rose" label="Refusing one">
          A refusal needs a reason of at least ten characters, and the member is told it word for
          word. Write it as if they will read it — because they will. “Wrong account
          number” is useful; “rejected” is not.
        </Advice>

        <Advice tone="gold" label="Stopping a live one is different">
          Cancelling an active debit order stops future collections and reverses nothing that has
          already been taken. Say that plainly when a member asks — the two get confused, and the
          confusion is always in the direction of them expecting money back.
        </Advice>
      </Section>

      {/* ═══ PART III ═════════════════════════════════════════════════════ */}
      <Page size="A4" style={styles.dark}>
        <PartDivider {...RAW_PARTS[2]!} plain={RAW_PARTS[2]!.title} />
      </Page>

      <Section num={7} title="Opening the Month" kicker="THE WIDEST ACTION YOU HAVE"
        plain="One Press," italic="Everybody's Month">
        <Lede>
          Opening a month writes a real obligation for every active member with an active debit
          order, all at once. It is the only thing you do that touches everyone in a single
          action, and there is no undo.
        </Lede>

        <HeroPanel title="Read the confirmation before you press it" glyph="warning" centred>
          It tells you exactly how many contributions will be created, how many members are being
          skipped because they already have one, and whether the period is in the past — in which
          case every obligation it writes is <HB>overdue the moment it exists</HB>.
        </HeroPanel>

        <Table
          head={['What it does', 'What it does not']}
          widths={[0.5, 0.5]}
          rows={[
            ['Creates one obligation per active member with an active debit order', 'Take any money — collection is separate'],
            ['Uses the amount on each member’s own mandate', 'Touch anybody who already has that month'],
            ['Writes an entry naming you and the counts', 'Have any way back'],
          ]}
        />

        <Advice tone="gold" label="Opening a past month on purpose">
          Catching up on a month that was missed is a real thing, and it is allowed — but every
          contribution created is overdue immediately, and members will see it that way. Tell them
          first.
        </Advice>
      </Section>

      <Section num={8} title="When the Money Arrives" kicker="THE ORDINARY CASE"
        plain="What Settles," italic="and What You See">
        <Lede>
          Most months, nothing is asked of you. The collection runs on each member{"'"}s chosen
          day, the money lands, and the record updates itself.
        </Lede>

        <Table
          head={['A month reads', 'What it means', 'Does it need you?']}
          widths={[0.2, 0.55, 0.25]}
          rows={[
            ['Pending', 'Owed, nothing collected yet. Normal early in a month.', 'No'],
            ['Partial', 'Some arrived. The rest is still owed, and what did arrive counts.', 'Only if it stays that way'],
            ['Paid', 'Settled in full.', 'No'],
            ['Overdue', 'The month passed unpaid.', 'Yes — Section 09'],
            ['Waived', 'You released them, with your name against it.', 'Already done'],
          ]}
        />

        <H2>What to look at, and how often</H2>
        <IconList items={[
          { glyph: 'chart', title: 'Once a month, the collection rate', text: <>One number that says how much of what was owed actually arrived. A drop is worth asking about before it is a pattern.</> },
          { glyph: 'users', title: 'Once a week, anything overdue', text: <>Not to chase. To catch the member who is embarrassed and has stopped answering, while it is still one month.</> },
        ]} />

        <Advice tone="green" label="Do not confuse quiet with fine">
          A member who pays every month and never speaks is fine. A member who has stopped paying
          and stopped answering is the one this Foundation exists to reach, and nothing on a screen
          will do it for you.
        </Advice>
      </Section>

      <Section num={9} title="When It Does Not" kicker="THE PART THAT NEEDS JUDGEMENT"
        plain="A Failed Collection" italic="Is Information">
        <Lede>
          It will happen to almost everyone eventually. The first thing to establish is which kind
          of failure it was, because the two mean opposite things about the member.
        </Lede>

        <Compare
          yes={{
            title: 'Not their fault',
            items: [
              'The collector was unreachable',
              'The request timed out',
              'The payment system errored on its own side',
              'Anything that happened between two machines',
            ],
          }}
          no={{
            title: 'Says something about the account',
            items: [
              'Insufficient funds',
              'The account was closed',
              'The debit order was stopped at their bank',
              'Their bank declined the instruction',
            ],
          }}
        />

        <P>
          The system already separates these and only tells the member about the second kind. Do
          the same in conversation: never open with {'"'}your payment failed{'"'} when the
          collector was down. It is the fastest way to make an honest member defensive.
        </P>

        <H2>The order to work in</H2>
        <IconList items={[
          { glyph: 'phone', title: 'Ask before you assume', text: <>One message, privately, early. Most shortfalls are a salary date, not a decision.</> },
          { glyph: 'wallet', title: 'Offer the part payment', text: <>They can settle any amount from their own dashboard, and a part payment genuinely counts. Members often think it is all or nothing.</> },
          { glyph: 'heart', title: 'Then decide together', text: <>If the month cannot be met, waive it — Section 10 — rather than letting it sit as arrears nobody has spoken about.</> },
        ]} />
      </Section>

      <Section num={10} title="Waiving, and Money That Came Another Way" kicker="TWO WAYS A MONTH ENDS"
        plain="Releasing It," italic="and Recording It">
        <Lede>
          A month that is not going to be collected ends in one of two ways: somebody paid it
          outside the debit order, or the circle released them from it. Both are yours to record,
          and both are visible to the member.
        </Lede>

        <H2>Recording money that arrived another way</H2>
        <P>
          Cash at a meeting, or a transfer straight into the account. You enter the amount and a
          note saying how it arrived — that note is the only thing that will ever distinguish a
          real cash payment from a mistake, so write it for somebody reading it in a year.
        </P>
        <P>
          It refuses more than is outstanding and tells you the figure. The member is told the
          amount, the reference, and what is left.
        </P>

        <H2>Waiving a month</H2>
        <P>
          This releases them from what is owed. It is not a payment and not a deletion: the month
          stays on the record marked as released, with your name and your reason, and it shows on
          their statement as a waiver rather than quietly reading as settled.
        </P>

        <Advice tone="green" label="It does not erase what they did pay">
          Waiving a partly paid month forgives the rest. The {zar(40)} they managed is still{' '}
          {zar(40)} they contributed, and their standing keeps it.
        </Advice>

        <Advice tone="rose" label="A waiver is a decision for all of you">
          One of you can do it in ten seconds. That is the point at which it should be hardest, not
          easiest. Agree it between you first — the record will show which of you pressed it, and
          that is a poor place for the rest to learn it happened.
        </Advice>
      </Section>

      {/* ═══ PART IV ══════════════════════════════════════════════════════ */}
      <Page size="A4" style={styles.dark}>
        <PartDivider {...RAW_PARTS[3]!} plain={RAW_PARTS[3]!.title} />
      </Page>

      <Section num={11} title="Suspension, and What It Is Not" kicker="THE ONE THAT TAKES SOMETHING AWAY"
        plain="Stopping Someone" italic="Taking Part">
        <Lede>
          The only power you hold that removes something from a member. Narrow by design, visible
          by design, and reversible by any of you.
        </Lede>

        <Compare
          yes={{
            title: 'What it is for',
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
              'Disagreeing with you',
              'Asking uncomfortable questions',
              'A failure that was the collector’s fault',
            ],
          }}
        />

        <P>
          A suspended member keeps their account, their history, their statements, their inbox and
          their seat. They can still sign in and read everything of theirs, still change their
          password, still switch off messages — and still leave. Suspension is not erasure.
        </P>

        <Advice tone="gold" label="Tell them in words, yourself">
          The system records it; it does not explain it. A member who discovers they are suspended
          by finding a button missing has been treated badly even if the decision was right.
        </Advice>
      </Section>

      <Section num={12} title="When a Member Leaves" kicker="THEIR DECISION, NOT YOURS"
        plain="What Ends," italic="and What Does Not">
        <Lede>
          A member can leave at any time, from their own account, without a reason and without
          asking you. You will find out because it happened, not because you approved it.
        </Lede>

        <Advice tone="rose" label="You cannot mark somebody as having resigned">
          Refused outright. Resignation is a member{"'"}s own account of their own decision, and an
          admin writing it would put words in their mouth — the record would say they left when in
          fact you removed them. If you need to end access, suspend, which says plainly who did it.
        </Advice>

        <Table
          head={['They keep', 'They stop']}
          widths={[0.5, 0.5]}
          rows={[
            ['Their account and sign-in', 'Contributing, and being collected from'],
            ['Every statement, for every month', 'Funding Goals and running monthly plans'],
            ['Their full contribution history', 'Proposing, cheering, commenting'],
            ['Changing their password, muting messages', 'Posting to the board'],
            ['Their name on what they helped build', 'Holding a seat in the circle'],
          ]}
        />

        <H2>The money</H2>
        <P>
          What they contributed stays in the pool and in the Goals it went to. This is the hard
          edge of the arrangement and the one to state most plainly, without softening it: they
          were funding things for other people, and other people were funding things for them.
        </P>

        <Advice tone="green" label="Rejoining">
          Possible, and a conversation rather than a form. Their history is still here, so they
          would not be starting again from nothing — and a seat has to be free.
        </Advice>
      </Section>

      <Section num={13} title="Correcting What Is on File" kicker="WHEN SOMETHING IS WRONG"
        plain="Fixing It Without" italic="Rewriting History">
        <Lede>
          Details get captured wrong. The question is never whether to fix them, but whether the
          fix leaves a trail.
        </Lede>

        <IconList items={[
          { glyph: 'key', title: 'An ID number captured wrong', text: <>Correctable by you, with a reason, and recorded. Neither the member nor an ordinary screen can change it — that is what makes it worth anything as an identity check.</> },
          { glyph: 'users', title: 'Name, contact details', text: <>The member changes these themselves from their profile. If they cannot, something else is wrong and that is the thing to look at.</> },
          { glyph: 'bank', title: 'Bank details', text: <>Theirs to change, and it means a new debit order and a fresh confirmation with their bank. There is no way to quietly repoint an existing one, and there should not be.</> },
          { glyph: 'file', title: 'A payment recorded in error', text: <>Reverse it rather than deleting it. The original stays as evidence and the reversal explains itself — a payment that simply vanishes is indistinguishable from money going missing.</> },
        ]} />

        <Advice tone="gold" label="The rule underneath all four">
          Never make a correction that leaves the record looking like the mistake never happened.
          A member who finds an error and sees it honestly fixed trusts you more than one who
          finds nothing at all.
        </Advice>
      </Section>

      {/* ═══ PART V ═══════════════════════════════════════════════════════ */}
      <Page size="A4" style={styles.dark}>
        <PartDivider {...RAW_PARTS[4]!} plain={RAW_PARTS[4]!.title} />
      </Page>

      <Section num={14} title="Goals: Opening, Funding, Closing" kicker="WHAT THE POOL IS FOR"
        plain="The Only Door" italic="Out of the Pool">
        <Lede>
          Money leaves the pool through a Goal and nowhere else. Opening one is therefore the most
          consequential thing you do that is not about a single member.
        </Lede>

        <JourneyRail stops={[
          { glyph: 'flag', title: 'Proposed', text: 'By a member on the board, or by you.' },
          { glyph: 'users', title: 'Agreed', text: 'Discussed by the circle before it opens.' },
          { glyph: 'wallet', title: 'Funded', text: 'By the monthly pool, gifts and plans.' },
          { glyph: 'seed', title: 'Closed', text: 'Met, or the date passed. Either way, recorded.' },
        ]} />

        <Table
          head={['A Goal reads', 'What it means for you']}
          widths={[0.2, 0.8]}
          rows={[
            ['Draft', 'Proposed and not yet open. Nobody can pay into it, so there is no rush to decide badly.'],
            ['Active', 'Open and accepting money. Members can direct one-off gifts and monthly plans at it.'],
            ['Achieved', 'Target met. It closes to new payments — money cannot be added to something already finished.'],
            ['Failed', 'The date passed without the target. What was contributed stays where it is; the Goal simply stops asking.'],
          ]}
        />

        <Advice tone="rose" label="Say what happened at the end">
          A Goal that quietly disappears is the single fastest way to lose a circle{"'"}s trust.
          When one is met, record what it actually bought and tell everybody. When one fails, say
          that too, and say what happens to the money.
        </Advice>
      </Section>

      <Section num={15} title="What the System Will Refuse You" kicker="NOT A MATTER OF DISCIPLINE"
        plain="The Things You" italic="Simply Cannot Do">
        <Lede>
          These are not undertakings you are trusted to keep. They are refusals — the same kind of
          refusal a member meets when they try to commit below the minimum.
        </Lede>

        <Table
          head={['You cannot', 'Why it is built in']}
          widths={[0.38, 0.62]}
          rows={[
            ['Mark somebody as resigned', 'Only they can say they left. You would be putting words in their mouth, and the record would be a lie about a person.'],
            ['Suspend your own account', 'Refused even when other leaders exist — whether you can lock yourself out should not depend on somebody else’s account.'],
            ['Suspend the last leader who can sign in', 'It would lock the circle out of its own console with nobody able to undo it.'],
            ['Revoke your own leadership', 'Same reasoning, from the other direction.'],
            ['Open a month more than a year away', 'Billing everyone for a month nobody is in is very easy to do with a dropdown.'],
            ['Read anybody’s password', 'It is not kept in a form anybody can read, including you.'],
            ['Delete an entry from the record', 'Not from any screen, and not your own.'],
            ['Waive a month already settled', 'There is nothing to release, and it would misreport a paid month as forgiven.'],
            ['Record more than is outstanding', 'The figure it refuses with is the real one — trust it over your arithmetic.'],
          ]}
        />

        <Advice tone="green" label="If one of these ever lets you through">
          That is a fault, and a serious one. Say so immediately rather than using it.
        </Advice>
      </Section>

      <Section num={16} title="The Record, and the Handover" kicker="WHAT YOU LEAVE BEHIND"
        plain="Everything Is Written," italic="So Nothing Is Owed">
        <Lede>
          The record is not paperwork. It is the thing that lets a member hand money to people
          they know, and still be able to check.
        </Lede>

        <IconList items={[
          { glyph: 'file', title: 'What it holds', text: <>Every rand in and out, every decision against an account, who did it and when. Goals, plans, gifts, mandates, invitations, badges, suspensions.</> },
          { glyph: 'scale', title: 'What it proves', text: <>That the pool matches the bank. The two are checked against each other automatically, every day, and a disagreement is a real problem rather than a rounding difference.</> },
          { glyph: 'lock', title: 'What nobody can do to it', text: <>Remove anything. There is no screen for it and no exception for leadership.</> },
        ]} />

        <H2>Handing over</H2>
        <P>
          One day one of you will step back. What the next person needs is not a conversation —
          it is this handbook, the Founder Guide, and the record itself, which will already tell
          them everything that has ever been done and by whom.
        </P>

        <Advice tone="gold" label="The only thing that does not survive a handover">
          What was agreed but never written down. If a decision matters — a waiver, an amount
          changed, a promise made to a member — put it where the next person will find it, not
          only in the group chat.
        </Advice>

        <DiamondRule />
      </Section>

      {/* ═══ BACK ═════════════════════════════════════════════════════════ */}
      <Page size="A4" style={styles.dark}>
        <View style={{ flex: 1, height: '100%', position: 'relative' }}>
          <NightGround />
          <Guilloche cx={300} cy={420} rings={20} gap={30} opacity={0.35} />
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 70 }}>
            <View style={{ marginBottom: 26 }}><Diamond size={9} /></View>
            <Text style={{ fontSize: 15, fontFamily: 'Times-Bold', color: '#FFFFFF', letterSpacing: 1.6, textAlign: 'center' }}>
              XKIMI XA MALI FOUNDATION
            </Text>
            <Text style={{ fontFamily: 'Geist', fontSize: 6.2, fontWeight: 600, color: G.gold, letterSpacing: 2.4, marginTop: 9 }}>
              THE LEADERSHIP HANDBOOK
            </Text>
            <View style={{ height: 1.4, width: 78, backgroundColor: G.gold, marginVertical: 26 }} />
            <Text style={{ fontSize: 10.5, fontFamily: 'Times-Italic', color: '#C6D9CF', textAlign: 'center', lineHeight: 1.6 }}>
              “The rules that protect members also bind us.”
            </Text>
            <Text style={{ fontFamily: 'Geist', fontSize: 6.2, color: G.greenSoft, letterSpacing: 1.3, marginTop: 44, textAlign: 'center', lineHeight: 1.8 }}>
              VERSION {VERSION}  ·  {RELEASED.toUpperCase()}{'\n'}
              PRIVATE &amp; CONFIDENTIAL  ·  PREPARED FOR {holder.toUpperCase()}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}

/** One section, one page — the same rule the guide holds itself to. */
export function assertPagination(pdf: Buffer, expected = TOTAL): void {
  const actual = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
  if (actual !== expected) {
    throw new Error(
      `The handbook laid out ${actual} pages but its contents describes ${expected}. ` +
      `${actual - expected} section(s) overflowed — find the fullest page and cut it.`,
    )
  }
}

export async function generateLeadershipHandbookPdf(opts?: { holder?: string }): Promise<Buffer> {
  registerGuideFonts()
  const pdf = await renderToBuffer(
    <LeadershipHandbookDocument holder={opts?.holder ?? 'The Leadership'} />,
  )
  assertPagination(pdf)
  return pdf
}
