import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Compact id for the monospace console look (first 8 chars of a uuid). */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function fmtNum(n: number | null | undefined, suffix = ""): string {
  if (n === null || n === undefined) return "—";
  return `${n}${suffix}`;
}
