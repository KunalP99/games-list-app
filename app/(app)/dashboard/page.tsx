import { createClient } from '@/lib/supabase/server'
import NewDashboard from '@/components/dashboard/new/NewDashboard'

export default async function DashboardPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return <NewDashboard userId={user!.id} />
}
