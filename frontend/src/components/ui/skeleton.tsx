export function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-card rounded-[8px] ${className || ""}`} />;
}
