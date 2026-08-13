import React from 'react'
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import {
  MAX_MEMBERS, FOUNDER_COUNT, MIN_CONTRIBUTION_ZAR, MAX_CONTRIBUTION_ZAR,
  DEFAULT_INVITE_AMOUNT, MIN_GOAL_PAYMENT, MAX_GOAL_PAYMENT,
  PASSWORD_MIN_LENGTH, MAX_TRANSACTION_RETRY,
} from '@xxm/utils'
import { NETCASH_FEE_BUFFER } from '@/lib/group-account'
import { registerGuideFonts, loadPortraits, type Portrait } from './guide-assets'
import {
  G, PAGE, RunningHead, RunningFoot, GhostNumeral, EdgeTab,
  Cover, Contents, PartDivider, Kicker, Heading, H2, Lede, P, B, HB,
  HeroPanel, Advice, Stats, IconList, JourneyRail, Table, Compare, Quote,
  DiamondRule, FounderGrid, SignatureGrid, NightGround, Guilloche, Diamond,
} from './guide-kit'

/**
 * The Founder Guide.
 *
 * ── Who this is written for ─────────────────────────────────────────────────
 *
 * Four brothers, three of whom do not work in software. That is the single most
 * important fact about the writing, and a previous revision of this file forgot
 * it — it explained the Foundation in the language of the thing that runs it,
 * down to an appendix listing source files. Nobody outside the room that built
 * it would have finished that document.
 *
 * So: no file names, no field names, no talk of modules or validators. Where a
 * rule is enforced, the sentence says "nobody can", not "the schema refuses".
 * The reader should be able to hand this to their mother.
 *
 * ── Where the numbers come from ─────────────────────────────────────────────
 *
 * Every figure is still imported from the part of the system that enforces it,
 * so the guide cannot quietly fall out of date the way the first edition did
 * about the community board. That mechanism is deliberately invisible in the
 * document: the reader is told once, in one plain sentence, that the numbers
 * come straight from the system, and never made to care how.
 *
 * ── One section, one page ───────────────────────────────────────────────────
 *
 * As in the first edition. It is what lets the contents print real page
 * numbers, and it forces each section to be worth its page.
 */

const VERSION = '2.0'
const RELEASED = 'August 2026'
const NEXT_REVIEW = 'August 2027'

const zar = (n: number) => `R${n.toLocaleString('en-ZA').replace(/,/g, ' ')}`

// ─── The four ──────────────────────────────────────────────────────────────────

const FOUNDERS = [
  {
    file: 'maluleke-kurhula-success.png',
    name: 'Kurhula Maluleke', role: 'Founder & Chairman', glyph: 'gem',
    bio: 'Brought the idea to the other three and built the platform that carries it. Chairs the Foundation and answers for it.',
  },
  {
    file: 'maluleke-ntwanano-glen.png',
    name: 'Ntwanano Maluleke', role: 'Co-Founder & Secretary', glyph: 'file',
    bio: 'Keeper of records and governance. Maintains the standards of the collective and holds every member to the pact.',
  },
  {
    file: 'maluleke-risima-blessing.png',
    name: 'Risima Maluleke', role: 'Co-Founder & Treasurer', glyph: 'scale',
    bio: 'Financial custodian of the collective. Sees that every contribution is accounted for and guards the pool with discipline.',
  },
  {
    file: 'nkuna-rito-blessing.png',
    name: 'Rito Nkuna', role: 'Co-Founder & Welfare Officer', glyph: 'heart',
    bio: 'The heart of the brotherhood. Champions member welfare and keeps the Foundation rooted in human trust.',
  },
]

// ─── Structure, and the page numbers it implies ────────────────────────────────

type Sec = { num: number; title: string }

const RAW_PARTS: {
  roman: string; numeral: string; title: string; italic: string
  conviction: string; convictionTail?: string; label: string; sections: Sec[]
}[] = [
  {
    roman: 'I', numeral: 'I', title: 'The Foundation', italic: 'Why We Exist',
    conviction: 'When people come together with discipline, transparency and trust, they can build ',
    convictionTail: 'something none of us could build alone.',
    label: 'The founding conviction',
    sections: [
      { num: 1, title: 'A Word From the Chairman' },
      { num: 2, title: 'What Xkimm Xa Mali Is' },
      { num: 3, title: 'Your Leadership' },
    ],
  },
  {
    roman: 'II', numeral: 'II', title: 'The Money', italic: 'How It Moves',
    conviction: 'Money is easy to pool and hard to trust. Everything in this part exists ',
    convictionTail: 'to answer the second problem.',
    label: 'Follow every rand',
    sections: [
      { num: 4, title: 'How Your Contribution Works' },
      { num: 5, title: 'The Journey of One Rand' },
      { num: 6, title: 'Where the Money Actually Sits' },
      { num: 7, title: 'The One Rule' },
    ],
  },
  {
    roman: 'III', numeral: 'III', title: 'Your Account', italic: 'What Is Yours',
    conviction: 'Your record is not something the Foundation keeps about you. ',
    convictionTail: 'It is something you own, and can take with you.',
    label: 'Yours to see, always',
    sections: [
      { num: 8, title: 'Goals — What the Pool Builds' },
      { num: 9, title: 'Your Badge' },
      { num: 10, title: 'Community & Notifications' },
      { num: 11, title: 'Your Member Dashboard' },
      { num: 12, title: 'What Leadership Can and Cannot Do' },
    ],
  },
  {
    roman: 'IV', numeral: 'IV', title: 'The Circle', italic: 'How We Hold It',
    conviction: 'Fifty people, and the few rules that keep fifty people workable — ',
    convictionTail: 'including the rules that bind the four of us.',
    label: 'The pact between us',
    sections: [
      { num: 13, title: 'Your Rights & Responsibilities' },
      { num: 14, title: 'Security' },
      { num: 15, title: 'Risks We Have Considered' },
      { num: 16, title: 'What We Collect, and Why' },
      { num: 17, title: 'Foundation Values' },
      { num: 18, title: 'How the Foundation Fits Together' },
      { num: 19, title: 'How the Circle Grows' },
    ],
  },
  {
    roman: 'V', numeral: 'V', title: 'Joining', italic: 'Before You Sign',
    conviction: 'Read it carefully. Ask anything at all. ',
    convictionTail: 'There is no deadline and no pressure, only clarity.',
    label: 'Take your time',
    sections: [
      { num: 20, title: 'Frequently Asked Questions' },
      { num: 21, title: 'Glossary' },
      { num: 22, title: 'Your Journey at a Glance' },
      { num: 23, title: 'Joining, Step by Step' },
      { num: 24, title: 'Important Notice' },
      { num: 25, title: 'Founder Declaration' },
      { num: 26, title: 'Signature Page' },
    ],
  },
]

/**
 * Page numbers, derived rather than written down.
 *
 * Cover is 1, contents 2, then each part opens with a divider and each section
 * takes exactly one page. The contents and the pages it points at are computed
 * from the same list, so they cannot disagree.
 */
