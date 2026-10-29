// Must stay the first thing the root layout evaluates on iOS/Android: react-native-gesture-handler wants to be
// imported before anything else touches gestures.
import 'react-native-gesture-handler';

export { GestureHandlerRootView } from 'react-native-gesture-handler';
