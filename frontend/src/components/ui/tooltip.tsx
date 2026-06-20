import * as React from "react";

interface TooltipProviderProps { children: React.ReactNode; }

export function TooltipProvider({ children }: TooltipProviderProps) {
  return <>{children}</>;
}

interface TooltipProps { children: React.ReactNode; }

export function Tooltip({ children }: TooltipProps) {
  return <>{children}</>;
}

export function TooltipTrigger({ children }: { children: React.ReactNode; asChild?: boolean }) {
  return <>{children}</>;
}

export function TooltipContent({ children }: { children: React.ReactNode; className?: string }) {
  return <>{children}</>;
}
