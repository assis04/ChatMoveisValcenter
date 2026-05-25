import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    {...props}
    className={cn(
      "h-9 w-full rounded-md border border-border bg-background/40 px-3 text-sm text-foreground placeholder:text-muted-foreground/70",
      "focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
  />
));
Input.displayName = "Input";
