/**
 * Configuration for dsh-desktop-alerts.
 *
 * The plugin deliberately does not export a `Config` schema: a bundle that is
 * installed from a local directory is linked into the profile, and a schema
 * exported here would have to resolve `@deepseek-ai/schemastery` from outside
 * the profile tree. Instead every value is optional and normalised here, and
 * the defaults are documented in README.md.
 */

export const DEFAULTS = Object.freeze({
  /** Master switch. */
  enabled: true,
  /** Notify when the agent asks the user a question / asks for plan approval. */
  questions: true,
  /** Notify when a tool call needs an approval decision. */
  approvals: true,
  /** Notify when a turn finishes normally. */
  completed: true,
  /** Notify when a turn ends with an error. */
  errors: true,
  /** Also notify for sessions owned by a subagent. */
  includeSubagents: false,
  /** bottom-right | top-right | bottom-left | top-left | center */
  position: 'bottom-right',
  /** How long a card stays on screen, in milliseconds. */
  durationMs: 12000,
  /** Play a short system sound with the card. */
  sound: true,
  /** asterisk | beep | exclamation | hand | question | none */
  soundName: 'asterisk',
  /** Minimum gap between two cards, in milliseconds. */
  minIntervalMs: 1200,
  /** Maximum number of cards kept on screen at the same time. */
  maxVisible: 3,
  /** Body text is truncated to this many characters. */
  maxBodyChars: 220,
  /** focus | url | none — what clicking a card does. */
  clickAction: 'focus',
  /** URL for clickAction = url. */
  url: '',
  /** Window title / process name of the DSH desktop app, used by clickAction = focus. */
  processName: 'DeepSeek Harness',
  /** auto | zh | en — card language. */
  language: 'auto',
  /** Show the project folder (last path segment of the session cwd) on the card. */
  showProject: true,
  /** Show the tool name on approval cards. */
  showToolName: true,
})

const POSITIONS = new Set(['bottom-right', 'top-right', 'bottom-left', 'top-left', 'center'])
const CLICK_ACTIONS = new Set(['focus', 'url', 'none'])
const LANGUAGES = new Set(['auto', 'zh', 'en'])
const SOUND_NAMES = new Set(['asterisk', 'beep', 'exclamation', 'hand', 'question', 'none'])

const ACCENT_DEFAULTS = Object.freeze({
  question: '#4D6BFE',
  approval: '#F5A524',
  completed: '#22C55E',
  error: '#EF4444',
})

function asBoolean(value, fallback) {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

function asNumber(value, fallback, min, max) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function asString(value, fallback) {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function asEnum(value, allowed, fallback) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return allowed.has(text) ? text : fallback
}

function asAccent(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : ''
  return /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(text) ? text : fallback
}

/** Merge user config with defaults and clamp every value into a usable shape. */
export function resolveSettings(config) {
  const input = config !== null && typeof config === 'object' ? config : {}
  const accents = input.accents !== null && typeof input.accents === 'object' ? input.accents : {}
  return {
    enabled: asBoolean(input.enabled, DEFAULTS.enabled),
    questions: asBoolean(input.questions, DEFAULTS.questions),
    approvals: asBoolean(input.approvals, DEFAULTS.approvals),
    completed: asBoolean(input.completed, DEFAULTS.completed),
    errors: asBoolean(input.errors, DEFAULTS.errors),
    includeSubagents: asBoolean(input.includeSubagents, DEFAULTS.includeSubagents),
    position: asEnum(input.position, POSITIONS, DEFAULTS.position),
    durationMs: Math.round(asNumber(input.durationMs, DEFAULTS.durationMs, 3000, 120000)),
    sound: asBoolean(input.sound, DEFAULTS.sound),
    soundName: asEnum(input.soundName, SOUND_NAMES, DEFAULTS.soundName),
    minIntervalMs: Math.round(asNumber(input.minIntervalMs, DEFAULTS.minIntervalMs, 0, 60000)),
    maxVisible: Math.round(asNumber(input.maxVisible, DEFAULTS.maxVisible, 1, 8)),
    maxBodyChars: Math.round(asNumber(input.maxBodyChars, DEFAULTS.maxBodyChars, 40, 1200)),
    clickAction: asEnum(input.clickAction, CLICK_ACTIONS, DEFAULTS.clickAction),
    url: asString(input.url, DEFAULTS.url),
    processName: asString(input.processName, DEFAULTS.processName),
    language: asEnum(input.language, LANGUAGES, DEFAULTS.language),
    showProject: asBoolean(input.showProject, DEFAULTS.showProject),
    showToolName: asBoolean(input.showToolName, DEFAULTS.showToolName),
    accents: {
      question: asAccent(accents.question, ACCENT_DEFAULTS.question),
      approval: asAccent(accents.approval, ACCENT_DEFAULTS.approval),
      completed: asAccent(accents.completed, ACCENT_DEFAULTS.completed),
      error: asAccent(accents.error, ACCENT_DEFAULTS.error),
    },
  }
}
