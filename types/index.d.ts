export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Segment = { name: string; tokens: number; color: string }

export type Snapshot = {
  tokens?: number
  window: number
  percent?: number
  limits: Limit[]
  usd?: number
  /** Used categories, largest first, as /context and the usage popover colour them. */
  segments: Segment[]
  /** The auto-compact buffer, drawn after the used segments in a darker gray. */
  buffer?: number
  autoCompactAt?: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { snapshot: Snapshot | null; isOpen: boolean }
  }
}
