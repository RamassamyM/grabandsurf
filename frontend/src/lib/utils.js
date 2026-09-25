import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Merge Tailwind classes, the last one wins (shadcn/ui helper).
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
