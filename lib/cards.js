/**
 * Turns DSH runtime events into the small card descriptions rendered by
 * lib/notify.ps1. Every function here is pure so the shapes are easy to test.
 */

const STRINGS = {
  zh: {
    questionTitle: 'DSH 需要你的输入',
    choiceTitle: 'DSH 需要你的选择',
    planTitle: 'DSH 计划待确认',
    approvalIntentTitle: 'DSH 需要你的确认',
    approvalTitle: 'DSH 请求权限',
    completedTitle: '任务完成',
    errorTitle: '任务出错',
    completedFallback: '本回合已结束，回到 DSH 查看结果。',
    errorFallback: '回合因错误结束。',
    moreQuestions: (count) => `另有 ${count} 个问题`,
    options: (labels) => `选项：${labels.join(' / ')}`,
    tool: (name) => `工具 ${name}`,
    metaKinds: { question: '确认', approval: '权限', completed: '完成', error: '出错' },
  },
  en: {
    questionTitle: 'DSH needs your input',
    choiceTitle: 'DSH needs your choice',
    planTitle: 'DSH plan waiting for approval',
    approvalIntentTitle: 'DSH needs your confirmation',
    approvalTitle: 'DSH requests permission',
    completedTitle: 'Task finished',
    errorTitle: 'Task failed',
    completedFallback: 'The turn ended. Switch back to DSH for the result.',
    errorFallback: 'The turn ended with an error.',
    moreQuestions: (count) => `${count} more question(s)`,
    options: (labels) => `Options: ${labels.join(' / ')}`,
    tool: (name) => `tool ${name}`,
    metaKinds: { question: 'input', approval: 'permission', completed: 'done', error: 'error' },
  },
}

