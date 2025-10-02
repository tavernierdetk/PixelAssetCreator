import { ButtonHTMLAttributes } from "react";


function stripConflicting(tokenList: string): string {
  // Remove any incoming background/text utility classes so our base wins deterministically.
  const forbid = [/^(bg-)/, /^(hover:)?bg-/, /^(text-)/, /^(hover:)?text-/];
  return (tokenList || "")
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !forbid.some((re) => re.test(t)))
    .join(" ");
}

export function Button({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    "inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm bg-slate-900 text-white hover:opacity-90 disabled:opacity-50";
  const cleaned = stripConflicting(className);
  return <button className={`${cleaned} ${base}`} {...props} />;
}
