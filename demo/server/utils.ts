import type { Request as ExpressReq } from 'express'

/** Convert an Express request to a Web API Request for mppx. */
export function toWebRequest(req: ExpressReq): globalThis.Request {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value[0] : value)
  }
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`
  const init: RequestInit = { method: req.method, headers }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = JSON.stringify(req.body)
  }
  return new globalThis.Request(url, init)
}
