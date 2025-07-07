import Image from 'next/image';

interface HeaderProps {
  children?: React.ReactNode;
  className?: string;
}

export function Header({ children, className = '' }: HeaderProps) {
  return (
    <header className={`bg-wp-base-2 border-b border-wp-contrast-3/20 ${className}`}>
      <div className="max-w-wide mx-auto px-6 py-4 flex items-center">
        <img
          src="/logo.png"
          alt="Starholder Logo"
          className="w-10 h-10 rounded-full mr-4 border border-wp-contrast-3/30 bg-wp-base"
        />
        <div>
          {children}
        </div>
      </div>
    </header>
  );
} 