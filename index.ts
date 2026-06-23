import { registerRootComponent } from 'expo';
import notifee, { EventType } from '@notifee/react-native';

import App from './App';

// Handler de background do notifee — necessário para o alarme do desperta porteiro
// funcionar com o app fechado/bloqueado. Deve ser registrado no nível raiz.
notifee.onBackgroundEvent(async ({ type, detail }) => {
  // O full-screen intent abre o app automaticamente; a abertura da tela de alarme
  // é feita pelo App via getInitialNotification. Aqui apenas tratamos o dismiss.
  if (type === EventType.DISMISSED) {
    // Notificação ongoing não deve ser descartável, mas garantimos o cancelamento limpo
    const id = detail.notification?.id;
    if (id) await notifee.cancelNotification(id);
  }
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
