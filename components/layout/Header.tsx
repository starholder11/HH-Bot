import React from 'react';

export function Header() {
  return (
    <header className="bg-white w-full py-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6">
        {/* Logo and Title */}
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
        {/* Search and Menu */}
        <div className="flex items-center space-x-4">
          <form className="flex items-center bg-gray-100 rounded-full px-2 py-1 w-56 focus-within:ring-2 focus-within:ring-black">
            <input
              type="text"
              placeholder="Search..."
              className="bg-transparent outline-none px-3 py-1 flex-1 text-base font-sans"
              style={{ fontFamily: 'Inter, sans-serif' }}
            />
            <button type="submit" className="bg-black text-white rounded-full w-8 h-8 flex items-center justify-center ml-2">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
          </form>
          <div className="relative">
            <button className="flex items-center px-4 py-2 rounded-full bg-white border border-gray-200 text-base font-sans" style={{ fontFamily: 'Inter, sans-serif' }}>
              Menu
              <svg className="ml-2" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            {/* Dropdown can be implemented later */}
          </div>
        </div>
      </div>
    </header>
  );
} 