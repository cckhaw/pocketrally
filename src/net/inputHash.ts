/** Hash of the quantised input log. The server only checks its shape (see README for limits). */
export async function hashInputLog(log: Int8Array, len: number): Promise<string> {
  const bytes = Uint8Array.from(log.subarray(0, len), (v) => v & 255)
  try {
    const subtle = globalThis.crypto?.subtle
    if (subtle) {
      const digest = await subtle.digest('SHA-256', bytes)
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    }
  } catch {
    /* fall through to FNV-1a */
  }
  let h = 0x811c9dc5
  for (let i = 0; i < len; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0').repeat(4)
}
