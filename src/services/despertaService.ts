import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

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

// dias_semana armazenado como "0,1,2,3,4,5,6" (getDay() do JS)
function isDiaAtivo(diasSemana: string | null): boolean {
  if (!diasSemana) return true;
  const hoje = new Date().getDay();
  return diasSemana.split(',').map(Number).includes(hoje);
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
  // Remove notificacoes de desperta anteriores
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.content.data?.tipo === 'DESPERTA_PORTEIRO') {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }

  const agora = new Date();
  const horaAtualMin = agora.getHours() * 60 + agora.getMinutes();

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
}

export async function carregarEAgendarDespertas() {
  try {
    const resp = await api.get('/desperta/mobile');
    await agendarDespertas(resp.data);
  } catch (e) {
    console.log('[Desperta] Erro ao carregar:', e);
  }
}
