/**
 * dsh-desktop-alerts — Windows 桌面提醒
 *
 * Shows a small always-on-top card in the corner of the screen when DSH needs
 * you: the agent asked a question, a tool call needs a permission decision, or
 * a turn finished. The card never takes keyboard focus; clicking it brings the
 * DSH window back to the front.
 *
 * Host-only bundle: no client half, no build step, no dependencies.
 */

import { resolveSettings } from './lib/settings.js'
import { Notifier } from './lib/notifier.js'
import {
  assistantText,
  approvalCard,
  isSubagentSession,
  questionCard,
  stringsFor,
  turnEndCard,
} from './lib/cards.js'

const PREFIX = '[windows-notify]'

function createLogger(ctx) {
  const logger = ctx?.logger
  return (level, message) => {
    try {
      const target = logger?.[level]
      if (typeof target === 'function') target.call(logger, `${PREFIX} ${message}`)
    } catch {
      /* logging must never break a notification */
    }
  }
}

function sessionKey(session) {
  return session?.id ?? session?.header?.id ?? 'unknown'
}

export function apply(ctx, config) {
  const settings = resolveSettings(config)
  if (!settings.enabled) return

  const log = createLogger(ctx)

  if (process.platform !== 'win32') {
    log('info', 'not a Windows host, windows notifications are disabled')
    return
  }

  const strings = stringsFor(settings.language)
  const notifier = new Notifier(settings, log)
  /** sessionId -> text of the most recent assistant message */
  const lastAssistant = new Map()

  const wantsCardForSession = (session) => {
    if (!session) return true
    if (settings.includeSubagents) return true
    return !isSubagentSession(session)
  }

  // --- The agent is asking the user something --------------------------------
  ctx.on('user-questions/request', (request, next) => {
    try {
      if (settings.questions && wantsCardForSession(request?.agent?.session)) {
        notifier.push(questionCard(request, settings, strings))
      }
    } catch (error) {
      log('warn', `${error?.message ?? error}`)
    }
    return next()
  })

  // --- A tool call needs a permission decision -------------------------------
  ctx.on('approval/request', (request, next) => {
    try {
      if (settings.approvals && wantsCardForSession(request?.agent?.session)) {
        notifier.push(approvalCard(request, settings, strings))
      }
    } catch (error) {
      log('warn', `${error?.message ?? error}`)
    }
    return next()
  })

  // --- A turn finished -------------------------------------------------------
  ctx.on('session/event', (session, event) => {
    try {
      const type = event?.type
      if (type === 'assistant/message') {
        const text = assistantText(event?.data?.message)
        if (text.length > 0) lastAssistant.set(sessionKey(session), text)
        return
      }
      if (type !== 'turn/end') return
      if (!wantsCardForSession(session)) return
      const key = sessionKey(session)
      const card = turnEndCard(session, event, settings, strings, lastAssistant.get(key))
      lastAssistant.delete(key)
      if (card) notifier.push(card)
    } catch (error) {
      log('warn', `${error?.message ?? error}`)
    }
  })

  if (typeof ctx.effect === 'function') {
    ctx.effect(
      () => () => {
        notifier.dispose()
        lastAssistant.clear()
      },
      'windows-notify: cards',
    )
  }

  log('info', `cards enabled (${settings.position}, ${settings.durationMs}ms)`)
}
