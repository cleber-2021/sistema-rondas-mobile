// App.tsx
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LogBox, Platform, ActivityIndicator, View, Modal } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { registrarHandlerSessaoExpirada } from './src/services/api';
import DespertaAlarm from './src/screens/DespertaAlarm';
import { carregarEAgendarDespertas } from './src/services/despertaService';

import Login from './src/screens/Login';
import SupervisorHome from './src/screens/SupervisorHome';
import SupervisorDashboard from './src/screens/SupervisorDashboard';
import SupervisorOcorrencias from './src/screens/SupervisorOcorrencias';
import ResponderChecklist from './src/screens/ResponderChecklist';
import VigilanteHome from './src/screens/VigilanteHome';
import VigilanteRondas from './src/screens/VigilanteRondas';
import VigilantePassagem from './src/screens/VigilantePassagem';
import VigilanteOcorrencia from './src/screens/VigilanteOcorrencia';
import SupervisorPanico from './src/screens/SupervisorPanico';

LogBox.ignoreLogs(['expo-notifications: Android Push notifications']);

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // Não exibe notificações de ronda se não houver sessão ativa
    const token = await AsyncStorage.getItem('@RondasApp:token');
    const tipo = notification.request.content.data?.tipo as string | undefined;
    if (!token && (tipo === 'RONDA_LIBERADA' || tipo === 'DESPERTA_PORTEIRO')) {
      return { shouldShowAlert: false, shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
    }
    return { shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true };
  },
});

const BACKGROUND_PANICO_TASK = 'background-panico-check';

