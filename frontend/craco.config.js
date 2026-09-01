const path = require("path");

/**
 * Build configuration.
 *
 * Two things beyond the CRA defaults:
 *   1. the `@/` alias for absolute imports from src/
 *   2. silencing source-map warnings from dependencies that ship broken maps
 */
module.exports = {
  eslint: {
    // Linting runs as its own step (`yarn lint`, eslint.config.mjs) so the
    // dev server stays fast and CI gets one authoritative result.
    enable: false,
  },
  webpack: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    configure: (webpackConfig) => {
      // html5-qrcode publishes source maps pointing at .ts files it doesn't
      // ship. Without this the build prints ~25 warnings that hide real ones.
      const sourceMapRule = webpackConfig.module.rules.find(
        (rule) => rule.enforce === "pre" && String(rule.loader).includes("source-map-loader"),
      );
      if (sourceMapRule) {
        sourceMapRule.exclude = [/node_modules[\\/]html5-qrcode/];
      }

      webpackConfig.watchOptions = {
        ...webpackConfig.watchOptions,
        ignored: ["**/node_modules/**", "**/.git/**", "**/build/**"],
      };
      return webpackConfig;
    },
  },
  devServer: (devServerConfig) => ({
    ...devServerConfig,
    // webpack-dev-server 5 removed the v4 middleware hooks CRA still passes.
    onAfterSetupMiddleware: undefined,
    onBeforeSetupMiddleware: undefined,
    server: devServerConfig.https ? "https" : "http",
    https: undefined,
  }),
};
