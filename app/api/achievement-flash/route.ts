import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function DELETE() {
  cookies().delete('achievement_unlocks')
  return NextResponse.json({ ok: true })
}
