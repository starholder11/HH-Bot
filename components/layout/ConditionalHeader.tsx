'use client';

import { usePathname } from 'next/navigation';
import { Header } from './Header';

// Routes that should not show the header (iframe-ready routes)
const IFRAME_ROUTES = ['/video-editor', '/audio-editor', '/L7'];

// Routes that should use the original header styling
const ORIGINAL_HEADER_ROUTES = ['/timeline', '/keystatic'];

export function ConditionalHeader() {
  const pathname = usePathname();

  // Don't show header for iframe routes
  if (pathname && IFRAME_ROUTES.includes(pathname)) {
    return null;
  }

  // Check if current path should use original styling
  const useOriginalHeader = Boolean(pathname && ORIGINAL_HEADER_ROUTES.some(route => 
    pathname.startsWith(route)
  ));

  return <Header useOriginalStyling={useOriginalHeader} />;
}
