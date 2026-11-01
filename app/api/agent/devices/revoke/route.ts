import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateDevice } from '@/lib/agent-auth'

export const dynamic = 'force-dynamic'

/**
 * Revoke a paired PC. Scoped to the caller's own user id, same as the
 * website's `revokeDevice` Server Action — including revoking the device
 * making this very request, which is a legitimate "unpair this PC" case:
 * the delete still goes through, and the agent's next poll simply gets 401
 * and reports "Device was revoked", which it already handles.
 */
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
  if (typeof body?.deviceId !== 'string' || !body.deviceId) {
    return NextResponse.json({ error: 'deviceId is required' }, { status: 400 })
  }

  const { error } = await (sb.from('device_tokens') as any)
    .delete()
    .eq('id', body.deviceId)
    .eq('user_id', identity.userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
