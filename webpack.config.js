var webpack = require('webpack');

module.exports = {
	output: {
		filename: 'app.js'
	},
	externals: {
		'window': 'window'
	},
	module: {
		rules: [
			{
				test: /\.js$/,
				exclude: /(node_modules)/,
				loader: 'babel-loader',
				options: {
					presets: [
						[
							'@babel/preset-env',
							{
								'useBuiltIns': 'usage',
								'corejs': 3
							}
						]
					]
				}
			}
		]
	},
	devtool: 'source-map'
};
