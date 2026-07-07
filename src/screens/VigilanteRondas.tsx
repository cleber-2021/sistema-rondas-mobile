import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, Modal, ScrollView, TextInput, Image, ActivityIndicator, AppState } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as TaskManager from 'expo-task-manager';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import * as Notifications from 'expo-notifications';

const BACKGROUND_LOCATION_TASK = 'BACKGROUND_LOCATION_TASK';

// URL base usada pelo background task (não pode importar o axios instance de dentro do TaskManager)
const API_BASE = 'https://sulcleansm.ddns.com.br:3443/api';

function calcularDistancia(lat1: number, lon1: number, lat2: number, lon2: number) {
  if (!lat2 || !lon2) return 0;
  const R = 6371e3;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c);
}

function formatarTempo(segundos: number) {
  const m = Math.floor(segundos / 60).toString().padStart(2, '0');
  const s = (segundos % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ─── BACKGROUND TASK ────────────────────────────────────────────────────────
// Recebe atualizações de GPS do Android mesmo com a tela bloqueada/app em
// segundo plano. Lê todo o estado necessário do AsyncStorage (não tem acesso
// ao estado React) e chama a API diretamente via fetch.
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: any) => {
  if (error) {
    console.log('Erro na task de localização em background:', error.message);
    return;
  }

  const { locations } = data;
  if (!locations?.length) return;
  const loc = locations[0];

  try {
    const [rondaSalva, pontoSalvo, jaRegistrando, token] = await Promise.all([
      AsyncStorage.getItem('@Ronda:emAndamento'),
      AsyncStorage.getItem('@Ronda:pontoAtual'),
      AsyncStorage.getItem('@Ronda:jaRegistrando'),
      AsyncStorage.getItem('@RondasApp:token'),
    ]);

    // Ignora se não há ronda ativa, token, ou se já está processando um ponto
    if (!rondaSalva || !pontoSalvo || !token || jaRegistrando === 'true') return;

    const ronda = JSON.parse(rondaSalva);
    const ponto = JSON.parse(pontoSalvo);

    // Este task só trata pontos AUTOMÁTICOS (GPS). MANUAL usa QR Code.
    if (ponto.tipo_validacao !== 'AUTOMATICA') return;
    if (!ponto.latitude || !ponto.longitude) return;

    const dist = calcularDistancia(
      loc.coords.latitude, loc.coords.longitude,
      Number(ponto.latitude), Number(ponto.longitude)
    );

    if (dist <= Number(ponto.raio_tolerancia)) {
      // Trava para evitar chamadas duplicadas se o GPS oscilar dentro do raio
      await AsyncStorage.setItem('@Ronda:jaRegistrando', 'true');

      const res = await fetch(`${API_BASE}/rondas/bater-ponto`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ronda_id: ronda.id,
          checkpoint_id: ponto.checkpoint_id,
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        }),
      });

      if (res.ok) {
        // Sinaliza para o componente React que este ponto foi validado.
        // Quando o app voltar ao foreground, o polling vai detectar e avançar.
        await AsyncStorage.setItem('@Ronda:pontoValidado', ponto.checkpoint_id);
      } else {
        // Libera para tentar novamente na próxima atualização de GPS
        await AsyncStorage.setItem('@Ronda:jaRegistrando', 'false');
      }
    }
  } catch (e) {
    await AsyncStorage.setItem('@Ronda:jaRegistrando', 'false');
    console.log('Erro no background GPS task:', e);
  }
});

