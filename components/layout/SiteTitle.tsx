interface SiteTitleProps {
  children: React.ReactNode;
  as?: 'h1' | 'h2' | 'h3' | 'div';
  className?: string;
}

export function SiteTitle({ children, as: Component = 'h1', className = '' }: SiteTitleProps) {
  return (
    <Component className={`font-cardo font-semibold text-wp-contrast text-wp-xl sm:text-wp-2xl ${className}`}>
      {children}
    </Component>
  );
} 