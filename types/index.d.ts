export type Limit = { kind: string; percent: number; resetsAt?: string }

export type Snapshot = {
  contextPercent?: number
  contextTokens?: number
  contextWindow: number
  limits: Limit[]
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
      /** Context tokens when the main loop's current turn began. */
      turnBase: number | null
      prefs: Prefs
    }
  }
}
