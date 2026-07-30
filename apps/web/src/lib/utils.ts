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

function fromMillis(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  if (d < 7) return `há ${d} dias`;
  return new Date(ms).toLocaleDateString("pt-BR");
}

export function relativeTime(iso: string): string {
  return fromMillis(new Date(iso).getTime());
}

export function relativeFromEpoch(seconds: number): string {
  if (!seconds) return "";
  return fromMillis(seconds * 1000);
}
