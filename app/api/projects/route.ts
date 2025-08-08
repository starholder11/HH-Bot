import { NextRequest, NextResponse } from 'next/server'
import { listProjects } from '@/lib/project-storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  try {
    const projects = await listProjects()
    return NextResponse.json({ projects })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to list projects' }, { status: 500 })
  }
}


