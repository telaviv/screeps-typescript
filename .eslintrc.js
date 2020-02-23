module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    parserOptions: {
        project: './tsconfig.json',
    },
    plugins: ['@typescript-eslint'],
    extends: [
        'airbnb-typescript/base',
        'plugin:@typescript-eslint/eslint-recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
    ],
    rules: {
        'arrow-parens': ['error', 'as-needed'],
        'arrow-body-style': ['off'],
        'import/no-unresolved': ['off'],
        'import/prefer-default-export': ['off'],
        'implicit-arrow-linebreak': 'off',
        'linebreak-style': ['warn', 'unix'],
        'max-len': ['error', { code: 120 }],
        'no-extra-semi': 'off',
        'no-console': 'off',
        'no-confusing-arrow': 'off',
        'no-continue': 'off',
        'no-param-reassign': ['error', { props: false }],
        'no-plusplus': 'off',
        'no-restricted-syntax': ['off'],
        'object-curly-newline': ['off'],
        'linebreak-style': ['error', 'unix'],
        'padded-blocks': ['off'],
        'prefer-destructuring': 'off',
        'space-before-function-paren': 'off',
        'operator-linebreak': ['off'],
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/no-use-before-define': 'off',
        '@typescript-eslint/semi': ['warn', 'never'],
        '@typescript-eslint/indent': ['error', 4],
        '@typescript-eslint/unbound-method': 'off',
        '@typescript-eslint/member-delimiter-style': [
            'error',
            {
                multiline: { delimiter: 'none' },
            },
        ],
    },
    overrides: [
        {
            files: ['**/*.spec.ts'],
            rules: {
                'padded-blocks': 'off', // I like padding my describe blocks
                '@typescript-eslint/unbound-method': 'off', // Complains about expect(instance.method)...
            },
        },
    ],
}