TaskManager.defineTask(BACKGROUND_PANICO_TASK, async () => {
  try {
    const token = await AsyncStorage.getItem('@RondasApp:token');
    const userString = await AsyncStorage.getItem('@RondasApp:user');

    if (!token || !userString) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const usuario = JSON.parse(userString);

    if (usuario.perfil !== 'SUPERVISOR') {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    const res = await api.get('/ocorrencias/alertas/panico');

    if (res.data?.existe_panico) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🆘 ALERTA CRÍTICO DE PÂNICO!',
          body: `Operador: ${res.data.nome_vigilante || 'Em Campo'}\nLocal: ${res.data.nome_local || 'Desconhecido'}`,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          // @ts-ignore
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
  const [loading, setLoading] = useState(true);
  const [rotaInicial, setRotaInicial] = useState('Login');
  const navigationRef = React.useRef<any>(null);

  // Estado do alarme de desperta porteiro
  const [despertaAtiva, setDespertaAtiva] = useState<{ id: string; nome: string; slotKey: string } | null>(null);

  // ─── LISTENER GLOBAL DE TOQUE NA NOTIFICAÇÃO ──────────────────────────────
  // Quando o vigilante toca na notificação "⏰ Hora da Ronda!", este listener
  // lê o campo `data.rota_id` que foi embutido na notificação e navega
  // diretamente para VigilanteRondas passando o ID da rota a ser iniciada.
  // ─── LISTENER GLOBAL DE TOQUE NA NOTIFICAÇÃO ──────────────────────────────
  // ─── HANDLER GLOBAL DE SESSÃO EXPIRADA ────────────────────────────────────
  // Quando o interceptor de resposta da API detecta 401/403 (token expirado),
  // ele chama esta função, que reseta a navegação de volta para o Login.
  useEffect(() => {
    registrarHandlerSessaoExpirada(() => {
      const irParaLogin = () => {
        if (navigationRef.current?.isReady()) {
          navigationRef.current.reset({ index: 0, routes: [{ name: 'Login' }] });
        } else {
          setTimeout(irParaLogin, 200);
        }
      };
      irParaLogin();
    });
  }, []);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as any;
      
      // 1. Criamos a função FORA dos IFs para que todos possam usá-la, 
      // e preparamos ela para receber o nome da rota e os parâmetros dinamicamente.
      const tentarNavegar = (rota: string, params?: any) => {
        if (navigationRef.current?.isReady()) {
          navigationRef.current.navigate(rota, params);
        } else {
          setTimeout(() => tentarNavegar(rota, params), 200);
        }
      };

      // 2. Agora fazemos as checagens chamando a função recém-criada
      if (data?.tipo === 'RONDA_LIBERADA' && data?.rota_id) {
        // Só navega para rondas se for vigilante — supervisor não recebe estas notificações
        AsyncStorage.getItem('@RondasApp:user').then(userStr => {
          if (!userStr) return;
          const u = JSON.parse(userStr);
          if (u.perfil === 'POSTO_SERVICO') {
            tentarNavegar('VigilanteRondas', { rota_id_auto: data.rota_id });
          }
        });
      }
      else if (data?.tipo === 'PANICO') {
        tentarNavegar('SupervisorPanico');
      }
      else if (data?.tipo === 'DESPERTA_PORTEIRO') {
        setDespertaAtiva({ id: data.despertaId, nome: data.nome, slotKey: data.slotKey });
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    async function configurar() {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Permissão de notificações negada.');
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('rondas-default', {
          name: 'Notificações de Rondas',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#2563eb',
        });

        await Notifications.setNotificationChannelAsync('rondas-panico', {
          name: '🆘 Alertas de Pânico',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 500, 200, 500, 200, 500],
          lightColor: '#dc2626',
          sound: 'default',
          bypassDnd: true,
        });

        await Notifications.setNotificationChannelAsync('desperta-porteiro', {
          name: '🔔 Desperta Porteiro',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 1000, 500, 1000, 500],
          lightColor: '#f59e0b',
          sound: 'default',
          bypassDnd: true,
        });
      }

      try {
        await BackgroundFetch.registerTaskAsync(BACKGROUND_PANICO_TASK, {
          minimumInterval: 60,
          stopOnTerminate: false,
          startOnBoot: true,
        });
        console.log('✅ Background fetch registrado.');
      } catch (e) {
        console.warn('Background fetch não pôde ser registrado:', e);
      }
    }

    async function verificarAutenticacao() {
      try {
        const token = await AsyncStorage.getItem('@RondasApp:token');
        const userString = await AsyncStorage.getItem('@RondasApp:user');

        if (token && userString) {
          const usuario = JSON.parse(userString);
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

          if (usuario.perfil === 'SUPERVISOR') {
            setRotaInicial('SupervisorHome');
          } else if (usuario.perfil === 'POSTO_SERVICO') {
            setRotaInicial('VigilanteHome');
            // Agenda despertadores ao inicializar como vigilante/porteiro
            carregarEAgendarDespertas().catch(() => {});
          }
        }
      } catch (e) {
        console.log("Erro na reidratação:", e);
      } finally {
        setLoading(false);
      }
    }

    configurar();
    verificarAutenticacao();

    return () => {
      BackgroundFetch.unregisterTaskAsync(BACKGROUND_PANICO_TASK).catch(() => {});
    };
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e293b' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <>
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator initialRouteName={rotaInicial} screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={Login} />

          {/* Rotas Supervisor */}
          <Stack.Screen name="SupervisorHome" component={SupervisorHome} />
          <Stack.Screen name="SupervisorDashboard" component={SupervisorDashboard} />
          <Stack.Screen name="SupervisorOcorrencias" component={SupervisorOcorrencias} />
          <Stack.Screen name="SupervisorPanico" component={SupervisorPanico} />
          <Stack.Screen name="ResponderChecklist" component={ResponderChecklist} />

          {/* Rotas Vigilante */}
          <Stack.Screen name="VigilanteHome" component={VigilanteHome} />
          <Stack.Screen name="VigilanteRondas" component={VigilanteRondas} />
          <Stack.Screen name="VigilantePassagem" component={VigilantePassagem} />
          <Stack.Screen name="VigilanteOcorrencia" component={VigilanteOcorrencia} />
        </Stack.Navigator>
      </NavigationContainer>

      {/* Overlay de Desperta Porteiro — aparece sobre qualquer tela */}
      {despertaAtiva && (
        <Modal visible animationType="slide" statusBarTranslucent>
          <DespertaAlarm
            despertaId={despertaAtiva.id}
            nome={despertaAtiva.nome}
            slotKey={despertaAtiva.slotKey}
            onConfirmado={() => setDespertaAtiva(null)}
          />
        </Modal>
      )}
    </>
  );
}
