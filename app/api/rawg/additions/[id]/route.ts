import { getRawgAdditions } from '@/lib/rawg'
import { NextResponse } from 'next/server'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const data = await getRawgAdditions(Number(params.id))
  return NextResponse.json(data)
}
