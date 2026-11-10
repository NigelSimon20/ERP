import { Prisma } from '@prisma/client'

// P1-1: amounts are Decimal(18,2). Round half-up on Decimal, never on
// floats (1.005 * 100 is 100.49999... in binary floating point).
export type MoneyInput = Prisma.Decimal | number | string | null | undefined

export function money(x: MoneyInput): Prisma.Decimal {
  return new Prisma.Decimal(x ?? 0).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
}

// Exact integer cents, for comparisons that must not tolerate drift.
export function cents(x: MoneyInput): number {
  return money(x).mul(100).toNumber()
}

export function sumMoney(xs: MoneyInput[]): Prisma.Decimal {
  return xs.reduce<Prisma.Decimal>((s, x) => s.add(money(x)), new Prisma.Decimal(0))
}

export function moneyEquals(a: MoneyInput, b: MoneyInput): boolean {
  return money(a).eq(money(b))
}
