interface ErrorBannerProps {
  message: string;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
  if (!message) return null;

  return (
    <div className="flex items-center gap-3 p-3 mb-6 rounded-lg text-sm bg-accent-tomato/10 border border-accent-tomato/30 text-accent-tomato">
      <span className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full bg-accent-tomato text-white font-bold text-[13px] shrink-0">
        !
      </span>
      <span>{message}</span>
    </div>
  );
}
