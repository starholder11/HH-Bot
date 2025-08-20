import React from 'react';
import Link from 'next/link';

export function Footer() {
  return (
    <div className="mt-5 pb-8 flex justify-center">
      <Link href="/" className="inline-block">
        <img
          src="/logo.png"
          alt="Starholder Logo"
          className="w-16 h-16 rounded-full shadow-md object-cover hover:shadow-lg transition-shadow duration-200"
          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.10)' }}
        />
      </Link>
    </div>
  );
}
