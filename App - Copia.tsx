import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ActivityIndicator, Modal, ScrollView, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location'; 
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Notifications from 'expo-notifications';
import api from './src/services/api';
import { LogBox } from 'react-native';

LogBox.ignoreLogs(['expo-notifications: Android Push notifications']);

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
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

export default function App() {
  const [usuarioLocal, setUsuarioLocal] = useState(''); 
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [logado, setLogado] = useState(false);
  const [nomePosto, setNomePosto] = useState('');
  
  const [rotasDisponiveis, setRotasDisponiveis] = useState<any[]>([]);
  const [rondaEmAndamento, setRondaEmAndamento] = useState<any>(null);
  const [pontoAtual, setPontoAtual] = useState<any>(null);
  
  const [modalOcorrencia, setModalOcorrencia] = useState(false);
  const [descricaoOcorrencia, setDescricaoOcorrencia] = useState('');
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);

  const [localizacao, setLocalizacao] = useState<Location.LocationObject | null>(null);
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [distanciaAtual, setDistanciaAtual] = useState<number | null>(null);
  
  const [tempoRestante, setTempoRestante] = useState<number | null>(null);
  const [modalScanner, setModalScanner] = useState(false);
  const [permissaoCamera, pedirPermissaoCamera] = useCameraPermissions();

  useEffect(() => {
    async function verificarLogin() {
      const token = await AsyncStorage.getItem('@RondasApp:token');
      const userString = await AsyncStorage.getItem('@RondasApp:user');
      if (token && userString) {
        setNomePosto(JSON.parse(userString).nome); setLogado(true); carregarRotas();
      }
      await Notifications.requestPermissionsAsync();
    }
    verificarLogin();
  }, []);

  // Motor do Cronômetro
  useEffect(() => {
    if (!rondaEmAndamento || tempoRestante === null || buscandoGps) return;

    if (tempoRestante <= 0) {
      registrarFalhaPorTempo();
      return;
    }

    const interval = setInterval(() => {
      setTempoRestante(t => (t && t > 0 ? t - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [rondaEmAndamento, tempoRestante, buscandoGps]);

  // Motor do GPS
  useEffect(() => {
    let watchSubscription: Location.LocationSubscription | null = null;
    async function iniciarRastreamento() {
      if (rondaEmAndamento && pontoAtual?.checkpoints?.tipo_validacao === 'AUTOMATICA' && !buscandoGps) {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

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

  async function handleLogin() {
    if (!usuarioLocal || !senha) return Alert.alert('Erro', 'Preencha o Usuário e Senha!'); 
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { usuario: usuarioLocal, senha });
      const { token, usuario } = res.data;
      if (usuario.perfil !== 'POSTO_SERVICO') return Alert.alert('Acesso Negado', 'Exclusivo para Postos.');
      
      await AsyncStorage.setItem('@RondasApp:token', token);
      await AsyncStorage.setItem('@RondasApp:user', JSON.stringify(usuario));
      setNomePosto(usuario.nome); setLogado(true); carregarRotas();
    } catch (e: any) { Alert.alert('Erro', e.response?.data?.error || 'Erro.'); } 
    finally { setLoading(false); }
  }

  async function carregarRotas() {
    try { const res = await api.get('/rotas'); setRotasDisponiveis(res.data); } 
    catch (e) { console.log(e); }
  }

  async function iniciarRonda(rota: any) {
    try {
      const res = await api.post('/rondas/iniciar', { rota_id: rota.id });
      setRondaEmAndamento({ ...res.data, rotas: rota }); 
      
      const primeiroPonto = rota.rota_checkpoints[0];
      setPontoAtual(primeiroPonto); 
      setDistanciaAtual(null);
      setTempoRestante((primeiroPonto.tempo_limite_min || 5) * 60);

      Alert.alert('Ronda Iniciada!', `Dirija-se para: ${primeiroPonto.checkpoints.nome}`);
    } catch (e) { Alert.alert('Erro', 'Falha ao iniciar.'); }
  }

  async function agendarProximaRonda(rota: any) {
    if (rota.intervalo_minutos && rota.intervalo_minutos > 0) {
      await Notifications.scheduleNotificationAsync({
        content: { title: "⏰ Alerta de Patrulha!", body: `Inicie o roteiro: ${rota.nome}.`, sound: true },
        trigger: { seconds: rota.intervalo_minutos * 60 }
      });
    }
  }

  async function avancaParaProximoPontoOuFinaliza() {
    const listaPontos = rondaEmAndamento.rotas.rota_checkpoints;
    const indexAtual = listaPontos.findIndex((p: any) => p.checkpoint_id === pontoAtual.checkpoint_id);
    
    if (indexAtual + 1 < listaPontos.length) {
      const proxPonto = listaPontos[indexAtual + 1];
      setPontoAtual(proxPonto);
      setDistanciaAtual(null);
      setTempoRestante((proxPonto.tempo_limite_min || 5) * 60); 
    } else {
      try {
        const res = await api.post('/rondas/encerrar', { ronda_id: rondaEmAndamento.id });
        if (res.data.message.includes('PERDIDA')) {
          Alert.alert('⚠️ Roteiro Encerrado', 'Patrulha finalizada, mas com pontos perdidos por tempo.');
        } else {
          Alert.alert('🎉 Patrulha Concluída', 'Todos os pontos foram visitados no tempo certo!');
        }
      } catch(e) {
        Alert.alert('Fim da Patrulha', 'Roteiro finalizado.');
      }
      agendarProximaRonda(rondaEmAndamento.rotas);
      setRondaEmAndamento(null); setPontoAtual(null); setTempoRestante(null); setDistanciaAtual(null);
    }
  }

  // === CORREÇÃO: AVANÇO FORÇADO À PROVA DE FALHAS ===
  async function registrarFalhaPorTempo() {
    setBuscandoGps(true);
    setTempoRestante(null); // Trava o cronômetro para não ficar em loop
    try {
      await api.post('/rondas/falhar-ponto', {
        ronda_id: rondaEmAndamento.id,
        checkpoint_id: pontoAtual.checkpoint_id
      });
      Alert.alert('Tempo Esgotado ⏱️', `O tempo para este ponto expirou.`);
    } catch (e) {
      Alert.alert('Aviso de Rede', 'O tempo expirou, falha ao avisar servidor, mas a ronda vai prosseguir.');
    } finally {
      setBuscandoGps(false);
      avancaParaProximoPontoOuFinaliza(); // GARANTE QUE VAI PULAR PRO PRÓXIMO MESMO SE DER ERRO!
    }
  }

  async function registrarPontoNaApi(lat: number, lng: number) {
    setBuscandoGps(true);
    try {
      await api.post('/rondas/bater-ponto', {
        ronda_id: rondaEmAndamento.id, checkpoint_id: pontoAtual.checkpoint_id, latitude: lat, longitude: lng
      });
      avancaParaProximoPontoOuFinaliza();
    } catch (e: any) { 
      Alert.alert('Falha', e.response?.data?.error || 'Erro de conexão.'); 
    } finally { 
      setBuscandoGps(false); 
    }
  }

  // === BOTÃO DE FUGA MANUAL ===
  function interromperPatrulhaManual() {
    Alert.alert(
      "⚠️ Interromper Patrulha",
      "Deseja realmente abandonar a ronda pela metade? Ela será registada como PERDIDA.",
      [
        { text: "Continuar Ronda", style: "cancel" },
        { text: "Sim, Abandonar", style: "destructive", onPress: async () => {
            try {
              // AVISO CRÍTICO: Agora passamos "abandonada: true" para reprovar imediatamente no servidor
              await api.post('/rondas/encerrar', { ronda_id: rondaEmAndamento.id, abandonada: true });
            } catch(e) {}
            // Limpa tudo e destrava o ecrã do telemóvel instantaneamente
            setRondaEmAndamento(null);
            setPontoAtual(null);
            setTempoRestante(null);
            setDistanciaAtual(null);
        }}
      ]
    );
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
    if (data !== pontoAtual.checkpoint_id) return Alert.alert('❌ Erro', 'QR Code de outro local.');
    setBuscandoGps(true); 
    try {
      let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await registrarPontoNaApi(loc.coords.latitude, loc.coords.longitude);
    } catch (e) { await registrarPontoNaApi(0, 0); } 
  }

  async function enviarOcorrencia() {
    if (!descricaoOcorrencia) return Alert.alert('Erro', 'Descreva a ocorrência.');
    setLoading(true);
    try {
      await api.post('/ocorrencias', { ronda_id: rondaEmAndamento.id, descricao: descricaoOcorrencia, foto_base64: fotoBase64 });
      Alert.alert('Sucesso', 'Ocorrência enviada!');
      setModalOcorrencia(false); setDescricaoOcorrencia(''); setFotoBase64(null);
    } catch (e: any) { Alert.alert('Erro', 'Falha ao enviar.'); } 
    finally { setLoading(false); }
  }

  async function abrirCameraOcorrencia() {
    let result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.3, base64: true, 
    });
    if (!result.canceled && result.assets[0].base64) setFotoBase64(`data:image/jpeg;base64,${result.assets[0].base64}`);
  }

  if (logado) {
    const isPontoManual = pontoAtual?.checkpoints?.tipo_validacao === 'MANUAL';

    return (
      <View style={styles.container}>
        <Text style={styles.title}>{nomePosto}</Text>
        <Text style={styles.subtitle}>Aparelho configurado para operação.</Text>

        {!rondaEmAndamento ? (
          <View style={{ width: '100%', flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>Roteiros Disponíveis:</Text>
            {rotasDisponiveis.map(rota => (
              <View key={rota.id} style={styles.rotaCard}>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: 'bold' }}>{rota.nome}</Text>
                  <Text style={{ color: '#666' }}>{rota.rota_checkpoints.length} pontos a visitar</Text>
                </View>
                <TouchableOpacity style={styles.btnIniciar} onPress={() => iniciarRonda(rota)}>
                  <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Iniciar</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ width: '100%', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            
            <View style={{ backgroundColor: tempoRestante && tempoRestante <= 60 ? '#fee2e2' : '#e0f2fe', padding: 15, borderRadius: 30, marginBottom: 20, borderWidth: 2, borderColor: tempoRestante && tempoRestante <= 60 ? '#dc2626' : '#0284c7' }}>
              <Text style={{ fontSize: 28, fontWeight: 'bold', color: tempoRestante && tempoRestante <= 60 ? '#dc2626' : '#0369a1' }}>
                ⏱️ {tempoRestante !== null ? formatarTempo(tempoRestante) : '00:00'}
              </Text>
            </View>
            
            <View style={{ backgroundColor: '#fff', padding: 20, borderRadius: 8, width: '100%', borderWidth: 1, borderColor: '#ddd', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, color: '#666' }}>Próximo Destino:</Text>
              <Text style={{ fontSize: 24, fontWeight: 'bold', marginVertical: 10, textAlign: 'center' }}>{pontoAtual?.checkpoints.nome}</Text>
              
              {!isPontoManual ? (
                <>
                  <Text style={{ fontSize: 14, color: '#dc2626', fontWeight: 'bold', textAlign: 'center' }}>Raio do alvo: {pontoAtual?.checkpoints.raio_tolerancia} metros</Text>
                  <Text style={{ fontSize: 18, color: '#059669', fontWeight: 'bold', marginTop: 10, marginBottom: 20 }}>
                    Distância: {distanciaAtual !== null ? `${distanciaAtual}m` : 'Calculando...'}
                  </Text>
                </>
              ) : (
                <Text style={{ fontSize: 14, color: '#ea580c', fontWeight: 'bold', marginBottom: 20, textAlign: 'center' }}>Vá até o local e leia o QR Code.</Text>
              )}

              {isPontoManual && (
                <TouchableOpacity style={[styles.button, { backgroundColor: '#ea580c', height: 60, marginBottom: 15 }]} onPress={abrirScanner}>
                  <Text style={styles.buttonText}>📷 Ler QR Code</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={[styles.button, { backgroundColor: '#dc2626', height: 50 }]} onPress={() => setModalOcorrencia(true)}>
                <Text style={styles.buttonText}>⚠️ Registrar Ocorrência</Text>
              </TouchableOpacity>

              {/* === NOVO BOTÃO DE FUGA NA TELA DE RONDA === */}
              <TouchableOpacity style={[styles.button, { backgroundColor: '#64748b', height: 50, marginTop: 15 }]} onPress={interromperPatrulhaManual}>
                <Text style={styles.buttonText}>⏹️ Interromper Patrulha</Text>
              </TouchableOpacity>
            </View>

            <Modal visible={modalScanner} animationType="slide" transparent={false}>
              <View style={{ flex: 1, backgroundColor: '#000' }}>
                <CameraView style={StyleSheet.absoluteFillObject} facing="back" onBarcodeScanned={handleBarCodeScanned} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} />
                <View style={styles.overlayScanner}>
                  <View style={styles.caixaScanner} />
                  <Text style={{ color: '#fff', marginTop: 20, fontSize: 16, fontWeight: 'bold' }}>Aponte para o QR Code</Text>
                </View>
                <TouchableOpacity style={styles.btnFecharScanner} onPress={() => setModalScanner(false)}>
                  <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 18 }}>✕ Cancelar</Text>
                </TouchableOpacity>
              </View>
            </Modal>

            <Modal visible={modalOcorrencia} animationType="slide">
              <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
                <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>Nova Ocorrência</Text>
                <TextInput style={[styles.input, { height: 100, textAlignVertical: 'top' }]} placeholder="Descreva o que aconteceu..." multiline value={descricaoOcorrencia} onChangeText={setDescricaoOcorrencia} />
                <TouchableOpacity style={[styles.button, { backgroundColor: '#475569', marginBottom: 20 }]} onPress={abrirCameraOcorrencia}><Text style={styles.buttonText}>📸 Tirar Foto</Text></TouchableOpacity>
                {fotoBase64 && <Image source={{ uri: fotoBase64 }} style={{ width: '100%', height: 200, borderRadius: 8, marginBottom: 20 }} />}
                <TouchableOpacity style={[styles.button, { backgroundColor: '#16a34a' }]} onPress={enviarOcorrencia}>
                  {loading ? <ActivityIndicator color="#FFF"/> : <Text style={styles.buttonText}>🚀 Enviar para Central</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc', marginTop: 15 }]} onPress={() => setModalOcorrencia(false)}><Text style={[styles.buttonText, { color: '#333' }]}>Cancelar</Text></TouchableOpacity>
              </ScrollView>
            </Modal>
          </View>
        )}

        <TouchableOpacity style={[styles.button, { backgroundColor: '#d9534f', marginTop: 40, height: 45 }]} onPress={async () => {
            await AsyncStorage.clear(); setLogado(false);
          }}>
          <Text style={styles.buttonText}>Desconectar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ativar Dispositivo</Text>
      <TextInput style={styles.input} placeholder="Usuário" value={usuarioLocal} onChangeText={setUsuarioLocal} autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Senha" value={senha} onChangeText={setSenha} secureTextEntry />
      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Conectar</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 10 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 20, textAlign: 'center' },
  input: { width: '100%', height: 55, backgroundColor: '#FFF', borderRadius: 8, paddingHorizontal: 15, marginBottom: 15, borderWidth: 1, borderColor: '#DDD', fontSize: 18 },
  button: { width: '100%', height: 55, backgroundColor: '#0056b3', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  rotaCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', padding: 15, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#DDD' },
  btnIniciar: { backgroundColor: '#0056b3', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 6 },
  overlayScanner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  caixaScanner: { width: 250, height: 250, borderWidth: 2, borderColor: '#ea580c', backgroundColor: 'transparent' },
  btnFecharScanner: { position: 'absolute', bottom: 50, alignSelf: 'center', backgroundColor: '#dc2626', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 8 }
});