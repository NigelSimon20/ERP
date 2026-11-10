// Intentional fixed-shift model, not a placeholder: guards are paid for a
// full standard shift when marked present, regardless of exact clock time.
// This attendance module is a manually-stamped daily status register (see
// the Timesheet/Site Registers UI) -- there is no clock-in/out capture
// anywhere in the app, including the guard self-service portal, which is
// read-only. Deriving hoursWorked from checkIn/checkOut would require
// building a real time-clock feature (portal write endpoint + UI) rather
// than changing this function; do not "fix" this without that being an
// explicit, separately-scoped product decision.
export const STANDARD_SHIFT_HOURS = 12

export function hoursForStatus(status: string): number {
  return status === 'PRESENT' || status === 'INDUCTION_PAID' ? STANDARD_SHIFT_HOURS : 0
}

// P1-11 (BUG-020): days off and leave are not missed shifts, so they are
// excluded from the denominator (1,419 present / 1,866 records read as 76%;
// against the 1,493 rostered days it is 95%).
export const NOT_ROSTERED_STATUSES = ['OFF', 'LEAVE'] as const

export function attendanceRate(present: number, totalRecords: number, notRostered: number): number {
  const rostered = totalRecords - notRostered
  return rostered > 0 ? Math.round((present / rostered) * 100) : 0
}
