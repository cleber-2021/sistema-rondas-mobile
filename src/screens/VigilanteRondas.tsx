import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, Modal, ScrollView, TextInput, Image, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location'; 
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as TaskManager from 'expo-task-manager';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  
  // Cronômetro resiliente
  const [tempoRestante, setTempoRestante] = useState<number>(0);
  const [buscandoGps, setBuscandoGps] = useState(false);
  
  const [modalScanner, setModalScanner] = useState(false);
  const [permissaoCamera, pedirPermissaoCamera] = useCameraPermissions();
  const [modalOcorrencia, setModalOcorrencia] = useState(false);
  const [descricaoOcorrencia, setDescricaoOcorrencia] = useState('');
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const [loadingOco, setLoadingOco] = useState(false);

  useEffect(() => {
    carregarRotas();
    verificarRondaEmAndamento();
  }, []);

  async function verificarRondaEmAndamento() {
    const salva = await AsyncStorage.getItem('@Ronda:emAndamento');
    const fim = await AsyncStorage.getItem('@Ronda:fim');
    if (salva && fim) {
      const ronda = JSON.parse(salva);
      setRondaEmAndamento(ronda);
      setPontoAtual(ronda.pontoAtual);
    }
  }

  // Cronômetro que ignora pausas do sistema
  useEffect(() => {
    if (!rondaEmAndamento) return;
    const interval = setInterval(async () => {
      const fim = await AsyncStorage.getItem('@Ronda:fim');
      if (fim) {
        const restante = Math.floor((parseInt(fim) - Date.now()) / 1000);
        if (restante <= 0) {
          clearInterval(interval);
          registrarFalhaPorTempo();
        } else {
          setTempoRestante(restante);
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [rondaEmAndamento]);

  useEffect(() => {
    let watchSubscription: Location.LocationSubscription | null = null;
    async function iniciarRastreamento() {
      if (rondaEmAndamento && pontoAtual?.checkpoints?.tipo_validacao === 'AUTOMATICA') {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
            accuracy: Location.Accuracy.BestForNavigation, timeInterval: 3000, distanceInterval: 1,
            foregroundService: { notificationTitle: "Ronda Ativa", notificationBody: "Monitorando posição...", notificationColor: "#0284c7" },
        });
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
  }, [rondaEmAndamento, pontoAtual]);

  async function carregarRotas() {
    try { const res = await api.get('/rotas'); setRotasDisponiveis(res.data); } catch (e) {} 
  }

  async function iniciarRonda(rota: any) {
    try {
      const res = await api.post('/rondas/iniciar', { rota_id: rota.id });
      const r = { ...res.data, rotas: rota, pontoAtual: rota.rota_checkpoints[0] };
      const fim = Date.now() + ((rota.rota_checkpoints[0].tempo_limite_min || 5) * 60000);
      
      await AsyncStorage.setItem('@Ronda:emAndamento', JSON.stringify(r));
      await AsyncStorage.setItem('@Ronda:fim', fim.toString());
      
      setRondaEmAndamento(r);
      setPontoAtual(rota.rota_checkpoints[0]);
    } catch (e) { Alert.alert('Erro', 'Falha ao iniciar.'); }
  }

  async function registrarPontoNaApi(lat: number, lng: number) {
    try {
      await api.post('/rondas/bater-ponto', { ronda_id: rondaEmAndamento.id, checkpoint_id: pontoAtual.checkpoint_id, latitude: lat, longitude: lng });
      avancaParaProximoPontoOuFinaliza();
    } catch (e) { Alert.alert('Falha', 'Erro ao registrar.'); }
  }

  async function avancaParaProximoPontoOuFinaliza() {
    const lista = rondaEmAndamento.rotas.rota_checkpoints;
    const idx = lista.findIndex((p: any) => p.checkpoint_id === pontoAtual.checkpoint_id);
    if (idx + 1 < lista.length) {
      const prox = lista[idx + 1];
      const r = { ...rondaEmAndamento, pontoAtual: prox };
      setPontoAtual(prox);
      setRondaEmAndamento(r);
      const novoFim = Date.now() + ((prox.tempo_limite_min || 5) * 60000);
      await AsyncStorage.setItem('@Ronda:emAndamento', JSON.stringify(r));
      await AsyncStorage.setItem('@Ronda:fim', novoFim.toString());
    } else {
      await api.post('/rondas/encerrar', { ronda_id: rondaEmAndamento.id });
      await AsyncStorage.multiRemove(['@Ronda:emAndamento', '@Ronda:fim']);
      setRondaEmAndamento(null);
      Alert.alert('Sucesso', 'Ronda finalizada!');
    }
  }

  async function registrarFalhaPorTempo() {
    await api.post('/rondas/falhar-ponto', { ronda_id: rondaEmAndamento.id, checkpoint_id: pontoAtual.checkpoint_id });
    avancaParaProximoPontoOuFinaliza();
  }

  async function abrirScanner() {
    if (!permissaoCamera?.granted) { const res = await pedirPermissaoCamera(); if (!res.granted) return; }
    setModalScanner(true);
  }

  async function handleBarCodeScanned({ data }: { data: string }) {
    setModalScanner(false);
    if (data !== pontoAtual.checkpoint_id) return Alert.alert('❌ Erro', 'QR Code incorreto.');
    let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await registrarPontoNaApi(loc.coords.latitude, loc.coords.longitude);
  }

  async function enviarOcorrenciaDuranteRonda() {
    setLoadingOco(true);
    try {
      await api.post('/ocorrencias', { ronda_id: rondaEmAndamento.id, checkpoint_id: pontoAtual.checkpoint_id, titulo: 'Ocorrência', descricao: descricaoOcorrencia, foto_base64: fotoBase64 });
      Alert.alert('Sucesso', 'Enviado!'); setModalOcorrencia(false);
    } finally { setLoadingOco(false); }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{rondaEmAndamento ? 'Ronda em Andamento' : 'Suas Rondas'}</Text>
      </View>
      {!rondaEmAndamento ? (
        <ScrollView style={{ padding: 20 }}>
          {rotasDisponiveis.map(rota => (
            <View key={rota.id} style={styles.rotaCard}>
              <Text style={{fontWeight: 'bold'}}>{rota.nome}</Text>
              <TouchableOpacity style={styles.btnIniciar} onPress={() => iniciarRonda(rota)}><Text style={{color: '#fff'}}>Iniciar</Text></TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.areaRonda}>
            <Text style={styles.timer}>⏱️ {formatarTempo(tempoRestante)}</Text>
            <Text style={styles.pontoNome}>{pontoAtual?.checkpoints.nome}</Text>
            {pontoAtual?.checkpoints?.tipo_validacao === 'MANUAL' && (
              <TouchableOpacity style={styles.btnAcao} onPress={abrirScanner}><Text style={styles.btnAcaoText}>📷 Ler QR</Text></TouchableOpacity>
            )}
        </View>
      )}
      <Modal visible={modalScanner} animationType="slide"><CameraView style={StyleSheet.absoluteFillObject} facing="back" onBarcodeScanned={handleBarCodeScanned} /></Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { padding: 25, paddingTop: 60, backgroundColor: '#1e293b' },
  title: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  timer: { fontSize: 50, fontWeight: 'bold', color: '#dc2626', marginVertical: 20 },
  pontoNome: { fontSize: 20, color: '#334155', marginBottom: 20 },
  rotaCard: { backgroundColor: '#fff', padding: 20, borderRadius: 12, marginBottom: 15, flexDirection: 'row', justifyContent: 'space-between' },
  btnIniciar: { backgroundColor: '#0284c7', padding: 12, borderRadius: 8 },
  btnAcao: { backgroundColor: '#ea580c', padding: 15, borderRadius: 8, width: '90%', alignItems: 'center' },
  btnAcaoText: { color: '#fff', fontWeight: 'bold' },
  areaRonda: { flex: 1, alignItems: 'center', padding: 20 }
});