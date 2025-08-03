interface HeadingProps {
  children: React.ReactNode;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  className?: string;
}

export function Heading({ children, level, className = '' }: HeadingProps) {
  const Component = `h${level}` as keyof React.JSX.IntrinsicElements;
  const sizeClasses = {
    1: 'text-wp-2xl font-normal',
    2: 'text-wp-xl font-normal',
    3: 'text-wp-large font-normal',
    4: 'text-wp-medium font-medium',
    5: 'text-wp-medium font-medium',
    6: 'text-wp-small font-medium',
  };
  return (
    <Component className={`font-cardo text-wp-contrast leading-tight ${sizeClasses[level]} ${className}`}>
      {children}
    </Component>
  );
} 