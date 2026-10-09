import type { GitHead } from '../types'
import { clip } from './fit'

// One call answers all four: the git dir, the common dir, the working tree's
// top and the branch ("HEAD" when detached).
export const HEAD_ARGV = [
  'git',
  'rev-parse',
  '--path-format=absolute',
  '--git-dir',
  '--git-common-dir',
  '--show-toplevel',
  '--abbrev-ref',
  'HEAD',
] as const

export const isDetached = (stdout: string) => stdout.trim().split(/\r?\n/)[3] === 'HEAD'

// A linked worktree keeps a git dir of its own under the common one; the main
// working tree's are the same.
export const parseHead = (stdout: string, sha = ''): GitHead | null => {
  const [gitDir, commonDir, top, ref] = stdout.trim().split(/\r?\n/).map(l => l.trim())
  if (!gitDir || !commonDir || !top || !ref) return null
  const branch = ref === 'HEAD' ? sha.trim() : ref
  if (!branch) return null
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
  return norm(gitDir) === norm(commonDir) ? { branch } : { branch, worktree: norm(top).split('/').pop() ?? top }
}

// The name after its last slash: "feature/NEXT-1777" is "NEXT-1777", and a
// worktree's "claude/fix-band" is "fix-band". The band shortens it further
// when the row is full, and shows the whole on hover.
export const branchName = (head: GitHead, max = 48) => clip(head.branch.split('/').pop() || head.branch, max)
