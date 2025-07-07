interface HeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function Header({ children, className = '' }: HeaderProps) {
  return (
    <header className={`bg-wp-base-2 border-b border-wp-contrast-3/20 ${className}`}>
      <div className="max-w-wide mx-auto px-6 py-4">
        {children}
      </div>
    </header>
  );
} 