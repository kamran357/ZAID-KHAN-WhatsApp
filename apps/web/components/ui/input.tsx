'use client';

import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/cn';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  trailing?: ReactNode;
}

export function Input({ label, hint, error, trailing, className, id, ...props }: FieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="block text-xs font-semibold text-navy">
        {label}
      </label>
      <div className="relative">
        <input
          id={fieldId}
          className={cn('glass-input', trailing && 'pr-12', className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint ? `${fieldId}-hint` : undefined}
          {...props}
        />
        {trailing ? (
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2">{trailing}</span>
        ) : null}
      </div>
      {error ? (
        <p className="text-xs font-medium text-red-500">{error}</p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function PasswordInput({ label, hint, error, ...props }: FieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      {...props}
      label={label}
      hint={hint}
      error={error}
      type={visible ? 'text' : 'password'}
      autoComplete="off"
      trailing={
        <button
          type="button"
          className="icon-btn h-8 w-8"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? 'Hide value' : 'Show value'}
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      }
    />
  );
}

const COUNTRIES = [
  { code: 'PK', dial: '+92', flag: '🇵🇰' },
  { code: 'IN', dial: '+91', flag: '🇮🇳' },
  { code: 'AE', dial: '+971', flag: '🇦🇪' },
  { code: 'SA', dial: '+966', flag: '🇸🇦' },
  { code: 'GB', dial: '+44', flag: '🇬🇧' },
  { code: 'US', dial: '+1', flag: '🇺🇸' },
] as const;

export function PhoneInput({ label, hint }: { label: string; hint?: string }) {
  const id = useId();
  const [country, setCountry] = useState<(typeof COUNTRIES)[number]>(COUNTRIES[0]);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold text-navy">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <select
          className="glass-input w-[104px] cursor-pointer appearance-none text-center"
          aria-label="Country dialing code"
          value={country.code}
          onChange={(event) => {
            const next = COUNTRIES.find((entry) => entry.code === event.target.value);
            if (next) setCountry(next);
          }}
        >
          {COUNTRIES.map((entry) => (
            <option key={entry.code} value={entry.code}>
              {entry.flag} {entry.dial}
            </option>
          ))}
        </select>
        <input id={id} className="glass-input flex-1" inputMode="tel" placeholder="300 1234567" />
      </div>
      {hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}
