import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView, TextInput, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { garantirPermissaoCamera } from '../services/permissoes';

export default function VigilanteOcorrencia({ navigation }: any) {
  const [descricao, setDescricao] = useState('');
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const [postoId, setPostoId] = useState<string | null>(null);
  
  // === VARIÁVEIS DO NOVO COMBOBOX ===
  const [checkpointsPosto, setCheckpointsPosto] = useState<any[]>([]);
  const [buscaCheckpoint, setBuscaCheckpoint] = useState('');
  const [checkpointSelecionado, setCheckpointSelecionado] = useState<string>('');
  const [comboboxAberto, setComboboxAberto] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function carregarDados() {
      const userString = await AsyncStorage.getItem('@RondasApp:user');
      if (userString) {
        setPostoId(JSON.parse(userString).posto_id || null);
        carregarCheckpoints();
      }
    }
    carregarDados();
  }, []);

  async function carregarCheckpoints() {
    try {
      const res = await api.get('/rotas');
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
    } catch (e: any) {
      console.log('Erro ao carregar checkpoints:', e.response?.data || e.message);
    }
  }

  async function abrirCamera() {
    const ok = await garantirPermissaoCamera();
    if (!ok) return;
    let result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.3, base64: true });
    if (!result.canceled && result.assets && result.assets[0].base64) {
      setFotoBase64(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  }

  async function enviarOcorrencia() {
    if (!descricao.trim()) return Alert.alert('Atenção', 'Descreva o problema encontrado.');
    setLoading(true);
    try {
      await api.post('/ocorrencias', {
        posto_id: postoId,
        checkpoint_id: checkpointSelecionado || null,
        titulo: 'Ocorrência registrada via App',
        descricao: descricao,
        foto_base64: fotoBase64
      });
      Alert.alert('Sucesso', 'Ocorrência enviada para a central!');
      navigation.goBack(); 
    } catch (e) { Alert.alert('Erro', 'Falha ao enviar ocorrência.'); } finally { setLoading(false); }
  }

  const checkpointsFiltrados = checkpointsPosto.filter(cp => cp.nome.toLowerCase().includes(buscaCheckpoint.toLowerCase()));
  const pontoSelecionadoObj = checkpointsPosto.find(cp => cp.id === checkpointSelecionado);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 15 }}>
          <Ionicons name="arrow-back" size={28} color="#1e293b" />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Nova Ocorrência</Text>
          <Text style={styles.subtitle}>Reportar problemas à central</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        
        <Text style={styles.label}>1. Em qual ponto ocorreu? (Opcional)</Text>
        
        {/* === COMPONENTE COMBOBOX CUSTOMIZADO === */}
        {checkpointsPosto.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            {/* Botão que simula o input */}
            <TouchableOpacity 
              style={[styles.inputArea, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]} 
              onPress={() => setComboboxAberto(!comboboxAberto)}
              activeOpacity={0.8}
            >
              <Text style={{ color: pontoSelecionadoObj ? '#1e293b' : '#94a3b8', fontSize: 15, flex: 1 }} numberOfLines={1}>
                {pontoSelecionadoObj ? pontoSelecionadoObj.nome : 'Selecione um ponto (Opcional)...'}
              </Text>
              
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {pontoSelecionadoObj && (
                  <TouchableOpacity onPress={(e) => { e.stopPropagation(); setCheckpointSelecionado(''); }}>
                    <Ionicons name="close-circle" size={20} color="#94a3b8" />
                  </TouchableOpacity>
                )}
                <Ionicons name={comboboxAberto ? "chevron-up" : "chevron-down"} size={20} color="#64748b" />
              </View>
            </TouchableOpacity>

            {/* Menu Dropdown Expandido */}
            {comboboxAberto && (
              <View style={styles.dropdownContainer}>
                <TextInput 
                  style={styles.inputBuscaCombo} 
                  placeholder="🔍 Buscar ponto..." 
                  placeholderTextColor="#94a3b8" 
                  value={buscaCheckpoint} 
                  onChangeText={setBuscaCheckpoint} 
                  autoFocus={true}
                />
                <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
                  {checkpointsFiltrados.length === 0 ? (
                    <Text style={{ padding: 15, textAlign: 'center', color: '#94a3b8' }}>Nenhum ponto encontrado.</Text>
                  ) : (
                    checkpointsFiltrados.map((cp: any) => (
                      <TouchableOpacity 
                        key={cp.id} 
                        style={styles.dropItem} 
                        onPress={() => {
                          setCheckpointSelecionado(cp.id);
                          setComboboxAberto(false);
                          setBuscaCheckpoint(''); // Limpa a pesquisa ao selecionar
                        }}
                      >
                        <Text style={{ color: '#475569', fontWeight: 'bold' }}>{cp.nome}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            )}
          </View>
        )}

        <Text style={styles.label}>2. Descreva o Problema:</Text>
        <TextInput 
          style={[styles.inputArea, { height: 120, textAlignVertical: 'top' }]} 
          placeholder="Descreva o que aconteceu..." 
          placeholderTextColor="#94a3b8" 
          multiline 
          value={descricao} 
          onChangeText={setDescricao} 
        />

        <Text style={styles.label}>3. Evidência Visual (Opcional):</Text>
        <TouchableOpacity style={styles.btnCamera} onPress={abrirCamera}>
          <Text style={styles.btnCameraText}>📸 Tirar Foto do Problema</Text>
        </TouchableOpacity>

        {fotoBase64 && (
          <View style={{ marginTop: 15, position: 'relative' }}>
            <Image source={{ uri: fotoBase64 }} style={{ width: '100%', height: 200, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1' }} />
            <Text style={styles.fotoSucesso}>✅ Imagem anexada com sucesso!</Text>
          </View>
        )}

        <TouchableOpacity style={styles.btnEnviar} onPress={enviarOcorrencia} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnEnviarText}>🚀 Enviar Ocorrência</Text>}
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 25, paddingTop: 60, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1e293b' },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 2 },
  scroll: { padding: 20 },
  label: { fontSize: 15, fontWeight: 'bold', color: '#334155', marginBottom: 10, marginTop: 10 },
  inputArea: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 15, fontSize: 15, color: '#1e293b' },
  
  // Estilos do novo Combobox
  dropdownContainer: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, backgroundColor: '#fff', marginTop: 5, overflow: 'hidden', elevation: 3, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  inputBuscaCombo: { backgroundColor: '#f1f5f9', padding: 12, fontSize: 14, color: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  dropItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  
  btnCamera: { backgroundColor: '#475569', padding: 15, borderRadius: 8, alignItems: 'center' },
  btnCameraText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  fotoSucesso: { color: '#10b981', fontWeight: 'bold', textAlign: 'center', marginTop: 10 },
  btnEnviar: { backgroundColor: '#16a34a', padding: 18, borderRadius: 8, alignItems: 'center', marginTop: 30, elevation: 2 },
  btnEnviarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});