import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET!

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function generateToken(payload: {
  userId: string
  companyId: string
  role: string
}): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' })
}

export function verifyToken(
  token: string
): { userId: string; companyId: string; role: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as {
      userId: string
      companyId: string
      role: string
    }
  } catch {
    return null
  }
}

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}
