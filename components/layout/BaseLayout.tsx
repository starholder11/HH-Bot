interface BaseLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function BaseLayout({ children, className = '' }: BaseLayoutProps) {
  return (
    <div className={`min-h-screen bg-wp-base font-inter text-wp-contrast leading-relaxed ${className}`}>
      {children}
    </div>
  );
} 