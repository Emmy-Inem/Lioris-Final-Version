module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Must stay last in the plugins array.
      'react-native-reanimated/plugin',
    ],
  };
};
