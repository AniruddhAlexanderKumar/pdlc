import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge conditional class names and resolve conflicting Tailwind utilities.
 * Standard `shadcn/ui` helper (`@/lib/utils`).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