/** Resolve `auto` against the operating system locale. */
export function resolveLanguage(setting) {
  if (setting === 'zh' || setting === 'en') return setting
  let locale = ''
  try {
    locale = Intl.DateTimeFormat().resolvedOptions().locale || ''
  } catch {
    locale = ''
  }
  if (!locale) {
    try {
      locale = process.env.LANG || process.env.LC_ALL || ''
    } catch {
      locale = ''
    }
  }
  return locale.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function stringsFor(setting) {
  return STRINGS[resolveLanguage(setting)] ?? STRINGS.en
}

/** Collapse whitespace and clamp to a readable preview. */
export function preview(value, max) {
  if (typeof value !== 'string') return ''
  const flat = value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

/** Last non-empty line of an assistant message, i.e. what the card should say. */
export function lastMeaningfulLine(text, max) {
  const flat = preview(text, Number.MAX_SAFE_INTEGER)
  if (!flat) return ''
  const lines = flat.split('\n').filter((line) => line.trim().length > 0)
  const tail = lines.length > 0 ? lines[lines.length - 1] : flat
  return preview(tail, max)
}

/** Plain text of an assistant message, tolerant about where the blocks live. */
export function assistantText(message) {
  const content = message?.content ?? message?.blocks
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n')
}

/** `DSH 插件 Windows 提醒弹窗开发` style project label, derived from the session cwd. */
export function projectName(cwd) {
  if (typeof cwd !== 'string' || cwd.length === 0) return ''
  const trimmed = cwd.replace(/[\\/]+$/, '')
  const segments = trimmed.split(/[\\/]/)
  return segments.length > 0 ? segments[segments.length - 1] : ''
}

function sessionOf(session) {
  return session?.header ?? session?.session?.header ?? undefined
}

export function isSubagentSession(session) {
  const header = sessionOf(session)
  if (!header) return false
  if (header.origin === 'subagent') return true
  return Boolean(header.parentSession)
}

function metaLine(settings, t, kind, session, extra) {
  const parts = []
  parts.push(t.metaKinds[kind])
  const project = settings.showProject ? projectName(sessionOf(session)?.cwd) : ''
  if (project) parts.push(project)
  if (extra) parts.push(extra)
  return parts.join(' · ')
}

function questionBody(questions, t, max) {
  const first = questions[0] ?? {}
  const intent = first.intent
  let body = ''
  if (intent?.kind === 'approval' && intent.display?.question) {
    body = intent.display.question.zh || intent.display.question.en || ''
  }
  if (!body && first.header && first.question) {
    body = `${first.header}：${first.question}`
  }
  if (!body) body = typeof first.question === 'string' ? first.question : ''
  const details = []
  if (Array.isArray(first.options) && first.options.length > 0) {
    const labels = first.options
      .map((option) => (typeof option?.label === 'string' ? option.label : ''))
      .filter((label) => label.length > 0)
    if (labels.length > 0) details.push(t.options(labels))
  }
  if (questions.length > 1) details.push(t.moreQuestions(questions.length - 1))
  if (details.length > 0) body = body.length > 0 ? `${body}\n${details.join(' · ')}` : details.join(' · ')
  return preview(body, max)
}

function questionTitle(questions, t) {
  const intent = questions[0]?.intent
  if (intent?.kind === 'plan-review') return t.planTitle
  if (intent?.kind === 'approval') return t.approvalIntentTitle
  if (Array.isArray(questions[0]?.options) && questions[0].options.length > 0) return t.choiceTitle
  return t.questionTitle
}

/** Card for `user-questions/request`. */
export function questionCard(request, settings, t) {
  const questions = Array.isArray(request?.questions) ? request.questions : []
  const session = request?.agent?.session
  return {
    kind: 'question',
    title: questionTitle(questions, t),
    body: questionBody(questions, t, settings.maxBodyChars),
    meta: metaLine(settings, t, 'question', session),
    accent: settings.accents.question,
    glyph: '?',
  }
}

/** Card for `approval/request`. */
export function approvalCard(request, settings, t) {
  const session = request?.agent?.session
  const display = request?.displayReason
  const localised =
    display?.[resolveLanguage(settings.language)] || display?.zh || display?.en || ''
  let body = localised || (typeof request?.reason === 'string' ? request.reason : '')
  if (!body) body = STRINGS.zh.approvalTitle
  const extra = settings.showToolName && typeof request?.toolName === 'string' ? t.tool(request.toolName) : ''
  return {
    kind: 'approval',
    title: t.approvalTitle,
    body: preview(body, settings.maxBodyChars),
    meta: metaLine(settings, t, 'approval', session, extra),
    accent: settings.accents.approval,
    glyph: '!',
  }
}

function reasonKind(reason) {
  const kind = reason?.kind
  return typeof kind === 'string' ? kind : ''
}

function errorText(reason) {
  const error = reason?.error
  if (!error) return ''
  const candidates = [error.message, error.summary, error.kind]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate
  }
  return ''
}

/**
 * Card for `session/event` → `turn/end`. Returns `undefined` when this turn
 * should not produce a card.
 */
export function turnEndCard(session, event, settings, t, lastText) {
  const reason = event?.data?.reason
  const kind = reasonKind(reason)
  const turn = event?.data?.turn
  const base = {
    meta: metaLine(settings, t, kind === 'error' ? 'error' : 'completed', session, turn ? `#${turn}` : ''),
    glyph: '✓',
  }

  if (kind === 'completed') {
    if (!settings.completed) return undefined
    const body = lastMeaningfulLine(lastText, settings.maxBodyChars) || t.completedFallback
    return { ...base, kind: 'completed', title: t.completedTitle, body, accent: settings.accents.completed }
  }

  if (kind === 'error') {
    if (!settings.errors) return undefined
    const body = preview(errorText(reason), settings.maxBodyChars) || t.errorFallback
    return {
      ...base,
      kind: 'error',
      title: t.errorTitle,
      body,
      glyph: '✕',
      accent: settings.accents.error,
    }
  }

  return undefined
}
