import * as React from "react";

interface AccordionContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const AccordionContext = React.createContext<AccordionContextValue | null>(null);

function useAccordion() {
  const ctx = React.useContext(AccordionContext);
  if (!ctx) throw new Error("AccordionItem must be used within Accordion");
  return ctx;
}

interface AccordionProps {
  type: "single";
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}

export function Accordion({ value, onValueChange, children }: AccordionProps) {
  return (
    <AccordionContext.Provider value={{ value, onValueChange }}>
      <div className="flex flex-col gap-3">{children}</div>
    </AccordionContext.Provider>
  );
}

interface AccordionItemProps {
  value: string;
  children: React.ReactNode;
}

export function AccordionItem({ value, children }: AccordionItemProps) {
  const ctx = useAccordion();
  const isOpen = ctx.value === value;

  return (
    <div
      className={`border rounded-xl overflow-hidden transition-colors ${
        isOpen ? "border-hairline-soft bg-canvas-card" : "border-hairline bg-canvas-soft hover:border-hairline-soft"
      }`}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<any>, { isOpen, value });
        }
        return child;
      })}
    </div>
  );
}

interface AccordionTriggerProps {
  children: React.ReactNode;
  isOpen?: boolean;
  value?: string;
}

export function AccordionTrigger({ children, isOpen, value }: AccordionTriggerProps) {
  const ctx = useAccordion();
  const open = isOpen ?? false;
  const itemValue = value ?? "";

  return (
    <button
      type="button"
      className="flex items-center justify-between w-full px-5 py-3.5 text-left text-sm font-medium text-ink-strong hover:text-ink cursor-pointer transition-colors"
      onClick={() => ctx.onValueChange(open ? "" : itemValue)}
    >
      <span>{children}</span>
      <svg
        className={`w-4 h-4 text-ink-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}

interface AccordionContentProps {
  children: React.ReactNode;
  isOpen?: boolean;
}

export function AccordionContent({ children, isOpen }: AccordionContentProps) {
  const open = isOpen ?? false;

  return (
    <div
      className={`overflow-hidden transition-all duration-200 ${
        open ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
      }`}
    >
      <div className="px-5 pb-5">{children}</div>
    </div>
  );
}
