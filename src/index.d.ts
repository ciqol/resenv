export type Environment = Record<string, string | undefined>

export type ResolveOptions = {
  /** Resolve doppler://project/config/SECRET_NAME through HTTPS. Default false. */
  readonly doppler?: boolean
  /** Execute whole-value $(command) expressions using /bin/sh. Default false. */
  readonly commands?: boolean
  /** Per-command timeout in milliseconds. Default 30000. */
  readonly commandTimeoutMs?: number
}

export declare class ResenvError extends Error {
  readonly code: string
  constructor(code: string, message: string)
}

/** Return a resolved copy. Read no dotenv files and leave the input untouched. */
export declare function resolveEnv(env?: Readonly<Environment>, options?: ResolveOptions): Environment

/** Update the environment only after every enabled resolution succeeds. */
export declare function resolveEnvInPlace(env?: Environment, options?: ResolveOptions): Environment

export declare function formatError(error: unknown): string
