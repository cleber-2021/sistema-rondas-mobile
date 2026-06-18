import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Modal, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { carregarEAgendarDespertas } from '../services/despertaService';

interface OcorrenciaPendente {
  id: string;
  titulo: string;
  descricao: string;
  criado_em: string;
}

export default function VigilanteHome({ navigation }: any) {
  const [nomePosto, setNomePosto] = useState('');
  const [segurandoPanico, setSegurandoPanico] = useState(false);
  const [timerPanico, setTimerPanico] = useState<any>(null);

  // Justificativas pendentes
  const [pendentes, setPendentes] = useState<OcorrenciaPendente[]>([]);
  const [indexAtual, setIndexAtual] = useState(0);
  const [justificativa, setJustificativa] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [modalVisivel, setModalVisivel] = useState(false);

  useEffect(() => {
    async function carregarUser() {
      const userString = await AsyncStorage.getItem('@RondasApp:user');
      if (userString) setNomePosto(JSON.parse(userString).nome);
    }
    carregarUser();
    // Agenda/reagenda despertadores ao abrir a tela home
    carregarEAgendarDespertas().catch(() => {});
  }, []);

  // Verifica inspeções perdidas sem justificativa toda vez que a tela recebe foco
  useFocusEffect(
    useCallback(() => {
      verificarPendentes();
    }, [])
  );

  async function verificarPendentes() {
    try {
      const res = await api.get('/rondas/pendentes-justificativa');
      if (res.data.length > 0) {
        setPendentes(res.data);
        setIndexAtual(0);
        setJustificativa('');
        setModalVisivel(true);
      }
    } catch (e) {
      console.log('Erro ao verificar pendências:', e);
    }
  }

  async function salvarJustificativa() {
    if (!justificativa.trim()) {
      Alert.alert('Obrigatório', 'Por favor, descreva o motivo da inspeção não realizada.');
      return;
    }
    setSalvando(true);
    try {
      await api.post(`/rondas/justificar/${pendentes[indexAtual].id}`, { justificativa });

      const proximo = indexAtual + 1;
      if (proximo < pendentes.length) {
        setIndexAtual(proximo);
        setJustificativa('');
      } else {
        setModalVisivel(false);
        setPendentes([]);
      }
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível salvar a justificativa.');
    } finally {
      setSalvando(false);
    }
  }

  async function deslogar() {
    try { await api.delete('/auth/push-token'); } catch {}
    await Notifications.cancelAllScheduledNotificationsAsync();
    await AsyncStorage.clear();
    api.defaults.headers.common['Authorization'] = '';
    navigation.replace('Login');
  }

  async function dispararSinalPanico() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return Alert.alert('Permissão Negada', 'O App precisa de acesso ao GPS para enviar o Pânico.');
      }
      let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await api.post('/ocorrencias/panico', { latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      Alert.alert('🆘 SINAL ENVIADO', 'A central foi notificada.');
    } catch (e: any) {
      Alert.alert('Erro', 'Falha ao enviar sinal de pânico.');
    }
  }

  const handleStartPanico = () => {
    setSegurandoPanico(true);
    setTimerPanico(setTimeout(() => { dispararSinalPanico(); setSegurandoPanico(false); }, 1500));
  };

  const handleCancelPanico = () => {
    if (timerPanico) clearTimeout(timerPanico);
    setSegurandoPanico(false);
  };

  const ocorrenciaAtual = pendentes[indexAtual];
  const dataFormatada = ocorrenciaAtual
    ? new Date(ocorrenciaAtual.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <View style={styles.container}>

      {/* ── MODAL BLOQUEANTE: JUSTIFICATIVA DE INSPEÇÃO PERDIDA ── */}
      <Modal visible={modalVisivel} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Ionicons name="warning" size={32} color="#dc2626" />
            <Text style={styles.modalTitulo}>Inspeção não realizada</Text>
            <Text style={styles.modalSubtitulo}>
              {pendentes.length > 1 ? `${indexAtual + 1} de ${pendentes.length} pendências` : '1 pendência'}
            </Text>
          </View>

          <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 20 }}>
            <View style={styles.cardOcorrencia}>
              <Text style={styles.labelOcorrencia}>Roteiro</Text>
              <Text style={styles.textoOcorrencia}>{ocorrenciaAtual?.titulo?.replace('⚠️ Inspeção Perdida — ', '')}</Text>
              <Text style={styles.labelOcorrencia}>Data/Hora</Text>
              <Text style={styles.textoOcorrencia}>{dataFormatada}</Text>
            </View>

            <Text style={styles.labelJust}>Justificativa *</Text>
            <Text style={styles.labelJustDesc}>Descreva o motivo pelo qual a inspeção não foi realizada no horário previsto:</Text>
            <TextInput
              style={styles.inputJust}
              multiline
              numberOfLines={5}
              placeholder="Ex: Local em manutenção, emergência no posto, falha de comunicação..."
              placeholderTextColor="#94a3b8"
              value={justificativa}
              onChangeText={setJustificativa}
              textAlignVertical="top"
            />
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.btnConfirmar, salvando && { opacity: 0.7 }]}
              onPress={salvarJustificativa}
              disabled={salvando}
            >
              {salvando
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnConfirmarText}>
                    {indexAtual + 1 < pendentes.length ? 'Confirmar e continuar →' : 'Confirmar e entrar'}
                  </Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── TELA PRINCIPAL ── */}
      <View style={styles.header}>
        <Text style={styles.title}>{nomePosto}</Text>
        <Text style={styles.subtitle}>Operação em Andamento</Text>
      </View>

      <View style={styles.menuContainer}>
        <TouchableOpacity style={styles.cardMenu} onPress={() => navigation.navigate('VigilanteRondas')}>
          <View style={[styles.iconBox, { backgroundColor: '#e0f2fe' }]}>
            <Ionicons name="shield-checkmark-outline" size={32} color="#0284c7" />
          </View>
          <View style={{ flex: 1, marginLeft: 15 }}>
            <Text style={styles.cardTitle}>Realizar Inspeções</Text>
            <Text style={styles.cardDesc}>Aceder aos roteiros de inspeção e ler QR Codes.</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#cbd5e1" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.cardMenu} onPress={() => navigation.navigate('VigilantePassagem')}>
          <View style={[styles.iconBox, { backgroundColor: '#fef3c7' }]}>
            <Ionicons name="clipboard-outline" size={32} color="#d97706" />
          </View>
          <View style={{ flex: 1, marginLeft: 15 }}>
            <Text style={styles.cardTitle}>Passagem de Serviço</Text>
            <Text style={styles.cardDesc}>Preencher os checklists de início ou fim de turno.</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#cbd5e1" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.cardMenu} onPress={() => navigation.navigate('VigilanteOcorrencia')}>
          <View style={[styles.iconBox, { backgroundColor: '#fee2e2' }]}>
            <Ionicons name="warning-outline" size={32} color="#dc2626" />
          </View>
          <View style={{ flex: 1, marginLeft: 15 }}>
            <Text style={styles.cardTitle}>Registrar Ocorrência</Text>
            <Text style={styles.cardDesc}>Reportar anomalias com foto para a central.</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#cbd5e1" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.btnPanico, segurandoPanico && { backgroundColor: '#000', transform: [{ scale: 1.1 }] }]}
        onPressIn={handleStartPanico}
        onPressOut={handleCancelPanico}
      >
        <Text style={styles.textPanico}>{segurandoPanico ? 'ENVIANDO...' : 'S.O.S'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btnLogout} onPress={deslogar}>
        <Ionicons name="log-out-outline" size={20} color="#dc2626" />
        <Text style={styles.btnLogoutText}>Desconectar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { padding: 25, paddingTop: 70, backgroundColor: '#1e293b', borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 16, color: '#cbd5e1', marginTop: 5 },
  menuContainer: { flex: 1, padding: 20, marginTop: 10 },
  cardMenu: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 20, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#e2e8f0', elevation: 2 },
  iconBox: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  cardDesc: { fontSize: 13, color: '#64748b', marginTop: 4, lineHeight: 18 },
  btnLogout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: 30, padding: 15, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#fecaca', marginBottom: 40 },
  btnLogoutText: { color: '#dc2626', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
  btnPanico: { position: 'absolute', bottom: 110, right: 20, width: 75, height: 75, borderRadius: 40, backgroundColor: '#dc2626', justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, zIndex: 100 },
  textPanico: { color: '#fff', fontWeight: 'bold', fontSize: 16, textAlign: 'center' },

  // Modal de justificativa
  modalContainer: { flex: 1, backgroundColor: '#f8fafc' },
  modalHeader: { backgroundColor: '#1e293b', padding: 30, paddingTop: 60, alignItems: 'center', gap: 8 },
  modalTitulo: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginTop: 8 },
  modalSubtitulo: { fontSize: 14, color: '#94a3b8', backgroundColor: '#334155', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  modalBody: { flex: 1, padding: 20 },
  cardOcorrencia: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: '#dc2626' },
  labelOcorrencia: { fontSize: 11, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginTop: 8 },
  textoOcorrencia: { fontSize: 15, color: '#1e293b', fontWeight: '600', marginTop: 2 },
  labelJust: { fontSize: 15, fontWeight: 'bold', color: '#1e293b', marginBottom: 4 },
  labelJustDesc: { fontSize: 13, color: '#64748b', marginBottom: 12, lineHeight: 18 },
  inputJust: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 14, fontSize: 15, color: '#1e293b', minHeight: 120 },
  modalFooter: { padding: 20, paddingBottom: 40, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  btnConfirmar: { backgroundColor: '#0284c7', padding: 16, borderRadius: 10, alignItems: 'center' },
  btnConfirmarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
