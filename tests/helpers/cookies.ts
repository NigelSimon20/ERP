// Minimal stand-in for Next's request cookie store, shared by the
// next/headers mock and callRoute().
const jar = new Map<string, string>()

export const testCookies = {
  get(name: string) {
    const value = jar.get(name)
    return value === undefined ? undefined : { name, value }
  },
  getAll() {
    return Array.from(jar, ([name, value]) => ({ name, value }))
  },
  has(name: string) {
    return jar.has(name)
  },
  set(name: string | { name: string; value: string }, value?: string) {
    if (typeof name === 'object') jar.set(name.name, name.value)
    else jar.set(name, value ?? '')
  },
  delete(name: string) {
    jar.delete(name)
  },
}

export function setTestCookie(name: string, value: string | null) {
  if (value === null) jar.delete(name)
  else jar.set(name, value)
}

export function cookieHeader(): string {
  return Array.from(jar, ([n, v]) => `${n}=${v}`).join('; ')
}
