import { twMerge } from 'tailwind-merge';
import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import type { Tone } from './format';

/** Joins class names; later classes win over conflicting earlier ones, so `className` can override defaults. */
function cx(...classes: (string | false | null | undefined)[]): string {
  return twMerge(classes.filter(Boolean).join(' '));
}

const BUTTON_VARIANTS = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 disabled:bg-brand-700/50',
  secondary: 'bg-white text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-slate-700 hover:bg-slate-100',
  danger: 'bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50',
  /** For dark surfaces such as the courier offer card. */
  dark: 'bg-slate-800 text-white ring-1 ring-slate-700 hover:bg-slate-700',
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof BUTTON_VARIANTS;
  loading?: boolean;
  block?: boolean;
}

export function Button({ variant = 'primary', loading, block, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed',
        BUTTON_VARIANTS[variant],
        block && 'w-full',
        className,
      )}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode;
}

/** Label, control, hint and error wired together for screen readers. */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-sm text-slate-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

const CONTROL =
  'min-h-11 w-full rounded-xl border-0 bg-white px-3 text-base text-slate-900 ring-1 ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-600 focus:outline-none aria-[invalid=true]:ring-red-500';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} {...rest} className={cx(CONTROL, className)} />;
});

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} className={cx(CONTROL, 'pr-8', className)} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={2} {...rest} className={cx(CONTROL, 'py-2.5', className)} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cx('rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6', className)}>
      {children}
    </section>
  );
}

const BADGE_TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  info: 'bg-sky-100 text-sky-800',
  progress: 'bg-brand-100 text-brand-800',
  success: 'bg-emerald-100 text-emerald-800',
  danger: 'bg-red-100 text-red-800',
  warning: 'bg-amber-100 text-amber-900',
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', BADGE_TONES[tone])}
    >
      {children}
    </span>
  );
}

const ALERT_TONES = {
  info: 'bg-sky-50 text-sky-900 ring-sky-200',
  warning: 'bg-amber-50 text-amber-900 ring-amber-200',
  danger: 'bg-red-50 text-red-900 ring-red-200',
  success: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
} as const;

export function Alert({ tone = 'info', children }: { tone?: keyof typeof ALERT_TONES; children: ReactNode }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx('rounded-xl p-3 text-sm ring-1', ALERT_TONES[tone])}
    >
      {children}
    </div>
  );
}

export function PageTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {action}
    </div>
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-brand-700" role="status" aria-label="Cargando">
      <Spinner className="size-8" />
    </div>
  );
}
