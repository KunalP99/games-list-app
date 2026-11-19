import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function DELETE() {
  (await cookies()).delete('achievement_unlocks')
  return NextResponse.json({ ok: true })
}
