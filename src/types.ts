export type Environment = Record<string, string | undefined>

export type ResolveOptions = {
  /** Also replace values in the input environment. Default false; always return a copy. */
  readonly inPlace?: boolean
  /** Execute whole-value $(command) expressions using /bin/sh. Default false. */
  readonly commands?: boolean
  /** Per-command timeout in milliseconds. Default 30000. */
  readonly commandTimeoutMs?: number
}
