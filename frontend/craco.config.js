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
  devServer: (devServerConfig) => {
    // webpack-dev-server 5 validates its options strictly and rejects the v4 keys
    // CRA still passes. They have to be *removed*, not set to undefined.
    const {
      onAfterSetupMiddleware,
      onBeforeSetupMiddleware,
      https,
      ...config
    } = devServerConfig;

    return {
      ...config,
      server: https ? "https" : "http",
      // Serve to other devices on the LAN (phones, a second laptop) as well as
      // localhost. Dev only — nothing here runs in production.
      host: "0.0.0.0",
      allowedHosts: "all",
      // The hot-reload socket is left alone on purpose: webpack-dev-server infers
      // it from window.location, which is what makes opening the page by IP work.

      // Serve the API from the same origin as the site, mirroring production
      // (one hostname, /api routed to the backend). Same-origin matters beyond
      // tidiness: Apple bakes `<origin>/api/wallet` into every Wallet pass and
      // calls back on exactly that host, and it keeps an HTTPS tunnel from
      // blocking calls to a plain-HTTP API as mixed content.
      // With this in place REACT_APP_BACKEND_URL can be left empty and the app
      // talks to a relative /api.
      proxy: [
        {
          context: ["/api"],
          target: process.env.API_TARGET || "http://127.0.0.1:8001",
          changeOrigin: false,
        },
      ],
    };
  },
};
