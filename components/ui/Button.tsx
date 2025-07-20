interface ButtonProps {
  children: React.ReactNode;
  variant?: 'default' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}

export function Button({
  children,
  variant = 'default',
  size = 'md',
  className = '',
  onClick,
  href,
  disabled = false
}: ButtonProps) {
  const baseClasses = 'font-inter font-medium inline-flex items-center justify-center rounded-wp transition-colors focus:outline-none focus:ring-2 focus:ring-wp-contrast/20';
  const variantClasses = {
    default: disabled
      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
      : 'bg-wp-contrast text-wp-base-2 hover:bg-wp-contrast-2',
    outline: disabled
      ? 'border border-gray-300 text-gray-400 cursor-not-allowed'
      : 'border border-wp-contrast text-wp-contrast hover:bg-wp-contrast hover:text-wp-base-2',
  };
  const sizeClasses = {
    sm: 'px-3 py-2 text-wp-small',
    md: 'px-4 py-2.5 text-wp-medium',
    lg: 'px-6 py-3 text-wp-medium',
  };
  const allClasses = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

  if (href && !disabled) {
    return (
      <a href={href} className={allClasses}>
        {children}
      </a>
    );
  }

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={allClasses}
    >
      {children}
    </button>
  );
}
