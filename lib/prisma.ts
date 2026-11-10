import { Prisma, PrismaClient } from '@prisma/client'

// Money columns are Decimal(18,2) (P1-1): stored and summed exactly in
// Postgres. decimal.js's valueOf/toJSON return strings, so untyped code
// doing `a + b` on API values would concatenate ("0.1" + 1 = "0.11") and
// responses would switch from numbers to strings. Keep both numeric.
// (Not via toNumber(): decimal.js implements that as `+this`, i.e. valueOf.)
const decimalProto = Prisma.Decimal.prototype as unknown as { valueOf: () => number; toJSON: () => number; toString: () => string }
decimalProto.valueOf = function (this: Prisma.Decimal) { return Number(this.toString()) }
decimalProto.toJSON = function (this: Prisma.Decimal) { return Number(this.toString()) }

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
