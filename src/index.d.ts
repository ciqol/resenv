export type Environment = Record<string, string | undefined>

export interface ResolveOptions {
  /** Resolve doppler://project/config/SECRET_NAME through HTTPS. Default false. */
  doppler?: boolean
  /** Execute whole-value $(command) expressions using /bin/sh. Default false. */
  commands?: boolean
  /** Per-command timeout in milliseconds. Default 30000. */
  commandTimeoutMs?: number
}

export declare class ResenvError extends Error {
  readonly code: string
  constructor(code: string, message: string)
}

/** Return a resolved copy. Read no dotenv files and leave the input untouched. */
export declare function resolveEnv(env?: Environment, options?: ResolveOptions): Environment

/** Update the environment only after every command and decryption succeeds. */
export declare function resolveEnvInPlace<T extends Environment>(env: T, options?: ResolveOptions): T
export declare function resolveEnvInPlace(env?: undefined, options?: ResolveOptions): Environment

export declare function formatError(error: unknown): string
