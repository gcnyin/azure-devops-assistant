export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 px-4 py-3 bg-error/5 border border-error/20 rounded-[8px] text-[14px] text-error">
      {message}
    </div>
  );
}
