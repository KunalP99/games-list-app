import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateDevice, generateDeviceToken, hashToken } from '@/lib/agent-auth'

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

/** Issue a new device token — for pairing a *different* PC while sitting at this one. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const sb = createAdminClient()
  const identity = await authenticateDevice(sb as any, request.headers.get('authorization'))
  if (!identity) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const label = typeof body?.label === 'string' ? body.label.trim() : ''
  if (!label) return NextResponse.json({ error: 'Give the device a name' }, { status: 400 })
  if (label.length > 60) return NextResponse.json({ error: 'That name is too long' }, { status: 400 })

  const token = generateDeviceToken()
  const { error } = await (sb.from('device_tokens') as any).insert({
    user_id: identity.userId,
    token_hash: hashToken(token),
    label,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // The only time the plaintext token is ever returned — only its hash is
  // stored, so it cannot be shown again after this response.
  return NextResponse.json({ token })
}
