import React, { useState, useEffect, forwardRef } from 'react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  debounce?: number;
  onFocus?: () => void;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ value, onChange, placeholder, className, debounce = 300, onFocus }, ref) => {
    const [inputValue, setInputValue] = useState(value);

    useEffect(() => {
      setInputValue(value);
    }, [value]);

    useEffect(() => {
      const handler = setTimeout(() => {
        if (inputValue !== value) {
          onChange(inputValue);
        }
      }, debounce);
      return () => clearTimeout(handler);
    }, [inputValue, value, onChange, debounce]);

    return (
      <input
        type="text"
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        placeholder={placeholder}
        className={className}
        aria-label={placeholder || 'Search'}
        autoComplete="off"
        ref={ref}
        onFocus={onFocus}
      />
    );
  }
);

SearchInput.displayName = 'SearchInput'; 