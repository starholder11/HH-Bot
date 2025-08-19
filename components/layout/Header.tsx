import React from 'react';
import Link from 'next/link';
import { Search } from '@/components/search/Search';

interface HeaderProps {
  useOriginalStyling?: boolean;
}

export function Header({ useOriginalStyling = false }: HeaderProps) {
  if (useOriginalStyling) {
    // Original styling for /timeline and /keystatic routes
    return (
      <header className="bg-white w-full py-6 border-b border-gray-100">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6">
          {/* Logo and title */}
          <div className="flex items-center space-x-4">
            <Link href="/" className="inline-block">
              <img
                src="/logo.png"
                alt="TEMPLATE Logo"
                className="w-12 h-12 rounded-full shadow-md object-cover hover:shadow-lg transition-shadow duration-200"
                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.10)' }}
              />
            </Link>
                          <Link
                href="/"
                className="font-serif text-3xl font-bold tracking-tight text-black no-underline hover:text-black hover:no-underline active:text-black active:no-underline visited:text-black visited:no-underline focus:text-black focus:no-underline"
                style={{ fontFamily: 'Cardo, serif', textDecoration: 'none' }}
              >
                TEMPLATE
              </Link>
          </div>

          {/* Site Navigation */}
          <nav className="flex items-center gap-6">
            <Link href="/library" className="text-lg text-black hover:text-gray-600 transition-colors">
              Library
            </Link>
            <Link href="/workshop" className="text-lg text-black hover:text-gray-600 transition-colors">
              Workshop
            </Link>
          </nav>

          {/* Right-aligned search */}
          <div className="flex items-center justify-end pr-2 min-w-[400px]">
            <Search variant="compact" maxResults={5} />
          </div>
        </div>
      </header>
    );
  }

  // New black styling for all other routes
  return (
    <header className="bg-black w-full py-6 border-b border-neutral-800">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6">
        {/* Logo and title */}
        <div className="flex items-center space-x-4">
          <Link href="/" className="inline-block">
            <img
              src="/logo.png"
              alt="TEMPLATE Logo"
              className="w-8 h-8 rounded-full shadow-md object-cover hover:shadow-lg transition-shadow duration-200"
            />
          </Link>
          <Link
            href="/"
            className="font-serif text-3xl font-bold tracking-tight text-white no-underline hover:text-white hover:no-underline active:text-white active:no-underline visited:text-white visited:no-underline focus:text-white focus:no-underline"
            style={{ fontFamily: 'Cardo, serif', textDecoration: 'none' }}
          >
            TEMPLATE
          </Link>
        </div>

        {/* Site Navigation */}
        <nav className="flex items-center gap-6">
          <Link href="/library" className="text-lg text-white hover:text-neutral-300 transition-colors">
            Library
          </Link>
          <Link href="/workshop" className="text-lg text-white hover:text-neutral-300 transition-colors">
            Workshop
          </Link>
        </nav>
      </div>
    </header>
  );
}
