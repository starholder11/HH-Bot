import React from 'react';
import Link from 'next/link';
import { Search } from '@/components/search/Search';

export function Header() {
  return (
    <header className="bg-white w-full py-6 border-b border-gray-100">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6">
        {/* Logo and title */}
        <div className="flex items-center space-x-4">
          <Link href="/" className="inline-block">
            <img
              src="/logo.png"
              alt="Starholder Logo"
              className="w-12 h-12 rounded-full shadow-md object-cover hover:shadow-lg transition-shadow duration-200"
              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.10)' }}
            />
          </Link>
          <Link
            href="/"
            className="font-serif text-3xl font-bold tracking-tight text-black no-underline hover:text-black hover:no-underline active:text-black active:no-underline visited:text-black visited:no-underline focus:text-black focus:no-underline"
            style={{ fontFamily: 'Cardo, serif', textDecoration: 'none' }}
          >
            Starholder
          </Link>
        </div>

        {/* Spacer to push search to the right */}
        <div className="flex-1" />

        {/* Right-aligned search */}
        <div className="flex items-center justify-end pr-2 min-w-[400px]">
          <Search variant="compact" maxResults={5} />
        </div>
      </div>
    </header>
  );
}
