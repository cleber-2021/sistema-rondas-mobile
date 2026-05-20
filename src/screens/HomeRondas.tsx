import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, ActivityIndicator, Modal, ScrollView, TextInput, Image, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location'; 
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import api from '../services/api';

const BACKGROUND_LOCATION_TASK = 'BACKGROUND_LOCATION_TASK';

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, ({ data, error }) => {
  if (error) return;
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true }),
});

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

export default function HomeRondas({ navigation }: any) {
  const [nomePosto, setNomePosto] = useState('');
  const [postoId, setPostoId] = useState<string | null>(null);
  
  // Estados de Rondas
  const [checkpointsPosto, setCheckpointsPosto] = useState<any[]>([]); 
  const [buscandoCheckpoints, setBuscandoCheckpoints] = useState(true);
  const [rotasDisponiveis, setRotasDisponiveis] = useState<any[]>([]);
  const [rondaEmAndamento, setRondaEmAndamento] = useState<any>(null);
  const [pontoAtual, setPontoAtual] = useState<any>(null);
  
  // Estados de Ocorrências
  const [modalOcorrencia, setModalOcorrencia] = useState(false);
  const [descricaoOcorrencia, setDescricaoOcorrencia] = useState('');
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const [checkpointSelecionado, setCheckpointSelecionado] = useState<string>('');
  const [buscaCheckpoint, setBuscaCheckpoint] = useState('');
  const [loading, setLoading] = useState(false);

  // Estados de GPS e Scanner
  const [localizacao, setLocalizacao] = useState<Location.LocationObject | null>(null);
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [distanciaAtual, setDistanciaAtual] = useState<number | null>(null);
  const [tempoRestante, setTempoRestante] = useState<number | null>(null);
  const [modalScanner, setModalScanner] = useState(false);
  const [permissaoCamera, pedirPermissaoCamera] = useCameraPermissions();

  // Pânico
  const [segurandoPanico, setSegurandoPanico] = useState(false);
  const [timerPanico, setTimerPanico] = useState<any>(null);
  const [horaAtualDaUI, setHoraAtualDaUI] = useState(Date.now());

  // === ESTADOS DO CHECKLIST DE SERVIÇO (FASE 2) ===
  const [checklistsServico, setChecklistsServico] = useState<any[]>([]);
  const [execucoesHoje, setExecucoesHoje] = useState<any[]>([]);
  const [modalPassagem, setModalPassagem] = useState(false);
  const [checklistAtivo, setChecklistAtivo] = useState<any>(null);
  const [respostasPassagem, setRespostasPassagem] = useState<any>({});
  const [loadingPassagem, setLoadingPassagem] = useState(false);

  useEffect(() => {
    const timerRelogio = setInterval(() => setHoraAtualDaUI(Date.now()), 10000);
    return () => clearInterval(timerRelogio);
  }, []);

  useEffect(() => {
    async function carregarDados() {
      const userString = await AsyncStorage.getItem('@RondasApp:user');
      if (userString) {
        const usuario = JSON.parse(userString);
        setNomePosto(usuario.nome);
        setPostoId(usuario.posto_id || null);
        carregarRotas(); 
        carregarChecklists(); // Carrega as passagens de serviço
      }
      
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus === 'granted') {
        await Location.requestBackgroundPermissionsAsync();
      }
      await Notifications.requestPermissionsAsync();
    }
    carregarDados();
  }, []);

  // === NOVA FUNÇÃO: CARREGAR CHECKLISTS DE SERVIÇO ===
  async function carregarChecklists() {
    try {
      const res = await api.get('/checklists-servico/app');
      setChecklistsServico(res.data.checklists || []);
      setExecucoesHoje(res.data.execucoes_hoje || []);
    } catch (e) { console.log("Erro ao carregar checklists", e); }
  }

  async function gerenciarAlertasDeRonda(rotas: any[]) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    rotas.forEach(async (rota) => {
      if (rota.intervalo_minutos && rota.ultima_execucao) {
        const ultimaTs = new Date(rota.ultima_execucao).getTime();
        const proximaTs = ultimaTs + (rota.intervalo_minutos * 60000);
        if (proximaTs > Date.now()) {
          await Notifications.scheduleNotificationAsync({
            content: { title: "⏰ Hora da Ronda!", body: `O roteiro "${rota.nome}" está liberado. Inicie agora!`, sound: true, priority: Notifications.AndroidPriority.MAX },
            trigger: { date: new Date(proximaTs) },
          });
        }
      }
    });
  }

  async function carregarRotas() {
    setBuscandoCheckpoints(true);
    try { 
      const res = await api.get('/rotas'); 
      setRotasDisponiveis(res.data); 
      gerenciarAlertasDeRonda(res.data);
      
      const mapaPontos = new Map();
      const listaPontosUnicos: any[] = [];
      res.data.forEach((rota: any) => {
        if (rota.rota_checkpoints) {
          rota.rota_checkpoints.forEach((rc: any) => {
            if (rc.checkpoints && !mapaPontos.has(rc.checkpoints.id)) {
              mapaPontos.set(rc.checkpoints.id, true);
              listaPontosUnicos.push(rc.checkpoints);
            }
          });
        }
      });
      setCheckpointsPosto(listaPontosUnicos); 
    } catch (e) {} finally { setBuscandoCheckpoints(false); }
  }

  useEffect(() => {
    if (!rondaEmAndamento || tempoRestante === null || buscandoGps) return;
    if (tempoRestante <= 0) { registrarFalhaPorTempo(); return; }
    const interval = setInterval(() => { setTempoRestante(t => (t && t > 0 ? t - 1 : 0)); }, 1000);
    return () => clearInterval(interval);
  }, [rondaEmAndamento, tempoRestante, buscandoGps]);

  useEffect(() => {
    let watchSubscription: Location.LocationSubscription | null = null;
    async function iniciarRastreamento() {
      if (rondaEmAndamento && pontoAtual?.checkpoints?.tipo_validacao === 'AUTOMATICA' && !buscandoGps) {
        const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        if (!hasStarted) {
          await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 3000,
            distanceInterval: 1,
            foregroundService: { notificationTitle: "Ronda em Andamento", notificationBody: "O GPS está monitorando ativamente.", notificationColor: "#dc2626" },
          });
        }

        watchSubscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 3000, distanceInterval: 1 },
          (loc) => {
            setLocalizacao(loc);
            const dist = calcularDistancia(
              loc.coords.latitude, loc.coords.longitude,
              Number(pontoAtual.checkpoints.latitude), Number(pontoAtual.checkpoints.longitude)
            );
            setDistanciaAtual(dist);
            if (dist <= Number(pontoAtual.checkpoints.raio_tolerancia)) {
              if (watchSubscription) watchSubscription.remove();
              registrarPontoNaApi(loc.coords.latitude, loc.coords.longitude);
            }
          }
        );
      }
    }
    iniciarRastreamento();
    return () => { if (watchSubscription) watchSubscription.remove(); };
  }, [rondaEmAndamento, pontoAtual, buscandoGps]);

  async function pararRastreamentoBackground() {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (hasStarted) { await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK); }
  }

  async function iniciarRonda(rota: any) {
    try {
      const res = await api.post('/rondas/iniciar', { rota_id: rota.id });
      setRondaEmAndamento({ ...res.data, rotas: rota }); 
      const primeiroPonto = rota.rota_checkpoints[0];
      setPontoAtual(primeiroPonto); setDistanciaAtual(null); setTempoRestante((primeiroPonto.tempo_limite_min || 5) * 60);
      Alert.alert('Ronda Iniciada!', `Dirija-se para: ${primeiroPonto.checkpoints.nome}`);
    } catch (e) { Alert.alert('Erro', 'Falha ao iniciar.'); }
  }

  async function avancaParaProximoPontoOuFinaliza() {
    const listaPontos = rondaEmAndamento.rotas.rota_checkpoints;
    const indexAtual = listaPontos.findIndex((p: any) => p.checkpoint_id === pontoAtual.checkpoint_id);
    
    if (indexAtual + 1 < listaPontos.length) {
      const proxPonto = listaPontos[indexAtual + 1];
      setPontoAtual(proxPonto); setDistanciaAtual(null); setTempoRestante((proxPonto.tempo_limite_min || 5) * 60); 
    } else {
      try {
        const res = await api.post('/rondas/encerrar', { ronda_id: rondaEmAndamento.id });
        if (res.data.message.includes('PERDIDA')) Alert.alert('⚠️ Roteiro Encerrado', 'Patrulha finalizada com pontos perdidos.');
        else Alert.alert('🎉 Patrulha Concluída', 'Todos os pontos foram visitados no tempo certo!');
      } catch(e) {}
      pararRastreamentoBackground(); carregarRotas(); setRondaEmAndamento(null); setPontoAtual(null); setTempoRestante(null); setDistanciaAtual(null);
    }
  }

  async function registrarFalhaPorTempo() {
    setBuscandoGps(true); setTempoRestante(null);
    try { await api.post('/rondas/falhar-ponto', { ronda_id: rondaEmAndamento.id, checkpoint_id: pontoAtual.checkpoint_id }); Alert.alert('Tempo Esgotado', `Tempo expirado.`); } catch (e) {} 
    finally { setBuscandoGps(false); avancaParaProximoPontoOuFinaliza(); }
  }

  async function registrarPontoNaApi(lat: number, lng: number) {
    setBuscandoGps(true);
    try { await api.post('/rondas/bater-ponto', { ronda_id: rondaEmAndamento.id, checkpoint_id: pontoAtual.checkpoint_id, latitude: lat, longitude: lng }); avancaParaProximoPontoOuFinaliza(); } 
    catch (e: any) { Alert.alert('Falha', e.response?.data?.error || 'Erro de conexão.'); } finally { setBuscandoGps(false); }
  }

  function interromperPatrulhaManual() {
    Alert.alert("⚠️ Interromper", "Deseja realmente abandonar a ronda?", [
      { text: "Continuar", style: "cancel" },
      { text: "Abandonar", style: "destructive", onPress: async () => {
          try { await api.post('/rondas/encerrar', { ronda_id: rondaEmAndamento.id, abandonada: true }); } catch(e) {}
          pararRastreamentoBackground(); carregarRotas(); setRondaEmAndamento(null); setPontoAtual(null); setTempoRestante(null); setDistanciaAtual(null);
      }}
    ]);
  }

  async function abrirScanner() {
    if (!permissaoCamera?.granted) {
      const result = await pedirPermissaoCamera();
      if (!result.granted) return Alert.alert('Aviso', 'Precisamos da câmera.');
    }
    setModalScanner(true);
  }

  async function handleBarCodeScanned({ data }: { data: string }) {
    setModalScanner(false);
    if (data !== pontoAtual.checkpoint_id) return Alert.alert('❌ Erro', 'QR Code incorreto.');
    setBuscandoGps(true); 
    try {
      let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await registrarPontoNaApi(loc.coords.latitude, loc.coords.longitude);
    } catch (e) { await registrarPontoNaApi(0, 0); } 
  }

  async function enviarOcorrencia() {
    if (!descricaoOcorrencia.trim()) return Alert.alert('Erro', 'Descreva o que aconteceu.');
    setLoading(true);
    try {
      await api.post('/ocorrencias', { ronda_id: rondaEmAndamento ? rondaEmAndamento.id : null, posto_id: postoId || null, checkpoint_id: checkpointSelecionado || null, titulo: 'Ocorrência registrada via App', descricao: descricaoOcorrencia, foto_base64: fotoBase64 });
      Alert.alert('Sucesso', 'Ocorrência enviada!'); setModalOcorrencia(false); setDescricaoOcorrencia(''); setFotoBase64(null); setCheckpointSelecionado(''); setBuscaCheckpoint(''); 
    } catch (e: any) { Alert.alert('Erro', e.response?.data?.error || 'Falha ao enviar.'); } finally { setLoading(false); }
  }

  async function abrirCameraOcorrencia() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permissão Negada', 'Precisamos da câmera.');
    let result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.3, base64: true });
    if (!result.canceled && result.assets && result.assets[0].base64) { setFotoBase64(`data:image/jpeg;base64,${result.assets[0].base64}`); }
  }

  async function deslogar() { await AsyncStorage.clear(); if (navigation) navigation.replace('Login'); }

  async function dispararSinalPanico() {
    try {
      let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await api.post('/ocorrencias/panico', { latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      Alert.alert('🆘 SINAL ENVIADO', 'A central foi notificada.');
    } catch (e) { Alert.alert('Erro', 'Falha ao enviar sinal de pânico.'); }
  }

  const handleStartPanico = () => {
    setSegurandoPanico(true);
    setTimerPanico(setTimeout(() => { dispararSinalPanico(); setSegurandoPanico(false); }, 1500));
  };
  const handleCancelPanico = () => { if (timerPanico) clearTimeout(timerPanico); setSegurandoPanico(false); };

  // ==========================================
  // LÓGICA DO CHECKLIST DE SERVIÇO (Passagem)
  // ==========================================
  function obterStatusChecklist(chk: any) {
    const horarios = chk.horarios.split(',').map((h: string) => h.trim());
    let janelaAberta = null;
    let proximoHorario = null;
    let jaRespondido = false;

    const timestamps = horarios.map((h: string) => {
      const [hora, min] = h.split(':').map(Number);
      const d = new Date(horaAtualDaUI);
      d.setHours(hora, min, 0, 0);
      return d.getTime();
    }).sort((a: number, b: number) => a - b);

    for (const ts of timestamps) {
      const inicioJanela = ts - (30 * 60000); // 30 min antes
      const fimJanela = ts + (30 * 60000);   // 30 min depois

      const execucaoNaJanela = execucoesHoje.find((e: any) => {
        if (e.checklist_id !== chk.id) return false;
        const execTs = new Date(e.criado_em).getTime();
        return execTs >= inicioJanela && execTs <= fimJanela;
      });

      if (horaAtualDaUI >= inicioJanela && horaAtualDaUI <= fimJanela) {
        if (execucaoNaJanela) jaRespondido = true;
        else janelaAberta = ts;
      }
      if (ts > horaAtualDaUI && !proximoHorario && !janelaAberta && !jaRespondido) {
        proximoHorario = ts;
      }
    }
    if (!janelaAberta && !proximoHorario && timestamps.length > 0) { proximoHorario = timestamps[0] + 86400000; }
    return { janelaAberta, proximoHorario, jaRespondido };
  }

  function iniciarPassagemServico(chk: any) {
    setChecklistAtivo(chk);
    const initial: any = {};
    chk.perguntas.forEach((p: any) => {
      initial[p.id] = { pergunta_id: p.id, resposta: 'Conforme', observacao: '', foto_base64: null };
    });
    setRespostasPassagem(initial);
    setModalPassagem(true);
  }

  function atualizarResposta(perguntaId: string, campo: string, valor: any) {
    setRespostasPassagem((prev: any) => ({
      ...prev,
      [perguntaId]: { ...prev[perguntaId], [campo]: valor }
    }));
  }

  async function tirarFotoPassagem(perguntaId: string) {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Aviso', 'Precisamos da câmera.');
    let result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.3, base64: true });
    if (!result.canceled && result.assets && result.assets[0].base64) {
      atualizarResposta(perguntaId, 'foto_base64', `data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  }

  async function enviarPassagemServico() {
    // Validação de fotos obrigatórias
    for (const p of checklistAtivo.perguntas) {
      if (p.exige_foto && !respostasPassagem[p.id].foto_base64) {
        return Alert.alert('Atenção', `A pergunta "${p.pergunta}" exige uma foto.`);
      }
    }
    
    setLoadingPassagem(true);
    try {
      const respostasArray = Object.values(respostasPassagem);
      await api.post('/checklists-servico/app/responder', {
        checklist_id: checklistAtivo.id,
        respostas: respostasArray
      });
      Alert.alert('Sucesso', 'Passagem de serviço registrada!');
      setModalPassagem(false);
      carregarChecklists(); // Recarrega para bloquear o botão recém respondido
    } catch (e: any) {
      Alert.alert('Erro', 'Falha ao registrar passagem.');
    } finally {
      setLoadingPassagem(false);
    }
  }

  const checkpointsFiltrados = checkpointsPosto.filter(cp => cp.nome.toLowerCase().includes(buscaCheckpoint.toLowerCase()));
  const isPontoManual = pontoAtual?.checkpoints?.tipo_validacao === 'MANUAL';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{nomePosto}</Text>
      <Text style={styles.subtitle}>Operação de Vigilância Ativa</Text>

      {!rondaEmAndamento ? (
        <View style={{ width: '100%', flex: 1 }}>

          {/* === NOVO: ÁREA DE PASSAGEM DE SERVIÇO === */}
          {checklistsServico.length > 0 && (
            <View style={{ marginBottom: 25 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>Passagem de Serviço:</Text>
              {checklistsServico.map(chk => {
                const status = obterStatusChecklist(chk);
                let btnColor = '#94a3b8'; // Cinza (Bloqueado)
                let texto = '';

                if (status.jaRespondido) {
                  btnColor = '#10b981'; // Verde Sucesso
                  texto = '✅ Respondido';
                } else if (status.janelaAberta) {
                  btnColor = '#ea580c'; // Laranja (Ação Requerida)
                  texto = '📝 Preencher Agora';
                } else {
                  const dataProxima = new Date(status.proximoHorario || 0);
                  const hh = dataProxima.getHours().toString().padStart(2, '0');
                  const mm = dataProxima.getMinutes().toString().padStart(2, '0');
                  texto = `⏳ Aguarde as ${hh}:${mm}`;
                }

                return (
                  <View key={chk.id} style={styles.rotaCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1e293b' }}>{chk.titulo}</Text>
                      <Text style={{ color: '#64748b', fontSize: 12 }}>Tolerância de 30 minutos</Text>
                    </View>
                    <TouchableOpacity 
                      style={[styles.btnIniciar, { backgroundColor: btnColor }]} 
                      onPress={() => status.janelaAberta ? iniciarPassagemServico(chk) : Alert.alert('Aviso', status.jaRespondido ? 'Você já preencheu este formulário nesta janela de horário.' : `Este formulário só será liberado próximo das ${texto.replace('⏳ Aguarde as ', '')}.`)}
                    >
                      <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{texto}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          <TouchableOpacity style={[styles.button, { backgroundColor: '#dc2626', marginBottom: 25 }]} onPress={() => setModalOcorrencia(true)}>
            <Text style={styles.buttonText}>⚠️ Registrar Ocorrência</Text>
          </TouchableOpacity>

          <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>Roteiros Disponíveis:</Text>
          <ScrollView>
          {rotasDisponiveis.map(rota => {
            const ultimaExecucaoTs = rota.ultima_execucao ? new Date(rota.ultima_execucao).getTime() : 0;
            const intervaloMs = (rota.intervalo_minutos || 0) * 60000;
            const proximaExecucaoTs = ultimaExecucaoTs + intervaloMs;
            const liberada = !rota.intervalo_minutos || ultimaExecucaoTs === 0 || horaAtualDaUI >= proximaExecucaoTs;

            let textoBotao = "Iniciar";
            if (!liberada) {
              const dataProxima = new Date(proximaExecucaoTs);
              const hh = dataProxima.getHours().toString().padStart(2, '0');
              const mm = dataProxima.getMinutes().toString().padStart(2, '0');
              textoBotao = `⏳ Às ${hh}:${mm}`;
            }

            return (
              <View key={rota.id} style={styles.rotaCard}>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: 'bold' }}>{rota.nome}</Text>
                  <Text style={{ color: '#666' }}>{rota.rota_checkpoints.length} pontos a visitar</Text>
                </View>
                <TouchableOpacity style={[styles.btnIniciar, !liberada && { backgroundColor: '#94a3b8' }]} onPress={() => liberada ? iniciarRonda(rota) : Alert.alert('Aguarde', `Ronda libertada às ${textoBotao.replace('⏳ Às ', '')}.`)}>
                  <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{textoBotao}</Text>
                </TouchableOpacity>
              </View>
            );
          })}
          </ScrollView>
        </View>
      ) : (
        /* ... ECRÃ DA RONDA EM ANDAMENTO MANTIDO IGUAL ... */
        <View style={{ width: '100%', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ backgroundColor: tempoRestante && tempoRestante <= 60 ? '#fee2e2' : '#e0f2fe', padding: 15, borderRadius: 30, marginBottom: 20 }}>
            <Text style={{ fontSize: 28, fontWeight: 'bold', color: tempoRestante && tempoRestante <= 60 ? '#dc2626' : '#0369a1' }}>
              ⏱️ {tempoRestante !== null ? formatarTempo(tempoRestante) : '00:00'}
            </Text>
          </View>
          <View style={{ backgroundColor: '#fff', padding: 20, borderRadius: 8, width: '100%', borderWidth: 1, borderColor: '#ddd', alignItems: 'center' }}>
            <Text style={{ fontSize: 16, color: '#666' }}>Próximo Destino:</Text>
            <Text style={{ fontSize: 24, fontWeight: 'bold', marginVertical: 10, textAlign: 'center' }}>{pontoAtual?.checkpoints.nome}</Text>
            {!isPontoManual ? (
              <Text style={{ fontSize: 18, color: '#059669', fontWeight: 'bold', marginVertical: 15 }}>Distância: {distanciaAtual !== null ? `${distanciaAtual}m` : 'Calculando...'}</Text>
            ) : (
              <TouchableOpacity style={[styles.button, { backgroundColor: '#ea580c', height: 60, marginBottom: 15 }]} onPress={abrirScanner}>
                <Text style={styles.buttonText}>📷 Ler QR Code</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.button, { backgroundColor: '#dc2626', height: 50, marginTop: 15 }]} onPress={() => setModalOcorrencia(true)}>
              <Text style={styles.buttonText}>⚠️ Registrar Ocorrência</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, { backgroundColor: '#64748b', height: 50, marginTop: 15 }]} onPress={interromperPatrulhaManual}>
              <Text style={styles.buttonText}>⏹️ Interromper Patrulha</Text>
            </TouchableOpacity>
          </View>
          <Modal visible={modalScanner} animationType="slide" transparent={false}>
            <View style={{ flex: 1, backgroundColor: '#000' }}>
              <CameraView style={StyleSheet.absoluteFillObject} facing="back" onBarcodeScanned={handleBarCodeScanned} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} />
              <TouchableOpacity style={{ position: 'absolute', bottom: 50, alignSelf: 'center', backgroundColor: '#dc2626', padding: 15, borderRadius: 8 }} onPress={() => setModalScanner(false)}>
                <Text style={{ color: '#FFF', fontWeight: 'bold' }}>✕ Cancelar</Text>
              </TouchableOpacity>
            </View>
          </Modal>
        </View>
      )}

      {/* === MODAL DA PASSAGEM DE SERVIÇO === */}
      <Modal visible={modalPassagem} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#f8fafc', paddingTop: 40 }}>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#1e293b', marginBottom: 5, textAlign: 'center' }}>{checklistAtivo?.titulo}</Text>
            <Text style={{ fontSize: 14, color: '#64748b', marginBottom: 25, textAlign: 'center' }}>Responda com atenção.</Text>

            {checklistAtivo?.perguntas.map((p: any, index: number) => (
              <View key={p.id} style={{ backgroundColor: '#fff', padding: 20, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#e2e8f0' }}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#334155', marginBottom: 15 }}>{index + 1}. {p.pergunta}</Text>
                
                {/* Botões de Conforme / Não Conforme */}
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 15 }}>
                  <TouchableOpacity 
                    style={[styles.btnToggle, respostasPassagem[p.id]?.resposta === 'Conforme' ? { backgroundColor: '#10b981', borderColor: '#10b981' } : {}]}
                    onPress={() => atualizarResposta(p.id, 'resposta', 'Conforme')}
                  >
                    <Text style={{ color: respostasPassagem[p.id]?.resposta === 'Conforme' ? '#fff' : '#64748b', fontWeight: 'bold' }}>Sim / Conforme</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.btnToggle, respostasPassagem[p.id]?.resposta === 'Não Conforme' ? { backgroundColor: '#ef4444', borderColor: '#ef4444' } : {}]}
                    onPress={() => atualizarResposta(p.id, 'resposta', 'Não Conforme')}
                  >
                    <Text style={{ color: respostasPassagem[p.id]?.resposta === 'Não Conforme' ? '#fff' : '#64748b', fontWeight: 'bold' }}>Não / Com Defeito</Text>
                  </TouchableOpacity>
                </View>

                {/* Observação */}
                <TextInput 
                  style={[styles.input, { height: 45, fontSize: 14, marginBottom: p.exige_foto ? 15 : 0 }]} 
                  placeholder="Observações (Opcional)..." 
                  value={respostasPassagem[p.id]?.observacao} 
                  onChangeText={txt => atualizarResposta(p.id, 'observacao', txt)} 
                />

                {/* Foto Obrigatória ou Opcional */}
                {p.exige_foto && (
                  <TouchableOpacity style={[styles.button, { backgroundColor: respostasPassagem[p.id]?.foto_base64 ? '#10b981' : '#475569', height: 45 }]} onPress={() => tirarFotoPassagem(p.id)}>
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>
                      {respostasPassagem[p.id]?.foto_base64 ? '📸 Foto Capturada (Tirar Outra)' : '📸 Tirar Foto (Obrigatório)'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingBottom: 40 }}>
              <TouchableOpacity style={[styles.button, { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', marginRight: 10 }]} onPress={() => setModalPassagem(false)}>
                <Text style={[styles.buttonText, { color: '#475569' }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1, backgroundColor: '#2563eb' }]} onPress={enviarPassagemServico} disabled={loadingPassagem}>
                {loadingPassagem ? <ActivityIndicator color="#FFF"/> : <Text style={styles.buttonText}>🚀 Enviar</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Modal de Ocorrência Padrão Mantido */}
      <Modal visible={modalOcorrencia} animationType="slide">
        {/* ... Lógica já existente da modal de ocorrência ... */}
        <View style={{ flex: 1, backgroundColor: '#f8fafc', paddingTop: 40 }}>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#1e293b', marginBottom: 20, textAlign: 'center' }}>Nova Ocorrência</Text>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#334155', marginBottom: 10 }}>1. Em qual ponto ocorreu? (Opcional)</Text>
            {buscandoCheckpoints ? ( <Text style={{ color: '#94a3b8', marginBottom: 25, fontStyle: 'italic' }}>Carregando pontos da rota...</Text> ) : checkpointsPosto.length > 0 ? (
              <View style={{ marginBottom: 25 }}>
                <TextInput style={[styles.input, { height: 45, marginBottom: 10, backgroundColor: '#e2e8f0', borderColor: '#cbd5e1', fontSize: 15 }]} placeholder="🔍 Digite para pesquisar o ponto..." value={buscaCheckpoint} onChangeText={setBuscaCheckpoint} />
                <View style={{ maxHeight: 180, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, backgroundColor: '#fff', overflow: 'hidden' }}>
                  <ScrollView nestedScrollEnabled={true}>
                    {checkpointsFiltrados.map((cp: any) => (
                      <TouchableOpacity key={cp.id} style={{ padding: 15, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: checkpointSelecionado === cp.id ? '#fee2e2' : '#fff', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }} onPress={() => setCheckpointSelecionado(checkpointSelecionado === cp.id ? '' : cp.id)}>
                        <Text style={{ color: checkpointSelecionado === cp.id ? '#dc2626' : '#475569', fontWeight: 'bold', fontSize: 15 }}>{cp.nome}</Text>
                        {checkpointSelecionado === cp.id && <Text style={{ color: '#dc2626', fontWeight: 'bold', fontSize: 16 }}>✓</Text>}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>
            ) : ( <Text style={{ color: '#94a3b8', marginBottom: 25, fontStyle: 'italic' }}>Nenhum ponto cadastrado para este posto.</Text> )}
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#334155', marginBottom: 10 }}>2. Descreva o Problema:</Text>
            <TextInput style={[styles.input, { height: 120, textAlignVertical: 'top', backgroundColor: '#fff', marginBottom: 25 }]} placeholder="Descreva detalhadamente o que aconteceu..." multiline value={descricaoOcorrencia} onChangeText={setDescricaoOcorrencia} />
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#334155', marginBottom: 10 }}>3. Evidência Visual (Opcional):</Text>
            <TouchableOpacity style={[styles.button, { backgroundColor: '#475569', marginBottom: 20 }]} onPress={abrirCameraOcorrencia}><Text style={styles.buttonText}>📸 Tirar Foto do Problema</Text></TouchableOpacity>
            {fotoBase64 && (
              <View style={{ position: 'relative' }}>
                 <Image source={{ uri: fotoBase64 }} style={{ width: '100%', height: 200, borderRadius: 8, marginBottom: 20, borderWidth: 1, borderColor: '#cbd5e1' }} />
                 <Text style={{ color: '#10b981', textAlign: 'center', fontWeight: 'bold', marginBottom: 20 }}>✅ Imagem anexada com sucesso!</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingBottom: 30 }}>
              <TouchableOpacity style={[styles.button, { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', marginRight: 10 }]} onPress={() => { setModalOcorrencia(false); setBuscaCheckpoint(''); }}><Text style={[styles.buttonText, { color: '#475569' }]}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1, backgroundColor: '#16a34a' }]} onPress={enviarOcorrencia} disabled={loading}>{loading ? <ActivityIndicator color="#FFF"/> : <Text style={styles.buttonText}>🚀 Enviar Ocorrência</Text>}</TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <TouchableOpacity style={[styles.btnPanico, segurandoPanico && { backgroundColor: '#000', transform: [{ scale: 1.1 }] }]} onPressIn={handleStartPanico} onPressOut={handleCancelPanico}>
        <Text style={styles.textPanico}>{segurandoPanico ? 'ENVIANDO...' : 'S.O.S'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, { backgroundColor: '#d9534f', marginTop: 40, height: 45 }]} onPress={deslogar}>
        <Text style={styles.buttonText}>Desconectar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5', alignItems: 'center', padding: 20, paddingTop: 60 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 5 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 30 },
  input: { width: '100%', height: 55, backgroundColor: '#FFF', borderRadius: 8, paddingHorizontal: 15, marginBottom: 15, borderWidth: 1, borderColor: '#DDD', fontSize: 18 },
  button: { width: '100%', height: 55, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  rotaCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', padding: 15, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#DDD' },
  btnIniciar: { backgroundColor: '#0056b3', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 6 },
  btnPanico: { position: 'absolute', bottom: 100, right: 20, width: 75, height: 75, borderRadius: 40, backgroundColor: '#dc2626', justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4 },
  textPanico: { color: '#fff', fontWeight: 'bold', fontSize: 16, textAlign: 'center' },
  btnToggle: { flex: 1, padding: 12, borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' }
});