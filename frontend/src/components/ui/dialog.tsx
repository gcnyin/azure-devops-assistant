import * as React from "react";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

const DialogContext = React.createContext<{ onOpenChange: (open: boolean) => void }>({ onOpenChange: () => {} });

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  if (!open) return null;

  return (
    <DialogContext.Provider value={{ onOpenChange }}>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div className="fixed inset-0 bg-ink/20" onClick={() => onOpenChange(false)} />
        <div className="relative z-50 w-full sm:max-w-[680px] bg-canvas rounded-[12px] border border-hairline shadow-lg mx-4 mb-4 sm:mb-0 max-h-[90vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </DialogContext.Provider>
  );
}

export function DialogContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`p-6 ${className || ""}`}>{children}</div>;
}

export function DialogHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-4">{children}</div>;
}

export function DialogTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[18px] font-medium text-ink-strong leading-snug">{children}</h2>;
}
