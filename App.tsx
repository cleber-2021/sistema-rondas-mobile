import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LogBox, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import Login from './src/screens/Login';

// Telas do Supervisor
import SupervisorHome from './src/screens/SupervisorHome';
import SupervisorDashboard from './src/screens/SupervisorDashboard';
import SupervisorOcorrencias from './src/screens/SupervisorOcorrencias';
import ResponderChecklist from './src/screens/ResponderChecklist';

// Novas Telas do Vigilante
import VigilanteHome from './src/screens/VigilanteHome';
import VigilanteRondas from './src/screens/VigilanteRondas';
import VigilantePassagem from './src/screens/VigilantePassagem';
import VigilanteOcorrencia from './src/screens/VigilanteOcorrencia';

LogBox.ignoreLogs(['expo-notifications: Android Push notifications']);

// Configuração do comportamento das notificações
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const Stack = createNativeStackNavigator();

export default function App() {
  
  // Registrar o canal para Android
  useEffect(() => {
    async function configurarNotificacoes() {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('rondas-default', {
          name: 'Notificações de Rondas',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }
    }
    configurarNotificacoes();
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={Login} />
        
        {/* Rotas Supervisor */}
        <Stack.Screen name="SupervisorHome" component={SupervisorHome} />
        <Stack.Screen name="SupervisorDashboard" component={SupervisorDashboard} />
        <Stack.Screen name="SupervisorOcorrencias" component={SupervisorOcorrencias} />
        <Stack.Screen name="ResponderChecklist" component={ResponderChecklist} />

        {/* Rotas Vigilante */}
        <Stack.Screen name="VigilanteHome" component={VigilanteHome} />
        <Stack.Screen name="VigilanteRondas" component={VigilanteRondas} />
        <Stack.Screen name="VigilantePassagem" component={VigilantePassagem} />
        <Stack.Screen name="VigilanteOcorrencia" component={VigilanteOcorrencia} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}