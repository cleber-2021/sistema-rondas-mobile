// App.tsx
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LogBox, Platform, ActivityIndicator, View, Modal, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, { EventType } from '@notifee/react-native';
import api, { registrarHandlerSessaoExpirada } from './src/services/api';
import DespertaAlarm from './src/screens/DespertaAlarm';
import { carregarEAgendarDespertas } from './src/services/despertaService';
import { solicitarPermissoesIniciais } from './src/services/permissoes';

import Login from './src/screens/Login';
import SupervisorHome from './src/screens/SupervisorHome';
import SupervisorDashboard from './src/screens/SupervisorDashboard';
import SupervisorVisitaDetalhe from './src/screens/SupervisorVisitaDetalhe';
import SupervisorOcorrencias from './src/screens/SupervisorOcorrencias';
import ResponderChecklist from './src/screens/ResponderChecklist';
import VigilanteHome from './src/screens/VigilanteHome';
import VigilanteRondas from './src/screens/VigilanteRondas';
import VigilantePassagem from './src/screens/VigilantePassagem';
import VigilanteOcorrencia from './src/screens/VigilanteOcorrencia';
import SupervisorPanico from './src/screens/SupervisorPanico';

LogBox.ignoreLogs(['expo-notifications: Android Push notifications']);

// Sempre exibe todas as notificacoes quando o app esta em foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
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
          title: 'ALERTA CRITICO DE PANICO!',
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

// ─── TASK DE NOTIFICAÇÃO EM BACKGROUND (push silencioso DESPERTA_SYNC) ──────────
// Quando o servidor envia um push de sincronização (ao inativar/editar desperta),
// este handler roda mesmo com o app fechado e reprograma os alarmes — cancelando
// os que saíram da lista ativa.
const BACKGROUND_NOTIFICATION_TASK = 'background-notification-sync';

TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }: any) => {
  if (error) return;
  try {
    // A estrutura do payload varia conforme a plataforma/origem
    const d =
      data?.notification?.data ??
      data?.data ??
      data?.notification?.request?.content?.data ??
      {};
    if (d?.tipo === 'DESPERTA_SYNC') {
      const token = await AsyncStorage.getItem('@RondasApp:token');
      const userString = await AsyncStorage.getItem('@RondasApp:user');
      if (token && userString) {
        const usuario = JSON.parse(userString);
        if (usuario.perfil === 'POSTO_SERVICO') {
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          await carregarEAgendarDespertas();
          console.log('[Sync] Desperta re-sincronizado via push.');
        }
      }
    }
  } catch (e) {
    console.log('[Sync] Erro no handler de sync:', e);
  }
});

const Stack = createNativeStackNavigator();

