// Metro configuration. Everything here is web-only: native bundles (Hermes, EAS Update) resolve exactly as before.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The web build splits every route into its own chunk (`extra.router.asyncRoutes` in app.config.ts). While a chunk
// downloads, expo-router renders its SuspenseFallback, which in a production build is `null`: a blank screen on a slow
// connection. expo-router offers no hook to replace it in async mode, so on web only we point its internal
// `./views/SuspenseFallback` import (from useScreens.js) at our own loading view. If a future expo-router moves that
// file the alias simply stops matching and the stock fallback is used again; nothing breaks.
const ROUTE_FALLBACK = path.resolve(__dirname, 'src/components/RouteLoadingFallback.tsx');
const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === 'web' &&
    moduleName === './views/SuspenseFallback' &&
    /[\\/]expo-router[\\/]build[\\/]useScreens\.js$/.test(context.originModulePath)
  ) {
    return { type: 'sourceFile', filePath: ROUTE_FALLBACK };
  }
  // `react-native-url-polyfill/auto` only installs its URL implementation when Platform.OS !== 'web' (browsers have a
  // native URL), but its ~20 KB are bundled anyway. An empty module on web is therefore behaviour-neutral.
  if (platform === 'web' && moduleName === 'react-native-url-polyfill/auto') {
    return { type: 'empty' };
  }
  return (upstreamResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
