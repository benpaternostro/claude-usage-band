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

/** The session's checkout: its branch (a short sha when detached) and, in a linked worktree, that worktree's folder name. */
export type GitHead = { branch: string; worktree?: string }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { snapshot: Snapshot | null; isOpen: boolean; cacheExpiresAt: number | null; git: GitHead | null }
  }
}
