import Link from "next/link";
import { cn } from "@/lib/utils";

const VARIANTS = {
  primary: "bg-navy text-white hover:bg-navy-hover border border-navy",
  secondary: "bg-white text-ink border border-line hover:bg-canvas",
  gold: "bg-gold text-white hover:bg-gold-strong border border-gold",
  ghost: "text-ink hover:bg-canvas border border-transparent",
  link: "text-ink underline underline-offset-4 decoration-1 hover:text-navy border-0 px-0",
} as const;

const SIZES = {
  sm: "h-8 px-3 text-xs rounded-md",
  md: "h-10 px-4 text-sm rounded-lg",
  lg: "h-11 px-5 text-[15px] rounded-lg",
} as const;

export interface ButtonStyleProps {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}

export function buttonClass({ variant = "primary", size = "md" }: ButtonStyleProps = {}, className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-1.5 font-semibold whitespace-nowrap transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy",
    "disabled:opacity-50 disabled:pointer-events-none",
    VARIANTS[variant],
    variant === "link" ? "h-auto" : SIZES[size],
    className,
  );
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ButtonStyleProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={buttonClass({ variant, size }, className)} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ButtonStyleProps & React.ComponentProps<typeof Link>) {
  return <Link className={buttonClass({ variant, size }, className)} {...props} />;
}
