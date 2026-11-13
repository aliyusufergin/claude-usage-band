export type Limit = { kind: string; percent: number; resetsAt?: string }

export type Snapshot = {
  contextPercent?: number
  limits: Limit[]
}

export type ModelInfo = { model?: string; effort?: string }

/** The person's view choices from /usage-band, kept across sessions too. */
export type Prefs = { isHidden: boolean }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': {
      snap: Snapshot | null
      model: ModelInfo
      prefs: Prefs
    }
  }
}
