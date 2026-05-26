// App.tsx
// ALTERAÇÕES:
//  1. Registra canal Android separado para PÂNICO (prioridade máxima + som)
//  2. Configura expo-background-fetch + expo-task-manager para polling em background
//  3. A task de background verifica pânico ativo e dispara notificação local mesmo
//     com o app fechado (fallback para quando o push do servidor não chega)

import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LogBox, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './src/services/api';

import Login from './src/screens/Login';
import SupervisorHome from './src/screens/SupervisorHome';
import SupervisorDashboard from './src/screens/SupervisorDashboard';
import SupervisorOcorrencias from './src/screens/SupervisorOcorrencias';
import ResponderChecklist from './src/screens/ResponderChecklist';
import VigilanteHome from './src/screens/VigilanteHome';
import VigilanteRondas from './src/screens/VigilanteRondas';
import VigilantePassagem from './src/screens/VigilantePassagem';
import VigilanteOcorrencia from './src/screens/VigilanteOcorrencia';

LogBox.ignoreLogs(['expo-notifications: Android Push notifications']);

// ─── Configuração de comportamento das notificações em foreground ────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ─── Nome da task de background ──────────────────────────────────────────────
const BACKGROUND_PANICO_TASK = 'background-panico-check';

/**
 * TASK DE BACKGROUND — executada pelo SO mesmo com o app fechado/minimizado.
 * 
 * O Android acorda essa task aproximadamente a cada 15 minutos (limitação do SO).
 * Para pânico em tempo real o push notification do servidor é o mecanismo principal;
 * esta task é o fallback que garante que o supervisor veja o alerta ao abrir o app.
 */
TaskManager.defineTask(BACKGROUND_PANICO_TASK, async () => {
  try {
    const token = await AsyncStorage.getItem('@RondasApp:token');
    const userString = await AsyncStorage.getItem('@RondasApp:user');

    if (!token || !userString) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const usuario = JSON.parse(userString);

    // Só supervisores precisam verificar pânico em background
    if (usuario.perfil !== 'SUPERVISOR') {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Injeta token para a chamada da API
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    const res = await api.get('/ocorrencias/alertas/panico');

    if (res.data?.existe_panico) {
      // Dispara notificação local como fallback (caso o push do servidor não tenha chegado)
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🆘 ALERTA CRÍTICO DE PÂNICO!',
          body: `Vigilante: ${res.data.nome_vigilante || 'Em Campo'}\nLocal: ${res.data.nome_local || 'Desconhecido'}`,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          // @ts-ignore — channelId é válido no Android
          channelId: 'rondas-panico',
        },
        trigger: null,
      });
    }

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (e) {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

const Stack = createNativeStackNavigator();

export default function App() {
  useEffect(() => {
    async function configurar() {
      // 1. Solicita permissão de notificações
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Permissão de notificações negada.');
      }

      if (Platform.OS === 'android') {
        // 2a. Canal padrão (checklists, avisos gerais)
        await Notifications.setNotificationChannelAsync('rondas-default', {
          name: 'Notificações de Rondas',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#2563eb',
        });

        // 2b. Canal de pânico — prioridade MÁXIMA, toca mesmo no modo não-perturbe
        await Notifications.setNotificationChannelAsync('rondas-panico', {
          name: '🆘 Alertas de Pânico',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 500, 200, 500, 200, 500],
          lightColor: '#dc2626',
          sound: 'default',
          bypassDnd: true, // Fura o modo "Não Perturbe" — crítico para emergências
        });
      }

      // 3. Registra a task de background fetch
      //    minimumInterval: 60 segundos (o Android vai respeitar ~15 min na prática)
      try {
        await BackgroundFetch.registerTaskAsync(BACKGROUND_PANICO_TASK, {
          minimumInterval: 60,
          stopOnTerminate: false,  // Continua mesmo após o app ser "swipado"
          startOnBoot: true,       // Reinicia automaticamente ao ligar o celular
        });
        console.log('✅ Background fetch registrado.');
      } catch (e) {
        console.warn('Background fetch não pôde ser registrado:', e);
      }
    }

    configurar();

    // Limpa o background fetch ao desmontar (não ocorre em produção, mas bom para dev)
    return () => {
      BackgroundFetch.unregisterTaskAsync(BACKGROUND_PANICO_TASK).catch(() => {});
    };
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