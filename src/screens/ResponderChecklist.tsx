import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal, Image } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

export default function ResponderChecklist({ route, navigation }: any) {
  const { visita_id, local_id, checklist } = route.params;
  const [respostas, setRespostas] = useState<any>({});
  const [fotos, setFotos] = useState<{[key: string]: string}>({});
  const [loading, setLoading] = useState(false);

  // === ESTADOS PARA OCORRÊNCIA DE EMERGÊNCIA (EXCEPCIONAL) ===
  const [modalOco, setModalOco] = useState(false);
  const [descOco, setDescOco] = useState('');
  const [fotoOco, setFotoOco] = useState<string | null>(null);
  const [loadingOco, setLoadingOco] = useState(false);

  function selecionarResposta(perguntaId: string, valor: string) {
    setRespostas({ ...respostas, [perguntaId]: { ...respostas[perguntaId], resposta: valor } });
  }

  function digitarObservacao(perguntaId: string, texto: string) {
    setRespostas({ ...respostas, [perguntaId]: { ...respostas[perguntaId], observacao: texto } });
  }

  async function tirarFoto(pergunta_id: string) {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permissão', 'Precisamos da câmera.');
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.3, base64: true });
    if (!result.canceled && result.assets[0].base64) {
      const base64 = result.assets[0].base64;
      setFotos(prev => ({ ...prev, [pergunta_id]: base64 }));
    }
  }

  // === FUNÇÕES DA OCORRÊNCIA EXCEPCIONAL ===
  async function tirarFotoOcorrencia() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permissão', 'Precisamos da câmera.');
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.3, base64: true });
    if (!result.canceled && result.assets[0].base64) { setFotoOco(`data:image/jpeg;base64,${result.assets[0].base64}`); }
  }

  async function enviarOcorrencia() {
    if (!descOco.trim()) return Alert.alert('Aviso', 'Descreva o problema.');
    setLoadingOco(true);
    try {
      await api.post('/ocorrencias', {
        titulo: 'Ocorrência Crítica (Durante Auditoria)',
        descricao: `(No Local: ID ${local_id}) - ${descOco}`,
        foto_base64: fotoOco
      });
      Alert.alert('Enviado', 'Ocorrência enviada. Pode continuar a sua auditoria.');
      setModalOco(false); setDescOco(''); setFotoOco(null);
    } catch (error) {
      Alert.alert('Erro', 'Falha ao enviar.');
    } finally { setLoadingOco(false); }
  }

  async function finalizarVisita() {
    for (const p of checklist.perguntas) {
      if (p.obrigatoria && !respostas[p.id]?.resposta) {
        return Alert.alert('Atenção', `A pergunta "${p.pergunta}" é obrigatória.`);
      }
    }
    setLoading(true);
    try {
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const arrayRespostas = Object.keys(respostas).map(key => ({
        pergunta_id: key, resposta: respostas[key].resposta, observacao: respostas[key].observacao || '', foto: fotos[key] || null
      }));
      await api.post('/visitas/encerrar', { visita_id, local_id, latitude: location.coords.latitude, longitude: location.coords.longitude, respostas: arrayRespostas });
      Alert.alert('✅ Sucesso!', 'Relatório de auditoria salvo.');
      navigation.goBack(); 
    } catch (error: any) { Alert.alert('❌ Erro', error.response?.data?.error || 'Erro ao encerrar.'); } finally { setLoading(false); }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{checklist.titulo}</Text>
        {checklist.descricao ? <Text style={styles.headerDesc}>{checklist.descricao}</Text> : null}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 30 }}>
        {checklist.perguntas.map((p: any, index: number) => {
          const respostaAtual = respostas[p.id]?.resposta;
          return (
            <View key={p.id} style={styles.card}>
              <Text style={styles.perguntaText}>{index + 1}. {p.pergunta} {p.obrigatoria && <Text style={{ color: '#dc2626' }}>*</Text>}</Text>
              <View style={styles.botoesContainer}>
                <TouchableOpacity style={[styles.btnResposta, respostaAtual === 'Conforme' && styles.btnConforme]} onPress={() => selecionarResposta(p.id, 'Conforme')}><Text style={[styles.btnText, respostaAtual === 'Conforme' && { color: '#fff' }]}>Conforme</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.btnResposta, respostaAtual === 'Não Conforme' && styles.btnNaoConforme]} onPress={() => selecionarResposta(p.id, 'Não Conforme')}><Text style={[styles.btnText, respostaAtual === 'Não Conforme' && { color: '#fff' }]}>Não Conforme</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.btnResposta, respostaAtual === 'N/A' && styles.btnNA]} onPress={() => selecionarResposta(p.id, 'N/A')}><Text style={[styles.btnText, respostaAtual === 'N/A' && { color: '#fff' }]}>N/A</Text></TouchableOpacity>
              </View>
              <TextInput 
                style={styles.inputObservacao} 
                placeholder="Adicionar observação (opcional)..." 
                placeholderTextColor="#94a3b8" 
                value={respostas[p.id]?.observacao || ''} 
                onChangeText={(texto) => digitarObservacao(p.id, texto)} 
                multiline 
              />
              <TouchableOpacity style={styles.btnCamera} onPress={() => tirarFoto(p.id)}><Text style={styles.btnCameraText}>📸 {fotos[p.id] ? 'Trocar Foto' : 'Anexar Evidência'}</Text></TouchableOpacity>
              {fotos[p.id] && <Text style={styles.fotoSucessoText}>✅ Imagem capturada!</Text>}
            </View>
          );
        })}
      </ScrollView>

      {/* === MODAL DA OCORRÊNCIA EXCEPCIONAL === */}
      <Modal visible={modalOco} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#f8fafc', padding: 25, paddingTop: 60 }}>
          <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#1e293b', marginBottom: 20 }}>Abrir Ocorrência Crítica</Text>
          <TextInput style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 15, height: 120, textAlignVertical: 'top', marginBottom: 20 }} placeholder="Descreva o problema grave encontrado na visita..." multiline value={descOco} onChangeText={setDescOco} />
          <TouchableOpacity style={{ backgroundColor: '#475569', padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 20 }} onPress={tirarFotoOcorrencia}><Text style={{ color: '#fff', fontWeight: 'bold' }}>📸 Tirar Foto da Situação</Text></TouchableOpacity>
          {fotoOco && <Image source={{ uri: fotoOco }} style={{ width: '100%', height: 180, borderRadius: 8, marginBottom: 20 }} />}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={{ flex: 1, padding: 15, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, alignItems: 'center' }} onPress={() => setModalOco(false)}><Text style={{ fontWeight: 'bold' }}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, padding: 15, backgroundColor: '#dc2626', borderRadius: 8, alignItems: 'center' }} onPress={enviarOcorrencia} disabled={loadingOco}>{loadingOco ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: 'bold' }}>Enviar Alerta</Text>}</TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* BOTÃO FLUTUANTE DE EMERGÊNCIA */}
      <TouchableOpacity style={styles.fabOcorrencia} onPress={() => setModalOco(true)}>
        <Ionicons name="warning" size={24} color="#fff" />
      </TouchableOpacity>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.btnSalvar} onPress={finalizarVisita} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnSalvarText}>Encerrar Visita e Salvar</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  header: { backgroundColor: '#b0b0b0', padding: 20, paddingTop: 50, borderBottomLeftRadius: 15, borderBottomRightRadius: 15 },
  headerTitle: { color: '#1a1a1a', fontSize: 20, fontWeight: 'bold' },
  headerDesc: { color: '#94a3b8', fontSize: 14, marginTop: 5 },
  scroll: { flex: 1, padding: 15 },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 15, elevation: 1 },
  perguntaText: { fontSize: 16, fontWeight: 'bold', color: '#334155', marginBottom: 15 },
  botoesContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  btnResposta: { flex: 1, borderWidth: 1, borderColor: '#cbd5e1', paddingVertical: 10, borderRadius: 6, marginHorizontal: 3, alignItems: 'center' },
  btnText: { color: '#64748b', fontWeight: 'bold', fontSize: 13 },
  btnConforme: { backgroundColor: '#10b981', borderColor: '#10b981' },
  btnNaoConforme: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
  btnNA: { backgroundColor: '#94a3b8', borderColor: '#94a3b8' },
  btnCamera: { marginTop: 15, paddingVertical: 10, paddingHorizontal: 15, backgroundColor: '#e0f2fe', borderRadius: 6, alignSelf: 'flex-start' },
  btnCameraText: { color: '#0369a1', fontWeight: 'bold', fontSize: 13 },
  fotoSucessoText: { color: '#10b981', marginTop: 8, fontSize: 13, fontWeight: 'bold' },
  inputObservacao: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 6, padding: 10, minHeight: 60, textAlignVertical: 'top', color: '#1e293b' },
  // Estilo do Botão Flutuante
  fabOcorrencia: { position: 'absolute', bottom: 90, right: 20, backgroundColor: '#dc2626', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  
  footer: { padding: 15, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#e2e8f0' },
  btnSalvar: { backgroundColor: '#3b82f6', padding: 15, borderRadius: 8, alignItems: 'center' },
  btnSalvarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});