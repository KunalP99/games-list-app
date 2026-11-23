'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
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
  setSize,
  sizeForSpace,
  type CardSize,
  type LayoutItem,
  type ProfileCardData,
  type ProfileCardId,
  type ProfileLayout,
} from '@/lib/profile-cards'
import ProfileCard, { type ProfileFigures } from './ProfileCard'
import ProfileTabs from './ProfileTabs'
import CardBody from './CardBody'
import AddCardDialog from './AddCardDialog'

// The profile page's Overview (public edition): the profile card, then the
// cards in two columns. The owner can switch to editing: drag cards about
// (mouse, touch or keyboard), add one in any empty space, resize or remove
// one, and edit the bio. Nothing is saved until Done.

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
  gameCount: number | null
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
  const [dragging, setDragging] = useState<ProfileCardId | null>(null)
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
      ) : (
        <ProfileTabs username={props.username} active="overview" gameCount={props.gameCount} />
      )}

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
            <div className="grid gap-4 sm:grid-cols-2">
              {entries.map(entry => entry.kind === 'card' ? (
                <SortableCard
                  key={entry.item.card}
                  item={entry.item}
                  editing={editing}
                  data={data}
                  accent={accent}
                  onRemove={() => setDraft(d => removeCard(d, entry.item.card))}
                  onResize={size => setDraft(d => setSize(d, entry.item.card, size))}
                />
              ) : editing ? (
                <button
                  key={`space-${entry.size}-${entry.at}`}
                  type="button"
                  onClick={() => setAdding({ at: entry.at, size: entry.size })}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-edge-input text-fg-secondary transition-colors hover:border-fg-muted hover:bg-surface-hover ${
                    entry.size === 'full' ? 'min-h-[96px] sm:col-span-2' : 'min-h-[150px]'
                  }`}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-edge-base bg-surface-base text-xl" aria-hidden>+</span>
                  <span className="text-sm font-semibold">Add a card</span>
                  {entry.size === 'half' && <span className="text-xs text-fg-muted">Half-size space</span>}
                </button>
              ) : null)}
            </div>
          </SortableContext>
          <DragOverlay>
            {draggingItem && (
              <div className="rotate-[-1.5deg] cursor-grabbing rounded-2xl shadow-2xl shadow-black/30">
                <CardBody card={draggingItem.card} size={draggingItem.size} data={data} accent={accent} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
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
  item, editing, data, accent, onRemove, onResize,
}: {
  item: LayoutItem
  editing: boolean
  data: ProfileCardData
  accent: string
  onRemove: () => void
  onResize: (size: CardSize) => void
}) {
  const card = PROFILE_CARDS[item.card]
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useSortable({ id: item.card, disabled: !editing })
  const span = item.size === 'full' ? 'sm:col-span-2' : ''

  return (
    <div ref={setNodeRef} data-card={item.card} className={`relative ${span}`}>
      <div className={isDragging ? 'invisible' : ''}>
        <CardBody card={item.card} size={item.size} data={data} accent={accent} />
      </div>
      {isDragging && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-2xl border-2 border-dashed text-sm font-semibold"
          style={{ borderColor: accent, color: accent, backgroundColor: `${accent}14` }}
        >
          Drop here
        </div>
      )}
      {editing && !isDragging && (
        <>
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Move ${card.name}`}
            className="absolute left-1/2 top-2 -translate-x-1/2 cursor-grab touch-none rounded-full border border-edge-base bg-surface-base px-3 py-0.5 text-xs tracking-[3px] text-fg-muted shadow-sm hover:text-fg-base"
          >
            ⋮⋮⋮
          </button>
          <div className="absolute right-3 top-3 flex gap-1.5">
            {card.sizes.length > 1 && (
              <div role="group" aria-label={`${card.name} size`} className="flex rounded-lg border border-edge-base bg-surface-base p-0.5 text-xs font-semibold shadow-sm">
                {card.sizes.map(size => (
                  <button
                    key={size}
                    type="button"
                    aria-pressed={item.size === size}
                    onClick={() => onResize(size)}
                    className={`rounded-md px-2 py-1 ${item.size === size ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'text-fg-muted hover:text-fg-base'}`}
                  >
                    {size === 'full' ? 'Full' : 'Half'}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${card.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge-base bg-surface-base text-sm text-fg-secondary shadow-sm hover:text-fg-base"
            >
              ✕
            </button>
          </div>
        </>
      )}
    </div>
  )
}
