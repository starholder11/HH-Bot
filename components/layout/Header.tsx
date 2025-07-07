import Image from 'next/image';

interface HeaderProps {
  children?: React.ReactNode;
  className?: string;
}

export function Header({ children, className = '' }: HeaderProps) {
  return (
    <header className={`bg-white text-black border-b border-gray-200 ${className}`}>
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <img
            src="/logo.png"
            alt="Starholder Logo"
            className="w-8 h-8"
          />
          <span className="text-xl font-semibold">Starholder</span>
        </div>
        <div className="flex items-center space-x-6">
          <a href="/" className="hover:text-gray-600 transition-colors">Home</a>
          <a href="/timeline" className="hover:text-gray-600 transition-colors">Timeline</a>
          <a href="/search" className="hover:text-gray-600 transition-colors">Search</a>
          <a href="/chat" className="hover:text-gray-600 transition-colors">Chat</a>
        </div>
      </div>
    </header>
  );
} 