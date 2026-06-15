import type * as React from "react";
import { cn } from "@/lib/utils";

const Badge = ({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "secondary" | "destructive" | "outline";
}) => {
  const variantClasses = {
    default: "bg-primary text-primary-foreground",
    secondary: "bg-canvas-card text-ink",
    destructive: "bg-destructive text-destructive-foreground",
    outline: "border border-hairline text-ink",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium transition-colors",
        variantClasses[variant || "default"],
        className,
      )}
      {...props}
    />
  );
};

export { Badge };
