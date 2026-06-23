import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import api from './api';

// Garante que o canal de alarme do desperta exista (idempotente).
// Evita corrida com a criação de canais no App.tsx.
async function garantirCanalDesperta() {
  if (Platform.OS !== 'android') return;
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

export interface DespertaConfig {
  id: string;
  nome: string;
  hora_inicio: string;
  hora_fim: string;
  intervalo_min: number;
  dias_semana: string | null;
  ativo: boolean;
}

// Gera uma chave unica para cada slot: "despertaId_YYYY-MM-DD_HHmm"
export function gerarSlotKey(despertaId: string, hora: string): string {
  const hoje = new Date();
  const dataStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  return `${despertaId}_${dataStr}_${hora.replace(':', '')}`;
}

// dias_semana é um BITMASK de 7 posições: "D,S,T,Q,Q,S,S" onde cada posição
// (índice 0=Dom ... 6=Sáb) vale '1' (ativo) ou '0' (inativo). Mesmo formato salvo
// pelo painel web em DespertaPorteiro.tsx (stringDosDias).
function isDiaAtivo(diasSemana: string | null): boolean {
  if (!diasSemana) return true;
  const hoje = new Date().getDay(); // 0=Dom ... 6=Sáb
  const dias = diasSemana.split(',');
  if (dias.length !== 7) return true; // formato inesperado → não bloqueia
  return dias[hoje] === '1';
}

function gerarSlots(horaInicio: string, horaFim: string, intervaloMin: number): string[] {
  const [hI, mI] = horaInicio.split(':').map(Number);
  const [hF, mF] = horaFim.split(':').map(Number);
  const slots: string[] = [];

  let minAtual = hI * 60 + mI;
  const minFim = hF * 60 + mF;

  while (minAtual <= minFim) {
    const h = Math.floor(minAtual / 60);
    const m = minAtual % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    minAtual += intervaloMin;
  }

  return slots;
}

export async function agendarDespertas(despertaList: DespertaConfig[]) {
  await garantirCanalDesperta();

  // Remove notificacoes de desperta anteriores
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.content.data?.tipo === 'DESPERTA_PORTEIRO') {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }

  const agora = new Date();
  const horaAtualMin = agora.getHours() * 60 + agora.getMinutes();
  let totalAgendados = 0;

  for (const d of despertaList) {
    if (!d.ativo) continue;
    if (!isDiaAtivo(d.dias_semana)) continue;

    const slots = gerarSlots(d.hora_inicio, d.hora_fim, d.intervalo_min);

    for (const slot of slots) {
      const [h, m] = slot.split(':').map(Number);
      const slotMin = h * 60 + m;

      if (slotMin <= horaAtualMin) continue;

      const slotKey = gerarSlotKey(d.id, slot);
      const confirmado = await AsyncStorage.getItem(`@desperta_confirmado:${d.id}:${slotKey}`);
      if (confirmado) continue;

      const disparo = new Date();
      disparo.setHours(h, m, 0, 0);
      totalAgendados++;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🔔 DESPERTA PORTEIRO',
          body: `${d.nome} - Confirme sua presenca AGORA!`,
          data: { tipo: 'DESPERTA_PORTEIRO', despertaId: d.id, nome: d.nome, slotKey },
          sound: 'sirene.mp3',
          priority: Notifications.AndroidNotificationPriority.MAX,
          vibrate: [0, 1000, 500, 1000, 500, 1000, 500, 1000],
          // @ts-ignore
          channelId: 'desperta-porteiro-sirene',
          // @ts-ignore
          sticky: true,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: disparo },
      });
    }
  }

  console.log(`[Desperta] ${totalAgendados} alarme(s) agendado(s) para hoje.`);
}

export async function carregarEAgendarDespertas() {
  try {
    const resp = await api.get('/desperta/mobile');
    console.log(`[Desperta] ${Array.isArray(resp.data) ? resp.data.length : 0} configuracao(oes) recebida(s) do servidor.`);
    await agendarDespertas(resp.data);
  } catch (e: any) {
    console.log('[Desperta] Erro ao carregar:', e?.response?.status, e?.response?.data || e?.message);
  }
}
