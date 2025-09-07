import { InputHTMLAttributes, forwardRef } from "react";


export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
{ className = "", ...props },
ref
) {
return (
<input
ref={ref}
className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 ${className}`}
{...props}
/>
);
});