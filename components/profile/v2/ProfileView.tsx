'use client'

import { Fragment, useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { saveProfile } from '@/app/(app)/users/[username]/actions'
import {
  MAX_BIO_LENGTH,
  PROFILE_CARDS,
  addCard,
  gridEntries,
  isProfileCardId,
  moveCard,
  removeCard,
  sameLayout,
  setShelfGames,
  setSize,
  sizeForSpace,
  splitSize,
  type CardSize,
  type LayoutItem,
  type ProfileCardData,
  type ProfileCardId,
  type ProfileLayout,
} from '@/lib/profile-cards'
import ProfileCard, { type ProfileFigures } from './ProfileCard'
import CardBody from './CardBody'
import AddCardDialog from './AddCardDialog'
import ShelfPicker from './ShelfPicker'

// The top of the profile page (public edition): the profile card, then the
// cards in a four-column grid (the games list follows, ProfileGames). The owner can switch to editing: drag cards about
// (mouse, touch or keyboard), add one in any empty space, resize or remove
// one, and edit the bio. Nothing is saved until Done.

/** Grid columns a card or space takes: four on wider screens, two on phones. */
const SPAN: Record<CardSize, string> = {
  full: 'col-span-2 sm:col-span-4',
  half: 'col-span-2',
  small: 'col-span-1 aspect-square',
}
const SIZE_LABEL: Record<CardSize, string> = { full: 'Full', half: 'Half', small: 'Square' }

// Cards stay where they are while dragging; the layout itself is reordered
// as the pointer passes over another card, so the grid makes room for real
// (cards here aren't all one size, which sliding transforms assume).
const stayPut = () => null

type Props = {
  name: string
  username: string
  initials: string
  accent: string
  xp: number
  figures: ProfileFigures | null
  layout: ProfileLayout
  bio: string | null
  data: ProfileCardData
  isOwner: boolean
  friendButton?: React.ReactNode
}

export default function ProfileView(props: Props) {
  const { accent, data, isOwner } = props
  const [saved, setSaved] = useState({ layout: props.layout, bio: props.bio })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ProfileLayout>(props.layout)
  const [draftBio, setDraftBio] = useState(props.bio ?? '')
  const [adding, setAdding] = useState<{ at: number; size: CardSize } | null>(null)
  // Empty spaces the owner has split (full → halves → squares), by key. Only
  // for the layout they were split on: any change to the cards starts afresh.
  const [splits, setSplits] = useState<{ on: ProfileLayout; keys: ReadonlySet<string> }>({ on: [], keys: new Set() })
  const [dragging, setDragging] = useState<ProfileCardId | null>(null)
  const [choosingShelf, setChoosingShelf] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, startSaving] = useTransition()

  const layout = editing ? draft : saved.layout
  const dirty = editing && (!sameLayout(draft, saved.layout) || draftBio.trim() !== (saved.bio ?? ''))

  // Leaving mid-edit with changes asks first, like any unsaved form.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function startEditing() {
    setDraft(saved.layout)
    setDraftBio(saved.bio ?? '')
    setError(null)
    setEditing(true)
  }

  function cancel() {
    setEditing(false)
    setAdding(null)
    setError(null)
  }

  function done() {
    setError(null)
    startSaving(async () => {
      const result = await saveProfile({ layout: draft, bio: draftBio })
      if (!result.success) {
        setError(result.error)
        return
      }
      setSaved(result.data)
      setEditing(false)
    })
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragStart = (e: DragStartEvent) => {
    if (isProfileCardId(e.active.id)) setDragging(e.active.id)
  }
  const onDragOver = (e: DragOverEvent) => {
    const from = e.active.id
    const to = e.over?.id
    if (!isProfileCardId(from) || !isProfileCardId(to) || from === to) return
    setDraft(current => moveCard(current, from, to))
  }
  const onDragEnd = (_: DragEndEvent) => setDragging(null)

  const closeAdding = useCallback(() => setAdding(null), [])
  const entries = useMemo(() => gridEntries(layout), [layout])
  const splitKeys = splits.on === draft ? splits.keys : new Set<string>()
  const split = (key: string) => setSplits({ on: draft, keys: new Set([...splitKeys, key]) })

  function renderSpace(at: number, size: CardSize, key: string): React.ReactNode {
    const smaller = splitSize(size)
    if (smaller && splitKeys.has(key)) {
      return (
        <Fragment key={key}>
          {renderSpace(at, smaller, `${key}.0`)}
          {renderSpace(at, smaller, `${key}.1`)}
        </Fragment>
      )
    }
    const label = size === 'half' ? 'Half-size space' : size === 'small' ? 'Square space' : null
    return (
      <div key={key} data-space={size} className={`relative ${SPAN[size]} ${size === 'full' ? 'min-h-[96px]' : size === 'half' ? 'min-h-[150px]' : ''}`}>
        <button
          type="button"
          onClick={() => setAdding({ at, size })}
          aria-label={label ? `Add a card (${label.toLowerCase()})` : 'Add a card'}
          className="flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-edge-input p-2 text-center text-fg-secondary transition-colors hover:border-fg-muted hover:bg-surface-hover"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-edge-base bg-surface-base text-xl" aria-hidden>+</span>
          <span className="text-sm font-semibold">Add a card</span>
          {label && <span className="text-xs text-fg-muted">{label}</span>}
        </button>
        {smaller && (
          <button
            type="button"
            onClick={() => split(key)}
            className="absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-lg border border-edge-base bg-surface-base px-2.5 py-1 text-xs font-semibold text-fg-secondary shadow-sm hover:text-fg-base"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16" />
            </svg>
            {smaller === 'half' ? 'Split into halves' : 'Split into squares'}
          </button>
        )}
      </div>
    )
  }
  const draggingItem = dragging ? layout.find(item => item.card === dragging) : undefined

  const bio = editing ? (
    <label className="block">
      <span className="sr-only">Bio</span>
      <textarea
        value={draftBio}
        onChange={e => setDraftBio(e.target.value.slice(0, MAX_BIO_LENGTH))}
        maxLength={MAX_BIO_LENGTH}
        rows={2}
        placeholder="A line or two about you"
        className="w-full max-w-xl resize-none rounded-xl border border-dashed border-white/60 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/70"
      />
      <span className="mt-0.5 block text-[11px] text-white/70 tabular-nums">{draftBio.length} / {MAX_BIO_LENGTH}</span>
    </label>
  ) : saved.bio ? (
    <p className="max-w-xl text-sm leading-relaxed text-white/90 break-words">{saved.bio}</p>
  ) : null

  const action = isOwner
    ? !editing && (
      <button
        type="button"
        onClick={startEditing}
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold shadow-sm hover:bg-white/90"
        style={{ color: accent }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        Edit profile
      </button>
    )
    : props.friendButton

  return (
    <div className="space-y-5">
      <ProfileCard
        name={props.name}
        username={props.username}
        initials={props.initials}
        accent={accent}
        xp={props.xp}
        bio={bio}
        figures={props.figures}
        action={action || undefined}
      />

      {editing ? (
        <div
          role="toolbar"
          aria-label="Editing your profile"
          className="sticky top-16 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-zinc-900 px-4 py-3 text-white shadow-lg dark:bg-zinc-800"
        >
          <p className="text-sm font-semibold">Editing your profile</p>
          <p className="hidden text-xs text-zinc-400 md:block">Drag a card to move it. Click an empty space to add one.</p>
          <span className="flex-1" />
          <button
            type="button"
            title="The shop is coming soon"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/10 px-3.5 text-sm hover:bg-white/15"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 9h18l-1.5 11h-15Z" /><path d="M8 9V7a4 4 0 0 1 8 0v2" /></svg>
            Shop
          </button>
          <button type="button" onClick={cancel} disabled={saving} className="h-10 rounded-xl px-3.5 text-sm text-zinc-300 hover:text-white">
            Cancel
          </button>
          <button
            type="button"
            onClick={done}
            disabled={saving}
            className="h-10 rounded-xl px-5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: accent }}
          >
            {saving ? 'Saving…' : 'Done'}
          </button>
          {error && <p role="alert" className="basis-full text-sm text-red-300">{error}</p>}
        </div>
      ) : null}

      {!editing && layout.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-edge-base px-6 py-10 text-center text-sm text-fg-muted">
          {isOwner ? 'Your profile has no cards. Edit profile to add some.' : 'Nothing to show here yet.'}
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragging(null)}
        >
          <SortableContext items={layout.map(item => item.card)} strategy={stayPut}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {entries.map((entry, i) => entry.kind === 'card' ? (
                <SortableCard
                  key={entry.item.card}
                  item={entry.item}
                  editing={editing}
                  data={data}
                  accent={accent}
                  onRemove={() => setDraft(d => removeCard(d, entry.item.card))}
                  onResize={size => setDraft(d => setSize(d, entry.item.card, size))}
                  onChooseGames={entry.item.card === 'shelf' ? () => setChoosingShelf(true) : undefined}
                />
              ) : editing ? (
                renderSpace(entry.at, entry.size, `space-${i}`)
              ) : null)}
            </div>
          </SortableContext>
          <DragOverlay>
            {draggingItem && (
              <div className="rotate-[-1.5deg] cursor-grabbing rounded-2xl shadow-2xl shadow-black/30">
                <CardBody card={draggingItem.card} size={draggingItem.size} data={data} accent={accent} chosen={draggingItem.games} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {choosingShelf && (
        <ShelfPicker
          games={data.shelf ?? []}
          initial={draft.find(item => item.card === 'shelf')?.games ?? []}
          onClose={() => setChoosingShelf(false)}
          onDone={games => {
            setDraft(d => setShelfGames(d, games))
            setChoosingShelf(false)
          }}
        />
      )}

      {adding && (
        <AddCardDialog
          space={adding.size}
          used={new Set(draft.map(item => item.card))}
          onClose={closeAdding}
          onAdd={card => {
            setDraft(d => addCard(d, adding.at, card, sizeForSpace(card, adding.size)))
            setAdding(null)
          }}
        />
      )}
    </div>
  )
}

function SortableCard({
  item, editing, data, accent, onRemove, onResize, onChooseGames,
}: {
  item: LayoutItem
  editing: boolean
  data: ProfileCardData
  accent: string
  onRemove: () => void
  onResize: (size: CardSize) => void
  /** The Game shelf only: opens the picker for its games. */
  onChooseGames?: () => void
}) {
  const card = PROFILE_CARDS[item.card]
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useSortable({ id: item.card, disabled: !editing })
  return (
    <div ref={setNodeRef} data-card={item.card} className={`relative ${SPAN[item.size]}`}>
      {/* While editing, a square's bottom line is where its controls go. */}
      <div className={`h-full ${isDragging ? 'invisible' : ''} ${editing && item.size === 'small' ? '[&_[data-note]]:invisible' : ''}`}>
        <CardBody card={item.card} size={item.size} data={data} accent={accent} chosen={item.games} />
      </div>
      {isDragging && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-2xl border-2 border-dashed text-sm font-semibold"
          style={{ borderColor: accent, color: accent, backgroundColor: `${accent}14` }}
        >
          Drop here
        </div>
      )}
      {editing && !isDragging && (() => {
        const square = item.size === 'small'
        const handle = (
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Move ${card.name}`}
            className={`cursor-grab touch-none rounded-full border border-edge-base bg-surface-base px-3 py-0.5 text-xs tracking-[3px] text-fg-muted shadow-sm hover:text-fg-base ${
              square ? '' : 'absolute left-1/2 top-2 -translate-x-1/2'
            }`}
          >
            ⋮⋮⋮
          </button>
        )
        const controls = (
          <div className={`flex gap-1.5 ${square ? '' : 'absolute right-3 top-3'}`}>
            {onChooseGames && (
              <button
                type="button"
                onClick={onChooseGames}
                className="h-8 rounded-lg border border-edge-base bg-surface-base px-3 text-xs font-semibold text-fg-secondary shadow-sm hover:text-fg-base"
              >
                Choose games
              </button>
            )}
            {card.sizes.length > 1 && (
              <div role="group" aria-label={`${card.name} size`} className="flex rounded-lg border border-edge-base bg-surface-base p-0.5 text-xs font-semibold shadow-sm">
                {card.sizes.map(size => (
                  <button
                    key={size}
                    type="button"
                    aria-pressed={item.size === size}
                    onClick={() => onResize(size)}
                    className={`rounded-md py-1 ${square ? 'px-1.5' : 'px-2'} ${item.size === size ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'text-fg-muted hover:text-fg-base'}`}
                  >
                    {SIZE_LABEL[size]}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${card.name}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-edge-base bg-surface-base text-sm text-fg-secondary shadow-sm hover:text-fg-base"
            >
              ✕
            </button>
          </div>
        )
        // A square has no room up top beside its title: everything goes in
        // one row along the bottom instead.
        return square ? (
          <div className="absolute inset-x-2.5 bottom-2.5 flex flex-wrap items-center justify-between gap-1.5">
            {handle}
            {controls}
          </div>
        ) : (
          <>
            {handle}
            {controls}
          </>
        )
      })()}
    </div>
  )
}
