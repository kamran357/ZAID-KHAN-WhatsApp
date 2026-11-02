import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-55',
  {
    variants: {
      variant: {
        navy: 'bg-navy text-white shadow-[0_14px_28px_-16px_rgba(11,20,55,0.95)] hover:bg-navy-soft',
        blue: 'bg-brand text-white shadow-[0_14px_28px_-16px_rgba(59,142,240,0.95)] hover:bg-brand-dark',
        mint: 'bg-mint text-[#06301f] hover:bg-mint-dark',
        white: 'border border-white bg-white/85 text-ink hover:bg-white',
        outline: 'border border-navy/15 text-navy hover:border-navy/30 hover:bg-white/70',
        ghost: 'text-ink-muted hover:bg-white/70 hover:text-ink',
        danger: 'bg-red-500 text-white hover:bg-red-600',
      },
      size: {
        sm: 'h-9 px-4 text-xs',
        md: 'h-11 px-5',
        lg: 'h-12 px-6',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'navy', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
