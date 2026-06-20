import * as React from "react";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

const DialogContext = React.createContext<{ onOpenChange: (open: boolean) => void }>({ onOpenChange: () => {} });

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  // ESC key to close
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <DialogContext.Provider value={{ onOpenChange }}>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div className="fixed inset-0 bg-ink/20" onClick={() => onOpenChange(false)} />
        <div className="relative z-50 w-full sm:max-w-[680px] bg-canvas rounded-t-[12px] sm:rounded-[12px] border border-hairline shadow-lg mx-0 sm:mx-4 mb-0 sm:mb-0 max-h-[90vh] sm:max-h-[90vh] max-sm:max-h-[95vh] overflow-y-auto">
          {/* Close button */}
          <button
            className="absolute top-3 right-3 z-10 inline-flex items-center justify-center w-8 h-8 rounded-[8px] text-ink-muted hover:text-ink hover:bg-surface-card transition-colors"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X size={18} />
          </button>
          {children}
        </div>
      </div>
    </DialogContext.Provider>
  );
}

export function DialogContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`p-4 sm:p-6 ${className || ""}`}>{children}</div>;
}

export function DialogHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 sm:mb-4">{children}</div>;
}

export function DialogTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[16px] sm:text-[18px] font-medium text-ink-strong leading-snug pr-9">{children}</h2>;
}
