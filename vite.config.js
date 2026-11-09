import { defineConfig } from 'vite';
import svgSpritemap from '@spiriit/vite-plugin-svg-spritemap';

export default defineConfig({
	plugins: [svgSpritemap('./src/icons/*.svg')],
	css: {
		preprocessorOptions: {
			styl: { imports: ['nib'] }
		}
	},
	build: { sourcemap: true }
});
