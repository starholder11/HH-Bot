'use client';

import { usePathname } from 'next/navigation';
import { Header } from './Header';

// Routes that should not show the header (iframe-ready routes)
const IFRAME_ROUTES = ['/video-editor', '/audio-editor'];

export function ConditionalHeader() {
  const pathname = usePathname();

  // Don't show header for iframe routes
  if (pathname && IFRAME_ROUTES.includes(pathname)) {
    return null;
  }

  return <Header />;
}
