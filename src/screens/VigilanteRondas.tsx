import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, Modal, ScrollView, TextInput, Image, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location'; 
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as TaskManager from 'expo-task-manager';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

const BACKGROUND_LOCATION_TASK = 'BACKGROUND_LOCATION_TASK';

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, ({ data, error }) => {
  if (error) return;
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

export default function VigilanteRondas({ navigation }: any) {
  const [rotasDisponiveis, setRotasDisponiveis] = useState<any[]>([]);
  const [rondaEmAndamento, setRondaEmAndamento] = useState<any>(null);
  const [pontoAtual, setPontoAtual] = useState<any>(null);
  
  const [distanciaAtual, setDistanciaAtual] = useState<number | null>(null);
  const [tempoRestante, setTempoRestante] = useState<number | null>(null);
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [modalScanner, setModalScanner] = useState(false);
  const [permissaoCamera, pedirPermissaoCamera] = useCameraPermissions();

  // Ocorrência dentro da ronda
  const [modalOcorrencia, setModalOcorrencia] = useState(false);
  const [descricaoOcorrencia, setDescricaoOcorrencia] = useState('');
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const [loadingOco, setLoadingOco] = useState(false);

  const [horaAtualDaUI, setHoraAtualDaUI] = useState(Date.now());

  useEffect(() => {
    const timerRelogio = setInterval(() => setHoraAtualDaUI(Date.now()), 10000);
    carregarRotas();
    return () => clearInterval(timerRelogio);
  }, []);

  async function carregarRotas() {
    try { 
      const res = await api.get('/rotas'); 
      setRotasDisponiveis(res.data); 
    } catch (e) {} 
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
            accuracy: Location.Accuracy.BestForNavigation, timeInterval: 3000, distanceInterval: 1,
            foregroundService: { notificationTitle: "Ronda em Andamento", notificationBody: "O GPS está monitorando ativamente.", notificationColor: "#0284c7" },
          });
        }
        watchSubscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 3000, distanceInterval: 1 },
          (loc) => {
            const dist = calcularDistancia(loc.coords.latitude, loc.coords.longitude, Number(pontoAtual.checkpoints.latitude), Number(pontoAtual.checkpoints.longitude));
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
    if (hasStarted) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
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

  async function enviarOcorrenciaDuranteRonda() {
    if (!descricaoOcorrencia.trim()) return Alert.alert('Erro', 'Descreva o problema.');
    setLoadingOco(true);
    try {
      await api.post('/ocorrencias', { ronda_id: rondaEmAndamento.id, checkpoint_id: pontoAtual.checkpoint_id, titulo: 'Ocorrência na Ronda', descricao: descricaoOcorrencia, foto_base64: fotoBase64 });
      Alert.alert('Sucesso', 'Ocorrência enviada!'); setModalOcorrencia(false); setDescricaoOcorrencia(''); setFotoBase64(null);
    } catch (e) { Alert.alert('Erro', 'Falha ao enviar.'); } finally { setLoadingOco(false); }
  }

  async function abrirCameraOcorrencia() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Negado', 'Precisamos da câmera.');
    let result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.3, base64: true });
    if (!result.canceled && result.assets && result.assets[0].base64) { setFotoBase64(`data:image/jpeg;base64,${result.assets[0].base64}`); }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {!rondaEmAndamento && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 15 }}>
            <Ionicons name="arrow-back" size={28} color="#1e293b" />
          </TouchableOpacity>
        )}
        <View>
          <Text style={styles.title}>{rondaEmAndamento ? 'Ronda em Andamento' : 'Suas Rondas'}</Text>
          <Text style={styles.subtitle}>{rondaEmAndamento ? pontoAtual?.checkpoints.nome : 'Roteiros de patrulha do posto'}</Text>
        </View>
      </View>

      {!rondaEmAndamento ? (
        <ScrollView style={{ flex: 1, width: '100%', padding: 20 }}>
          {rotasDisponiveis.map(rota => {
            const ultimaExecucaoTs = rota.ultima_execucao ? new Date(rota.ultima_execucao).getTime() : 0;
            const proximaExecucaoTs = ultimaExecucaoTs + ((rota.intervalo_minutos || 0) * 60000);
            const liberada = !rota.intervalo_minutos || ultimaExecucaoTs === 0 || horaAtualDaUI >= proximaExecucaoTs;

            let textoBotao = "Iniciar";
            if (!liberada) {
              const dataProxima = new Date(proximaExecucaoTs);
              textoBotao = `⏳ Às ${dataProxima.getHours().toString().padStart(2, '0')}:${dataProxima.getMinutes().toString().padStart(2, '0')}`;
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
      ) : (
        <View style={{ flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ backgroundColor: tempoRestante && tempoRestante <= 60 ? '#fee2e2' : '#e0f2fe', padding: 20, borderRadius: 30, marginBottom: 20, width: '100%', alignItems: 'center' }}>
            <Text style={{ fontSize: 35, fontWeight: 'bold', color: tempoRestante && tempoRestante <= 60 ? '#dc2626' : '#0284c7' }}>
              ⏱️ {tempoRestante !== null ? formatarTempo(tempoRestante) : '00:00'}
            </Text>
          </View>
          <View style={{ backgroundColor: '#fff', padding: 20, borderRadius: 12, width: '100%', elevation: 2, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, color: '#64748b' }}>Dirija-se para:</Text>
            <Text style={{ fontSize: 24, fontWeight: 'bold', marginVertical: 10, textAlign: 'center', color: '#1e293b' }}>{pontoAtual?.checkpoints.nome}</Text>
            
            {pontoAtual?.checkpoints?.tipo_validacao !== 'MANUAL' ? (
              <Text style={{ fontSize: 18, color: '#10b981', fontWeight: 'bold', marginVertical: 15 }}>Distância: {distanciaAtual !== null ? `${distanciaAtual}m` : 'Calculando...'}</Text>
            ) : (
              <TouchableOpacity style={[styles.btnAcao, { backgroundColor: '#ea580c' }]} onPress={abrirScanner}>
                <Text style={styles.btnAcaoText}>📷 Ler QR Code</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.btnAcao, { backgroundColor: '#dc2626' }]} onPress={() => setModalOcorrencia(true)}>
              <Text style={styles.btnAcaoText}>⚠️ Registrar Ocorrência Aqui</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btnAcao, { backgroundColor: '#64748b' }]} onPress={interromperPatrulhaManual}>
              <Text style={styles.btnAcaoText}>⏹️ Interromper Patrulha</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Modal Câmera QR */}
      <Modal visible={modalScanner} animationType="slide" transparent={false}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView style={StyleSheet.absoluteFillObject} facing="back" onBarcodeScanned={handleBarCodeScanned} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} />
          <TouchableOpacity style={{ position: 'absolute', bottom: 50, alignSelf: 'center', backgroundColor: '#dc2626', padding: 15, borderRadius: 8 }} onPress={() => setModalScanner(false)}>
            <Text style={{ color: '#FFF', fontWeight: 'bold' }}>✕ Cancelar Leitura</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Modal Ocorrência na Ronda */}
      <Modal visible={modalOcorrencia} animationType="slide">
        <View style={{ flex: 1, padding: 25, paddingTop: 60, backgroundColor: '#f8fafc' }}>
          <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#1e293b', marginBottom: 20 }}>Problema no Ponto</Text>
          <TextInput style={styles.inputArea} placeholder="O que encontrou de errado?" multiline value={descricaoOcorrencia} onChangeText={setDescricaoOcorrencia} />
          <TouchableOpacity style={styles.btnCamera} onPress={abrirCameraOcorrencia}>
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>📸 Anexar Foto</Text>
          </TouchableOpacity>
          {fotoBase64 && <Image source={{ uri: fotoBase64 }} style={{ width: '100%', height: 180, borderRadius: 8, marginTop: 15 }} />}
          
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 30 }}>
            <TouchableOpacity style={{ flex: 1, padding: 15, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, alignItems: 'center' }} onPress={() => setModalOcorrencia(false)}><Text style={{ fontWeight: 'bold' }}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, padding: 15, backgroundColor: '#dc2626', borderRadius: 8, alignItems: 'center' }} onPress={enviarOcorrenciaDuranteRonda} disabled={loadingOco}>{loadingOco ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: 'bold' }}>Enviar</Text>}</TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 25, paddingTop: 60, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1e293b' },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 2 },
  rotaCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', padding: 20, borderRadius: 12, marginBottom: 15, elevation: 2 },
  btnIniciar: { backgroundColor: '#0284c7', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  btnAcao: { width: '100%', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 15 },
  btnAcaoText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  inputArea: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 15, height: 120, textAlignVertical: 'top', fontSize: 15 },
  btnCamera: { backgroundColor: '#475569', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 15 },
});