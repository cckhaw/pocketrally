/** Nickname rules shared by the client and the API (pure, no dependencies). */
const BLOCKED = [
  'fuck',
  'shit',
  'bitch',
  'cunt',
  'dick',
  'cock',
  'nigg',
  'fag',
  'slut',
  'whore',
  'rape',
  'nazi',
  'hitler',
  'porn',
  'penis',
  'vagina',
  'asshole',
]

export type NicknameResult = { ok: true; nickname: string } | { ok: false; reason: string }

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[0@]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[^a-z]/g, '')
}

export function validateNickname(raw: unknown): NicknameResult {
  if (typeof raw !== 'string') return { ok: false, reason: 'Nickname must be text' }
  // collapse whitespace and strip control characters
  const nickname = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (nickname.length < 3) return { ok: false, reason: 'Nickname needs at least 3 characters' }
  if (nickname.length > 16) return { ok: false, reason: 'Nickname can be at most 16 characters' }
  if (
    /https?:|www\.|\.(com|net|org|io|cc|gg|ly|xyz|me)\b|:\/\//i.test(nickname) ||
    /\w\.\w{2,}/.test(nickname)
  ) {
    return { ok: false, reason: 'No links in nicknames' }
  }
  const n = normalise(nickname)
  if (BLOCKED.some((w) => n.includes(w)))
    return { ok: false, reason: 'Please pick a friendlier nickname' }
  return { ok: true, nickname }
}
