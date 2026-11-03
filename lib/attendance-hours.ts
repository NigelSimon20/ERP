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
