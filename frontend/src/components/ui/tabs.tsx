import * as React from "react";

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabs() {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error("Tabs components must be used within <Tabs>");
  return ctx;
}

interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function Tabs({ value, onValueChange, children, className }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`inline-flex items-center gap-1 bg-surface-card rounded-[8px] p-1 ${className || ""}`}>
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) {
  const ctx = useTabs();
  const isActive = ctx.value === value;

  return (
    <button
      type="button"
      className={`px-3.5 py-1.5 rounded-[6px] text-[14px] font-medium transition-colors ${
        isActive
          ? "bg-canvas text-ink shadow-sm"
          : "text-ink-muted hover:text-ink"
      } ${className || ""}`}
      onClick={() => ctx.onValueChange(value)}
    >
      {children}
    </button>
  );
}
