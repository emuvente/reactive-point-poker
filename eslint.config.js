import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';

export default defineConfig([
	{ ignores: ['dist/'] },
	{
		files: ['**/*.js'],
		plugins: { js },
		extends: ['js/recommended'],
		languageOptions: { globals: globals.browser },
		rules: {
			'indent': ['error', 'tab'],
			'linebreak-style': ['error', 'unix'],
			'prefer-template': 'error',
			'quotes': ['error', 'single', { allowTemplateLiterals: true }],
			'semi': ['error', 'always']
		}
	},
	{
		files: ['*.config.js'],
		languageOptions: { globals: globals.node }
	}
]);
