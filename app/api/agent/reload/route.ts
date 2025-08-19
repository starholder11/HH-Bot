import { NextResponse } from 'next/server';
import { clearConfigCaches } from '@/services/config/RemoteConfig';

export async function POST() {
  try {
    clearConfigCaches();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'failed' }, { status: 500 });
  }
}


