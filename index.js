import { registerRootComponent } from 'expo';
import { AppRegistry, Platform } from 'react-native';
import App from './src/App';

registerRootComponent(App);

/*
 * The ring link's background task.
 *
 * Registered here, at the entry point, because after a phone restart the
 * foreground service starts a JS context with no app in front of it: this file
 * runs, and the task must already be registered by the time the service asks
 * for it. Registering it inside a screen or a provider would be too late.
 *
 * The name must match RingLinkForegroundService.TASK_NAME.
 */
if (Platform.OS === 'android') {
  AppRegistry.registerHeadlessTask(
    'RingLinkTask',
    () => require('./src/soulsync/ring/ringLinkTask').default,
  );
}
