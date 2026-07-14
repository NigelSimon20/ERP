import type { Guard } from '@prisma/client'

export interface GuardDto {
  id: string
  employeeNumber: string | null
  name: string | null
  idNumber: string | null
  phone: string | null
  email: string | null
  address: string | null
  department: string | null
  position: string | null
  status: string | null
  dailyRate: number | null
  dateOfBirth: string | null
  dateHired: string | null
}

export function toGuardDto(guard: Guard): GuardDto {
  return {
    id: guard.id,
    employeeNumber: guard.employee_code,
    name: guard.full_name,
    idNumber: guard.national_id,
    phone: guard.phone,
    email: guard.email,
    address: guard.address,
    department: guard.department,
    position: guard.position,
    status: guard.status,
    dailyRate: guard.daily_rate,
    dateOfBirth: guard.date_of_birth,
    dateHired: guard.hire_date,
  }
}

export function splitName(name: string): { first_name: string; last_name: string | null } {
  const parts = name.trim().split(/\s+/)
  return { first_name: parts[0] ?? name, last_name: parts.slice(1).join(' ') || null }
}
