'use client'

import { useState, useTransition, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import WheelAnimation, { WheelStatic } from './WheelAnimation'
import {
  performSpin,
  acceptSpinResult,
  paySpinAgain,
  payUpgradeToSpinReroll,
  pickNextUpgradeGame,
  finalizeUpgradeChoice,
  payChooseAnyGame,
  performReroll,
  finalizeSpinReroll,
  chooseGame,
  chooseGameWithRawg,
  skipChooseTurn,
} from '@/app/(app)/wheel/actions'
import { TICKET_COSTS, TICKET_AWARDS, WHEEL_TURN_LABELS, WHEEL_MIN_GAMES } from '@/lib/constants'
import type { WheelTurn } from '@/lib/types'
import type { RawgSearchResult } from '@/lib/rawg'

type Phase =
  | 'setup'
  | 'spinning'
  | 'elim_step'
  // SPIN turn phases
  | 'spin_result'           // result shown + Accept / paid options
  | 'spin_paid_spinning'    // animation for paid Spin Again
  | 'spin_upgrade_spinning' // animation for upgrade game2
  | 'spin_upgrade_reroll_prompt' // keep game2 or spin for game3?
  | 'spin_upgrade_game3_spinning'
  | 'spin_upgrade_final_choice'  // choose from game1+game2+(game3)
  | 'spin_choose_any'       // free-text input (paid)
  // SPIN+REROLL turn phases
  | 'reroll_prompt'
  | 'reroll_spinning'
  | 'final_choice'
  // CHOOSE turn
  | 'choose_input'
  // Done
  | 'done'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

interface Props {
  turn: WheelTurn
  balance: number
  accentColour: string
  backlogGames: string[]
}

export default function WheelClient({ turn, balance, accentColour, backlogGames }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [phase, setPhase] = useState<Phase>(turn === 'choose' ? 'choose_input' : 'setup')
  const [rawGames, setRawGames] = useState('')
  const [mode, setMode] = useState<'elimination' | 'first_land'>('elimination')
  const [chooseInput, setChooseInput] = useState('')
  const [chooseSearchResults, setChooseSearchResults] = useState<RawgSearchResult[]>([])
  const [chooseSelectedRawg, setChooseSelectedRawg] = useState<RawgSearchResult | null>(null)
  const [chooseSearching, setChooseSearching] = useState(false)
  const chooseSearchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [error, setError] = useState('')
  const [elimNextPhase, setElimNextPhase] = useState<Phase>('spinning')

  // Optimistic balance — updated immediately on spend, synced from server after revalidation
  const [localBalance, setLocalBalance] = useState(balance)
  const [ticketFlash, setTicketFlash] = useState<{ amount: number; id: number } | null>(null)
  const [spentThisTurn, setSpentThisTurn] = useState(0)

  useEffect(() => { setLocalBalance(balance) }, [balance])

  // Debounced RAWG search for the CHOOSE turn input
  useEffect(() => {
    const q = chooseInput.trim()
    if (chooseSelectedRawg && q === chooseSelectedRawg.name) {
      setChooseSearchResults([])
      return
    }
    if (chooseSelectedRawg && q !== chooseSelectedRawg.name) {
      setChooseSelectedRawg(null)
    }
    if (q.length < 2) {
      setChooseSearchResults([])
      return
    }
    if (chooseSearchDebounce.current) clearTimeout(chooseSearchDebounce.current)
    chooseSearchDebounce.current = setTimeout(async () => {
      setChooseSearching(true)
      try {
        const res = await fetch(`/api/rawg/search?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setChooseSearchResults(Array.isArray(data?.results) ? data.results : [])
      } catch {
        setChooseSearchResults([])
      } finally {
        setChooseSearching(false)
      }
    }, 300)
    return () => {
      if (chooseSearchDebounce.current) clearTimeout(chooseSearchDebounce.current)
    }
  }, [chooseInput, chooseSelectedRawg])

  // Animation state
  const [animTarget, setAnimTarget] = useState('')
  const [currentAnimGames, setCurrentAnimGames] = useState<string[]>([])
  const [elimQueue, setElimQueue] = useState<string[]>([])
  const [elimIndex, setElimIndex] = useState(0)
  const [eliminated, setEliminated] = useState<string[]>([])

  // Results
  const [winner, setWinner] = useState('')         // current/first spin result
  const [rerollWinner, setRerollWinner] = useState('') // SPIN+REROLL turn second option
  // Upgrade (paid Spin&Reroll): all games in the upgrade flow (pre-existing + newly spun)
  const [upgradeGames, setUpgradeGames] = useState<string[]>([])
  const [upgradeMaxGames, setUpgradeMaxGames] = useState(3) // 3 from reroll_prompt, 4 from final_choice
  const [finalChosen, setFinalChosen] = useState('')
  const [chooseAnyReturnPhase, setChooseAnyReturnPhase] = useState<Phase>('spin_result')

  const gamesList = rawGames.split(/\r?\n/).map(g => g.trim()).filter(Boolean)
  const uniqueGames = Array.from(new Set(gamesList.map(g => g.toLowerCase()))).map(
    lower => gamesList.find(g => g.toLowerCase() === lower)!
  )
  const duplicateCount = gamesList.length - uniqueGames.length
  const canSpin = uniqueGames.length >= WHEEL_MIN_GAMES

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function spendTickets(amount: number) {
    setLocalBalance(prev => prev - amount)
    setTicketFlash(prev => ({ amount, id: (prev?.id ?? 0) + 1 }))
    setSpentThisTurn(prev => prev + amount)
  }

  function startAnimation(
    games: string[],
    target: string,
    onDone: () => void,
    nextPhase: Phase,
  ) {
    if (mode === 'first_land') {
      setCurrentAnimGames(games)
      setAnimTarget(target)
      setPhase(nextPhase)
      // onDone is called by WheelAnimation's onComplete
    } else {
      const nonWinners = shuffle(games.filter(g => g !== target))
      const queue = [...nonWinners, target]
      setElimQueue(queue)
      setElimIndex(0)
      setEliminated([])
      setCurrentAnimGames(games)
      setAnimTarget(queue[0])
      setPhase(nextPhase)
    }
  }

  // ─── Initial spin ──────────────────────────────────────────────────────────

  function handleSpin() {
    setError('')
    startTransition(async () => {
      const res = await performSpin(uniqueGames, mode)
      if ('error' in res) { setError(res.error ?? ''); return }
      const target = res.winner ?? ''
      setWinner(target)
      startAnimation(uniqueGames, target, () => {}, 'spinning')
    })
  }

  // Called by WheelAnimation's onComplete (and elim step handler)
  const handleSpinAnimComplete = useCallback(() => {
    if (mode !== 'elimination') {
      // first_land — go straight to result
      if (turn === 'spin') setPhase('spin_result')
      else setPhase('reroll_prompt')
      return
    }
    // Elimination logic
    const landed = elimQueue[elimIndex]
    const isLast = elimIndex === elimQueue.length - 1
    if (isLast) {
      if (turn === 'spin') setPhase('spin_result')
      else setPhase('reroll_prompt')
    } else {
      const newElim = [...eliminated, landed]
      setEliminated(newElim)
      const remaining = uniqueGames.filter(g => !newElim.includes(g))
      if (remaining.length === 1) {
        // Last game standing — no need to spin again
        if (turn === 'spin') setPhase('spin_result')
        else setPhase('reroll_prompt')
        return
      }
      const next = elimIndex + 1
      setElimIndex(next)
      setCurrentAnimGames(remaining)
      setAnimTarget(elimQueue[next])
      setElimNextPhase('spinning')
      setPhase('elim_step')
    }
  }, [mode, turn, elimQueue, elimIndex, eliminated, uniqueGames])

  // ─── SPIN turn: Accept (free) ──────────────────────────────────────────────

  function handleAccept() {
    startTransition(async () => {
      const res = await acceptSpinResult(winner, mode, uniqueGames, spentThisTurn)
      if (res && 'error' in res) { setError(res.error as string); return }
      setFinalChosen(winner)
      setPhase('done')
    })
  }

  // ─── SPIN turn: Paid — Spin Again ─────────────────────────────────────────

  function handlePaySpinAgain() {
    setError('')
    spendTickets(TICKET_COSTS.spin)
    startTransition(async () => {
      const res = await paySpinAgain(uniqueGames)
      if ('error' in res) { setError(res.error ?? ''); return }
      const target = res.winner ?? ''
      setWinner(target)
      // Reuse elimination animation for paid spin too
      if (mode === 'first_land') {
        setCurrentAnimGames(uniqueGames)
        setAnimTarget(target)
        setPhase('spin_paid_spinning')
      } else {
        const nonWinners = shuffle(uniqueGames.filter(g => g !== target))
        const queue = [...nonWinners, target]
        setElimQueue(queue)
        setElimIndex(0)
        setEliminated([])
        setCurrentAnimGames(uniqueGames)
        setAnimTarget(queue[0])
        setPhase('spin_paid_spinning')
      }
    })
  }

  const handlePaidSpinAnimComplete = useCallback(() => {
    if (mode !== 'elimination') {
      setPhase('spin_result')
      return
    }
    const landed = elimQueue[elimIndex]
    const isLast = elimIndex === elimQueue.length - 1
    if (isLast) {
      setPhase('spin_result')
    } else {
      const newElim = [...eliminated, landed]
      setEliminated(newElim)
      const remaining = uniqueGames.filter(g => !newElim.includes(g))
      if (remaining.length === 1) {
        setPhase('spin_result')
        return
      }
      const next = elimIndex + 1
      setElimIndex(next)
      setCurrentAnimGames(remaining)
      setAnimTarget(elimQueue[next])
      setElimNextPhase('spin_paid_spinning')
      setPhase('elim_step')
    }
  }, [mode, elimQueue, elimIndex, eliminated, uniqueGames])

  // ─── SPIN / SPIN+REROLL: Paid — Spin & Reroll upgrade ────────────────────
  // existingGames: games already known before the upgrade starts
  // maxGames: max total options (3 from reroll_prompt, 4 from final_choice)

  function handlePayUpgradeToReroll(existingGames: string[], maxGames: number) {
    setError('')
    spendTickets(TICKET_COSTS.spin_reroll)
    startTransition(async () => {
      const res = await payUpgradeToSpinReroll(uniqueGames, existingGames)
      if ('error' in res) { setError(res.error ?? ''); return }
      const target = res.nextGame ?? ''
      const newUpgradeGames = [...existingGames, target]
      setUpgradeGames(newUpgradeGames)
      setUpgradeMaxGames(maxGames)
      const pool = uniqueGames.filter(g => !existingGames.includes(g))
      if (mode === 'first_land') {
        setCurrentAnimGames(pool.length > 0 ? pool : uniqueGames)
        setAnimTarget(target)
      } else {
        const animPool = pool.length > 0 ? pool : uniqueGames
        const nonWinners = shuffle(animPool.filter(g => g !== target))
        const queue = [...nonWinners, target]
        setElimQueue(queue)
        setElimIndex(0)
        setEliminated([])
        setCurrentAnimGames(animPool)
        setAnimTarget(queue[0])
      }
      setPhase('spin_upgrade_spinning')
    })
  }

  const handleUpgradeSpinAnimComplete = useCallback(() => {
    if (mode !== 'elimination') {
      setPhase('spin_upgrade_reroll_prompt')
      return
    }
    const landed = elimQueue[elimIndex]
    const isLast = elimIndex === elimQueue.length - 1
    if (isLast) {
      setPhase('spin_upgrade_reroll_prompt')
    } else {
      const newElim = [...eliminated, landed]
      setEliminated(newElim)
      const pool = uniqueGames.filter(g => !upgradeGames.includes(g) && !newElim.includes(g))
      const next = elimIndex + 1
      setElimIndex(next)
      setCurrentAnimGames(pool.length > 0 ? pool : uniqueGames)
      setAnimTarget(elimQueue[next])
      setElimNextPhase('spin_upgrade_spinning')
      setPhase('elim_step')
    }
  }, [mode, elimQueue, elimIndex, eliminated, uniqueGames, upgradeGames])

  function handleUpgradeKeepGame2() {
    // Skip game3 — go straight to final choice with game1 + game2
    setPhase('spin_upgrade_final_choice')
  }

  function handleUpgradeGetNextGame() {
    setError('')
    startTransition(async () => {
      const res = await pickNextUpgradeGame(uniqueGames, upgradeGames)
      if ('error' in res) { setError(res.error ?? ''); return }
      const target = res.nextGame ?? ''
      const newUpgradeGames = [...upgradeGames, target]
      setUpgradeGames(newUpgradeGames)
      const pool = uniqueGames.filter(g => !upgradeGames.includes(g))
      if (mode === 'first_land') {
        setCurrentAnimGames(pool.length > 0 ? pool : uniqueGames)
        setAnimTarget(target)
      } else {
        const animPool = pool.length > 0 ? pool : uniqueGames
        const nonWinners = shuffle(animPool.filter(g => g !== target))
        const queue = [...nonWinners, target]
        setElimQueue(queue)
        setElimIndex(0)
        setEliminated([])
        setCurrentAnimGames(animPool)
        setAnimTarget(queue[0])
      }
      setPhase('spin_upgrade_game3_spinning')
    })
  }

  const handleUpgradeGame3AnimComplete = useCallback(() => {
    const goToFinal = upgradeGames.length >= upgradeMaxGames
    if (mode !== 'elimination') {
      setPhase(goToFinal ? 'spin_upgrade_final_choice' : 'spin_upgrade_reroll_prompt')
      return
    }
    const landed = elimQueue[elimIndex]
    const isLast = elimIndex === elimQueue.length - 1
    if (isLast) {
      setPhase(goToFinal ? 'spin_upgrade_final_choice' : 'spin_upgrade_reroll_prompt')
    } else {
      const newElim = [...eliminated, landed]
      setEliminated(newElim)
      const pool = uniqueGames.filter(g => !upgradeGames.includes(g) && !newElim.includes(g))
      const next = elimIndex + 1
      setElimIndex(next)
      setCurrentAnimGames(pool.length > 0 ? pool : uniqueGames)
      setAnimTarget(elimQueue[next])
      setElimNextPhase('spin_upgrade_game3_spinning')
      setPhase('elim_step')
    }
  }, [mode, elimQueue, elimIndex, eliminated, uniqueGames, upgradeGames, upgradeMaxGames])

  function handleFinalUpgradeChoice(chosen: string) {
    startTransition(async () => {
      const res = await finalizeUpgradeChoice(chosen, upgradeGames, mode, uniqueGames, spentThisTurn)
      if (res && 'error' in res) { setError(res.error as string); return }
      setFinalChosen(chosen)
      setPhase('done')
    })
  }

  // ─── SPIN turn: Paid — Choose Any Game ────────────────────────────────────

  function handlePayChooseAny() {
    if (!chooseInput.trim()) return
    spendTickets(TICKET_COSTS.choose_game)
    startTransition(async () => {
      const res = await payChooseAnyGame(chooseInput.trim(), uniqueGames, spentThisTurn)
      if (res && 'error' in res) { setError(res.error as string); return }
      setFinalChosen(chooseInput.trim())
      setPhase('done')
    })
  }

  // ─── SPIN+REROLL turn ──────────────────────────────────────────────────────

  const handleRerollAnimComplete = useCallback(() => {
    setPhase('final_choice')
  }, [])

  function handleKeep() {
    startTransition(async () => {
      const res = await finalizeSpinReroll(winner, '', winner, mode, uniqueGames, spentThisTurn)
      if (res && 'error' in res) { setError(res.error as string); return }
      setFinalChosen(winner)
      setPhase('done')
    })
  }

  function handleReroll() {
    setError('')
    startTransition(async () => {
      const res = await performReroll(uniqueGames, winner)
      if ('error' in res) { setError(res.error ?? ''); return }
      const target = res.winner ?? ''
      setRerollWinner(target)
      setCurrentAnimGames(uniqueGames.filter(g => g !== winner))
      setAnimTarget(target)
      setPhase('reroll_spinning')
    })
  }

  function handleFinalChoice(chosen: string) {
    startTransition(async () => {
      const res = await finalizeSpinReroll(winner, rerollWinner, chosen, mode, uniqueGames, spentThisTurn)
      if (res && 'error' in res) { setError(res.error as string); return }
      setFinalChosen(chosen)
      setPhase('done')
    })
  }

  // ─── CHOOSE turn ──────────────────────────────────────────────────────────

  function handleChooseGame() {
    if (!chooseInput.trim()) return
    setError('')
    startTransition(async () => {
      const res = chooseSelectedRawg
        ? await chooseGameWithRawg({
            id: chooseSelectedRawg.id,
            name: chooseSelectedRawg.name,
            released: chooseSelectedRawg.released,
            background_image: chooseSelectedRawg.background_image,
          })
        : await chooseGame(chooseInput.trim())
      if (res && 'error' in res) { setError(res.error as string); return }
      setFinalChosen(chooseSelectedRawg?.name ?? chooseInput.trim())
      setPhase('done')
    })
  }

  function handleSkip() {
    setError('')
    startTransition(async () => {
      const res = await skipChooseTurn()
      if (res && 'error' in res) { setError(res.error as string); return }
      setPhase('done')
    })
  }

  // ─── Reset ────────────────────────────────────────────────────────────────

  function handleReset() {
    setPhase(turn === 'choose' ? 'choose_input' : 'setup')
    setRawGames('')
    setWinner('')
    setRerollWinner('')
    setUpgradeGames([])
    setFinalChosen('')
    setChooseInput('')
    setEliminated([])
    setError('')
    setSpentThisTurn(0)
    router.refresh()
  }

  // ─── Shared UI pieces ─────────────────────────────────────────────────────

  const turnBadge = (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
        turn === 'spin' ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300' :
        turn === 'spin_reroll' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
        'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
      }`}>
        {WHEEL_TURN_LABELS[turn]}
      </span>
      <div className="relative inline-flex items-center">
        <span className="text-xs text-fg-subtle">Balance: {localBalance} 🎟️</span>
        {ticketFlash && (
          <span
            key={ticketFlash.id}
            className="absolute -top-5 left-0 text-xs font-bold text-red-500 pointer-events-none animate-ticket-spend whitespace-nowrap"
          >
            −{ticketFlash.amount} 🎟️
          </span>
        )}
      </div>
    </div>
  )

  function elimBadges() {
    if (eliminated.length === 0) return null
    return (
      <div className="flex flex-wrap gap-1.5">
        {eliminated.map(g => (
          <span key={g} className="text-xs line-through text-fg-subtle bg-surface-active px-2 py-0.5 rounded-full">
            {g}
          </span>
        ))}
      </div>
    )
  }

  function handleShuffle() {
    const winner = elimQueue[elimQueue.length - 1]
    const toShuffle = elimQueue.slice(elimIndex, elimQueue.length - 1)
    const shuffledRemaining = shuffle(toShuffle)
    const newQueue = [...elimQueue.slice(0, elimIndex), ...shuffledRemaining, winner]
    setElimQueue(newQueue)
    setAnimTarget(newQueue[elimIndex])
    setCurrentAnimGames(shuffle([...currentAnimGames]))
  }

  function entriesPanel(onShuffle?: () => void) {
    return (
      <div className="rounded-xl border border-edge-base bg-surface-base p-4 space-y-3 w-52 shrink-0">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            Entries <span className="font-bold text-fg-base">{uniqueGames.length}</span>
          </p>
          {onShuffle && (
            <button
              onClick={onShuffle}
              className="text-xs font-medium text-brand-600 hover:text-brand-800 dark:hover:text-brand-400 transition-colors"
            >
              ⇄ Shuffle
            </button>
          )}
        </div>
        <ul className="space-y-1.5">
          {uniqueGames.map(g => (
            <li
              key={g}
              className={`text-sm truncate ${
                eliminated.includes(g)
                  ? 'line-through text-fg-subtle'
                  : 'text-fg-secondary'
              }`}
            >
              {g}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  // ─── Animation phases ─────────────────────────────────────────────────────

  const animPhaseMap: Partial<Record<Phase, () => void>> = {
    spinning: handleSpinAnimComplete,
    spin_paid_spinning: handlePaidSpinAnimComplete,
    spin_upgrade_spinning: handleUpgradeSpinAnimComplete,
    spin_upgrade_game3_spinning: handleUpgradeGame3AnimComplete,
    reroll_spinning: handleRerollAnimComplete,
  }

  if (
    phase === 'spinning' ||
    phase === 'spin_paid_spinning' ||
    phase === 'spin_upgrade_spinning' ||
    phase === 'spin_upgrade_game3_spinning' ||
    phase === 'reroll_spinning'
  ) {
    return (
      <div className="flex flex-col lg:flex-row lg:items-start gap-6">
        <WheelAnimation
          games={currentAnimGames.length > 0 ? currentAnimGames : uniqueGames}
          target={animTarget}
          onComplete={animPhaseMap[phase]!}
          accentColour={accentColour}
        />
        {entriesPanel()}
      </div>
    )
  }

  if (phase === 'elim_step') {
    const remaining = uniqueGames.length - eliminated.length
    return (
      <div className="flex flex-col lg:flex-row lg:items-start gap-6">
        <WheelStatic games={currentAnimGames} accentColour={accentColour} />
        <div className="flex flex-col gap-4 lg:flex-1">
          <div className="rounded-xl border border-edge-base bg-surface-base p-5 space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl shrink-0">❌</span>
              <div>
                <p className="text-xs text-fg-muted font-medium uppercase tracking-wider mb-0.5">Eliminated</p>
                <p className="text-lg font-bold text-fg-base">{elimQueue[elimIndex - 1]}</p>
              </div>
            </div>
            <p className="text-sm text-fg-muted">
              {remaining} game{remaining !== 1 ? 's' : ''} remaining
            </p>
            <button
              onClick={() => setPhase(elimNextPhase)}
              className="w-full py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors"
            >
              🎰 Spin again
            </button>
          </div>
          {entriesPanel(handleShuffle)}
        </div>
      </div>
    )
  }

  // ─── SPIN turn: result + options ──────────────────────────────────────────

  if (phase === 'spin_result') {
    return (
      <div className="space-y-4 max-w-2xl">
        {turnBadge}
        <div className="rounded-xl border border-edge-base bg-surface-base p-6 space-y-5">
          <div>
            <p className="text-xs text-fg-muted font-medium uppercase tracking-wider mb-1">You got</p>
            <p className="text-2xl font-bold text-fg-base">{winner}</p>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          {/* Accept */}
          <button
            onClick={handleAccept}
            disabled={isPending}
            className="w-full py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Saving…' : '✅ Accept this game'}
          </button>

          <p className="text-xs text-fg-subtle font-medium uppercase tracking-wide">
            or spend tickets to change it
          </p>

          <div className="grid grid-cols-1 gap-2">
            {/* Spin Again */}
            <button
              onClick={handlePaySpinAgain}
              disabled={isPending || localBalance < TICKET_COSTS.spin}
              className="flex items-center justify-between px-4 py-3 rounded-lg border border-edge-base hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors dark:hover:border-brand-700 dark:hover:bg-brand-900/30"
            >
              <div className="text-left">
                <p className="text-sm font-semibold text-fg-base">🎰 Spin Again</p>
                <p className="text-xs text-fg-muted">New spin — must play whatever it lands on</p>
              </div>
              <span className="text-xs font-bold text-brand-700 bg-brand-100 px-2 py-0.5 rounded-full shrink-0 ml-3 dark:bg-brand-900/40 dark:text-brand-300">
                −{TICKET_COSTS.spin} 🎟️
              </span>
            </button>

            {/* Spin & Reroll upgrade */}
            <button
              onClick={() => handlePayUpgradeToReroll([winner], 3)}
              disabled={isPending || localBalance < TICKET_COSTS.spin_reroll}
              className="flex items-center justify-between px-4 py-3 rounded-lg border border-edge-base hover:border-amber-300 hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors dark:hover:border-amber-700 dark:hover:bg-amber-900/30"
            >
              <div className="text-left">
                <p className="text-sm font-semibold text-fg-base">🔄 Spin &amp; Reroll</p>
                <p className="text-xs text-fg-muted">Spin twice more — choose from up to 3 games</p>
              </div>
              <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full shrink-0 ml-3 dark:bg-amber-900/40 dark:text-amber-300">
                −{TICKET_COSTS.spin_reroll} 🎟️
              </span>
            </button>

            {/* Choose any game */}
            <button
              onClick={() => { setChooseAnyReturnPhase('spin_result'); setPhase('spin_choose_any') }}
              disabled={isPending || localBalance < TICKET_COSTS.choose_game}
              className="flex items-center justify-between px-4 py-3 rounded-lg border border-edge-base hover:border-green-300 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors dark:hover:border-green-700 dark:hover:bg-green-900/30"
            >
              <div className="text-left">
                <p className="text-sm font-semibold text-fg-base">🎮 Choose a Game</p>
                <p className="text-xs text-fg-muted">Pick any game you want to play</p>
              </div>
              <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full shrink-0 ml-3 dark:bg-green-900/40 dark:text-green-300">
                −{TICKET_COSTS.choose_game} 🎟️
              </span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── SPIN turn: Choose any game (paid) ────────────────────────────────────

  if (phase === 'spin_choose_any') {
    return (
      <div className="space-y-4 max-w-2xl">
        {turnBadge}
        <div className="rounded-xl border border-edge-base bg-surface-base p-6 space-y-4">
          <div>
            <p className="text-base font-semibold text-fg-base">Choose your game</p>
            <p className="text-sm text-fg-muted mt-0.5">Costs {TICKET_COSTS.choose_game} 🎟️</p>
          </div>
          <input
            type="text"
            value={chooseInput}
            onChange={e => setChooseInput(e.target.value)}
            placeholder="Game title…"
            className="w-full border border-edge-input rounded-lg px-3 py-2 text-sm text-fg-base placeholder-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 bg-surface-input"
            onKeyDown={e => e.key === 'Enter' && handlePayChooseAny()}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => setPhase(chooseAnyReturnPhase)}
              disabled={isPending}
              className="px-4 py-2 text-sm text-fg-muted border border-edge-base rounded-lg hover:bg-surface-hover transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={handlePayChooseAny}
              disabled={!chooseInput.trim() || isPending}
              className="flex-1 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? 'Confirming…' : `Confirm (−${TICKET_COSTS.choose_game} 🎟️)`}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── SPIN turn: Upgrade — reroll prompt ───────────────────────────────────

  if (phase === 'spin_upgrade_reroll_prompt') {
    const latestGame = upgradeGames[upgradeGames.length - 1]
    const spinCount = upgradeGames.length
    const nextGameNum = spinCount + 1
    const canSpinMore = spinCount < upgradeMaxGames
    return (
      <div className="rounded-xl border border-edge-base bg-surface-base p-6 space-y-5 max-w-2xl">
        <div>
          <p className="text-xs text-fg-muted font-medium uppercase tracking-wider mb-1">Game {spinCount}</p>
          <p className="text-2xl font-bold text-fg-base">{latestGame}</p>
        </div>
        {canSpinMore && (
          <p className="text-sm text-fg-muted">
            Spin once more for game {nextGameNum}, or go straight to choosing?
          </p>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={handleUpgradeKeepGame2}
            disabled={isPending}
            className="flex-1 py-2.5 border border-edge-base text-fg-secondary text-sm font-semibold rounded-lg hover:bg-surface-hover disabled:opacity-50 transition-colors"
          >
            Choose now →
          </button>
          {canSpinMore && (
            <button
              onClick={handleUpgradeGetNextGame}
              disabled={isPending}
              className="flex-1 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Spinning…' : `🎲 Spin for game ${nextGameNum}`}
            </button>
          )}
        </div>
      </div>
    )
  }

  // ─── SPIN turn: Upgrade — final choice ───────────────────────────────────

  if (phase === 'spin_upgrade_final_choice') {
    const options = upgradeGames
    return (
      <div className="rounded-xl border border-edge-base bg-surface-base p-6 space-y-4 max-w-2xl">
        <div>
          <p className="text-base font-semibold text-fg-base">Choose your game</p>
          <p className="text-xs text-fg-muted mt-0.5">Pick one from your options</p>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="grid gap-3">
          {options.map((game, i) => (
            <button
              key={game}
              onClick={() => handleFinalUpgradeChoice(game)}
              disabled={isPending}
              className="flex items-center gap-3 p-4 rounded-xl border-2 border-edge-base hover:border-brand-400 hover:bg-brand-50 text-left transition-all disabled:opacity-50 dark:hover:border-brand-500 dark:hover:bg-brand-900/30"
            >
              <span className="text-xs font-bold text-fg-subtle w-6 shrink-0">#{i + 1}</span>
              <span className="text-sm font-semibold text-fg-base">🎮 {game}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ─── SPIN+REROLL turn phases ──────────────────────────────────────────────

  if (phase === 'reroll_prompt') {
    return (
      <div className="rounded-xl border border-edge-base bg-surface-base p-6 space-y-5 max-w-2xl">
        <div>
          <p className="text-xs text-fg-muted font-medium uppercase tracking-wider mb-1">You got</p>
          <p className="text-2xl font-bold text-fg-base">{winner}</p>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={handleKeep}
            disabled={isPending}
            className="flex-1 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Saving…' : '✅ Keep it'}
          </button>
          <button
            onClick={handleReroll}
            disabled={isPending}
            className="flex-1 py-2.5 border border-edge-base text-fg-secondary text-sm font-semibold rounded-lg hover:bg-surface-hover disabled:opacity-50 transition-colors"
          >
            🎲 Reroll
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'final_choice') {
    return (
      <div className="space-y-4 max-w-2xl">
        {turnBadge}
        <div className="rounded-xl border border-edge-base bg-surface-base p-6 space-y-5">
          <p className="text-base font-semibold text-fg-base">Choose your game</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            {[winner, rerollWinner].map(game => (
              <button
                key={game}
                onClick={() => handleFinalChoice(game)}
                disabled={isPending}
                className="p-5 rounded-xl border-2 border-edge-base hover:border-brand-400 hover:bg-brand-50 text-sm font-semibold text-fg-base transition-all text-center disabled:opacity-50 dark:hover:border-brand-500 dark:hover:bg-brand-900/30"
              >
                🎮 {game}
              </button>
            ))}
          </div>

          <p className="text-xs text-fg-subtle font-medium uppercase tracking-wide">
            or spend tickets to change it
          </p>

          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={handlePaySpinAgain}
              disabled={isPending || localBalance < TICKET_COSTS.spin}
              className="flex items-center justify-between px-4 py-3 rounded-lg border border-edge-base hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors dark:hover:border-brand-700 dark:hover:bg-brand-900/30"
            >
              <div className="text-left">
                <p className="text-sm font-semibold text-fg-base">🎰 Spin Again</p>
                <p className="text-xs text-fg-muted">New spin — must play whatever it lands on</p>
              </div>
              <span className="text-xs font-bold text-brand-700 bg-brand-100 px-2 py-0.5 rounded-full shrink-0 ml-3 dark:bg-brand-900/40 dark:text-brand-300">
                −{TICKET_COSTS.spin} 🎟️
              </span>
            </button>

            <button
              onClick={() => handlePayUpgradeToReroll([winner, rerollWinner], 4)}
              disabled={isPending || localBalance < TICKET_COSTS.spin_reroll}
              className="flex items-center justify-between px-4 py-3 rounded-lg border border-edge-base hover:border-amber-300 hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors dark:hover:border-amber-700 dark:hover:bg-amber-900/30"
            >
              <div className="text-left">
                <p className="text-sm font-semibold text-fg-base">🔄 Spin &amp; Reroll</p>
                <p className="text-xs text-fg-muted">Spin twice more — choose from up to 4 games</p>
              </div>
              <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full shrink-0 ml-3 dark:bg-amber-900/40 dark:text-amber-300">
                −{TICKET_COSTS.spin_reroll} 🎟️
              </span>
            </button>

            <button
              onClick={() => { setChooseAnyReturnPhase('final_choice'); setPhase('spin_choose_any') }}
              disabled={isPending || localBalance < TICKET_COSTS.choose_game}
              className="flex items-center justify-between px-4 py-3 rounded-lg border border-edge-base hover:border-green-300 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors dark:hover:border-green-700 dark:hover:bg-green-900/30"
            >
              <div className="text-left">
                <p className="text-sm font-semibold text-fg-base">🎮 Choose a Game</p>
                <p className="text-xs text-fg-muted">Pick any game you want to play</p>
              </div>
              <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full shrink-0 ml-3 dark:bg-green-900/40 dark:text-green-300">
                −{TICKET_COSTS.choose_game} 🎟️
              </span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── CHOOSE turn ──────────────────────────────────────────────────────────

  if (phase === 'choose_input') {
    return (
      <div className="space-y-5 max-w-2xl">
        {turnBadge}
        <div className="rounded-xl border border-edge-base bg-surface-base p-6 space-y-4">
          <div>
            <p className="text-base font-semibold text-fg-base">Choose your next game</p>
            <p className="text-sm text-fg-muted mt-0.5">Pick any game you want to play</p>
          </div>
          <div className="relative">
            <input
              type="text"
              value={chooseInput}
              onChange={e => setChooseInput(e.target.value)}
              placeholder="Search RAWG or type any title…"
              className="w-full border border-edge-input rounded-lg px-3 py-2 text-sm text-fg-base placeholder-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 bg-surface-input"
              onKeyDown={e => e.key === 'Enter' && handleChooseGame()}
            />
            {chooseSearchResults.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-surface-base border border-edge-base rounded-lg shadow-lg">
                {chooseSearchResults.map(result => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => {
                      setChooseInput(result.name)
                      setChooseSelectedRawg(result)
                      setChooseSearchResults([])
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-surface-hover transition-colors border-b border-edge-subtle last:border-b-0"
                  >
                    {result.background_image ? (
                      <img
                        src={result.background_image}
                        alt=""
                        className="w-10 h-10 rounded object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-surface-sunken flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-fg-base truncate">{result.name}</p>
                      {result.released && (
                        <p className="text-xs text-fg-muted">{result.released.slice(0, 4)}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {chooseSearching && (
            <p className="text-xs text-fg-muted">Searching RAWG…</p>
          )}
          {chooseSelectedRawg && (
            <p className="text-xs text-blue-700 dark:text-blue-300">
              ✓ {chooseSelectedRawg.name} will be added to your library as Playing
            </p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            onClick={handleChooseGame}
            disabled={!chooseInput.trim() || isPending}
            className="w-full py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? 'Confirming…' : 'Confirm'}
          </button>
          <div className="relative flex items-center gap-3">
            <div className="flex-1 border-t border-edge-subtle" />
            <span className="text-xs text-fg-subtle">or</span>
            <div className="flex-1 border-t border-edge-subtle" />
          </div>
          <button
            onClick={handleSkip}
            disabled={isPending}
            className="w-full py-2 text-sm text-fg-muted hover:text-fg-base border border-edge-base rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            {isPending ? 'Skipping…' : `Skip (+${TICKET_AWARDS.turn_skipped} 🎟️)`}
          </button>
        </div>
      </div>
    )
  }

  // ─── Done ─────────────────────────────────────────────────────────────────

  if (phase === 'done') {
    const isSkipped = !finalChosen
    return (
      <div className="rounded-xl border border-edge-base bg-surface-base p-6 space-y-4 max-w-2xl">
        {isSkipped ? (
          <div className="flex items-center gap-3">
            <span className="text-3xl shrink-0">⏭️</span>
            <div>
              <p className="text-lg font-bold text-fg-base">Turn skipped</p>
              <p className="text-sm text-fg-muted">+{TICKET_AWARDS.turn_skipped} tickets awarded</p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <span className="text-3xl shrink-0">🎮</span>
            <div>
              <p className="text-xs text-fg-muted font-medium uppercase tracking-wider mb-0.5">You got</p>
              <p className="text-2xl font-bold text-fg-base">{finalChosen}</p>
              <p className="text-sm text-fg-subtle mt-1">Good luck!</p>
            </div>
          </div>
        )}
        <button
          onClick={handleReset}
          className="px-5 py-2 bg-surface-active text-fg-secondary text-sm font-medium rounded-lg hover:bg-zinc-200 transition-colors dark:hover:bg-zinc-600"
        >
          Back to wheel
        </button>
      </div>
    )
  }

  // ─── Setup ────────────────────────────────────────────────────────────────

  const gameCount = uniqueGames.length
  const countOk = gameCount >= WHEEL_MIN_GAMES

  function addFromBacklog(title: string) {
    setRawGames(prev => {
      const lines = prev.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      if (lines.map(l => l.toLowerCase()).includes(title.toLowerCase())) return prev
      return lines.length > 0 ? prev.trimEnd() + '\n' + title : title
    })
  }

  return (
    <div className="space-y-5">
      {turnBadge}
      <div className={`grid gap-4 items-stretch ${backlogGames.length > 0 ? 'grid-cols-1 md:grid-cols-2' : ''}`}>

        {/* Main card: textarea + mode + spin */}
        <div className="rounded-xl border border-edge-base bg-surface-base p-6 space-y-5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-fg-secondary">Games (one per line)</label>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                countOk ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
              }`}>
                {gameCount} / {WHEEL_MIN_GAMES}+
              </span>
            </div>
            {duplicateCount > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {duplicateCount} duplicate{duplicateCount > 1 ? 's' : ''} removed — {uniqueGames.length} unique game{uniqueGames.length !== 1 ? 's' : ''} will be used
              </p>
            )}
            <textarea
              value={rawGames}
              onChange={e => setRawGames(e.target.value)}
              placeholder={`Enter at least ${WHEEL_MIN_GAMES} games, one per line…`}
              rows={5}
              className="w-full border border-edge-input rounded-lg px-3 py-2.5 text-sm text-fg-base placeholder-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none bg-surface-input"
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-fg-secondary">Spin mode</p>
            <div className="grid grid-cols-2 gap-3">
              {([
                {
                  value: 'elimination' as const,
                  label: 'Elimination',
                  desc: 'Keep spinning — each landed game is removed until one remains.',
                },
                {
                  value: 'first_land' as const,
                  label: 'First Land',
                  desc: 'Single spin — whatever it lands on first is your game.',
                },
              ]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMode(opt.value)}
                  className={`p-3 rounded-lg border-2 text-left transition-colors ${
                    mode === opt.value
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30 dark:border-brand-500'
                      : 'border-edge-base hover:border-edge-input'
                  }`}
                >
                  <p className={`text-sm font-semibold ${mode === opt.value ? 'text-brand-700 dark:text-brand-300' : 'text-fg-secondary'}`}>
                    {opt.label}
                  </p>
                  <p className="text-xs text-fg-muted mt-0.5 leading-snug">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            onClick={handleSpin}
            disabled={!canSpin || isPending}
            className="w-full py-3 bg-brand-600 text-white text-sm font-bold rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? 'Spinning…' : '🎰 Spin!'}
          </button>
        </div>

        {/* Backlog panel */}
        {backlogGames.length > 0 && (
          <div className="rounded-xl border border-edge-base bg-surface-base p-4 flex flex-col gap-3 h-80">
            <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Your Backlog</p>
            <div className="flex flex-col divide-y divide-edge-subtle overflow-y-auto flex-1 min-h-0 pr-3">
              {backlogGames.map(title => {
                const alreadyAdded = uniqueGames.map(g => g.toLowerCase()).includes(title.toLowerCase())
                return (
                  <div key={title} className="flex items-center justify-between gap-2 py-2">
                    <span className="text-sm text-fg-base truncate">{title}</span>
                    <button
                      type="button"
                      onClick={() => addFromBacklog(title)}
                      disabled={alreadyAdded}
                      className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-md transition-colors ${
                        alreadyAdded
                          ? 'text-fg-subtle bg-surface-active cursor-default'
                          : 'text-brand-600 bg-brand-50 hover:bg-brand-100 dark:bg-brand-900/30 dark:text-brand-300 dark:hover:bg-brand-900/50'
                      }`}
                    >
                      {alreadyAdded ? '✓' : '+'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
