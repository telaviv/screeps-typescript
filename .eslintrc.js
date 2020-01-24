module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json'
  },
  plugins: [
    '@typescript-eslint'
  ],
  extends: [
    'airbnb-typescript/base',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking'
  ],
  rules: {
    'arrow-parens': ['error', 'as-needed'],
    'comma-dangle': ['error', 'never'],
    'import/no-unresolved': ['off'],
    'linebreak-style': ['warn', 'windows'],
    'max-len': ['error', { 'code': 120 }],
    'no-plusplus': 'off',
    'object-curly-newline': ['error', { 'multiline': true }],
    'padded-blocks': ['error', {
      'blocks': 'never',
      'classes': 'always',
      'switches': 'never'
    }]
  },
  overrides: [
    {
      'files': ['**/*.spec.ts'],
      'rules': {
        'padded-blocks': 'off', // I like padding my describe blocks
        '@typescript-eslint/unbound-method': 'off' // Complains about expect(instance.method)...
      }
    }
  ]
}
