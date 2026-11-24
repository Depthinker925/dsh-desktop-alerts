/**
 * Spawns the PowerShell card renderer and keeps card spawns polite: one card
 * every `minIntervalMs` at most, `maxVisible` cards on screen at a time, each
 * card assigned a stack slot so stacked cards do not overlap.
 */

import { spawn } from 'node:child_process'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const RENDERER = join(HERE, 'notify.ps1')
const PAYLOAD_DIR = join(tmpdir(), 'dsh-desktop-alerts')
const CARD_GRACE_MS = 1500
const SPAWN_TIMEOUT_MS = 30000

function powershellPath() {
  const root = process.env.SystemRoot || process.env.windir || 'C:\\Windows'
  return join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

export class Notifier {
  /**
   * @param {ReturnType<import('./settings.js').resolveSettings>} settings
   * @param {(level: string, message: string) => void} log
   */
  constructor(settings, log) {
    this.settings = settings
    this.log = typeof log === 'function' ? log : () => {}
    this.active = new Map()
    this.queue = []
    this.timer = undefined
    this.sequence = 0
    this.lastSpawnAt = 0
    this.disposed = false
    this.broken = false
    this.ready = this.prepareDirectory()
  }

  async prepareDirectory() {
    try {
      await mkdir(PAYLOAD_DIR, { recursive: true })
    } catch (error) {
      this.broken = true
      this.log('warn', `cannot prepare payload directory ${PAYLOAD_DIR}: ${error?.message ?? error}`)
    }
  }

  /** Queue one card. Never throws: a failed notification must not affect the agent. */
  push(card) {
    if (this.disposed || this.broken || !card) return
    if (this.queue.length >= 12) {
      // A backlog this large means the desktop is not being watched; drop the
      // oldest queued cards instead of alerting minutes later.
      this.queue.splice(0, this.queue.length - 8)
    }
    this.queue.push(card)
    this.pump()
  }

  pump() {
    if (this.disposed || this.broken) return
    if (this.timer !== undefined) return
    this.prune()
    if (this.queue.length === 0) return
    const now = Date.now()
    const wait = Math.max(0, this.lastSpawnAt + this.settings.minIntervalMs - now)
    if (wait > 0) {
      this.schedule(wait)
      return
    }
    if (this.active.size >= this.settings.maxVisible) {
      const earliest = Math.min(...[...this.active.values()].map((entry) => entry.expiresAt))
      this.schedule(Math.max(120, earliest - now))
      return
    }
    this.spawnNow()
    if (this.queue.length > 0) {
      this.schedule(Math.max(60, this.settings.minIntervalMs))
    }
  }

  schedule(delayMs) {
    if (this.timer !== undefined) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.pump()
    }, Math.max(20, delayMs))
    if (typeof this.timer.unref === 'function') this.timer.unref()
  }

  prune() {
    const now = Date.now()
    for (const [id, entry] of this.active) {
      if (entry.expiresAt <= now) this.active.delete(id)
    }
  }

  spawnNow() {
    const card = this.queue.shift()
    if (!card) return
    const id = ++this.sequence
    const stackIndex = this.active.size
    this.active.set(id, { expiresAt: Date.now() + this.settings.durationMs + CARD_GRACE_MS })
    this.lastSpawnAt = Date.now()
    void this.render(id, card, stackIndex)
  }

  async render(id, card, stackIndex) {
    const payloadPath = join(PAYLOAD_DIR, `card-${Date.now()}-${randomBytes(4).toString('hex')}.json`)
    const payload = {
      kind: card.kind,
      title: card.title,
      body: card.body,
      meta: card.meta,
      glyph: card.glyph,
      accent: card.accent,
      position: this.settings.position,
      durationMs: this.settings.durationMs,
      sound: this.settings.sound,
      soundName: this.settings.soundName,
      clickAction: this.settings.clickAction,
      url: this.settings.url,
      processName: this.settings.processName,
      stackIndex,
    }

    try {
      await this.ready
      await writeFile(payloadPath, JSON.stringify(payload), 'utf8')
    } catch (error) {
      this.active.delete(id)
      this.log('warn', `cannot write notification payload: ${error?.message ?? error}`)
      return
    }

    let child
    try {
      child = spawn(
        powershellPath(),
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-WindowStyle',
          'Hidden',
          '-File',
          RENDERER,
          '-Payload',
          payloadPath,
        ],
        { windowsHide: true, stdio: 'ignore' },
      )
    } catch (error) {
      this.active.delete(id)
      void rm(payloadPath, { force: true })
      this.log('warn', `cannot start PowerShell: ${error?.message ?? error}`)
      return
    }

    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      this.active.delete(id)
      void rm(payloadPath, { force: true })
      if (result && result.code !== 0) {
        this.log('warn', `card renderer exited with code ${result.code}${result.stderr ? `: ${result.stderr}` : ''}`)
      }
      if (this.queue.length > 0) this.pump()
    }

    const timeout = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* already gone */
      }
      finish({ code: 0 })
    }, this.settings.durationMs + SPAWN_TIMEOUT_MS)
    if (typeof timeout.unref === 'function') timeout.unref()

    child.on('error', (error) => {
      finish({ code: -1, stderr: error?.message ?? String(error) })
    })
    child.on('exit', (code) => finish({ code: code ?? 0 }))

    // Free the visual slot when the card is expected to disappear, not when the
    // PowerShell process happens to exit.
    const release = setTimeout(() => {
      this.active.delete(id)
      if (this.queue.length > 0) this.pump()
    }, this.settings.durationMs + CARD_GRACE_MS)
    if (typeof release.unref === 'function') release.unref()
  }

  dispose() {
    this.disposed = true
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    this.queue.length = 0
    this.active.clear()
  }
}

export { RENDERER }
