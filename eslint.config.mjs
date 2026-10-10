import tseslint from 'typescript-eslint'

const runtimeFiles = ['src/**/*.ts', 'bin/**/*.ts', 'scripts/**/*.mjs', '*.config.mjs']
const typedRules = Object.assign({}, ...tseslint.configs.recommendedTypeChecked.map(config => config.rules))

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', '.vitest/**'] },
  {
    files: runtimeFiles,
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: Object.fromEntries([
        'process', 'console', 'Buffer', 'URL', 'URLSearchParams', 'TextDecoder',
        'AbortSignal', 'setTimeout', 'clearTimeout', 'fetch'
      ].map(name => [name, 'readonly']))
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-empty': 'error',
      'no-unreachable': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'max-params': ['error', 3],
      // Preserve the existing compact guards; multiline guards require braces.
      curly: ['error', 'multi-line'],
      'no-restricted-syntax': ['error',
        { selector: 'BinaryExpression[operator=/^(===|!==)$/][left.property.name="length"][right.value=0]', message: 'Use length < 1 or length > 0 for empty/nonempty checks.' },
        { selector: 'CatchClause[param.type="Identifier"][param.name!="err"]', message: 'Name caught exceptions err.' }
      ]
    }
  },
  {
    files: ['src/**/*.ts', 'bin/**/*.ts'],
    languageOptions: { parser: tseslint.parser, parserOptions: { project: ['./tsconfig.json', './tsconfig.spec.json'] } },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      ...typedRules,
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none', ignoreRestSiblings: true }],
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      'no-restricted-syntax': ['error',
        { selector: 'BinaryExpression[operator=/^(===|!==)$/][left.property.name="length"][right.value=0]', message: 'Use length < 1 or length > 0 for empty/nonempty checks.' },
        { selector: 'CatchClause[param.type="Identifier"][param.name!="err"]', message: 'Name caught exceptions err.' },
        { selector: 'TSPropertySignature:not([readonly=true])', message: 'Use readonly properties for public options and results.' },
        { selector: 'TSEnumDeclaration', message: 'Use a union or an as-const map.' },
        { selector: 'ExportDefaultDeclaration', message: 'Use named public exports.' }
      ]
    }
  }
]
