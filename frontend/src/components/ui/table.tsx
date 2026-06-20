import * as React from "react";

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return <table className={`w-full text-left text-[14px] ${className || ""}`}>{children}</table>;
}

export function TableHeader({ children }: { children: React.ReactNode }) {
  return <thead className="bg-surface-card">{children}</thead>;
}

export function TableHead({ children, className, style, onClick }: {
  children: React.ReactNode; className?: string; style?: React.CSSProperties; onClick?: (event: unknown) => void;
}) {
  return (
    <th
      className={`px-4 py-2.5 text-xs font-medium text-ink-muted uppercase tracking-wider ${className || ""}`}
      style={style}
      onClick={onClick}
    >
      {children}
    </th>
  );
}

export function TableBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TableRow({ children, className, onClick }: {
  children: React.ReactNode; className?: string; onClick?: () => void;
}) {
  return (
    <tr
      className={`border-b border-hairline last:border-0 hover:bg-surface-soft transition-colors cursor-pointer ${className || ""}`}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function TableCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 ${className || ""}`}>{children}</td>;
}
