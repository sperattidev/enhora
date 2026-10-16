export function Brand({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold tracking-tight ${className}`}>
      <img src="/icon.svg" alt="" className="size-8" />
      <span>
        En<span className="text-brand-700">Hora</span>
      </span>
    </span>
  );
}
