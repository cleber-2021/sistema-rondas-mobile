import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import notifee from '@notifee/react-native';

// Cancela todas as notificações locais (agendadas e exibidas), expo + notifee.
// Usado ao sair/sessão expirar para o aparelho parar de receber alertas.
export async function cancelarTodasNotificacoes() {
  try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch {}
  try { await Notifications.dismissAllNotificationsAsync(); } catch {}
  try { await notifee.cancelAllNotifications(); } catch {}
  try {
    const ids = await notifee.getTriggerNotificationIds();
    for (const id of ids) { try { await notifee.cancelTriggerNotification(id); } catch {} }
  } catch {}
}

const api = axios.create({
  baseURL: 'https://sulcleansm.ddns.com.br:3443/api',
  // Sem timeout, uma requisição que engasgue fica girando PARA SEMPRE (é o
  // "não carrega o checklist"). 20s é folgado para a rede e evita o spinner eterno.
  timeout: 20000,
});

// ─── Handler global de sessão expirada ────────────────────────────────────
// O App.tsx registra aqui uma função que limpa o estado e leva o usuário
// de volta ao Login. Mantemos fora dos componentes para que o interceptor
// (que roda fora da árvore React) consiga acioná-la sem dependência circular.
let onSessaoExpirada: (() => void) | null = null;

export function registrarHandlerSessaoExpirada(handler: () => void) {
  onSessaoExpirada = handler;
}

// Evita disparar o logout várias vezes em rajadas de requisições paralelas
let deslogando = false;

async function limparSessao() {
  if (deslogando) return;
  deslogando = true;
  try {
    await cancelarTodasNotificacoes();
    await AsyncStorage.multiRemove(['@RondasApp:token', '@RondasApp:user']);
    api.defaults.headers.common['Authorization'] = '';
    onSessaoExpirada?.();
  } finally {
    // Libera após um pequeno intervalo para não engolir respostas legítimas
    setTimeout(() => { deslogando = false; }, 1000);
  }
}

// Interceptor de request: reidrata o token a cada chamada
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('@RondasApp:token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Interceptor de response: detecta token expirado/ausente (401/403)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    if (status === 401 || status === 403) {
      await limparSessao();
    }
    return Promise.reject(error);
  }
);

export default api;
