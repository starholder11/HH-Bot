interface ButtonProps {
  children: React.ReactNode;
  variant?: 'default' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
  href?: string;
}

export function Button({ 
  children, 
  variant = 'default', 
  size = 'md', 
  className = '',
  onClick,
  href
}: ButtonProps) {
  const baseClasses = 'font-inter font-medium inline-flex items-center justify-center rounded-wp transition-colors focus:outline-none focus:ring-2 focus:ring-wp-contrast/20';
  const variantClasses = {
    default: 'bg-wp-contrast text-wp-base-2 hover:bg-wp-contrast-2',
    outline: 'border border-wp-contrast text-wp-contrast hover:bg-wp-contrast hover:text-wp-base-2',
  };
  const sizeClasses = {
    sm: 'px-3 py-2 text-wp-small',
    md: 'px-4 py-2.5 text-wp-medium',
    lg: 'px-6 py-3 text-wp-medium',
  };
  const allClasses = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;
  if (href) {
    return (
      <a href={href} className={allClasses}>
        {children}
      </a>
    );
  }
  return (
    <button onClick={onClick} className={allClasses}>
      {children}
    </button>
  );
} 