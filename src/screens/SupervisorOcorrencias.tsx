import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { tirarFotoBase64 } from '../services/permissoes';

export default function SupervisorOcorrencias({ navigation }: any) {
  const [descricao, setDescricao] = useState('');
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function abrirCamera() {
    const foto = await tirarFotoBase64();
    if (foto) setFotoBase64(foto);
  }

  async function enviarOcorrencia() {
    if (!descricao.trim()) return Alert.alert('Atenção', 'Descreva o problema encontrado.');
    setLoading(true);
    try {
      await api.post('/ocorrencias', {
        titulo: 'Ocorrência Direta (Fiscalização)',
        descricao: descricao,
        foto_base64: fotoBase64
      });
      Alert.alert('Sucesso', 'Ocorrência enviada para a central de monitoramento!');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Erro', 'Falha ao enviar ocorrência.');
    } finally { setLoading(false); }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 15 }}>
          <Ionicons name="arrow-back" size={28} color="#1e293b" />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Registo Rápido</Text>
          <Text style={styles.subtitle}>Comunique problemas à central</Text>
        </View>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Descreva a situação encontrada:</Text>
        <TextInput 
          style={styles.inputArea} 
          placeholder="Ex: Lâmpada queimada na portaria..." 
          placeholderTextColor="#94a3b8"
          multiline value={descricao} onChangeText={setDescricao} 
        />

        <Text style={styles.label}>Evidência Visual (Opcional):</Text>
        <TouchableOpacity style={styles.btnCamera} onPress={abrirCamera}>
          <Text style={styles.btnCameraText}>📸 Capturar Imagem do Problema</Text>
        </TouchableOpacity>

        {fotoBase64 && (
          <View style={{ marginTop: 15, position: 'relative' }}>
            <Image source={{ uri: fotoBase64 }} style={{ width: '100%', height: 200, borderRadius: 8 }} />
            <Text style={styles.fotoSucesso}>✅ Imagem anexada!</Text>
          </View>
        )}

        <TouchableOpacity style={styles.btnEnviar} onPress={enviarOcorrencia} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnEnviarText}>🚀 Enviar para a Central</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 25, paddingTop: 60, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1e293b' },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 4 },
  form: { padding: 20 },
  label: { fontSize: 14, fontWeight: 'bold', color: '#334155', marginBottom: 10, marginTop: 10 },
  
  btnCamera: { backgroundColor: '#475569', padding: 15, borderRadius: 8, alignItems: 'center' },
  btnCameraText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  fotoSucesso: { color: '#10b981', fontWeight: 'bold', textAlign: 'center', marginTop: 10 },
  btnEnviar: { backgroundColor: '#dc2626', padding: 18, borderRadius: 8, alignItems: 'center', marginTop: 30, elevation: 2 },
  btnEnviarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  inputArea: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 15, height: 120, textAlignVertical: 'top', fontSize: 15, color: '#1e293b' },
});