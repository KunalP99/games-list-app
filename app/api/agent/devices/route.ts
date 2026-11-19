import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateDevice } from '@/lib/agent-auth'

export const dynamic = 'force-dynamic'

/**
 * Manage the paired PCs for the device-token-authenticated caller itself.
 *
 * The website's own Devices section (`app/(app)/settings/actions.ts`) does
 * the same thing through Server Actions, which need a browser session —
 * something the desktop app never has (it only ever holds a device token).
 * This is the agent-reachable equivalent, same `device_tokens` table, same
 * rules, just bearer-authenticated instead of cookie-authenticated.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const sb = createAdminClient()
  const identity = await authenticateDevice(sb as any, request.headers.get('authorization'))
  if (!identity) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await (sb.from('device_tokens') as any)
    .select('id, label, last_seen_at, created_at')
    .eq('user_id', identity.userId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    devices: (data ?? []).map((d: any) => ({
      id: d.id,
      label: d.label,
      lastSeenAt: d.last_seen_at,
      createdAt: d.created_at,
      isThisDevice: d.id === identity.deviceId,
    })),
  })
}

/**
 * Used to issue a new device token from an existing one (the desktop app's
 * "Add device", for pairing a *different* PC). Retired: a stolen token could
 * use it to mint more, and revoking the stolen device left those working. A PC
 * is now only ever paired by signing in (the app's Connect button →
 * /settings/devices/pair). The desktop app shows this message until its next
 * release removes the button.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const sb = createAdminClient()
  const identity = await authenticateDevice(sb as any, request.headers.get('authorization'))
  if (!identity) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(
    { error: 'To add a PC, open the app on that PC and click Connect.' },
    { status: 410 },
  )
}
