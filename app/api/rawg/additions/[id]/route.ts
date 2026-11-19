import { getRawgAdditions } from '@/lib/rawg'
import { NextResponse } from 'next/server'

export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const data = await getRawgAdditions(Number(params.id))
  return NextResponse.json(data)
}
