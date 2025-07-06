import React, { useState, useEffect } from 'react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  debounce?: number;
}

export function SearchInput({ value, onChange, placeholder, className, debounce = 300 }: SearchInputProps) {
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
    />
  );
} 