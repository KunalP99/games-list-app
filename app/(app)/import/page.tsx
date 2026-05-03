import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ImportClient from '@/components/import/ImportClient'

export default async function ImportPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-fg-base">Import from Spreadsheet</h1>
        <p className="text-sm text-fg-muted mt-0.5">
          Paste your Google Sheets CSV export below — completed games and backlog separately.
        </p>
      </div>
      <ImportClient />
    </div>
  )
}
