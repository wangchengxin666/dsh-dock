export const SKILL_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const VALID_CATEGORIES = new Set(['skill', 'automation', 'workflow', 'fix', 'lesson'])

export function normalizeSkillSlug(raw) {
  return String(raw || '').trim().toLowerCase()
}

export function parseSkillFrontmatter(markdown) {
  const text = String(markdown || '')
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return { name: '', description: '' }
  const block = m[1]
  const pick = (key) => {
    const line = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
    return line ? line[1].trim().replace(/^['"]|['"]$/g, '') : ''
  }
  return {
    name: pick('name'),
    description: pick('description'),
  }
}
