import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-[8px] font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 text-[14px] leading-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-active",
        secondary: "bg-surface-card text-ink border border-hairline hover:bg-surface-cream-strong",
        ghost: "text-ink-muted hover:text-ink hover:bg-surface-card",
        outline: "border border-hairline bg-canvas text-ink-muted hover:text-ink hover:bg-surface-card",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        default: "h-10 px-5 py-3",
        sm: "h-8 px-3 py-1.5 text-[13px]",
        lg: "h-11 px-6 py-3 text-[16px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button className={buttonVariants({ variant, size, className })} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
