import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:opacity-90 focus-visible:ring-primary/60",
  secondary:
    "bg-muted/40 text-foreground hover:bg-muted/60 focus-visible:ring-muted/60",
  ghost:
    "bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground focus-visible:ring-muted/40",
  destructive:
    "bg-destructive/15 text-destructive hover:bg-destructive/25 focus-visible:ring-destructive/40",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, ...props }, ref) => (
    <button
      ref={ref}
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium tracking-tight transition-colors",
        "focus-visible:outline-none focus-visible:ring-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
    />
  ),
);
Button.displayName = "Button";
