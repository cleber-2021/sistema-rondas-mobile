import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, TextInput } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

export default function SupervisorDashboard({ navigation }: any) {
  const [roteiros, setRoteiros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [iniciandoId, setIniciandoId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => { carregarRoteiros(); });
    carregarRoteiros();
    return unsubscribe;
  }, [navigation]);

  async function carregarRoteiros() {
    setLoading(true);
    try {
      const response = await api.get('/supervisao/roteiros/mobile');
      setRoteiros(response.data);
    } catch (error: any) {
      Alert.alert('Erro', error.response?.data?.error || 'Erro ao carregar os roteiros.');
    } finally { setLoading(false); }
  }

  async function handleIniciarVisita(local: any, checklist: any, roteiro_id: string) {
    setIniciandoId(local.id);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Aviso', 'A permissão de GPS é obrigatória.');
        setIniciandoId(null); return;
      }

      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const response = await api.post('/visitas/iniciar', {
        local_id: local.id, checklist_id: checklist.id, roteiro_id: roteiro_id,
        latitude: location.coords.latitude, longitude: location.coords.longitude
      });

      navigation.navigate('ResponderChecklist', {
        visita_id: response.data.visita.id, local_id: local.id, checklist: checklist
      });
    } catch (error: any) {
      Alert.alert('Aviso', error.response?.data?.error || 'Erro ao validar localização GPS.');
    } finally { setIniciandoId(null); }
  }

  const roteirosFiltrados = roteiros.filter(roteiro => {
    const termo = busca.toLowerCase();
    const nomeRoteiro = roteiro.nome?.toLowerCase() || '';
    const temLocalMatch = roteiro.itens?.some((it: any) => it.local?.nome?.toLowerCase().includes(termo));
    return nomeRoteiro.includes(termo) || temLocalMatch;
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 15 }}>
          <Ionicons name="arrow-back" size={28} color="#1e293b" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Visitas Pendentes</Text>
          <Text style={styles.subtitle}>Auditorias agendadas para hoje</Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <TextInput style={styles.searchInput} placeholder="🔍 Buscar roteiro ou local..." value={busca} onChangeText={setBusca} autoCapitalize="none" />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>
      ) : (
        <FlatList
          data={roteirosFiltrados}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
          renderItem={({ item }) => (
            <View style={styles.cardRoteiro}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nomeRoteiro}>{item.nome}</Text>
                  <Text style={styles.periodicidadeText}>⌚ Ciclo {item.periodicidade}</Text>
                </View>
                <View style={item.status === 'CONCLUÍDO' ? styles.badgeVerde : styles.badgeLaranja}>
                  <Text style={styles.badgeText}>{item.status === 'CONCLUÍDO' ? 'FEITO' : 'PENDENTE'}</Text>
                </View>
              </View>

              <View style={styles.listaItens}>
                {item.itens.map((it: any) => (
                  <View key={it.id} style={styles.itemRow}>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={styles.itemLocal}>📍 {it.local.nome}</Text>
                      <Text style={styles.itemChecklist}>📋 {it.checklist.titulo}</Text>
                    </View>
                    <TouchableOpacity 
                      style={[styles.btnIniciar, iniciandoId === it.local.id && { backgroundColor: '#94a3b8' }]}
                      onPress={() => handleIniciarVisita(it.local, it.checklist, item.id)} disabled={iniciandoId === it.local.id}
                    >
                      {iniciandoId === it.local.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnText}>Iniciar</Text>}
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>🎉 Nenhuma visita pendente! Tudo em dia.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 25, paddingTop: 60, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1e293b' },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 4 },
  searchContainer: { paddingHorizontal: 20, paddingTop: 15, paddingBottom: 5 },
  searchInput: { backgroundColor: '#fff', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', fontSize: 15 },
  cardRoteiro: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#e2e8f0', marginTop: 10, overflow: 'hidden', elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f1f5f9', padding: 15, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  nomeRoteiro: { fontSize: 16, fontWeight: 'bold', color: '#1e293b' },
  periodicidadeText: { fontSize: 12, color: '#64748b', marginTop: 4, fontWeight: 'bold' },
  badgeVerde: { backgroundColor: '#10b981', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  badgeLaranja: { backgroundColor: '#f59e0b', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  listaItens: { padding: 15 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  itemLocal: { fontSize: 14, fontWeight: 'bold', color: '#334155' },
  itemChecklist: { fontSize: 12, color: '#64748b', marginTop: 2 },
  btnIniciar: { backgroundColor: '#2563eb', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 6 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 50, fontSize: 16 }
});