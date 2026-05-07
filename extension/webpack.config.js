const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: process.env.NODE_ENV || 'development',
  devtool: 'cheap-module-source-map',

  entry: {
    sidepanel: './src/sidepanel/index.tsx',
    background: './src/background/index.ts',
    'content-tradingview': './src/content/tradingview.ts',
    'content-robinhood': './src/content/robinhood.ts',
    'content-coinbase': './src/content/coinbase.ts',
    'content-webull': './src/content/webull.ts',
  },

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },

  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              '@babel/preset-env',
              '@babel/preset-react',
              '@babel/preset-typescript',
            ],
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },

  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },

  plugins: [
    new HtmlWebpackPlugin({
      template: './src/sidepanel/index.html',
      filename: 'sidepanel.html',
      chunks: ['sidepanel'],
    }),
    new CopyPlugin({
      patterns: [
        { from: 'public/manifest.json', to: 'manifest.json' },
        {
          from: 'public/icons',
          to: 'icons',
          noErrorOnMissing: true,
        },
      ],
    }),
  ],
};
