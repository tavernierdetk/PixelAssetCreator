import { HTMLAttributes } from "react";

type DivProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className = "", ...props }: DivProps) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}
      {...props}
    />
  );
}

export function CardHeader({ className = "", ...props }: DivProps) {
  return <div className={`p-4 border-b border-slate-200 ${className}`} {...props} />;
}

export function CardContent({ className = "", ...props }: DivProps) {
  return <div className={`p-4 ${className}`} {...props} />;
}
