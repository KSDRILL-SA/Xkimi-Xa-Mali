'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { formatZAR } from '@/lib/formatters'
import { PartyPopper, MessageCircle, Send, Trash2, Coins, HandCoins, Pencil, X, Loader2 } from 'lucide-react'

type Comment = {
  id: string
  content: string
  createdAt: string
  authorId: string
  authorName: string
  isMine: boolean
  canDelete: boolean
}

type Pledge = { pledgeTotal: number; pledgeCount: number; myPledge: number | null }

type Props = {
  goalId: string
  initial: { cheerCount: number; hasCheered: boolean; comments: Comment[]; pledge: Pledge }
  /** Active goals can be pledged toward; achieved/failed cannot. */
  contributable?: boolean
}

const AVATAR_COLORS = ['bg-xxm-green', 'bg-indigo-500', 'bg-purple-500', 'bg-sky-500', 'bg-rose-500', 'bg-emerald-500']

function relative(iso: string): string {
  const d = new Date(iso)
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
}

const MAX = 500

export function GoalEngagement({ goalId, initial, contributable = false }: Props) {
  // ── Cheers ──
  const [cheerCount, setCheerCount] = useState(initial.cheerCount)
  const [hasCheered, setHasCheered] = useState(initial.hasCheered)
  const [cheering, setCheering] = useState(false)
  const [burst, setBurst] = useState(false)

  // ── Comments ──
  const [comments, setComments] = useState<Comment[]>(initial.comments)
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)

  // ── Pledges ──
  const [pledge, setPledge] = useState<Pledge>(initial.pledge)
  const [showPledgeForm, setShowPledgeForm] = useState(false)
  const [pledgeAmount, setPledgeAmount] = useState('')
  const [pledging, setPledging] = useState(false)

  async function toggleCheer() {
    if (cheering) return
    setCheering(true)
    const prev = { hasCheered, cheerCount }
    const next = !hasCheered
    setHasCheered(next)
    setCheerCount((c) => c + (next ? 1 : -1))
    if (next) { setBurst(true); setTimeout(() => setBurst(false), 650) }
    try {
      const res = await api.post<{ cheered: boolean; cheerCount: number }>(`/api/v1/goals/${goalId}/cheer`)
      setHasCheered(res.cheered)
      setCheerCount(res.cheerCount)
    } catch {
      setHasCheered(prev.hasCheered)
      setCheerCount(prev.cheerCount)
    } finally {
      setCheering(false)
    }
  }

  async function submitPledge(e: React.FormEvent) {
    e.preventDefault()
    const amount = Number(pledgeAmount)
    if (!Number.isFinite(amount) || amount <= 0 || pledging) return
    setPledging(true)
    try {
      const res = await api.post<Pledge>(`/api/v1/goals/${goalId}/pledge`, { amount })
      setPledge(res)
      setShowPledgeForm(false)
      setPledgeAmount('')
    } catch {
      /* keep form open for retry */
    } finally {
      setPledging(false)
    }
  }

  async function withdrawPledge() {
    if (pledging) return
    setPledging(true)
    const prev = pledge
    try {
      const res = await api.delete<Pledge>(`/api/v1/goals/${goalId}/pledge`)
      setPledge(res)
    } catch {
      setPledge(prev)
    } finally {
      setPledging(false)
    }
  }

  function openPledgeForm() {
    setPledgeAmount(pledge.myPledge ? String(pledge.myPledge) : '')
    setShowPledgeForm(true)
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault()
    const content = text.trim()
    if (!content || posting) return
    setPosting(true)
    try {
      const created = await api.post<Comment>(`/api/v1/goals/${goalId}/comments`, { content })
      setComments((prev) => [created, ...prev])
      setText('')
    } catch {
      /* leave text for retry */
    } finally {
      setPosting(false)
    }
  }

  async function removeComment(id: string) {
    const prev = comments
    setComments((c) => c.filter((x) => x.id !== id))
    try {
      await api.delete(`/api/v1/goals/${goalId}/comments/${id}`)
    } catch {
      setComments(prev)
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Cheer ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm-sm p-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={toggleCheer}
          disabled={cheering}
          aria-pressed={hasCheered}
          className={`group relative inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all duration-fast ease-bounce active:scale-95 disabled:opacity-70 ${
            hasCheered
              ? 'bg-gradient-to-br from-xxm-gold to-xxm-gold-light text-xxm-green-900 shadow-gold-sm'
              : 'bg-xxm-gray-100 text-xxm-gray-600 hover:bg-xxm-gold/15 hover:text-xxm-gold-dark'
          }`}
        >
          <PartyPopper size={16} className={`transition-transform duration-slow ${hasCheered ? 'scale-110 -rotate-12' : 'group-hover:scale-110'}`} aria-hidden />
          {hasCheered ? 'Cheering' : 'Cheer'}
          <span className={`stat-number tabular-nums px-1.5 py-0.5 rounded-lg text-xs ${hasCheered ? 'bg-white/30' : 'bg-white'}`}>{cheerCount}</span>
          {burst && <span className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 text-xs animate-fade-in-up" aria-hidden>🎉</span>}
        </button>
        <p className="text-xs text-xxm-gray-400 flex-1 min-w-[120px]">
          {cheerCount === 0
            ? 'Be the first to cheer this goal on.'
            : `${cheerCount} member${cheerCount === 1 ? '' : 's'} ${cheerCount === 1 ? 'is' : 'are'} backing this.`}
        </p>
      </div>

      {/* ── Pledge ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-white rounded-3xl border border-xxm-gold/20 shadow-xxm-sm p-5">
        <div className="pointer-events-none absolute -top-12 -right-12 w-40 h-40 rounded-full bg-gradient-to-br from-xxm-gold/15 to-transparent blur-2xl" aria-hidden />
        <div className="relative flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-xxm-gold/20 to-xxm-gold/5 ring-1 ring-xxm-gold/25 flex items-center justify-center shrink-0">
            <Coins size={19} className="text-xxm-gold-dark" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-lg font-black text-xxm-green-900 leading-tight">
              {formatZAR(pledge.pledgeTotal)} <span className="text-sm font-bold text-xxm-gray-400">pledged</span>
            </p>
            <p className="text-xs text-xxm-gray-500 mt-0.5">
              {pledge.pledgeCount === 0
                ? 'No pledges yet — be the first to back this goal.'
                : `${pledge.pledgeCount} member${pledge.pledgeCount === 1 ? '' : 's'} backing this goal`}
            </p>

            {contributable && (
              <div className="mt-3">
                {showPledgeForm ? (
                  <form onSubmit={submitPledge} className="flex items-center gap-2">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-xxm-gray-400">R</span>
                      <input
                        type="number" min={10} step={10} autoFocus
                        value={pledgeAmount}
                        onChange={(e) => setPledgeAmount(e.target.value)}
                        placeholder="500"
                        className="w-32 rounded-xl border border-xxm-gray-200 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-gold/30"
                      />
                    </div>
                    <button type="submit" disabled={pledging || !pledgeAmount} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-xxm-gold text-xxm-green-900 text-sm font-bold hover:bg-xxm-gold-light transition-colors disabled:opacity-50 shadow-gold-sm">
                      {pledging ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <HandCoins size={14} aria-hidden />}
                      {pledge.myPledge ? 'Update' : 'Pledge'}
                    </button>
                    <button type="button" onClick={() => setShowPledgeForm(false)} className="p-2 text-xxm-gray-400 hover:text-xxm-gray-600" aria-label="Cancel">
                      <X size={15} aria-hidden />
                    </button>
                  </form>
                ) : pledge.myPledge !== null ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-xxm-green-50 text-xxm-green-800 text-sm font-bold">
                      <HandCoins size={14} aria-hidden /> You pledged {formatZAR(pledge.myPledge)}
                    </span>
                    <button type="button" onClick={openPledgeForm} className="inline-flex items-center gap-1 text-xs font-semibold text-xxm-gray-500 hover:text-xxm-green transition-colors">
                      <Pencil size={12} aria-hidden /> Edit
                    </button>
                    <button type="button" onClick={withdrawPledge} disabled={pledging} className="inline-flex items-center gap-1 text-xs font-semibold text-xxm-gray-400 hover:text-red-500 transition-colors disabled:opacity-50">
                      <X size={12} aria-hidden /> Withdraw
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={openPledgeForm} className="group inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-xxm-green text-white text-sm font-bold hover:bg-xxm-canopy hover:-translate-y-0.5 transition-all duration-fast ease-smooth shadow-xxm-sm">
                    <HandCoins size={15} aria-hidden /> Back this goal
                  </button>
                )}
                <p className="text-[11px] text-xxm-gray-400 mt-2 leading-relaxed">
                  A pledge is your commitment toward this goal — it rallies the brotherhood. Funds are still collected through your monthly contributions to the pool.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Discussion ─────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm-sm p-5 space-y-4">
        <h2 className="text-xs font-bold text-xxm-gray-400 uppercase tracking-widest flex items-center gap-1.5">
          <MessageCircle size={13} aria-hidden /> Discussion ({comments.length})
        </h2>

        <form onSubmit={submitComment} className="flex items-end gap-2">
          <div className="flex-1">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX))}
              rows={2}
              placeholder="Cheer the brotherhood on, or share an idea…"
              className="w-full rounded-2xl border border-xxm-gray-200 px-4 py-2.5 text-sm text-xxm-green-900 focus:outline-none focus:ring-2 focus:ring-xxm-green/25 resize-none placeholder:text-xxm-gray-400 leading-relaxed"
            />
            <p className="text-[10px] text-xxm-gray-300 mt-0.5 text-right">{text.length}/{MAX}</p>
          </div>
          <button
            type="submit"
            disabled={!text.trim() || posting}
            className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-xxm-green text-white hover:bg-xxm-canopy transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 mb-5"
            aria-label="Post comment"
          >
            {posting ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Send size={16} aria-hidden />}
          </button>
        </form>

        {comments.length === 0 ? (
          <p className="text-sm text-xxm-gray-400 text-center py-4">No comments yet — start the conversation.</p>
        ) : (
          <ul className="space-y-2.5">
            {comments.map((c, i) => {
              const initials = c.authorName.split(' ').map((p) => p[0] ?? '').slice(0, 2).join('').toUpperCase()
              const color = AVATAR_COLORS[c.authorName.charCodeAt(0) % AVATAR_COLORS.length]
              return (
                <li key={c.id} className="group flex items-start gap-3 animate-fade-in-up" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                  <span className={`w-8 h-8 rounded-xl ${color} text-white text-[10px] font-bold flex items-center justify-center shrink-0`}>{initials}</span>
                  <div className="flex-1 min-w-0 bg-xxm-gray-50/70 rounded-2xl px-3.5 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-xxm-green-900 truncate">
                        {c.authorName}{c.isMine && <span className="ml-1 text-[10px] font-semibold text-xxm-gold-dark">You</span>}
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-xxm-gray-400">{relative(c.createdAt)}</span>
                        {c.canDelete && (
                          <button type="button" onClick={() => removeComment(c.id)} className="text-xxm-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100" aria-label="Delete comment">
                            <Trash2 size={13} aria-hidden />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-xxm-gray-700 mt-0.5 leading-relaxed whitespace-pre-wrap break-words">{c.content}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
