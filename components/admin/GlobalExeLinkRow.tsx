'use client'

import { useState } from 'react'
import AddGlobalExeLinkForm from './AddGlobalExeLinkForm'
import { removeGlobalExeLink } from '@/app/(app)/admin/exe-links/actions'

type Props = {
  exeName: string
  title: string
  igdbId: number
  coverImageUrl: string | null
}

export default function GlobalExeLinkRow({ exeName, title, igdbId, coverImageUrl }: Props) {
  const [editing, setEditing] = useState(false)
  // Optimistic — addGlobalExeLink already saved this server-side; updating
  // here just means this row shows it immediately instead of waiting on a
  // full page reload to re-fetch.
  const [current, setCurrent] = useState({ title, igdbId, coverImageUrl })

  if (editing) {
    return (
      <div className="px-4 py-3">
        <AddGlobalExeLinkForm
          exeName={exeName}
          currentTitle={current.title}
          onCancel={() => setEditing(false)}
          onSaved={picked => {
            setCurrent({ title: picked.title, igdbId: picked.igdbId, coverImageUrl: picked.coverImageUrl })
            setEditing(false)
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {current.coverImageUrl && (
        <img src={current.coverImageUrl} alt="" className="w-8 h-11 rounded object-cover shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-fg-base truncate">
          <code className="text-fg-muted">{exeName}</code> → <span className="font-medium">{current.title}</span>
        </p>
        <p className="text-xs text-fg-subtle">IGDB id: {current.igdbId}</p>
      </div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs text-brand-600 hover:underline shrink-0"
      >
        Edit
      </button>
      <form action={removeGlobalExeLink.bind(null, exeName)}>
        <button type="submit" className="text-xs text-red-500 hover:underline shrink-0">Remove</button>
      </form>
    </div>
  )
}
