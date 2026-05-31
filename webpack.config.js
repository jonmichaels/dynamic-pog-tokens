const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  entry: {
    'scripts/module': './scripts/main.js',
    'styles/module': './scss/module.scss',
  },
  output: {
    path: path.resolve(__dirname),
    filename: '[name].js',
    publicPath: '/modules/dynamic-pog-tokens/',
  },
  module: {
    rules: [
      {
        test: /\.scss$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'],
      },
    ],
  },
  plugins: [
    new MiniCssExtractPlugin({ filename: '[name].css' }),
  ],
  devtool: 'source-map',
};
