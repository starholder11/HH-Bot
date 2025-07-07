interface ContentContainerProps {
  children: React.ReactNode;
  wide?: boolean;
  className?: string;
}

export function ContentContainer({ children, wide = false, className = '' }: ContentContainerProps) {
  const maxWidth = wide ? 'max-w-wide' : 'max-w-content';
  return (
    <div className={`${maxWidth} mx-auto px-6 ${className}`}>
      {children}
    </div>
  );
} 