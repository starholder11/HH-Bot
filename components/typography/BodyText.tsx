interface BodyTextProps {
  children: React.ReactNode;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export function BodyText({ children, size = 'medium', className = '' }: BodyTextProps) {
  const sizeClasses = {
    small: 'text-wp-small',
    medium: 'text-wp-medium',
    large: 'text-wp-large',
  };
  return (
    <div className={`font-inter text-wp-contrast ${sizeClasses[size]} leading-relaxed ${className}`}>
      {children}
    </div>
  );
} 