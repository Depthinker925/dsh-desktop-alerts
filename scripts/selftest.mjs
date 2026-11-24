/**
 * Unit tests for the pure parts of the plugin: settings normalisation, card
 * description and assistant-text extraction. No DSH, no Windows, no GUI needed.
 *
 *   node scripts/selftest.mjs
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { DEFAULTS, resolveSettings } from '../lib/settings.js'
import {
  assistantText,
  approvalCard,
  isSubagentSession,
  lastMeaningfulLine,
  preview,
  projectName,
  questionCard,
  stringsFor,
  turnEndCard,
} from '../lib/cards.js'

const settings = resolveSettings({ language: 'zh' })
const zh = stringsFor('zh')

const session = { header: { id: 's1', cwd: 'D:\\work\\dsh-windows-notify' } }
const agent = { id: 's1', session }

test('settings: defaults survive an empty config', () => {
  const resolved = resolveSettings(undefined)
  assert.equal(resolved.enabled, DEFAULTS.enabled)
  assert.equal(resolved.position, DEFAULTS.position)
  assert.equal(resolved.durationMs, DEFAULTS.durationMs)
  assert.equal(resolved.accents.question, '#4D6BFE')
})

test('settings: bad values are clamped instead of trusted', () => {
  const resolved = resolveSettings({
    position: 'somewhere',
    durationMs: 10,
    maxVisible: 99,
    clickAction: 'explode',
    soundName: 'trumpet',
    accents: { question: 'blue' },
  })
  assert.equal(resolved.position, DEFAULTS.position)
  assert.equal(resolved.durationMs, 3000)
  assert.equal(resolved.maxVisible, 8)
  assert.equal(resolved.clickAction, DEFAULTS.clickAction)
  assert.equal(resolved.soundName, DEFAULTS.soundName)
  assert.equal(resolved.accents.question, '#4D6BFE')
})

test('settings: strings "true"/"false" are accepted as booleans', () => {
  assert.equal(resolveSettings({ sound: 'false' }).sound, false)
  assert.equal(resolveSettings({ sound: 'true' }).sound, true)
})

test('text: preview collapses and truncates', () => {
  assert.equal(preview('  a \n\n b  ', 100), 'a\nb')
  assert.equal(preview('abcdefghij', 5), 'abcd…')
  assert.equal(preview(undefined, 10), '')
})

test('text: assistantText reads text blocks and ignores reasoning', () => {
  assert.equal(
    assistantText({
      content: [
        { type: 'reasoning', text: 'secret' },
        { type: 'text', text: 'hello ' },
        { type: 'tool-call', id: 'x' },
        { type: 'text', text: 'world' },
      ],
    }),
    'hello \nworld',
  )
  assert.equal(assistantText({ content: 'not-an-array' }), '')
  assert.equal(assistantText(undefined), '')
})

test('text: lastMeaningfulLine takes the tail', () => {
  assert.equal(lastMeaningfulLine('a\n\nb\nc\n', 50), 'c')
  assert.equal(lastMeaningfulLine('', 50), '')
})

test('projectName: last path segment, both separators', () => {
  assert.equal(projectName('D:\\work\\dsh-windows-notify'), 'dsh-windows-notify')
  assert.equal(projectName('/home/depth/project/'), 'project')
  assert.equal(projectName(''), '')
})

test('subagents: parentSession or origin marks a subagent session', () => {
  assert.equal(isSubagentSession({ header: { parentSession: 'p1' } }), true)
  assert.equal(isSubagentSession({ header: { origin: 'subagent' } }), true)
  assert.equal(isSubagentSession(session), false)
  assert.equal(isSubagentSession(undefined), false)
})

test('question card: choice title, options preview and project meta', () => {
  const card = questionCard(
    {
      agent,
      questions: [
        {
          id: 'q1',
          question: '是否提交到插件市场？',
          options: [{ label: '先提 GitHub' }, { label: '同时发 npm' }],
        },
      ],
    },
    settings,
    zh,
  )
  assert.equal(card.kind, 'question')
  assert.equal(card.title, zh.choiceTitle)
  assert.match(card.body, /是否提交到插件市场/)
  assert.match(card.body, /先提 GitHub \/ 同时发 npm/)
  assert.match(card.meta, /dsh-windows-notify/)
  assert.equal(card.accent, settings.accents.question)
})

test('question card: plan review and approval intents get their own titles', () => {
  const plan = questionCard(
    { agent, questions: [{ id: 'q', question: '批准计划？', intent: { kind: 'plan-review', approve: 'ok' } }] },
    settings,
    zh,
  )
  assert.equal(plan.title, zh.planTitle)

  const approval = questionCard(
    {
      agent,
      questions: [
        {
          id: 'q',
          question: '允许写入？',
          intent: { kind: 'approval', approve: 'y', reject: 'n', display: { question: { en: 'Allow?', zh: '允许写入？' } } },
        },
      ],
    },
    settings,
    zh,
  )
  assert.equal(approval.title, zh.approvalIntentTitle)
  assert.equal(approval.body, '允许写入？')
})

test('approval card: uses the localised display reason', () => {
  const card = approvalCard(
    {
      agent,
      toolName: 'write',
      reason: 'write outside workspace',
      displayReason: { en: 'Write outside the workspace', zh: '写入工作区之外的路径' },
    },
    settings,
    zh,
  )
  assert.equal(card.title, zh.approvalTitle)
  assert.equal(card.body, '写入工作区之外的路径')
  assert.match(card.meta, /write/)
  assert.equal(card.accent, settings.accents.approval)
})

test('approval card: falls back to the raw reason', () => {
  const card = approvalCard({ agent, toolName: 'bash', reason: 'run a command' }, settings, zh)
  assert.equal(card.body, 'run a command')
})

test('turn end: completed card carries the last line of the reply', () => {
  const card = turnEndCard(
    session,
    { type: 'turn/end', data: { turn: 3, reason: { kind: 'completed' } } },
    settings,
    zh,
    '做了三件事\n\n最后：源码已交付。',
  )
  assert.equal(card.kind, 'completed')
  assert.equal(card.title, zh.completedTitle)
  assert.equal(card.body, '最后：源码已交付。')
  assert.match(card.meta, /#3/)
})

test('turn end: completed card without text uses the fallback', () => {
  const card = turnEndCard(session, { data: { turn: 1, reason: { kind: 'completed' } } }, settings, zh, '')
  assert.equal(card.body, zh.completedFallback)
})

test('turn end: error card shows the failure message', () => {
  const card = turnEndCard(
    session,
    { data: { turn: 2, reason: { kind: 'error', error: { kind: 'llm', message: '400 invalid_request_error' } } } },
    settings,
    zh,
    '',
  )
  assert.equal(card.kind, 'error')
  assert.equal(card.title, zh.errorTitle)
  assert.equal(card.body, '400 invalid_request_error')
  assert.equal(card.glyph, '✕')
})

test('turn end: switched off or irrelevant reasons produce no card', () => {
  const off = resolveSettings({ language: 'zh', completed: false })
  assert.equal(turnEndCard(session, { data: { turn: 1, reason: { kind: 'completed' } } }, off, zh, 'x'), undefined)
  assert.equal(turnEndCard(session, { data: { turn: 1, reason: { kind: 'aborted' } } }, settings, zh, 'x'), undefined)
  assert.equal(turnEndCard(session, { data: { reason: {} } }, settings, zh, 'x'), undefined)
})

test('language: auto follows the OS locale, explicit wins', () => {
  assert.equal(stringsFor('zh').completedTitle, '任务完成')
  assert.equal(stringsFor('en').completedTitle, 'Task finished')
  assert.ok(['任务完成', 'Task finished'].includes(stringsFor('auto').completedTitle))
})
