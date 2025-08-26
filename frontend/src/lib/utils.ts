import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Merge Tailwind + custom classnames cleanly.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format token amount into a human-readable string.
 * Example: formatTokenAmount(123456789, 18) -> "0.123456789"
 */
export function formatTokenAmount(
  amount: string | number,
  decimals: number = 18,
  precision: number = 4
): string {
  if (!amount) return "0"

  const value =
    typeof amount === "string" ? BigInt(amount) : BigInt(amount.toString())

  const divisor = BigInt(10) ** BigInt(decimals)
  const whole = value / divisor
  const fraction = value % divisor

  // Get fraction as decimal string with precision
  const fractionStr = fraction
    .toString()
    .padStart(decimals, "0")
    .slice(0, precision)

  return `${whole.toString()}.${fractionStr}`
}
