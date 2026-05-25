import { cn, initialsOf } from "@/lib/utils";

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}

export function Avatar({ name, src, size = 32, className }: AvatarProps) {
  const dim = { width: size, height: size };
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={dim}
        className={cn("rounded-full object-cover", className)}
      />
    );
  }
  return (
    <div
      style={dim}
      className={cn(
        "flex items-center justify-center rounded-full bg-gradient-to-br from-primary/60 to-primary/20 text-[10px] font-medium uppercase tracking-wider text-primary-foreground",
        className,
      )}
    >
      {initialsOf(name) || "?"}
    </div>
  );
}