export default function App() {
  const [loading, setLoading] = useState(true);
  const [rotaInicial, setRotaInicial] = useState('Login');
  const navigationRef = React.useRef<any>(null);

  const [despertaAtiva, setDespertaAtiva] = useState<{ id: string; nome: string; slotKey: string; disparoEm?: string } | null>(null);

  // Hook recomendado pelo Expo: retorna a última resposta de notificação,
  // inclusive quando o app é aberto a partir de fechado (cold start).
  const ultimaResposta = Notifications.useLastNotificationResponse();
  const respostaProcessada = React.useRef<string | null>(null);

  // Ao abrir o app, solicita todas as permissões necessárias (localização,
  // câmera, notificações, galeria) numa sequência única de diálogos.
  useEffect(() => {
    solicitarPermissoesIniciais().catch(() => {});
  }, []);

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

  // Processa a resposta de uma notificação (toque do usuário)
  function processarRespostaNotificacao(response: Notifications.NotificationResponse) {
    const data = response.notification.request.content.data as any;

    const tentarNavegar = (rota: string, params?: any) => {
      if (navigationRef.current?.isReady()) {
        navigationRef.current.navigate(rota, params);
      } else {
        setTimeout(() => tentarNavegar(rota, params), 200);
      }
    };

    if (data?.tipo === 'RONDA_LIBERADA' && data?.rota_id) {
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
      setDespertaAtiva({ id: data.despertaId, nome: data.nome, slotKey: data.slotKey, disparoEm: data.disparoEm });
    }
  }

  // Processa a resposta vinda do hook (cobre cold start e app em background/aberto).
  // Dedup por identificador para não reabrir o mesmo alarme duas vezes.
  useEffect(() => {
    if (!ultimaResposta) return;
    const id = ultimaResposta.notification.request.identifier;
    if (respostaProcessada.current === id) return;
    respostaProcessada.current = id;
    console.log('[Notif] Resposta recebida:', ultimaResposta.notification.request.content.data);
    processarRespostaNotificacao(ultimaResposta);
  }, [ultimaResposta]);

  // Listener adicional para taps com o app já aberto em primeiro plano
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const id = response.notification.request.identifier;
      if (respostaProcessada.current === id) return;
      respostaProcessada.current = id;
      processarRespostaNotificacao(response);
    });
    return () => subscription.remove();
  }, []);

  // Push de sincronização recebido com o app em primeiro plano
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(async (notification) => {
      const d = notification.request.content.data as any;
      if (d?.tipo === 'DESPERTA_SYNC') {
        const userString = await AsyncStorage.getItem('@RondasApp:user');
        if (!userString) return;
        const usuario = JSON.parse(userString);
        if (usuario.perfil === 'POSTO_SERVICO') {
          carregarEAgendarDespertas().catch(() => {});
        }
      }
    });
    return () => sub.remove();
  }, []);

  // ─── EVENTOS DO NOTIFEE (alarme do desperta porteiro) ─────────────────────
  // Abre a tela de alarme quando o full-screen intent dispara (app aberto) ou
  // quando o app é iniciado pela notificação de alarme (estava fechado/bloqueado).
  useEffect(() => {
    function abrirAlarme(data: any) {
      if (data?.tipo !== 'DESPERTA_PORTEIRO') return;
      setDespertaAtiva({
        id: data.despertaId,
        nome: data.nome,
        slotKey: data.slotKey,
        disparoEm: data.disparoEm,
      });
    }

    // App aberto pelo alarme (estava fechado)
    notifee.getInitialNotification().then(initial => {
      if (initial?.notification?.data) abrirAlarme(initial.notification.data);
    });

    // Alarme disparado/tocado com o app em primeiro plano
    const unsubscribe = notifee.onForegroundEvent(({ type, detail }) => {
      if (
        (type === EventType.DELIVERED || type === EventType.PRESS) &&
        detail.notification?.data
      ) {
        abrirAlarme(detail.notification.data);
      }
    });

    return () => unsubscribe();
  }, []);

  // Re-sincroniza os alarmes do desperta sempre que o app volta ao primeiro plano.
  // Assim, inativar/alterar um desperta no painel passa a valer assim que o
  // operador reabre o app (cancela os alarmes que saíram da lista ativa).
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      const userString = await AsyncStorage.getItem('@RondasApp:user');
      if (!userString) return;
      const usuario = JSON.parse(userString);
      if (usuario.perfil === 'POSTO_SERVICO') {
        carregarEAgendarDespertas().catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    async function configurar() {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Permissao de notificacoes negada.');
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('rondas-default', {
          name: 'Notificacoes de Rondas',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#2563eb',
        });

        await Notifications.setNotificationChannelAsync('rondas-panico', {
          name: 'Alertas de Panico',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 500, 200, 500, 200, 500],
          lightColor: '#dc2626',
          sound: 'default',
          bypassDnd: true,
        });

        // Canal v3: ID novo porque canais são imutáveis após criados no Android.
        // Som de sirene alto + vibração longa que dispara assim que a notificação chega.
        await Notifications.setNotificationChannelAsync('desperta-porteiro-sirene', {
          name: 'Desperta Porteiro (Sirene)',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000],
          lightColor: '#f59e0b',
          sound: 'sirene.mp3',
          bypassDnd: true,
          enableVibrate: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });
      }

      try {
        await BackgroundFetch.registerTaskAsync(BACKGROUND_PANICO_TASK, {
          minimumInterval: 60,
          stopOnTerminate: false,
          startOnBoot: true,
        });
      } catch (e) {
        console.warn('Background fetch nao pode ser registrado:', e);
      }

      // Registra o handler de push de sincronização do desperta (background)
      try {
        await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
      } catch (e) {
        console.warn('Task de notificacao nao pode ser registrada:', e);
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
            carregarEAgendarDespertas().catch(() => {});
          }
        }
      } catch (e) {
        console.log("Erro na reidratacao:", e);
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

          <Stack.Screen name="SupervisorHome" component={SupervisorHome} />
          <Stack.Screen name="SupervisorDashboard" component={SupervisorDashboard} />
          <Stack.Screen name="SupervisorVisitaDetalhe" component={SupervisorVisitaDetalhe} />
          <Stack.Screen name="SupervisorOcorrencias" component={SupervisorOcorrencias} />
          <Stack.Screen name="SupervisorPanico" component={SupervisorPanico} />
          <Stack.Screen name="ResponderChecklist" component={ResponderChecklist} />

          <Stack.Screen name="VigilanteHome" component={VigilanteHome} />
          <Stack.Screen name="VigilanteRondas" component={VigilanteRondas} />
          <Stack.Screen name="VigilantePassagem" component={VigilantePassagem} />
          <Stack.Screen name="VigilanteOcorrencia" component={VigilanteOcorrencia} />
        </Stack.Navigator>
      </NavigationContainer>

      {despertaAtiva && (
        <Modal visible animationType="slide" statusBarTranslucent onRequestClose={() => {}}>
          <DespertaAlarm
            despertaId={despertaAtiva.id}
            nome={despertaAtiva.nome}
            slotKey={despertaAtiva.slotKey}
            disparoEm={despertaAtiva.disparoEm}
            onConfirmado={() => setDespertaAtiva(null)}
          />
        </Modal>
      )}
    </>
  );
}
