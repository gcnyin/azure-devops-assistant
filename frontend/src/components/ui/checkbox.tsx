import * as React from "react";

interface CheckboxProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function Checkbox({ checked, onCheckedChange, className, onClick }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      onClick={onClick}
      className={`h-4 w-4 rounded-[4px] border-hairline text-primary focus:ring-primary/15 cursor-pointer ${className || ""}`}
    />
  );
}
