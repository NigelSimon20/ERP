import toast from 'react-hot-toast'

// Loads one dropdown's options. A failure (non-2xx, HTML 404 page, missing
// key) toasts and yields [] for that list only, so sibling lists still load.
export async function fetchList<T>(url: string, key: string, label: string): Promise<T[]> {
  try {
    const res = await fetch(url)
    const json = await res.json().catch(() => null)
    if (!res.ok || !json || !Array.isArray(json[key])) {
      throw new Error(`GET ${url} failed (${res.status})`)
    }
    return json[key] as T[]
  } catch (err) {
    console.error(err)
    toast.error(`Failed to load ${label}`)
    return []
  }
}
