import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'scripts/**/*.spec.mjs'],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    api: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/types.ts'],
      reporter: ['text', 'lcov']
    }
  }
})
