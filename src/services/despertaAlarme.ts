// despertaAlarme.ts
// Agendamento do Desperta Porteiro usando notifee, que permite full-screen intent:
// a tela do alarme abre sozinha (mesmo com celular bloqueado) e a sirene toca em loop
// até o operador confirmar a presença. expo-notifications NÃO suporta isso.

import notifee, {
  AndroidImportance,
  AndroidCategory,
  AndroidVisibility,
  TriggerType,
  TimestampTrigger,
} from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const CANAL_ALARME = 'desperta-alarme';

// Solicita a permissão de notificação UMA ÚNICA VEZ por sessão.
// IMPORTANTE: não abrimos automaticamente a tela de "alarmes e lembretes"
// (openAlarmPermissionSettingsIfNeeded) porque isso causava um loop de abrir
// configurações → app em background → voltar → abrir de novo, fazendo a tela
// piscar e travar o teclado. A permissão USE_EXACT_ALARM no manifesto já
// garante o alarme exato no Android 13+.
let permissoesSolicitadas = false;
async function garantirPermissoes() {
  if (permissoesSolicitadas) return;
  permissoesSolicitadas = true;
  try {
    await notifee.requestPermission();
  } catch (e) {
    console.log('[DespertaAlarme] Erro ao solicitar permissão:', e);
  }
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

// Cria o canal de alarme de alta prioridade (idempotente).
async function criarCanalAlarme() {
  if (Platform.OS !== 'android') return;
  await notifee.createChannel({
    id: CANAL_ALARME,
    name: 'Desperta Porteiro (Alarme)',
    importance: AndroidImportance.HIGH,
    sound: 'sirene', // res/raw/sirene.mp3 (bundlado via plugin expo-notifications sounds)
    vibration: true,
    vibrationPattern: [300, 600, 300, 600],
    bypassDnd: true,
    visibility: AndroidVisibility.PUBLIC,
  });
}

// dias_semana é BITMASK de 7 posições (índice 0=Dom..6=Sáb), '1'=ativo.
function isDiaAtivo(diasSemana: string | null): boolean {
  if (!diasSemana) return true;
  const hoje = new Date().getDay();
  const dias = diasSemana.split(',');
  if (dias.length !== 7) return true;
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

export function gerarSlotKey(despertaId: string, hora: string): string {
  const hoje = new Date();
  const dataStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  return `${despertaId}_${dataStr}_${hora.replace(':', '')}`;
}

// Cancela alarmes de desperta agendados anteriormente.
async function cancelarAlarmesAnteriores() {
  const triggers = await notifee.getTriggerNotificationIds();
  for (const id of triggers) {
    if (id.startsWith('desperta_')) {
      await notifee.cancelTriggerNotification(id);
    }
  }
}

export async function agendarAlarmesDesperta(lista: DespertaConfig[]) {
  if (Platform.OS !== 'android') return;
  await garantirPermissoes();
  await criarCanalAlarme();
  await cancelarAlarmesAnteriores();

  const agora = new Date();
  const horaAtualMin = agora.getHours() * 60 + agora.getMinutes();
  let total = 0;

  for (const d of lista) {
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

      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: disparo.getTime(),
        alarmManager: { allowWhileIdle: true },
      };

      try {
        await notifee.createTriggerNotification(
          {
            id: `desperta_${slotKey}`,
            title: '🔔 DESPERTA PORTEIRO',
            body: `${d.nome} — Confirme sua presença AGORA!`,
            data: {
              tipo: 'DESPERTA_PORTEIRO',
              despertaId: d.id,
              nome: d.nome,
              slotKey,
              disparoEm: disparo.toISOString(),
            },
            android: {
              channelId: CANAL_ALARME,
              importance: AndroidImportance.HIGH,
              category: AndroidCategory.ALARM,
              // Full-screen intent: abre a tela do app sozinho, mesmo bloqueado
              fullScreenAction: { id: 'default' },
              pressAction: { id: 'default' },
              ongoing: true,        // não pode ser deslizada para fora
              autoCancel: false,
              loopSound: true,      // sirene em loop até confirmar
              sound: 'sirene',
              vibrationPattern: [300, 600, 300, 600],
            },
          },
          trigger
        );
        total++;
        console.log(`[DespertaAlarme] agendado ${d.nome} às ${slot} (${disparo.toISOString()})`);
      } catch (e) {
        console.log(`[DespertaAlarme] FALHA ao agendar ${d.nome} às ${slot}:`, e);
      }
    }
  }

  console.log(`[DespertaAlarme] ${total} alarme(s) notifee agendado(s).`);
}

// Cancela o alarme ativo (chamado quando o operador confirma).
export async function pararAlarme(slotKey: string) {
  if (Platform.OS !== 'android') return;
  try {
    await notifee.cancelNotification(`desperta_${slotKey}`);
    await notifee.cancelDisplayedNotification(`desperta_${slotKey}`);
  } catch {}
}
