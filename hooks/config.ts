import type { PluginOptions } from 'claude-code'

export type Config = {
  toastAt: number
  notifyAt: number
  notify: boolean
  warnAt: number
  dangerAt: number
  showPies: boolean
  showModel: boolean
  showEffort: boolean
  showCompact: boolean
  showReset: boolean
  showPace: boolean
  showDelta: boolean
}

export const DEFAULTS: Config = {
  toastAt: 80,
  notifyAt: 95,
  notify: true,
  warnAt: 70,
  dangerAt: 90,
  showPies: true,
  showModel: true,
  showEffort: true,
  showCompact: true,
  showReset: true,
  showPace: true,
  showDelta: true,
}

export const readConfig = (options: PluginOptions | undefined): Config => {
  const config = { ...DEFAULTS }
  for (const key of Object.keys(DEFAULTS) as (keyof Config)[]) {
    const value = options?.[key]
    if (typeof value === typeof DEFAULTS[key]) (config as Record<string, unknown>)[key] = value
  }
  // Thresholds given the wrong way round: keep the lower one first.
  if (config.warnAt > config.dangerAt) [config.warnAt, config.dangerAt] = [config.dangerAt, config.warnAt]
  if (config.toastAt > config.notifyAt) [config.toastAt, config.notifyAt] = [config.notifyAt, config.toastAt]
  return config
}
