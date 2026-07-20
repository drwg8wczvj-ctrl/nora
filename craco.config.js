// Wraps react-scripts (no eject) purely to give the `docx` package's
// CJS build somewhere to resolve its unused Node-builtin requires (it
// references node:fs/stream in code paths Packer.toBlob() never actually
// takes in a browser) — webpack 5 dropped automatic node polyfills, so
// without this the production build fails at compile time even though
// nothing here is used at runtime.
const webpack = require("webpack");

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        fs: false,
        stream: false,
        path: false,
      };
      // Webpack 5 treats "node:fs" as its own URI scheme, not a bare
      // specifier — resolve.fallback alone doesn't catch it. Strip the
      // "node:" prefix so it falls through to the fallback map above.
      webpackConfig.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, "");
        })
      );
      return webpackConfig;
    },
  },
};
