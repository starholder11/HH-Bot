import React from 'react';
import { Search } from '@/components/search/Search';

// Force redeploy: header and search results styling
export function Header() {
  return (
    <header className="bg-white w-full py-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6">
        <div className="flex items-center space-x-4">
          <img
            src="/logo.png"
            alt="Starholder Logo"
            className="w-12 h-12 rounded-full shadow-md object-cover"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.10)' }}
          />
          <span className="font-serif text-3xl font-bold tracking-tight" style={{ fontFamily: 'Cardo, serif' }}>
            Starholder
          </span>
        </div>
        <div className="relative w-80 ml-8">
          <Search variant="compact" maxResults={5} />
        </div>
      </div>
    </header>
  );
} 