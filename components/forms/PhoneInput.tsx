'use client';

import { useCallback } from 'react';
import { PHONE_MASK, PHONE_PLACEHOLDER } from '@/lib/phone';

interface PhoneInputProps {
  name: string;
  className?: string;
  placeholder?: string;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  required?: boolean;
}

export function PhoneInput({
  name,
  className,
  placeholder = PHONE_PLACEHOLDER,
  id,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  required,
}: PhoneInputProps) {
  const formatValue = useCallback((value: string, blur = false) => {
    const def = PHONE_MASK.replace(/\D/g, '');
    let digits = value.replace(/\D/g, '');
    if (def.length >= digits.length) digits = def;

    let i = 0;
    const formatted = PHONE_MASK.replace(/./g, (char) => {
      if (/[_\d]/.test(char) && i < digits.length) return digits.charAt(i++);
      return i >= digits.length ? '' : char;
    });

    if (blur && formatted.length === 2) return '';
    return formatted;
  }, []);

  return (
    <input
      type='tel'
      id={id}
      name={name}
      className={className}
      placeholder={placeholder}
      inputMode='tel'
      autoComplete='tel'
      aria-label='Номер телефону'
      aria-invalid={ariaInvalid || undefined}
      aria-describedby={ariaDescribedBy}
      required={required}
      onInput={(e) => {
        e.currentTarget.value = formatValue(e.currentTarget.value);
      }}
      onFocus={(e) => {
        e.currentTarget.value = formatValue(e.currentTarget.value);
      }}
      onBlur={(e) => {
        e.currentTarget.value = formatValue(e.currentTarget.value, true);
      }}
    />
  );
}
