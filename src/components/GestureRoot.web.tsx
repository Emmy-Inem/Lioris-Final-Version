import { View } from 'react-native';

// Web only: on the web react-native-gesture-handler does not need a root view (its web build never reads the root
// context), so the root layout renders a plain View and the library, ~240 KB raw, is no longer part of the first-load
// bundle. It is still bundled with the only screen that uses it (the swipe-to-archive rows in the messages list).
export const GestureHandlerRootView = View;
