export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="flex items-center gap-3 p-3 mb-6 rounded-lg text-sm bg-error/10 border border-error/30 text-error">
      <span className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full bg-error text-white font-bold text-[13px] shrink-0">!</span>
      <span>{message}</span>
    </div>
  );
}