export default function VigilanteRondas({ navigation, route }: any) {
  const [rotasDisponiveis, setRotasDisponiveis] = useState<any[]>([]);
  const [rondaEmAndamento, setRondaEmAndamento] = useState<any>(null);
  const [pontoAtual, setPontoAtual] = useState<any>(null);
  const [distanciaAtual, setDistanciaAtual] = useState<number | null>(null);

  const [tempoRestante, setTempoRestante] = useState<number>(0);
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [horaAtualDaUI, setHoraAtualDaUI] = useState(Date.now());

  // Ref para deduplicação no foreground (mais rápido que AsyncStorage para o path síncrono)
  const jaRegistrando = useRef(false);
  const jaFalhou = useRef(false);

  const [modalScanner, setModalScanner] = useState(false);
  const [permissaoCamera, pedirPermissaoCamera] = useCameraPermissions();
  const [modalOcorrencia, setModalOcorrencia] = useState(false);
  const [descricaoOcorrencia, setDescricaoOcorrencia] = useState('');
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const [loadingOco, setLoadingOco] = useState(false);

  // === CHECKLIST DE INSPEÇÃO (preenchido ao concluir a última checagem) ===
  const [modalChecklist, setModalChecklist] = useState(false);
  const [checklistAtivo, setChecklistAtivo] = useState<any>(null);
  const [respostasChecklist, setRespostasChecklist] = useState<any>({});
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  const [salvandoChecklist, setSalvandoChecklist] = useState(false);
  const rondaParaFinalizar = useRef<any>(null);
  const proximoIdxAposChecklist = useRef<number>(-1);

  // === JUSTIFICATIVAS PENDENTES ===
  // A tela de justificativa fica SOMENTE na VigilanteHome (tela estável, sem timers).
  // Aqui apenas detectamos se há pendências para bloquear o início de novas rondas
  // e redirecionar o operador para justificá-las.
  const [temPendencias, setTemPendencias] = useState(false);

  useEffect(() => {
    carregarRotas();
    verificarRondaEmAndamento();
    const timerRelogio = setInterval(() => setHoraAtualDaUI(Date.now()), 10000);
    return () => clearInterval(timerRelogio);
  }, []);

  // Ao focar a tela, verifica pendências. Se houver e não estiver em ronda,
  // redireciona para a VigilanteHome (onde o operador justifica).
  useFocusEffect(
    useCallback(() => {
      let ativo = true;
      (async () => {
        try {
          const res = await api.get('/rondas/pendentes-justificativa');
          if (!ativo) return;
          const tem = res.data.length > 0;
          setTemPendencias(tem);
          const emRonda = await AsyncStorage.getItem('@Ronda:emAndamento');
          if (tem && !emRonda) {
            navigation.navigate('VigilanteHome');
          }
        } catch (e) {
          console.log('Erro ao verificar pendências:', e);
        }
      })();
      return () => { ativo = false; };
    }, [])
  );

  // Persiste o pontoAtual no AsyncStorage sempre que muda, para o background task usar
  useEffect(() => {
    if (pontoAtual) {
      AsyncStorage.setItem('@Ronda:pontoAtual', JSON.stringify({
        checkpoint_id: pontoAtual.checkpoint_id,
        tipo_validacao: pontoAtual.checkpoints?.tipo_validacao,
        latitude: pontoAtual.checkpoints?.latitude,
        longitude: pontoAtual.checkpoints?.longitude,
        raio_tolerancia: pontoAtual.checkpoints?.raio_tolerancia,
      }));
    } else {
      AsyncStorage.removeItem('@Ronda:pontoAtual');
    }
  }, [pontoAtual]);

  async function verificarRondaEmAndamento() {
    const salva = await AsyncStorage.getItem('@Ronda:emAndamento');
    if (salva) {
      const ronda = JSON.parse(salva);
      setRondaEmAndamento(ronda);
      setPontoAtual(ronda.pontoAtual);
    }
  }

  // Cronômetro resiliente baseado no horário real (sobrevive a tela apagada)
  useEffect(() => {
    if (!rondaEmAndamento) return;

    const sincronizarCronometro = async () => {
      const fim = await AsyncStorage.getItem('@Ronda:fim');
      if (fim) {
        const restante = Math.floor((parseInt(fim) - Date.now()) / 1000);
        if (restante <= 0) {
          if (!jaFalhou.current) {
            jaFalhou.current = true;
            registrarFalhaPorTempo();
          }
        } else {
          setTempoRestante(restante);
        }
      }
    };

    const interval = setInterval(sincronizarCronometro, 1000);
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') sincronizarCronometro();
    });

    return () => { clearInterval(interval); subscription.remove(); };
  }, [rondaEmAndamento]);

  // ─── POLLING: detecta ponto validado pelo background task ───────────────────
  // Quando a tela está bloqueada, o background task valida o ponto e grava
  // '@Ronda:pontoValidado'. Este efeito detecta a flag e avança ao próximo ponto
  // assim que o app volta ao foreground (ou dentro de 2 segundos).
  useEffect(() => {
    if (!rondaEmAndamento || !pontoAtual) return;

    const verificarPontoValidado = async () => {
      const pontoValidado = await AsyncStorage.getItem('@Ronda:pontoValidado');
      // Só avança se o ponto validado em background é exatamente o ponto atual
      if (pontoValidado && pontoValidado === pontoAtual.checkpoint_id) {
        await AsyncStorage.multiRemove(['@Ronda:pontoValidado', '@Ronda:jaRegistrando']);
        jaRegistrando.current = false;
        avancaParaProximoPontoOuFinaliza();
      }
    };

    const interval = setInterval(verificarPontoValidado, 2000);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') verificarPontoValidado();
    });

    return () => { clearInterval(interval); sub.remove(); };
  }, [rondaEmAndamento, pontoAtual]);

  // ─── RASTREAMENTO GPS (foreground + background service) ─────────────────────
  useEffect(() => {
    let watchSubscription: Location.LocationSubscription | null = null;
    jaRegistrando.current = false;

    async function iniciarRastreamento() {
      if (!rondaEmAndamento || pontoAtual?.checkpoints?.tipo_validacao !== 'AUTOMATICA') return;

      try {
        const jaRodando = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
        if (!jaRodando) {
          await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 3000,
            distanceInterval: 1,
            foregroundService: {
              notificationTitle: "Inspeção Ativa",
              notificationBody: "Monitorando posição...",
              notificationColor: "#0284c7",
            },
          });
        }

        // watchPositionAsync: atualiza a UI com a distância em tempo real (foreground)
        // e também valida quando o app está na tela (caminho mais rápido).
        watchSubscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 3000, distanceInterval: 1 },
          (loc) => {
            const dist = calcularDistancia(
              loc.coords.latitude, loc.coords.longitude,
              Number(pontoAtual.checkpoints.latitude), Number(pontoAtual.checkpoints.longitude)
            );
            setDistanciaAtual(dist);

            if (dist <= Number(pontoAtual.checkpoints.raio_tolerancia) && !jaRegistrando.current) {
              jaRegistrando.current = true;
              AsyncStorage.setItem('@Ronda:jaRegistrando', 'true');
              registrarPontoNaApi(loc.coords.latitude, loc.coords.longitude);
            }
          }
        );
      } catch (err) {
        console.log('Erro ao iniciar rastreamento GPS:', err);
      }
    }

    iniciarRastreamento();
    return () => { if (watchSubscription) watchSubscription.remove(); };
  }, [rondaEmAndamento, pontoAtual]);

  // Calcula o slot atual e o próximo, respeitando a janela [hora_inicio, hora_fim].
  // Após hora_fim, o próximo slot rola para a abertura (hora_inicio) do dia seguinte.
  function calcularSlotAtual(horaInicio: string | null, horaFim: string | null, intervaloMin: number):
    { slotTs: number; proximoSlotTs: number; inicioTs: number; fimTs: number } {
    const agora = Date.now();
    const intervaloMs = intervaloMin * 60_000;

    // Janela de operação começando HOJE em hora_inicio
    const inicio = new Date();
    let hi = 0, mi = 0;
    if (horaInicio) { const p = horaInicio.split(':').map(Number); hi = p[0]; mi = p[1]; }
    inicio.setHours(hi, mi, 0, 0);

    // Detecta turno que vira o dia (ex: 19:30 → 06:30)
    let hf = 0, mf = 0;
    const temFim = !!horaFim;
    if (horaFim) { const p = horaFim.split(':').map(Number); hf = p[0]; mf = p[1]; }
    const cruzaMeiaNoite = temFim && (hf * 60 + mf) <= (hi * 60 + mi);

    const fim = new Date(inicio);
    if (temFim) {
      fim.setHours(hf, mf, 0, 0);
      if (cruzaMeiaNoite) fim.setDate(fim.getDate() + 1); // fim é no dia seguinte
    } else {
      fim.setDate(fim.getDate() + 1); // sem fim definido = 24h
    }

    // Turno que vira o dia e agora estamos na MADRUGADA (antes da abertura de hoje):
    // a janela ativa começou ONTEM. Sem isso, o app pensa que a próxima ronda é só
    // à noite (hora_inicio) e trava entre 00:00 e o fim do turno.
    if (cruzaMeiaNoite && agora < inicio.getTime()) {
      inicio.setDate(inicio.getDate() - 1);
      fim.setDate(fim.getDate() - 1);
    }

    // Se já passou do fim da janela, rola para a próxima janela
    if (agora >= fim.getTime()) {
      inicio.setDate(inicio.getDate() + 1);
      fim.setDate(fim.getDate() + 1);
    }

    const inicioTs = inicio.getTime();
    const fimTs = fim.getTime();

    let slotTs: number, proximoSlotTs: number;
    if (agora < inicioTs) {
      // Antes da janela abrir: o próximo disparo é a própria abertura (hora_inicio)
      slotTs = inicioTs;
      proximoSlotTs = inicioTs;
    } else {
      const n = Math.floor((agora - inicioTs) / intervaloMs);
      slotTs = inicioTs + n * intervaloMs;
      proximoSlotTs = slotTs + intervaloMs;
      // Se o próximo slot ultrapassa o fim, vai para a abertura de amanhã
      if (proximoSlotTs >= fimTs) {
        const amanha = new Date(inicio);
        amanha.setDate(amanha.getDate() + 1);
        proximoSlotTs = amanha.getTime();
      }
    }
    return { slotTs, proximoSlotTs, inicioTs, fimTs };
  }

  // Gera todos os horários de disparo futuros dentro da janela atual (ou da próxima).
  // Permite agendar todas as notificações do dia de uma vez (mais confiável).
  function gerarSlotsFuturos(horaInicio: string | null, horaFim: string | null, intervaloMin: number, max = 24): number[] {
    const agora = Date.now();
    const { inicioTs, fimTs } = calcularSlotAtual(horaInicio, horaFim, intervaloMin);
    const intervaloMs = intervaloMin * 60_000;
    const slots: number[] = [];
    for (let t = inicioTs; t < fimTs && slots.length < max; t += intervaloMs) {
      if (t > agora) slots.push(t);
    }
    return slots;
  }

  async function gerenciarAlertasDeRonda(rotas: any[]) {
    // Só agenda notificações para vigilantes (POSTO_SERVICO)
    const userStr = await AsyncStorage.getItem('@RondasApp:user');
    if (userStr) {
      const u = JSON.parse(userStr);
      if (u.perfil !== 'POSTO_SERVICO') return;
    }
    // Cancela apenas notificações de ronda — preserva as do desperta porteiro
    const agendadas = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of agendadas) {
      if (n.content.data?.tipo === 'RONDA_LIBERADA') {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
    for (const rota of rotas) {
      if (!rota.intervalo_minutos) continue;

      // Agenda TODOS os slots futuros da janela (ex: 08:00, 09:00, ..., 17:00).
      // Assim as notificações disparam mesmo que o app não seja reaberto.
      const slots = gerarSlotsFuturos(rota.hora_inicio ?? null, rota.hora_fim ?? null, rota.intervalo_minutos);

      for (const slotTs of slots) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '⏰ Hora da Inspeção!',
            body: `O roteiro "${rota.nome}" está liberado. Você tem 10 minutos para iniciar!`,
            sound: true,
            priority: Notifications.AndroidNotificationPriority.MAX,
            data: { tipo: 'RONDA_LIBERADA', rota_id: rota.id, rota_nome: rota.nome },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(slotTs),
          },
        });
      }
    }
  }

  async function carregarRotas() {
    try {
      const res = await api.get('/rotas');
      setRotasDisponiveis(res.data);
      gerenciarAlertasDeRonda(res.data);
    } catch (e: any) {
      console.log('Erro ao carregar rotas:', e.response?.data || e.message);
      Alert.alert('Erro', 'Não foi possível carregar as inspeções. Verifique sua conexão.');
    }
  }

  async function iniciarRonda(rota: any) {
    // Bloqueio: não permite iniciar nova ronda com justificativas pendentes
    if (temPendencias) {
      Alert.alert('Justificativa pendente', 'Você precisa justificar as inspeções perdidas antes de iniciar uma nova.');
      navigation.navigate('VigilanteHome');
      return;
    }
    try {
      const res = await api.post('/rondas/iniciar', { rota_id: rota.id });
      const primeiroPonto = rota.rota_checkpoints[0];
      const r = { ...res.data, rotas: rota, pontoAtual: primeiroPonto };
      const fim = Date.now() + ((primeiroPonto.tempo_limite_min || 5) * 60000);

      await AsyncStorage.setItem('@Ronda:emAndamento', JSON.stringify(r));
      await AsyncStorage.setItem('@Ronda:fim', fim.toString());
      await AsyncStorage.multiRemove(['@Ronda:pontoValidado', '@Ronda:jaRegistrando']);

      setRondaEmAndamento(r);
      setPontoAtual(primeiroPonto);
    } catch (e: any) {
      // Mostra a mensagem real do backend (ex.: janela de horário) em vez de genérica
      const msg = e?.response?.data?.error || 'Falha ao iniciar.';
      Alert.alert('Erro', msg);
    }
  }

  async function registrarPontoNaApi(lat: number, lng: number) {
    if (lat === 0 && lng === 0) {
      Alert.alert("Erro", "Sinal de GPS indisponível. Aguarde a estabilização.");
      jaRegistrando.current = false;
      await AsyncStorage.setItem('@Ronda:jaRegistrando', 'false');
      return;
    }
    try {
      await api.post('/rondas/bater-ponto', {
        ronda_id: rondaEmAndamento.id,
        checkpoint_id: pontoAtual.checkpoint_id,
        latitude: lat,
        longitude: lng,
      });
      avancaParaProximoPontoOuFinaliza();
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'Erro ao registrar ponto. Tente novamente.';
      Alert.alert('Falha', msg);
      jaRegistrando.current = false;
      await AsyncStorage.setItem('@Ronda:jaRegistrando', 'false');
    }
  }

  async function avancaParaProximoPontoOuFinaliza() {
    const lista = rondaEmAndamento.rotas.rota_checkpoints;
    const idx = lista.findIndex((p: any) => p.checkpoint_id === pontoAtual.checkpoint_id);

    // Verifica se o checkpoint atual tem checklist vinculado
    const checklistId = pontoAtual.checklist_id;
    if (checklistId) {
      rondaParaFinalizar.current = rondaEmAndamento;
      proximoIdxAposChecklist.current = idx + 1;
      await abrirChecklistInspecao(checklistId);
      return;
    }

    await avancarParaIndice(rondaEmAndamento, idx + 1);
  }

  async function avancarParaIndice(ronda: any, nextIdx: number) {
    const lista = ronda.rotas.rota_checkpoints;
    if (nextIdx < lista.length) {
      const prox = lista[nextIdx];
      const r = { ...ronda, pontoAtual: prox };
      const novoFim = Date.now() + ((prox.tempo_limite_min || 5) * 60000);

      jaFalhou.current = false;
      setPontoAtual(prox);
      setRondaEmAndamento(r);

      await AsyncStorage.setItem('@Ronda:emAndamento', JSON.stringify(r));
      await AsyncStorage.setItem('@Ronda:fim', novoFim.toString());
      await AsyncStorage.multiRemove(['@Ronda:pontoValidado', '@Ronda:jaRegistrando']);
      jaRegistrando.current = false;
    } else {
      await encerrarRondaDefinitivamente(ronda.id);
    }
  }

  async function encerrarRondaDefinitivamente(ronda_id: string) {
    await api.post('/rondas/encerrar', { ronda_id });
    await AsyncStorage.multiRemove(['@Ronda:emAndamento', '@Ronda:fim', '@Ronda:pontoAtual', '@Ronda:pontoValidado', '@Ronda:jaRegistrando']);
    setRondaEmAndamento(null);
    setPontoAtual(null);
    // Volta para VigilanteHome para que o useFocusEffect dispare verificarPendentes
    navigation.navigate('VigilanteHome');
  }

  async function abrirChecklistInspecao(checklistId: string) {
    setLoadingChecklist(true);
    try {
      const res = await api.get(`/checklists-inspecao/${checklistId}`);
      const checklist = res.data;
      const initial: any = {};
      checklist.perguntas.forEach((p: any) => {
        initial[p.id] = { pergunta_id: p.id, resposta: 'Conforme', observacao: '', foto_base64: null };
      });
      setRespostasChecklist(initial);
      setChecklistAtivo(checklist);
      setModalChecklist(true);
    } catch (e) {
      // Se falhar ao buscar o checklist, não bloqueia o vigilante: continua normalmente
      Alert.alert('Aviso', 'Não foi possível carregar o checklist. Continuando sem ele.');
      await avancarParaIndice(rondaParaFinalizar.current, proximoIdxAposChecklist.current);
    } finally {
      setLoadingChecklist(false);
    }
  }

  function atualizarRespostaChecklist(perguntaId: string, campo: string, valor: any) {
    setRespostasChecklist((prev: any) => ({
      ...prev, [perguntaId]: { ...prev[perguntaId], [campo]: valor }
    }));
  }

  async function tirarFotoChecklist(perguntaId: string) {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Aviso', 'Precisamos da câmera.');
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.3, base64: true });
    if (!result.canceled && result.assets && result.assets[0].base64) {
      atualizarRespostaChecklist(perguntaId, 'foto_base64', `data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  }

  async function finalizarComChecklist() {
    for (const p of checklistAtivo.perguntas) {
      if (p.exige_foto && !respostasChecklist[p.id]?.foto_base64) {
        return Alert.alert('Atenção', `A pergunta "${p.pergunta}" exige uma foto.`);
      }
    }
    setSalvandoChecklist(true);
    try {
      const respostasArray = Object.values(respostasChecklist);
      const ronda = rondaParaFinalizar.current;
      await api.post('/checklists-inspecao/responder', {
        checklist_id: checklistAtivo.id,
        ronda_exec_id: ronda.id,
        respostas: respostasArray,
      });
      setModalChecklist(false);
      setChecklistAtivo(null);
      await avancarParaIndice(ronda, proximoIdxAposChecklist.current);
    } catch (e) {
      Alert.alert('Erro', 'Falha ao salvar o checklist. Tente novamente.');
    } finally {
      setSalvandoChecklist(false);
    }
  }

  async function registrarFalhaPorTempo() {
    // Lê do AsyncStorage para evitar estado stale do closure do setInterval
    const rondaSalva = await AsyncStorage.getItem('@Ronda:emAndamento');
    if (!rondaSalva) return;
    const ronda = JSON.parse(rondaSalva);
    await api.post('/rondas/falhar-ponto', {
      ronda_id: ronda.id,
      checkpoint_id: ronda.pontoAtual.checkpoint_id,
    });
    avancaParaProximoPontoOuFinaliza();
  }

  async function abrirScanner() {
    if (!permissaoCamera?.granted) {
      const res = await pedirPermissaoCamera();
      if (!res.granted) return;
    }
    setModalScanner(true);
  }

  async function handleBarCodeScanned({ data }: { data: string }) {
    setModalScanner(false);
    if (data !== pontoAtual.checkpoint_id) return Alert.alert('❌ Erro', 'QR Code incorreto.');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return Alert.alert('Permissão Negada', 'O App precisa de acesso ao GPS para registrar o ponto.');
      }
      let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await registrarPontoNaApi(loc.coords.latitude, loc.coords.longitude);
    } catch (error) {
      Alert.alert('Erro de GPS', 'Não foi possível obter sua localização. Verifique se o GPS está ativado.');
    }
  }

  async function tirarFotoOcorrencia() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    const { status: statusCamera } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted' && statusCamera !== 'granted') {
      Alert.alert('Permissão negada', 'Permite o acesso à câmara ou galeria nas configurações.');
      return;
    }
    Alert.alert('Foto da Ocorrência', 'Como deseja adicionar a foto?', [
      {
        text: 'Câmara', onPress: async () => {
          const res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5 });
          if (!res.canceled && res.assets[0].base64) {
            setFotoBase64(`data:image/jpeg;base64,${res.assets[0].base64}`);
          }
        }
      },
      {
        text: 'Galeria', onPress: async () => {
          const res = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.5 });
          if (!res.canceled && res.assets[0].base64) {
            setFotoBase64(`data:image/jpeg;base64,${res.assets[0].base64}`);
          }
        }
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function enviarOcorrenciaDuranteRonda() {
    if (!descricaoOcorrencia.trim()) {
      Alert.alert('Atenção', 'Descreva a ocorrência antes de enviar.');
      return;
    }
    setLoadingOco(true);
    try {
      await api.post('/ocorrencias', {
        ronda_id: rondaEmAndamento.id,
        checkpoint_id: pontoAtual.checkpoint_id,
        titulo: 'Ocorrência registrada via App',
        descricao: descricaoOcorrencia,
        foto_base64: fotoBase64 || undefined,
      });
      Alert.alert('✅ Enviado', 'Ocorrência registrada com sucesso!');
      setModalOcorrencia(false);
      setDescricaoOcorrencia('');
      setFotoBase64(null);
    } catch (e: any) {
      console.log('Erro ao enviar ocorrência:', e.response?.data || e.message);
      Alert.alert('Erro', 'Falha ao enviar a ocorrência.');
    } finally {
      setLoadingOco(false);
    }
  }

  function interromperPatrulhaManual() {
    Alert.alert("⚠️ Interromper", "Deseja realmente abandonar a inspeção?", [
      { text: "Continuar", style: "cancel" },
      {
        text: "Abandonar", style: "destructive", onPress: async () => {
          try {
            await api.post('/rondas/encerrar', { ronda_id: rondaEmAndamento.id, abandonada: true });
          } catch (e: any) {
            console.log('Erro ao abandonar:', e.response?.data || e.message);
          }
          await AsyncStorage.multiRemove(['@Ronda:emAndamento', '@Ronda:fim', '@Ronda:pontoAtual', '@Ronda:pontoValidado', '@Ronda:jaRegistrando']);
          setRondaEmAndamento(null);
          setPontoAtual(null);
          carregarRotas();
        }
      }
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ position: 'absolute', top: 60, left: 20, zIndex: 10 }}>
          <Ionicons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>{rondaEmAndamento ? 'Inspeção em Andamento' : 'Suas Inspeções'}</Text>
      </View>

      {!rondaEmAndamento ? (
        <ScrollView style={{ padding: 20 }}>
          {rotasDisponiveis.map(rota => {
            const TOLERANCIA_MS = 10 * 60_000;
            const intervaloMs = (rota.intervalo_minutos || 0) * 60_000;

            // Sem intervalo configurado → sempre liberada
            if (!rota.intervalo_minutos) {
              return (
                <View key={rota.id} style={styles.rotaCard}>
                  <View>
                    <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{rota.nome}</Text>
                    <Text style={{ color: '#64748b' }}>{rota.rota_checkpoints?.length || 0} pontos a visitar</Text>
                  </View>
                  <TouchableOpacity style={[styles.btnIniciar, { backgroundColor: '#1a1a1a' }]} onPress={() => iniciarRonda(rota)}>
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Iniciar</Text>
                  </TouchableOpacity>
                </View>
              );
            }

            const { slotTs, proximoSlotTs } = calcularSlotAtual(rota.hora_inicio ?? null, rota.hora_fim ?? null, rota.intervalo_minutos);

            // Verifica se já foi executada neste slot
            const ultimaExecTs = rota.ultima_execucao ? new Date(rota.ultima_execucao).getTime() : 0;
            const execucaoNoSlot = ultimaExecTs >= slotTs && ultimaExecTs < slotTs + intervaloMs;

            // Liberada: dentro da janela de 10 min E sem execução no slot atual
            const dentroJanela = horaAtualDaUI >= slotTs && horaAtualDaUI < slotTs + TOLERANCIA_MS;
            const liberada = dentroJanela && !execucaoNoSlot;

            // Texto e cor do botão
            let textoBotao = 'Iniciar';
            let corBotao = '#0284c7';
            if (!liberada) {
              const referencia = execucaoNoSlot || horaAtualDaUI >= slotTs + TOLERANCIA_MS ? proximoSlotTs : slotTs;
              const proxData = new Date(referencia);
              const hh = proxData.getHours().toString().padStart(2, '0');
              const mm = proxData.getMinutes().toString().padStart(2, '0');
              // Indica "amanhã" se o próximo slot cair em outro dia
              const ehAmanha = proxData.getDate() !== new Date().getDate() || proxData.getMonth() !== new Date().getMonth();
              const sufixo = ehAmanha ? ' (amanhã)' : '';
              textoBotao = execucaoNoSlot ? `✅ Próx. às ${hh}:${mm}${sufixo}` : `⏳ Às ${hh}:${mm}${sufixo}`;
              corBotao = execucaoNoSlot ? '#16a34a' : '#94a3b8';
            }

            return (
              <View key={rota.id} style={styles.rotaCard}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{rota.nome}</Text>
                  <Text style={{ color: '#64748b' }}>{rota.rota_checkpoints?.length || 0} pontos a visitar</Text>
                  {dentroJanela && !execucaoNoSlot && (
                    <Text style={{ color: '#dc2626', fontSize: 12, marginTop: 2 }}>
                      ⚠️ Encerra em {Math.max(0, Math.floor((slotTs + TOLERANCIA_MS - horaAtualDaUI) / 60_000))} min
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={[styles.btnIniciar, { backgroundColor: corBotao }]}
                  onPress={() => {
                    if (liberada) {
                      iniciarRonda(rota);
                    } else {
                      const msg = execucaoNoSlot
                        ? `Inspeção já realizada neste horário. Próxima disponível às ${textoBotao.replace('✅ Próx. às ', '')}.`
                        : `Esta inspeção só estará disponível às ${textoBotao.replace('⏳ Às ', '')} por 10 minutos.`;
                      Alert.alert('Inspeção bloqueada', msg);
                    }
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12, textAlign: 'center' }}>{textoBotao}</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.areaRonda}>
          <Text style={styles.timer}>⏱️ {formatarTempo(tempoRestante)}</Text>
          <Text style={styles.pontoNome}>{pontoAtual?.checkpoints.nome}</Text>

          {pontoAtual?.checkpoints?.tipo_validacao === 'MANUAL' ? (
            <TouchableOpacity style={styles.btnAcao} onPress={abrirScanner}>
              <Text style={styles.btnAcaoText}>📷 Ler QR Code</Text>
            </TouchableOpacity>
          ) : (
            <Text style={{ fontSize: 18, color: '#059669', fontWeight: 'bold', marginVertical: 15 }}>
              Distância: {distanciaAtual !== null ? `${distanciaAtual}m` : 'Calculando GPS...'}
            </Text>
          )}

          <TouchableOpacity style={[styles.btnAcao, { backgroundColor: '#dc2626', marginTop: 15 }]} onPress={() => setModalOcorrencia(true)}>
            <Text style={styles.btnAcaoText}>⚠️ Registrar Ocorrência</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btnAcao, { backgroundColor: '#64748b', marginTop: 15 }]} onPress={interromperPatrulhaManual}>
            <Text style={styles.btnAcaoText}>⏹️ Interromper Inspeção</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal: Leitor de QR Code */}
      <Modal visible={modalScanner} animationType="slide">
        <CameraView style={StyleSheet.absoluteFillObject} facing="back" onBarcodeScanned={handleBarCodeScanned} />
        <TouchableOpacity
          style={{ position: 'absolute', top: 50, right: 20, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, padding: 10 }}
          onPress={() => setModalScanner(false)}
        >
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
      </Modal>

      {/* Modal: Registrar Ocorrência */}
      <Modal visible={modalOcorrencia} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>⚠️ Registrar Ocorrência</Text>

            <TextInput
              style={styles.inputDescricao}
              placeholder="Descreva o problema observado..."
              placeholderTextColor="#94a3b8"
              value={descricaoOcorrencia}
              onChangeText={setDescricaoOcorrencia}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <TouchableOpacity style={styles.btnFoto} onPress={tirarFotoOcorrencia}>
              <Ionicons name="camera-outline" size={20} color="#0284c7" />
              <Text style={styles.btnFotoText}>{fotoBase64 ? '✅ Foto Adicionada' : 'Adicionar Foto'}</Text>
            </TouchableOpacity>

            {fotoBase64 && (
              <View style={{ alignItems: 'center', marginBottom: 10 }}>
                <Image source={{ uri: fotoBase64 }} style={{ width: 120, height: 90, borderRadius: 8 }} />
                <TouchableOpacity onPress={() => setFotoBase64(null)}>
                  <Text style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>Remover foto</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={[styles.btnModal, { backgroundColor: '#64748b', flex: 1 }]}
                onPress={() => { setModalOcorrencia(false); setDescricaoOcorrencia(''); setFotoBase64(null); }}
                disabled={loadingOco}
              >
                <Text style={styles.btnModalText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnModal, { backgroundColor: '#dc2626', flex: 1 }]}
                onPress={enviarOcorrenciaDuranteRonda}
                disabled={loadingOco}
              >
                {loadingOco
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnModalText}>Enviar</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* === MODAL DO CHECKLIST DE INSPEÇÃO === */}
      <Modal visible={modalChecklist} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#f8fafc', paddingTop: 50 }}>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#1e293b', marginBottom: 5, textAlign: 'center' }}>{checklistAtivo?.titulo}</Text>
            {checklistAtivo?.descricao ? (
              <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 15, textAlign: 'center' }}>{checklistAtivo.descricao}</Text>
            ) : null}
            <Text style={{ fontSize: 14, color: '#64748b', marginBottom: 25, textAlign: 'center' }}>Responda para concluir a inspeção.</Text>

            {checklistAtivo?.perguntas.map((p: any, index: number) => (
              <View key={p.id} style={{ backgroundColor: '#fff', padding: 20, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#e2e8f0' }}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#334155', marginBottom: 15 }}>{index + 1}. {p.pergunta}</Text>

                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 15 }}>
                  <TouchableOpacity style={[styles.btnToggleChk, respostasChecklist[p.id]?.resposta === 'Conforme' ? { backgroundColor: '#10b981', borderColor: '#10b981' } : {}]} onPress={() => atualizarRespostaChecklist(p.id, 'resposta', 'Conforme')}>
                    <Text style={{ color: respostasChecklist[p.id]?.resposta === 'Conforme' ? '#fff' : '#64748b', fontWeight: 'bold' }}>Conforme</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnToggleChk, respostasChecklist[p.id]?.resposta === 'Não Conforme' ? { backgroundColor: '#ef4444', borderColor: '#ef4444' } : {}]} onPress={() => atualizarRespostaChecklist(p.id, 'resposta', 'Não Conforme')}>
                    <Text style={{ color: respostasChecklist[p.id]?.resposta === 'Não Conforme' ? '#fff' : '#64748b', fontWeight: 'bold' }}>Não Conforme</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnToggleChk, respostasChecklist[p.id]?.resposta === 'N/A' ? { backgroundColor: '#94a3b8', borderColor: '#94a3b8' } : {}]} onPress={() => atualizarRespostaChecklist(p.id, 'resposta', 'N/A')}>
                    <Text style={{ color: respostasChecklist[p.id]?.resposta === 'N/A' ? '#fff' : '#64748b', fontWeight: 'bold' }}>N/A</Text>
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={[styles.inputAreaChk, { height: 45, marginBottom: p.exige_foto ? 15 : 0 }]}
                  placeholder="Observações (Opcional)..."
                  placeholderTextColor="#94a3b8"
                  value={respostasChecklist[p.id]?.observacao}
                  onChangeText={txt => atualizarRespostaChecklist(p.id, 'observacao', txt)}
                />

                {p.exige_foto && (
                  <TouchableOpacity style={[styles.btnCameraChk, { backgroundColor: respostasChecklist[p.id]?.foto_base64 ? '#10b981' : '#475569' }]} onPress={() => tirarFotoChecklist(p.id)}>
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>{respostasChecklist[p.id]?.foto_base64 ? '📸 Imagem Capturada' : '📸 Tirar Foto (Obrigatório)'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            <View style={{ marginTop: 10, paddingBottom: 40 }}>
              <TouchableOpacity style={{ padding: 15, backgroundColor: '#2563eb', borderRadius: 8, alignItems: 'center' }} onPress={finalizarComChecklist} disabled={salvandoChecklist}>
                {salvandoChecklist ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: 'bold' }}>🚀 Concluir Inspeção</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {loadingChecklist && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  btnToggleChk: { flex: 1, padding: 12, borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  inputAreaChk: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 15, fontSize: 14, color: '#1e293b' },
  btnCameraChk: { padding: 15, borderRadius: 8, alignItems: 'center' },
  header: { padding: 25, paddingTop: 60, backgroundColor: '#b0b0b0', alignItems: 'center' },
  title: { color: '#1a1a1a', fontSize: 22, fontWeight: 'bold' },
  timer: { fontSize: 50, fontWeight: 'bold', color: '#dc2626', marginVertical: 20 },
  pontoNome: { fontSize: 20, color: '#334155', marginBottom: 20 },
  rotaCard: { backgroundColor: '#fff', padding: 20, borderRadius: 12, marginBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  btnIniciar: { padding: 12, borderRadius: 8, paddingHorizontal: 20 },
  btnAcao: { backgroundColor: '#ea580c', padding: 15, borderRadius: 8, width: '90%', alignItems: 'center' },
  btnAcaoText: { color: '#fff', fontWeight: 'bold' },
  areaRonda: { flex: 1, alignItems: 'center', padding: 20 },
  // Modal de ocorrência
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 25, paddingBottom: 40 },
  modalTitulo: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 15 },
  inputDescricao: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 12, fontSize: 15, color: '#1e293b', minHeight: 100, marginBottom: 12 },
  btnFoto: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderWidth: 1, borderColor: '#0284c7', borderRadius: 8, marginBottom: 12 },
  btnFotoText: { color: '#0284c7', fontWeight: '600' },
  btnModal: { padding: 14, borderRadius: 8, alignItems: 'center' },
  btnModalText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  // Modal bloqueante de justificativa
  justContainer: { flex: 1, backgroundColor: '#f8fafc' },
  justHeader: { backgroundColor: '#1e293b', padding: 30, paddingTop: 60, alignItems: 'center', gap: 8 },
  justTitulo: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginTop: 8 },
  justSubtitulo: { fontSize: 14, color: '#94a3b8', backgroundColor: '#334155', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  justCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: '#dc2626' },
  justLabel: { fontSize: 11, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginTop: 8 },
  justTexto: { fontSize: 15, color: '#1e293b', fontWeight: '600', marginTop: 2 },
  justLabelBig: { fontSize: 15, fontWeight: 'bold', color: '#1e293b', marginBottom: 4 },
  justDesc: { fontSize: 13, color: '#64748b', marginBottom: 12, lineHeight: 18 },
  justInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 14, fontSize: 15, color: '#1e293b', minHeight: 120 },
  justFooter: { padding: 20, paddingBottom: 40, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  justBtn: { backgroundColor: '#1a1a1a', padding: 16, borderRadius: 10, alignItems: 'center' },
  justBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
