import clsx, { type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function formatBrPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 12) return raw;
  // BR mobile: 55 11 9XXXX-XXXX
  const country = digits.slice(0, 2);
  const area = digits.slice(2, 4);
  const rest = digits.slice(4);
  if (rest.length === 9) {
    return `+${country} ${area} ${rest.slice(0, 5)}-${rest.slice(5)}`;
  }
  if (rest.length === 8) {
    return `+${country} ${area} ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  return `+${country} ${area} ${rest}`;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}
