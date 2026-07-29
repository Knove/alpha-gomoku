/**
 * Thin fetch wrapper around the FastAPI REST contract (PLAN.md §5).
 * All helpers throw an Error with a readable message on non-2xx responses.
 */

const BASE = "/api"

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, {
      method,
      headers:
        body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error("网络请求失败:无法连接服务器")
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const j = (await res.json()) as { detail?: unknown }
      if (j && j.detail != null) {
        detail =
          typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail)
      }
    } catch {
      // keep status-line fallback
    }
    throw new Error(detail)
  }
  return (await res.json()) as T
}

export const get = <T>(path: string): Promise<T> => request<T>("GET", path)
export const post = <T>(path: string, body?: unknown): Promise<T> =>
  request<T>("POST", path, body)
export const put = <T>(path: string, body?: unknown): Promise<T> =>
  request<T>("PUT", path, body)