const PAGES = (() => {
  const sectionPage = new Map<number, number>()
  const dividerPage = new Map<string, number>()
  let p = 3
  for (const part of RAW_PARTS) {
    dividerPage.set(part.roman, p++)
    for (const s of part.sections) sectionPage.set(s.num, p++)
  }
  return { sectionPage, dividerPage, back: p, total: p }
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

/** A numbered section: one page, its own furniture. */
function Section({
  num, title, kicker, plain, italic, children,
}: {
  num: number
  title: string
  kicker: string
  plain: string
  italic?: string
  children: React.ReactNode
}) {
  // Debug aid: render one section on its own so a page-count of two names the
  // section that overflows. Costs nothing when the variable is unset.
  if (process.env.GUIDE_ONLY && Number(process.env.GUIDE_ONLY) !== num) return null

  return (
    <Page size="A4" style={styles.body}>
      <RunningHead where={`${String(num).padStart(2, '0')} · ${title}`} />
      <EdgeTab />
      <GhostNumeral n={pg(num)} />
      <Kicker>{kicker}</Kicker>
      <Heading plain={plain} italic={italic} />
      {children}
      <RunningFoot />
    </Page>
  )
}

// ─── The document ──────────────────────────────────────────────────────────────

export function FounderGuideDocument({ holder, portraits }: { holder: string; portraits: Portrait[] }) {
  const founders = FOUNDERS.map((f, i) => ({ ...f, photo: portraits[i]! }))
  return (
    <Document
      title="Xkimm Xa Mali Foundation — The Founder Guide"
      author="Xkimm Xa Mali Foundation"
      subject="What the Foundation is, how the money moves, and the one rule every member agrees to"
      keywords="stokvel, foundation, savings, members, goals"
    >
      {/* ═══ COVER ════════════════════════════════════════════════════════ */}
      <Page size="A4" style={styles.dark}>
        <Cover
          version={VERSION}
          released={RELEASED}
          nextReview={NEXT_REVIEW}
          blurb={`A private savings collective built by four brothers, for four brothers and the people closest to them. This guide explains what the Foundation is, exactly how money moves, what your account holds, and the one rule every member agrees to before joining.`}
          photos={portraits}
        />
      </Page>

      {/* ═══ CONTENTS ═════════════════════════════════════════════════════ */}
      <Page size="A4" style={styles.body}>
        <RunningHead where="Contents" />
        <GhostNumeral n={2} />
        <Kicker>WHAT IS INSIDE</Kicker>
        <Heading plain="Contents" />
        <Contents parts={CONTENTS_PARTS} />
        <View style={{ marginTop: 12 }}>
          <Advice tone="green" label="About the figures in this guide">
            Every amount printed here is taken straight from the system that enforces it, so
            nothing in this document can quietly go out of date. Prepared for {holder}.
          </Advice>
        </View>
        <RunningFoot />
      </Page>

      {/* ═══ PART I ═══════════════════════════════════════════════════════ */}
      <Page size="A4" style={styles.dark}>
        <PartDivider {...RAW_PARTS[0]!} plain={RAW_PARTS[0]!.title} />
      </Page>

      {/* ── 01 ──────────────────────────────────────────────────────────── */}
      <Section num={1} title="A Word From the Chairman" kicker="WELCOME"
        plain="A Word From" italic="the Chairman">
        <P>
          Ntwanano, Risima, Rito — this Foundation began as a conversation between the four of us.
          A belief that when people come together with discipline, transparency and trust, they can
          build something none of us could build alone. We had all watched people close to us
          struggle to gain financial momentum, not for lack of ambition, but for lack of something
          that held everyone equally accountable.
        </P>
        <P>
          That conviction is what everything else was built on. My part has been the technology —
          taking what we agreed as brothers and giving it a home: the automation, the record, the
          safeguards you will read about here. The vision and the values belong to all four of us.
          I only got to build the thing that carries them.
        </P>

        <Quote attr="What this is">
          We are not building something for strangers. We are building something for our own
          people, and we are the first ones bound by it.
        </Quote>

        <P>
          This is not a business chasing customers. It is a closed circle — the four of us, and in
          time a small number of people we personally know and trust, never more than {MAX_MEMBERS}.
          Nobody markets it. Nobody applies. You come in because one of us invited you.
        </P>
        <P>
          Which is exactly why the four of us join first, on the same terms, through the same
          mechanism, under the same conditions we will ever ask of anyone else. Nothing in this
          guide applies to members and not to us.
        </P>
        <P>
          This second edition exists because the Foundation has grown since the first. There are
          now monthly plans toward a goal, one-off gifts you direct yourself, statements you can
          download whenever you like, and a clearer account of what leadership may and may not do.
          Everything that was true before is still true. There is simply more of it.
        </P>
        <P>
          Read it carefully. Ask me anything at all. Do not sign until you are completely
          comfortable — there is no deadline and no pressure, only clarity.
        </P>

        <View style={{ marginTop: 14, borderTopWidth: 0.7, borderTopColor: G.line, paddingTop: 12,
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <Text style={{ fontSize: 12, fontFamily: 'Times-Bold', color: G.green }}>Kurhula Maluleke</Text>
            <Text style={{ fontSize: 6, fontFamily: 'Geist', fontWeight: 600, color: G.goldInk, letterSpacing: 1.4, marginTop: 4 }}>
              FOUNDER &amp; CHAIRMAN
            </Text>
          </View>
          <Text style={{ fontFamily: 'Geist', fontSize: 5.8, color: G.ink35, letterSpacing: 1.3, textAlign: 'right' }}>
            XKIMM XA MALI FOUNDATION{'\n'}{RELEASED.toUpperCase()}
          </Text>
        </View>
        <DiamondRule />
      </Section>

      {/* ── 02 ──────────────────────────────────────────────────────────── */}
      <Section num={2} title="What Xkimm Xa Mali Is" kicker="THE SHAPE OF THE THING"
        plain="A Closed Circle," italic="Not a Product">
        <Lede>
          Xkimm Xa Mali is a private savings collective. It is not open to the public, it is not
          advertised, and nobody can sign up on their own. Membership begins with a personal
          invitation from one of us — and the circle is capped at {MAX_MEMBERS} people.
        </Lede>

        <Stats items={[
          { value: String(FOUNDER_COUNT), label: 'Founding brothers' },
          { value: String(MAX_MEMBERS), label: 'Members, maximum' },
          { value: String(MIN_CONTRIBUTION_ZAR), prefix: 'R', label: 'Monthly minimum' },
          { value: '1', label: 'Shared pool' },
        ]} />

        <IconList items={[
          {
            glyph: 'invite', title: 'Invitation only',
            text: <>There is no public sign-up. Every member arrives through a private link issued by one of us to a specific person. No link, no account — and a link belongs to one person and is never shared onward.</>,
          },
          {
            glyph: 'users', title: 'People we actually know',
            text: <>Family, close friends, people already part of our lives. The strength of this Foundation is not its technology — it is that everyone inside it can be reached by someone who knows them personally.</>,
          },
          {
            glyph: 'scale', title: `Capped at ${MAX_MEMBERS} on purpose`,
            text: <>This is the size at which everyone can still be known, every Goal can still be discussed properly, and nobody becomes a number on a spreadsheet. Beyond that a collective stops being a collective. The cap is a design decision, not a limit we are waiting to escape.</>,
          },
          {
            glyph: 'flag', title: 'Built around Goals, not returns',
            text: <>The pool exists to fund specific things the circle agrees on — equipment for a family business, emergency support, a shared investment. It pays no interest and grows nobody{"'"}s personal money.</>,
          },
        ]} />

        <Advice tone="green" label="What this means for the four of us">
          We are not looking for members. We are building something small, disciplined and
          genuinely useful for the people already around us — then letting it prove itself before
          it grows by a single person.
        </Advice>
      </Section>

      {/* ── 03 ──────────────────────────────────────────────────────────── */}
      <Section num={3} title="Your Leadership" kicker="GOVERNANCE"
        plain="Your" italic="Leadership">
        <FounderGrid founders={founders} />
        <View style={{ marginTop: 13 }}>
          <Advice tone="gold" label="The rules that protect members also bind us">
            Every leader contributes under the same rules as every other member — no special
            privileges, no exemption from the debit order, no way to bypass the record. Every
            action a leader takes is written against their name, permanently, where the other
            three can see it.
          </Advice>
        </View>
      </Section>

      {/* ═══ PART II ══════════════════════════════════════════════════════ */}
      <Page size="A4" style={styles.dark}>
        <PartDivider {...RAW_PARTS[1]!} plain={RAW_PARTS[1]!.title} />
      </Page>

      {/* ── 04 ──────────────────────────────────────────────────────────── */}
      <Section num={4} title="How Your Contribution Works" kicker="THE MONTHLY RHYTHM"
        plain="One Amount," italic="Once a Month">
        <Lede>
          Your amount is agreed before you join, and it does not change unless you ask. It is
          collected from your bank on a day you chose, by a standing permission you gave your own
          bank and can withdraw at any time.
        </Lede>

        <Stats items={[
          { value: String(MIN_CONTRIBUTION_ZAR), prefix: 'R', label: 'Least you may commit' },
          { value: MAX_CONTRIBUTION_ZAR.toLocaleString('en-ZA').replace(/,/g, ' '), prefix: 'R', label: 'Most you may commit' },
          { value: String(DEFAULT_INVITE_AMOUNT), prefix: 'R', label: 'Typical commitment' },
          { value: String(NETCASH_FEE_BUFFER), prefix: 'R', label: 'Collection fee' },
        ]} />

        <H2>Why your bank statement shows a little more</H2>
        <P>
          Collecting a debit order costs money, and the collector takes its fee out of what it
          collects. If we asked your bank for exactly your contribution, the pool would receive
          slightly less than you committed every single month, and the shortfall would come out of
          the Goals. So {zar(NETCASH_FEE_BUFFER)} is added to the amount debited, and the full
          amount you committed reaches the pool.
        </P>

        <Table
          head={['If you commit', 'Your bank shows', 'The pool receives']}
          widths={[0.33, 0.33, 0.34]}
          rows={[
            [zar(DEFAULT_INVITE_AMOUNT), zar(DEFAULT_INVITE_AMOUNT + NETCASH_FEE_BUFFER), zar(DEFAULT_INVITE_AMOUNT)],
            [zar(MIN_CONTRIBUTION_ZAR), zar(MIN_CONTRIBUTION_ZAR + NETCASH_FEE_BUFFER), zar(MIN_CONTRIBUTION_ZAR)],
          ]}
        />
        <H2>What your month can say</H2>
        <Table
          head={['Your month reads', 'What it means']}
          widths={[0.22, 0.78]}
          rows={[
            ['Pending', 'Owed, and nothing collected yet. Normal at the start of a month.'],
            ['Partial', 'Some of it arrived. The rest is still owed, and what you did pay counts.'],
            ['Paid', 'Settled in full. Nothing more is expected.'],
            ['Overdue', 'The month passed unpaid. No interest, no penalty — it simply stays on the record until settled.'],
            ['Waived', 'Leadership released you from the month, with their name against the decision.'],
          ]}
        />
      </Section>

      {/* ── 05 ──────────────────────────────────────────────────────────── */}
      <Section num={5} title="The Journey of One Rand" kicker="FOLLOW THE MONEY"
        plain="The Journey of" italic="One Rand">
        <P>
          Every rand takes exactly this path, every month, without exception. It moves bank to
          bank. It never passes through anybody{"'"}s hands, and it never passes through the app.
        </P>

        <JourneyRail stops={[
          { glyph: 'bank', title: 'Your bank account', text: 'The money is yours and sits with your own bank until the agreed day.' },
          { glyph: 'shield', title: 'Your standing permission', text: 'What you approved with your bank — for one amount, on one day.' },
          { glyph: 'cycle', title: 'The collector', text: 'A licensed, audited company your bank pays. Never us.' },
          { glyph: 'wallet', title: 'The Foundation account', text: 'The shared pool, held at a bank in the Foundation’s name.' },
        ]} />

        <H2>What happens at each stage</H2>
        <Table
          head={['Stage', 'What moves', 'What gets written down']}
          widths={[0.1, 0.44, 0.46]}
          rows={[
            ['01', 'Nothing yet — funds sit in your account', 'The upcoming debit and its date'],
            ['02', 'Your bank checks the instruction against the permission you approved', 'The permission, its amount and its status'],
            ['03', 'Your bank releases the agreed amount to the collector', 'The transaction and its reference'],
            ['04', 'The collector settles the funds into the Foundation’s account', 'Confirmation, your record entry, your receipt'],
          ]}
        />

        <Advice tone="gold" label="If your bank says no, nothing happens">
          A debit outside the amount or the date you approved is refused by your own bank before it
          reaches anyone. That protection sits with your bank, not with us — which is exactly why
          we chose this way of collecting.
        </Advice>
      </Section>

      {/* ── 06 ──────────────────────────────────────────────────────────── */}
      <Section num={6} title="Where the Money Actually Sits" kicker="THE MOST IMPORTANT DISTINCTION"
        plain="The App Never" italic="Holds Your Money">
        <HeroPanel title="Not one rand ever sits inside the app" glyph="lock">
          There is no wallet, no balance, no stored value and no account inside the software
          holding money. Your money is with <HB>your bank</HB> until the debit date, and with the{' '}
          <HB>Foundation{"'"}s bank</HB> afterwards. The app is the book that records the journey
          between the two.
        </HeroPanel>

        <Compare
          yes={{
            title: 'What the app does',
            items: [
              'Instructs your bank to collect what you approved',
              'Records every contribution the moment it settles',
              'Keeps the permanent record of the whole pool',
              'Tells you what is coming, what worked, what failed',
              'Tracks Goals and progress toward each target',
              'Produces your statements and receipts',
            ],
          }}
          no={{
            title: 'What it never does',
            items: [
              'Hold, store or carry a balance of your money',
              'Keep your card details — there are none to keep',
              'Take an amount you did not approve at your bank',
              'Move money between members’ accounts',
              'Release funds on its own, without a decision',
              'Delete or quietly rewrite anything in the record',
            ],
          }}
        />

        <H2>So who actually holds the pool?</H2>
        <IconList items={[
          {
            glyph: 'bank', title: 'A bank, in the Foundation’s name',
            text: <>The pool sits in a bank account belonging to the Foundation — not to Kurhula, not to any individual, and not to the software. All four leaders are signatories, and money only leaves it for a Goal the circle has approved.</>,
          },
          {
            glyph: 'file', title: 'And the record proves what is in it',
            text: <>Because every rand in and every rand out is written down as it happens, the pool can always be checked against the Foundation{"'"}s bank statement. The two must agree, and that is checked automatically, every day.</>,
          },
        ]} />
      </Section>

      {/* ── 07 ──────────────────────────────────────────────────────────── */}
      <Section num={7} title="The One Rule" kicker="READ THIS CAREFULLY"
        plain="The One Rule Every" italic="Member Agrees To">
        <HeroPanel title="Contributions Are Not Refundable" glyph="seed" centred>
          Think of your contribution as a seed planted in a shared family garden: once planted, it
          is not yours to dig back up — it grows for all of us. <HB>Money you contribute cannot be
          withdrawn or refunded to you personally</HB>, whether you stay a member for years or
          decide to leave one day. It leaves the pool only through a Goal — a specific purpose the
          circle has agreed on.
        </HeroPanel>

        <Advice tone="gold" label="Why this matters before you sign">
          This is not a personal savings account you can dip into. It is a shared pool. Please be
          genuinely comfortable with this before joining. It is not fine print — it is the
          foundation the whole Foundation rests on, and all four of us are agreeing to it for our
          own contributions at the same moment.
        </Advice>

        <Advice tone="green" label="What still belongs to you">
          Your standing is always yours to see — what you have paid, your badge, your full history.
          Leaving the Foundation does not erase your name from what you helped build; it simply
          means future contributions stop. You keep your account, and you can still download every
          statement for every month you were a member.
        </Advice>

        <Advice tone="rose" label="Before signing">
          Join only if you fully understand and accept that contributions are not refundable. If
          any part of this is unclear, ask before you sign. There is no pressure and no deadline —
          only clarity.
        </Advice>
      </Section>

      {/* ═══ PART III ═════════════════════════════════════════════════════ */}
      <Page size="A4" style={styles.dark}>
        <PartDivider {...RAW_PARTS[2]!} plain={RAW_PARTS[2]!.title} />
      </Page>

      {/* ── 08 ──────────────────────────────────────────────────────────── */}
      <Section num={8} title="Goals — What the Pool Builds" kicker="WHAT THE MONEY IS FOR"
        plain="Goals — What" italic="the Pool Builds">
        <Lede>
          A pool with no purpose is a savings account with extra steps. Goals are the purpose:
          named things, with an amount and a date, that the circle is putting money toward.
        </Lede>

        <P>
          There is one <B>main Goal</B> at a time — what the monthly contributions build. Alongside
          it there may be smaller Goals for something specific: a member{"'"}s school fees, a
          funeral, equipment for something somebody is starting. Everyone sees every Goal, what it
          needs and what it has, all the time.
        </P>

        <H2>Three ways money reaches a Goal</H2>
        <IconList items={[
          {
            glyph: 'cycle', title: 'Your monthly contribution',
            text: <>Goes to the main Goal automatically. You do nothing; it is the rhythm of the Foundation.</>,
          },
          {
            glyph: 'wallet', title: 'A one-off gift you direct yourself',
            text: <>See a Goal that matters to you and put something toward it, from {zar(MIN_GOAL_PAYMENT)} up to {zar(MAX_GOAL_PAYMENT)}. It goes to the Goal you chose — not into a general pot for leadership to allocate. If you press the button twice by mistake, you are charged once.</>,
          },
          {
            glyph: 'clock', title: 'A monthly plan toward one Goal',
            text: <>Commit an amount on a day of your choosing, and it is collected every month until you stop it or the Goal closes. The app suggests what the Goal still needs spread over the months it has left; the amount is yours to decide.</>,
          },
        ]} />

        <Advice tone="gold" label="If a plan stops on its own">
          A monthly plan pauses itself if the debit order behind it goes away — there is nothing to
          collect from. Set up a new debit order and the plan has a button to start it again, with
          the reason it stopped shown beside it. Stopping a plan never takes back what it has
          already put in; that money is in the Goal, and the Goal belongs to the circle.
        </Advice>

        <Table
          head={['A Goal reads', 'What it means']}
          widths={[0.2, 0.8]}
          rows={[
            ['Draft', 'Proposed, not yet open. Nobody can pay into it.'],
            ['Active', 'Open, and accepting money.'],
            ['Achieved', 'The target was reached, so it closes to new payments.'],
            ['Failed', 'The date passed without the target. What was contributed stays where it is; the Goal simply stops asking for more.'],
          ]}
        />
      </Section>

      {/* ── 09 ──────────────────────────────────────────────────────────── */}
      <Section num={9} title="Your Badge" kicker="STANDING"
        plain="Your Badge, and" italic="What It Says">
        <Lede>
          Your badge is a picture of your reliability — nothing more and nothing less. It reflects
          how consistently you have met what you committed to, and it is visible to the circle.
        </Lede>

        <P>
          It exists because in a group this size, reputation is the real security. Nobody is chasing
          anyone. What replaces chasing is that everyone can see who is carrying their share, and
          the quiet pressure of being known does the rest.
        </P>

        <Advice tone="green" label="A badge is never a punishment">
          A missed month because a salary landed late is not the same as a member who has stopped
          answering, and the two are not treated the same. If something goes wrong on the
          collector{"'"}s side or with the banking system — an outage, a timeout — that is not held
          against you at all, and you will not even hear about it as though it were.
        </Advice>

        <H2>The Founder badge</H2>
        <P>
          Separate from the reliability badge, and it is not earned. The {FOUNDER_COUNT} of us hold
          it because of when we arrived, and that is a fact about history rather than a ranking. It
          carries no extra vote, no larger share of anything, and no authority over another member.
          It is granted by hand and there will never be a fifth.
        </P>

        <Advice tone="gold" label="What a badge does not do">
          It does not change what you pay, what you may see, or what the Foundation owes you. Two
          members with different badges have exactly the same rights in this document.
        </Advice>
      </Section>

      {/* ── 10 ──────────────────────────────────────────────────────────── */}
      <Section num={10} title="Community & Notifications" kicker="STAYING IN TOUCH"
        plain="How the Circle" italic="Talks">
        <Lede>
          There is a board inside the app where the circle talks, and there are messages the
          Foundation sends you. You control most of the second; the first is simply there.
        </Lede>

        <H2>The board</H2>
        <P>
          Not a replacement for the family chat — the difference is that this one is part of the
          record. It is where a Goal gets proposed and argued for, where thanks are said in front
          of everybody, and where an answer stays findable six months later. Each member may post
          up to ten times a day, which nobody has ever come close to and which exists only so one
          person cannot become the board.
        </P>

        <H2>How we reach you</H2>
        <Table
          head={['Channel', 'What it carries']}
          widths={[0.22, 0.78]}
          rows={[
            ['In the app', 'Everything. This is the record — a message you deleted from your email is still here.'],
            ['Email', 'Statements, receipts, and anything you will want to find again later.'],
            ['SMS', 'Short and urgent. A collection that failed, a code you need now.'],
            ['WhatsApp', 'Optional, and off unless you turn it on. Announcements and reminders.'],
          ]}
        />

        <Advice tone="gold" label="Two things you cannot switch off">
          Anything about money leaving your account, and anything about your account{"'"}s security.
          A member who has muted the news that a collection failed finds out from their bank
          instead, and that is not a choice we are willing to let anyone make by accident.
          Everything else can be turned off at any time, including after you leave.
        </Advice>
      </Section>

      {/* ── 11 ──────────────────────────────────────────────────────────── */}
      <Section num={11} title="Your Member Dashboard" kicker="WHAT YOU SEE"
        plain="Your" italic="Dashboard">
        <Lede>
          One screen that answers four questions without you having to go looking for any of them.
        </Lede>

        <Table
          head={['The question', 'Where the answer is']}
          widths={[0.34, 0.66]}
          rows={[
            ['Am I up to date?', 'The card at the top, showing this month and where it stands. Overdue is unmissable by design.'],
            ['What have I put in altogether?', 'Your total, across every month since you joined.'],
            ['What is the circle working toward?', 'The main Goal, with what it needs and what it has.'],
            ['Is anything waiting for me?', 'A debit order to confirm, a shortfall you can settle, an unread message.'],
          ]}
        />

        <H2>Your statement</H2>
        <P>
          A proper PDF, for any month you choose, that you generate yourself whenever you want
          without asking anybody. It carries the Foundation{"'"}s mark, your name, and a line for
          every movement in that month. It is made to be handed to someone — a bank, a family
          member, anyone asking what this is that comes off your account — and to answer them
          without a conversation.
        </P>

        <IconList items={[
          { glyph: 'file', title: 'Every figure opens', text: <>No total is something you are asked to take on trust. Each one opens into the individual entries it was built from.</> },
          { glyph: 'clock', title: 'Yours after you leave', text: <>You keep the right to generate statements for every month you were a member, for as long as the Foundation exists.</> },
        ]} />

        <Advice tone="green" label="If two numbers disagree">
          If a figure on your dashboard ever disagrees with your statement, raise it that day. They
          are built from the same record, so a disagreement is a real problem worth reporting
          rather than a display quirk.
        </Advice>
      </Section>

      {/* ── 12 ──────────────────────────────────────────────────────────── */}
      <Section num={12} title="What Leadership Can and Cannot Do" kicker="POWER, AND ITS LIMITS"
        plain="What Leadership" italic="Can and Cannot Do">
        <P>
          Leadership runs the Foundation day to day. Every power below is real, and every one of
          them is written against the name of the person who used it, at the moment they used it.
        </P>

        <Table
          head={['Leadership may', 'What it means in practice']}
          widths={[0.3, 0.7]}
          rows={[
            ['Invite a member', 'Record who they are and send the link. Section 23.'],
            ['Activate an account', 'Let a newly registered member start taking part.'],
            ['Approve a debit order', 'Check the banking details before anything is collected. A refusal must carry a reason, and the member is told it.'],
            ['Stop a debit order', 'Necessary when somebody changes banks. It stops future collections and reverses nothing.'],
            ['Open the month', 'Write the month’s amount for every active member at once. There is no undo, so it asks first.'],
            ['Record a payment', 'Enter money that arrived another way — cash, a transfer — against the right member and month.'],
            ['Waive a month', 'Release a member from a month. It shows on their statement as a waiver, with who granted it.'],
            ['Run the Goals', 'Open one, set its target and date, close it when it is met.'],
            ['Suspend an account', 'End somebody’s participation. It keeps their record and their place.'],
          ]}
        />

        <H2>And what no leader can do</H2>
        <Compare
          yes={{
            title: 'Always true',
            items: [
              'Every action is written down, with a name and a time',
              'No leader can erase an entry, including their own',
              'At least one leader must always be able to sign in',
              'A member’s ID cannot be changed on an ordinary screen',
            ],
          }}
          no={{
            title: 'Simply not possible',
            items: [
              'Mark you as having resigned — only you can say you left',
              'Suspend their own account, or the last remaining leader',
              'Read your password; it is not stored in a readable form',
              'Open a month more than a year away',
              'Take money from a Goal without it being recorded',
            ],
          }}
        />

        <Advice tone="gold" label="Why this list exists">
          A rule that only lives in somebody{"'"}s head is a rule until the day it is inconvenient.
          Every line on the right is refused by the software itself, in the same way it refuses a
          contribution below the minimum.
        </Advice>
      </Section>

      {/* ═══ PART IV ══════════════════════════════════════════════════════ */}
      <Page size="A4" style={styles.dark}>
        <PartDivider {...RAW_PARTS[3]!} plain={RAW_PARTS[3]!.title} />
      </Page>

      {/* ── 13 ──────────────────────────────────────────────────────────── */}
      <Section num={13} title="Your Rights & Responsibilities" kicker="THE PACT"
        plain="What You Are Owed," italic="What You Owe">
        <Compare
          yes={{
            title: 'Your rights',
            items: [
              'See the full pool, and every Goal, at any time',
              'See your own complete history, always',
              'Download a statement for any month, unasked',
              'Know who took any decision affecting you, and when',
              'Ask any question about any figure, of anyone',
              'Turn off any message that is not about your money or your security',
              'Leave, at any time, without giving a reason',
            ],
          }}
          no={{
            title: 'Your responsibilities',
            items: [
              'Keep your agreed amount available on your debit day',
              'Tell us early if a month is going to be difficult',
              'Keep your contact details current',
              'Keep your password to yourself',
              'Treat every member’s circumstances as their own to share',
              'Accept that contributions are not refundable',
            ],
          }}
        />

        <H2>Leaving</H2>
        <P>
          At any time, from your own account, without a reason and without asking. It takes one
          screen. What happens next is the part worth reading: you stop being a participant, and
          you do not stop being someone with a record here.
        </P>

        <Table
          head={['After you leave, you keep', 'And you stop']}
          widths={[0.5, 0.5]}
          rows={[
            ['Your account and your sign-in', 'Contributing, and being collected from'],
            ['Every statement, for every month', 'Funding Goals or running monthly plans'],
            ['Your full contribution history', 'Proposing Goals, cheering, commenting'],
            ['The ability to change your password', 'Posting to the board'],
            ['The ability to switch messages off', 'Holding a seat in the circle'],
          ]}
        />

        <Advice tone="green" label="Leaving is your own account of your own decision">
          No leader can mark somebody as having resigned. If leadership needs to end access they
          suspend the account, which says plainly who did it. Nobody gets to put words in your
          mouth about why you left.
        </Advice>
      </Section>

      {/* ── 14 ──────────────────────────────────────────────────────────── */}
      <Section num={14} title="Security" kicker="KEEPING IT SAFE"
        plain="How Your Account" italic="Is Protected">
        <IconList items={[
          {
            glyph: 'key', title: `A password of at least ${PASSWORD_MIN_LENGTH} characters`,
            text: <>Length is what actually resists an attack, so length is what we ask for — not a capital and a symbol, which mostly produces the same handful of passwords everybody else picks. Four ordinary words you will remember beat eight characters you have to write down.</>,
          },
          {
            glyph: 'lock', title: 'Your details are encrypted',
            text: <>Your banking details and your ID number are scrambled where they are stored, in a way that can be re-secured without you re-entering anything. Nobody in leadership can read your password at all — it is not kept in a readable form.</>,
          },
          {
            glyph: 'shield', title: 'You are signed out eventually',
            text: <>Sessions do not last forever. That is inconvenient and it is the point: an account signed in forever on a phone that gets lost is an account somebody else has.</>,
          },
          {
            glyph: 'file', title: 'Everything is written down',
            text: <>Every action taken on the Foundation carries a name and a time, and nobody can remove one. It is the same protection for you as it is for us.</>,
          },
        ]} />

        <Advice tone="rose" label="We will never ask you for your password">
          Not by phone, not by message, and not by a person you know in leadership. If anyone asks
          — including someone using one of our names — it is not us. And banking details for this
          Foundation are never sent to you in a message; they are shown inside the app, where
          nobody can have changed them along the way.
        </Advice>
      </Section>

      {/* ── 15 ──────────────────────────────────────────────────────────── */}
      <Section num={15} title="Risks We Have Considered" kicker="HONESTLY"
        plain="What Could Go Wrong," italic="and What We Did">
        <P>
          Every arrangement involving money carries risk. Pretending otherwise is how people get
          hurt. These are the ones we thought about hardest, and what stands between each of them
          and you.
        </P>

        <Table
          head={['The risk', 'What stands in the way']}
          widths={[0.31, 0.69]}
          rows={[
            ['Somebody takes the pool', 'The account is in the Foundation’s name with all four leaders as signatories, and every movement is written down and checked against the bank daily.'],
            ['A member stops paying', 'Their standing shows it, the circle can see it, and it is a conversation long before it is a problem. There is no interest and no penalty.'],
            ['The pool cannot cover a Goal', 'A Goal opens with a target and a date and only pays out when the circle has agreed. Nothing is promised before it exists.'],
            ['Somebody joins who should not', 'Nobody can sign up. An invitation names a specific person and records who vouched for them.'],
            ['A leader abuses their position', 'Nothing can be done invisibly, no entry can be deleted, and no leader can remove the last other leader.'],
            ['The technology fails', 'The money never sits inside it. Your funds are with your bank or the Foundation’s bank, and the record can be rebuilt from both.'],
          ]}
        />

        <Advice tone="gold" label="The risk we cannot remove">
          This is a shared pool, not a savings account. If the circle funds a Goal, that money is
          spent on the Goal. You are funding things for other people, and they are funding things
          for you. The arrangement only works because that is true in both directions — and it is
          the reason Section 07 exists.
        </Advice>
      </Section>

      {/* ── 16 ──────────────────────────────────────────────────────────── */}
      <Section num={16} title="What We Collect, and Why" kicker="YOUR INFORMATION"
        plain="What We Hold," italic="and Why">
        <Table
          head={['What we hold', 'Why we need it']}
          widths={[0.28, 0.72]}
          rows={[
            ['Your name and contact details', 'To reach you, and so the circle knows who is in it.'],
            ['Your ID number', 'It is what ties a bank account to a person. A collective that cannot establish who a member is cannot protect the rest from somebody pretending to be them.'],
            ['Your banking details', 'To collect what you committed. Used for nothing else, ever.'],
            ['Your money history', 'Because it is the record, and the record is the whole point.'],
          ]}
        />

        <H2>About your ID number</H2>
        <P>
          It is written on your invitation by the leader inviting you, from a document, before you
          have an account — and you confirm it matches yours when you register. Afterwards neither
          of you can change it from an ordinary screen. That is inconvenient once and right
          forever: an ID a member can edit is not an identity check, it is a text box.
        </P>
        <P>
          Leaders only ever see the last four digits of it on screen — enough to tell which number
          is on file, without putting the whole thing where somebody could be standing behind them.
          We do not ask for your date of birth separately, because it is already inside the number.
        </P>

        <Compare
          yes={{
            title: 'What we do',
            items: [
              'Hold it only as long as you are part of this record',
              'Share banking details only with the collector, which needs them',
              'Show other members your name and that you are a member',
            ],
          }}
          no={{
            title: 'What we never do',
            items: [
              'Sell it, or share it with anyone outside the Foundation',
              'Use it to judge you for anything but membership here',
              'Show other members your ID, your bank, your amount or your gifts',
            ],
          }}
        />
      </Section>

      {/* ── 17 ──────────────────────────────────────────────────────────── */}
      <Section num={17} title="Foundation Values" kicker="WHAT WE STAND ON"
        plain="Five Things We" italic="Will Not Trade">
        <IconList items={[
          { glyph: 'scale', title: 'Discipline', text: <>The amount, the day, the record. A collective survives on people doing the ordinary thing repeatedly, not on anybody{"'"}s enthusiasm in month one.</> },
          { glyph: 'file', title: 'Transparency', text: <>Every figure traceable, every decision named. Nobody should ever have to take a number here on trust — including the four of us.</> },
          { glyph: 'users', title: 'Trust', text: <>Everyone inside this circle can be reached by someone who knows them personally. That is the actual security; the software only records it.</> },
          { glyph: 'heart', title: 'Dignity', text: <>A member who is struggling is a member, not a debtor. There is no interest, no penalty and no chasing — only an earlier conversation.</> },
          { glyph: 'seed', title: 'Patience', text: <>We are not trying to grow. Fifty people, done properly, for years, is the whole ambition.</> },
        ]} />

        <Quote attr="The standard we hold ourselves to">
          A circle where raising a problem is uncomfortable will eventually have a problem nobody
          raised.
        </Quote>

        <Advice tone="green" label="Asking about money is never rude">
          Asking where a figure came from, why a Goal changed, or what a waiver was for is exactly
          the behaviour this Foundation is built to make easy. Anybody made to feel awkward for
          asking is being failed by the group, not the other way round.
        </Advice>
      </Section>

      {/* ── 18 ──────────────────────────────────────────────────────────── */}
      <Section num={18} title="How the Foundation Fits Together" kicker="THE WHOLE PICTURE"
        plain="How It All" italic="Fits Together">
        <JourneyRail stops={[
          { glyph: 'invite', title: 'A leader invites', text: 'Names a person, records who vouched for them.' },
          { glyph: 'users', title: 'They join', text: 'Confirm who they are, set a password, get activated.' },
          { glyph: 'cycle', title: 'They contribute', text: 'One amount, one day, every month.' },
          { glyph: 'flag', title: 'The circle builds', text: 'The pool funds Goals the circle agreed on.' },
        ]} />

        <H2>The four moving parts</H2>
        <IconList items={[
          { glyph: 'users', title: 'The members', text: <>Up to {MAX_MEMBERS} people who each committed an amount. Everything else exists to serve them.</> },
          { glyph: 'wallet', title: 'The pool', text: <>One bank account in the Foundation{"'"}s name, holding everything contributed and not yet spent on a Goal.</> },
          { glyph: 'flag', title: 'The Goals', text: <>The only way money leaves the pool. Named, with a target and a date, visible to everybody.</> },
          { glyph: 'file', title: 'The record', text: <>Every rand and every decision, written as it happens, checkable against the bank, deletable by nobody.</> },
        ]} />

        <Advice tone="gold" label="If you only remember one thing">
          Money moves bank to bank. The app is the book that records it. Goals are the only door
          out of the pool, and every door has a name on it.
        </Advice>
      </Section>

      {/* ── 19 ──────────────────────────────────────────────────────────── */}
      <Section num={19} title="How the Circle Grows" kicker="SLOWLY, ON PURPOSE"
        plain="How the Circle" italic="Grows">
        <Lede>
          From {FOUNDER_COUNT} to {MAX_MEMBERS}, and no further. Not quickly, and never by
          advertising.
        </Lede>

        <P>
          The four of us join first and prove the arrangement on ourselves. Only then does anybody
          else get invited, one person at a time, each vouched for by name. A seat is taken the
          moment an invitation is sent — so if somebody decides not to join, ask us to cancel it
          and the seat comes back straight away.
        </P>

        <Table
          head={['Stage', 'Who is in it', 'What we are proving']}
          widths={[0.2, 0.24, 0.56]}
          rows={[
            ['The four', `${FOUNDER_COUNT} members`, 'That the money moves exactly as this guide says it does, on our own accounts first.'],
            ['The first circle', 'Up to about 15', 'That people who are not us can join, contribute and be looked after properly.'],
            ['The full circle', `Up to ${MAX_MEMBERS}`, 'That a Goal of real size can be funded and paid out, and the record still balances.'],
          ]}
        />

        <Advice tone="gold" label={`There is no seat ${MAX_MEMBERS + 1}`}>
          The cap is a design decision, not a limit we are waiting to escape. Beyond {MAX_MEMBERS}{' '}
          people, this stops being a circle of people who know each other and becomes an
          administration problem with a committee attached.
        </Advice>

        <Advice tone="green" label="Who to invite">
          Someone you would be comfortable sitting across from if a month went badly. That is the
          whole test, and it is a better one than any amount they can afford.
        </Advice>
      </Section>

      {/* ═══ PART V ═══════════════════════════════════════════════════════ */}
      <Page size="A4" style={styles.dark}>
        <PartDivider {...RAW_PARTS[4]!} plain={RAW_PARTS[4]!.title} />
      </Page>

      {/* ── 20 ──────────────────────────────────────────────────────────── */}
      <Section num={20} title="Frequently Asked Questions" kicker="THE THINGS PEOPLE ASK"
        plain="Questions People" italic="Actually Ask">
        <Table
          head={['Question', 'Answer']}
          widths={[0.33, 0.67]}
          rows={[
            ['Can I get my money back?', `No. Contributions are not refundable — that is the one rule, and Section 07 is entirely about it. Money leaves the pool only through a Goal.`],
            ['What if I cannot pay one month?', 'Tell us before the day. A month agreed in advance is an ordinary thing; a month discovered later is a harder conversation for everyone. There is no interest and no penalty either way.'],
            ['Why is my bank showing more than I committed?', `${zar(NETCASH_FEE_BUFFER)} is added to cover the cost of collecting, so the full amount you committed reaches the pool. Section 04.`],
            ['Can I change my monthly amount?', 'Yes, by speaking to a leader. It is a decision, not a slider — the circle plans around what everyone committed.'],
            ['Who can see what I contribute?', 'Leadership, and you. Other members see your name and that you are a member, not your amount.'],
            ['Can I be removed?', 'Leadership can suspend an account, which stops participation and keeps your record and your seat. It is for serious things, not for one missed month or for disagreeing with us.'],
            ['What happens if the app disappears?', 'Your money is not in it. It is with your bank or the Foundation’s bank, and the record can be rebuilt from both.'],
          ]}
        />
      </Section>

      {/* ── 21 ──────────────────────────────────────────────────────────── */}
      <Section num={21} title="Glossary" kicker="PLAIN MEANINGS"
        plain="The Words" italic="We Use">
        <Table
          head={['Word', 'What it means here']}
          widths={[0.26, 0.74]}
          rows={[
            ['The pool', 'One bank account in the Foundation’s name, holding everything contributed and not yet spent. Also called the collective or the circle.'],
            ['Contribution', 'The amount you agreed to put in each month.'],
            ['Debit order', 'The standing permission you gave your own bank to release your amount on your day. You can withdraw it.'],
            ['The collector', 'The licensed company your bank pays, which settles the money into the Foundation’s account. It never holds it.'],
            ['Goal', 'A named thing the circle is funding, with an amount and a date. The only way money leaves the pool.'],
            ['Monthly plan', 'A standing commitment to one Goal, collected each month until you stop it.'],
            ['Gift', 'A one-off amount you send to a Goal yourself, separate from your monthly contribution.'],
            ['Waiver', 'A month leadership released you from, with their name on the decision.'],
            ['Statement', 'A PDF of everything that happened on your account in a month, which you generate yourself.'],
            ['Suspended', 'Participation stopped by leadership. Your record and your seat stay yours.'],
            ['Resigned', 'You chose to leave — only you can say this about yourself.'],
          ]}
        />
      </Section>

      {/* ── 22 ──────────────────────────────────────────────────────────── */}
      <Section num={22} title="Your Journey at a Glance" kicker="WHAT THE FIRST YEAR LOOKS LIKE"
        plain="Your Journey" italic="at a Glance">
        <Table
          head={['When', 'What happens', 'What you do']}
          widths={[0.19, 0.42, 0.39]}
          rows={[
            ['The invitation', 'A leader sends you a private link with your details already on it.', 'Check every detail is right. Say so immediately if not.'],
            ['Registering', 'You confirm your ID matches and set a password.', 'Choose a password you use nowhere else.'],
            ['Activation', 'A leader activates your account.', 'Nothing. You can sign in and look around.'],
            ['Your debit order', 'You give your bank details; your bank asks you to confirm.', 'Confirm it on your banking app. Nothing can be collected until you do.'],
            ['Month one', 'Your first amount is collected on your day.', 'Check your bank statement against Section 04.'],
            ['Month one ends', 'Your first statement is available.', 'Generate it, before you ever need it.'],
            ['Ongoing', 'The pool grows. Goals open and get funded.', 'Contribute, watch the Goals, speak up on the board.'],
          ]}
        />

        <Advice tone="green" label="The one thing that holds everything up">
          Your debit order. Until your bank has your confirmation, nothing can be collected and
          your first month will sit unpaid through no fault of anyone. It is the first thing to do
          and the easiest to forget.
        </Advice>
      </Section>

      {/* ── 23 ──────────────────────────────────────────────────────────── */}
      <Section num={23} title="Joining, Step by Step" kicker="HOW SOMEBODY COMES IN"
        plain="Joining," italic="Step by Step">
        <H2>What is on your invitation before you ever see it</H2>
        <Table
          head={['On the invitation', 'Why it is there']}
          widths={[0.3, 0.7]}
          rows={[
            ['Your first and last name', 'So the account is not created by whoever opens the link.'],
            ['Your email address', 'Where the invitation goes, and how you sign in afterwards.'],
            ['Your mobile number', 'For anything short and urgent.'],
            ['Your ID number', 'The leader inviting you is vouching for who you are, from a document, before you have an account.'],
            ['Who vouched for you', 'How they know you. Recorded because it cannot be worked out from anything else.'],
            ['Your monthly amount', `What the two of you agreed. At least ${zar(MIN_CONTRIBUTION_ZAR)}.`],
          ]}
        />

        <JourneyRail stops={[
          { glyph: 'invite', title: 'Open your link', text: 'It is for you specifically, and it expires.' },
          { glyph: 'users', title: 'Check the details', text: 'Confirm your ID matches what was recorded.' },
          { glyph: 'key', title: 'Set a password', text: `At least ${PASSWORD_MIN_LENGTH} characters, used nowhere else.` },
          { glyph: 'shield', title: 'Get activated', text: 'A leader lets you in. Then set up your debit order.' },
        ]} />

        <Advice tone="gold" label="If a detail is wrong, stop">
          This is the moment it is easy to fix. If your ID does not match what the leader recorded,
          registration stops rather than creating an account against the wrong person — which is
          the check working, not a fault.
        </Advice>
      </Section>

      {/* ── 24 ──────────────────────────────────────────────────────────── */}
      <Section num={24} title="Important Notice" kicker="PLEASE READ BEFORE SIGNING"
        plain="Important" italic="Notice">
        <HeroPanel title="What this Foundation is not" glyph="shield">
          Xkimm Xa Mali is <HB>not a bank, not an investment product and not a lender</HB>. It is
          not registered as a financial services provider and does not give financial advice.
          Nobody here promises you a return, and no rand you contribute is guaranteed to come back
          to you multiplied. It is a private savings collective among people who know each other.
        </HeroPanel>

        <Advice tone="rose" label="Contributions are not refundable">
          The single most important sentence in this document. Money you contribute cannot be
          withdrawn or refunded to you personally, whether you stay for years or leave tomorrow. It
          leaves the pool only through a Goal the circle has agreed on. Section 07 explains it in
          full. Please do not sign until you are genuinely at peace with it.
        </Advice>

        <Advice tone="gold" label="Nothing here is a promise of a payout">
          A Goal is funded when the circle has the money and has agreed to it. Being a member does
          not entitle you to a Goal, to a share of the pool, or to a specific amount at a specific
          time.
        </Advice>

        <Advice tone="green" label="You may leave at any time">
          Without a reason, without a notice period, and with your full record intact. A circle you
          cannot leave is not a circle. What you may not do is take back what you have already
          contributed.
        </Advice>

        <P>
          This guide is the plain-language account of how the Foundation works and what it asks of
          you. If anything in it is unclear, ask before you sign. If anything in it ever stops
          matching what actually happens, say so — that is a fault worth fixing immediately.
        </P>
      </Section>

      {/* ── 25 ──────────────────────────────────────────────────────────── */}
      <Section num={25} title="Founder Declaration" kicker="WHAT THE FOUR OF US AGREE"
        plain="Founder" italic="Declaration">
        <Lede>
          We, the {FOUNDER_COUNT} founding members of Xkimm Xa Mali Foundation, declare the
          following to each other and to every member who follows us.
        </Lede>

        <IconList items={[
          { glyph: 'scale', title: 'We are bound by every rule in this guide', text: <>Without exception and without privilege. Nothing here applies to members and not to us.</> },
          { glyph: 'wallet', title: 'We contribute first, and on the same terms', text: <>The same minimum, the same collection, the same record. We prove the arrangement on ourselves before asking anyone else to trust it.</> },
          { glyph: 'file', title: 'We will keep the record honest', text: <>Every rand and every decision written as it happens, checkable by anybody in the circle, erasable by nobody including us.</> },
          { glyph: 'lock', title: 'We will not touch the pool for ourselves', text: <>Money leaves only through a Goal the circle has agreed. All four of us are signatories on the account, and no one of us can move it alone.</> },
          { glyph: 'users', title: 'We will keep the circle small', text: <>Never more than {MAX_MEMBERS} people, and every one of them invited by name and vouched for.</> },
          { glyph: 'heart', title: 'We will treat a hard month as a conversation', text: <>Not as a debt to be collected. No interest, no penalty, no chasing — for anybody, ever.</> },
        ]} />

        <Quote attr="Signed in the founding of it">
          We are not building something for strangers. We are building something for our own
          people, and we are the first ones bound by it.
        </Quote>
      </Section>

      {/* ── 26 ──────────────────────────────────────────────────────────── */}
      <Section num={26} title="Signature Page" kicker="AGREEMENT"
        plain="Signature" italic="Page">
        <P>
          By signing below I confirm that I have read this guide in full, that I understand how the
          Foundation works and how money moves, and that I accept the one rule: that contributions
          are not refundable and leave the pool only through a Goal the circle has agreed on.
        </P>
        <P>
          I confirm that I am joining freely, that nobody has pressured me, and that every question
          I had has been answered to my satisfaction.
        </P>

        <SignatureGrid people={FOUNDERS.map((f) => ({ name: f.name, role: f.role }))} />

        <View style={{ marginTop: 16 }}>
          <Advice tone="gold" label="For a member joining after the founders">
            Your signature belongs on a copy of this page issued with your own name on it. Ask the
            leader who invited you for one — do not sign a page carrying somebody else{"'"}s name.
          </Advice>
        </View>

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
              XKIMM XA MALI FOUNDATION
            </Text>
            <Text style={{ fontSize: 6.2, fontFamily: 'Geist', fontWeight: 600, color: G.gold, letterSpacing: 2.4, marginTop: 9 }}>
              CONTRIBUTING  ·  GROWING  ·  SECURING
            </Text>
            <View style={{ height: 1.4, width: 78, backgroundColor: G.gold, marginVertical: 26 }} />
            <Text style={{ fontSize: 10, fontFamily: 'Times-Italic', color: '#C6D9CF', textAlign: 'center', lineHeight: 1.6 }}>
              “It is more blessed to give than to receive.”
            </Text>
            <Text style={{ fontSize: 5.8, fontFamily: 'Geist', fontWeight: 600, color: G.gold, letterSpacing: 1.8, marginTop: 8 }}>
              ACTS 20:35
            </Text>
            <Text style={{ fontFamily: 'Geist', fontSize: 6.2, color: G.greenSoft, letterSpacing: 1.3, marginTop: 44, textAlign: 'center', lineHeight: 1.8 }}>
              VERSION {VERSION}  ·  {RELEASED.toUpperCase()}  ·  NEXT REVIEW {NEXT_REVIEW.toUpperCase()}{'\n'}
              PRIVATE &amp; CONFIDENTIAL  ·  PREPARED FOR {holder.toUpperCase()}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}

/**
 * Every section must occupy exactly one page.
 *
 * It is what lets the contents print a page number beside each entry without
 * laying the document out twice. When a section overflows, every entry after it
 * points one page early — and nothing says so, because an overflowed page looks
 * like an ordinary page. This turns that into a failure at the moment it
 * happens, which is the only time it is cheap to fix.
 */
export function assertPagination(pdf: Buffer, expected = TOTAL): void {
  // A single-section render is deliberately not the whole document.
  if (process.env.GUIDE_ONLY) return
  const actual = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
  if (actual !== expected) {
    throw new Error(
      `The guide laid out ${actual} pages but its contents describes ${expected}. ` +
      `${actual - expected} section(s) overflowed onto a second sheet — find the fullest ` +
      `page and cut it, or the contents will point at the wrong page from there on.`,
    )
  }
}

/**
 * The guide as bytes. `holder` is the only thing not read from the system — it
 * is whose copy this is.
 */
export async function generateFounderGuidePdf(opts?: { holder?: string }): Promise<Buffer> {
  registerGuideFonts()
  const portraits = await loadPortraits(FOUNDERS.map((f) => f.file))
  const pdf = await renderToBuffer(
    <FounderGuideDocument holder={opts?.holder ?? 'The Founding Members'} portraits={portraits} />,
  )
  assertPagination(pdf)
  return pdf
}
