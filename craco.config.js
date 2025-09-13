const path = require('path');

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Add fallbacks for Node.js core modules
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        "path": require.resolve("path-browserify"),
        "util": require.resolve("util/"),
        "url": require.resolve("url/"),
        "buffer": require.resolve("buffer/"),
        "process": require.resolve("process/browser"),
        "fs": false,
        "net": false,
        "tls": false,
        "crypto": false,
        "stream": false,
        "http": false,
        "https": false,
        "zlib": false,
        "querystring": false
      };

      // Add plugins for polyfills
      const webpack = require('webpack');
      webpackConfig.plugins = [
        ...webpackConfig.plugins,
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
          process: 'process/browser'
        })
      ];

      // Ignore server-only modules in browser builds
      webpackConfig.externals = {
        ...webpackConfig.externals,
        'express': 'commonjs express',
        'fs': 'commonjs fs',
        'path': 'commonjs path'
      };

      return webpackConfig;
    }
  },
  devServer: {
    // Ensure dev server works with polyfills
    setupMiddlewares: (middlewares, devServer) => {
      return middlewares;
    }
  }
};