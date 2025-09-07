import { TextareaHTMLAttributes, forwardRef } from "react";


export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
{ className = "", ...props },
ref
) {
return (
<textarea
ref={ref}
className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 ${className}`}
{...props}
/>
);
});