import { LabelHTMLAttributes } from "react";


export function Label({ className = "", ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
return <label className={`block text-xs font-medium text-slate-600 mb-1 ${className}`} {...props} />;
}