import { ButtonHTMLAttributes } from "react";


export function Button({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
return (
<button
className={`inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-white text-sm hover:opacity-90 disabled:opacity-50 ${className}`}
{...props}
/>
);
}