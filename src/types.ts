export type Environment = Record<string, string | undefined>

export type ResolveOptions = {
  /** Resolve doppler://project/config/SECRET_NAME through HTTPS. Default false. */
  readonly doppler?: boolean
  /** Execute whole-value $(command) expressions using /bin/sh. Default false. */
  readonly commands?: boolean
  /** Per-command timeout in milliseconds. Default 30000. */
  readonly commandTimeoutMs?: number
}
