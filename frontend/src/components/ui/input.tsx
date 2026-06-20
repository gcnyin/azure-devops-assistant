import * as React from "react";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={`flex h-9 w-full rounded-[8px] border border-hairline bg-canvas px-3 py-2 text-[14px] text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50 ${className || ""}`}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
