export type Limit = { kind: string; percent: number; resetsAt?: string }

export type Snapshot = {
  contextPercent?: number
  contextTokens?: number
  contextWindow: number
  limits: Limit[]
  costUsd?: number
}

export type ModelInfo = { model?: string; effort?: string }

/** The person's view choices from /usage-band, kept across sessions too. */
export type Prefs = { isHidden: boolean; isCompact: boolean }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': {
      snap: Snapshot | null
      model: ModelInfo
      /** Token count auto-compaction runs at; null when off or unknown. */
      compactAt: number | null
      prefs: Prefs
    }
  }
}
