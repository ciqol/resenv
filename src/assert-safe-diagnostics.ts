import { debuglog } from 'node:util'
import { ResenvError } from './errors.js'

const childProcessDebug = debuglog('child_process')

export function assertSafeDiagnostics (): void {
  // Node logs spawn options, including stdin and env, before starting a child.
  // Test Node's actual debug state, including wildcard selectors and caching.
  if (childProcessDebug.enabled) {
    throw new ResenvError('UNSAFE_DEBUG_LOGGING', 'Disable child_process in NODE_DEBUG before resolving secrets or starting a child. Use NODE_DEBUG=ciqol:resenv for value-free diagnostics.')
  }
}
