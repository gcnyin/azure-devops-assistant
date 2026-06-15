interface StatsRowProps {
  total: number;
  open: number;
  done: number;
}

export function StatsRow({ total, open, done }: StatsRowProps) {
  return (
    <div className="flex gap-6 max-sm:w-full max-sm:justify-between">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-medium tabular-nums text-ink">{total}</span>
        <span className="text-[13px] text-ink-mute">Total</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-medium tabular-nums text-accent-yellow">{open}</span>
        <span className="text-[13px] text-ink-mute">Open</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-medium tabular-nums text-primary">{done}</span>
        <span className="text-[13px] text-ink-mute">Done</span>
      </div>
    </div>
  );
}
