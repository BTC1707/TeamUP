'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useId, useState, type InputHTMLAttributes } from 'react';

type AuthPasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string;
};

/** Password input with a show/hide toggle for auth forms. */
export default function AuthPasswordField({
  label,
  id,
  className,
  ...inputProps
}: AuthPasswordFieldProps) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <label htmlFor={inputId}>
      {label}
      <span className='auth-password-field'>
        <input
          {...inputProps}
          id={inputId}
          type={visible ? 'text' : 'password'}
          className={className}
        />
        <button
          type='button'
          className='auth-password-toggle'
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff size={18} aria-hidden='true' /> : <Eye size={18} aria-hidden='true' />}
        </button>
      </span>
    </label>
  );
}
