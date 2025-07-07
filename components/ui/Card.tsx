interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-wp-base-2 rounded-wp border border-wp-contrast-3/20 p-6 shadow-wp-subtle ${className}`}>
      {children}
    </div>
  );
} 