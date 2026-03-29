import reactPlugin from 'eslint-plugin-react';

export default [
    {
        files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
        plugins: {
            react: reactPlugin,
        },
        languageOptions: {
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                ecmaFeatures: {
                    jsx: true,
                },
            },
            globals: {
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                process: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
            }
        },
        rules: {
            'react/jsx-uses-react': 'error',
            'react/jsx-uses-vars': 'error',
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
    },
    {
        ignores: ['dist/**', 'node_modules/**', 'server.js'],
    }
];
