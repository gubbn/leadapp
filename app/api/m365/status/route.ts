import { NextResponse } from 'next/server'
import { getM365ConfigStatus } from '@/lib/m365Graph'

export async function GET() {
  return NextResponse.json(getM365ConfigStatus())
}
