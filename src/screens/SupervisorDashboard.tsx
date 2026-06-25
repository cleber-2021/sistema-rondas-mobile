import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

export default function SupervisorDashboard({ navigation }: any) {
  const [roteiros, setRoteiros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
          <Text style={styles.title}>Rotas de Visita</Text>
          <Text style={styles.subtitle}>Selecione uma rota para ver os locais</Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <TextInput style={styles.searchInput} placeholder="🔍 Buscar rota ou local..." value={busca} onChangeText={setBusca} autoCapitalize="none" />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>
      ) : (
        <FlatList
          data={roteirosFiltrados}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, paddingTop: 10 }}
          renderItem={({ item }) => {
            const concluido = item.status === 'CONCLUÍDO';
            return (
              <TouchableOpacity
                style={styles.cardRoteiro}
                onPress={() => navigation.navigate('SupervisorVisitaDetalhe', { roteiroId: item.id, nome: item.nome })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.nomeRoteiro}>{item.nome}</Text>
                  <Text style={styles.periodicidadeText}>⌚ Ciclo {item.periodicidade}</Text>
                  <Text style={styles.progresso}>
                    {item.total_feitos}/{item.total_itens} locais visitados
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 8 }}>
                  <View style={concluido ? styles.badgeVerde : styles.badgeLaranja}>
                    <Text style={styles.badgeText}>{concluido ? 'FEITO' : 'PENDENTE'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color="#cbd5e1" />
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>🎉 Nenhuma rota cadastrada.</Text>}
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
  cardRoteiro: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 18, elevation: 2 },
  nomeRoteiro: { fontSize: 16, fontWeight: 'bold', color: '#1e293b' },
  periodicidadeText: { fontSize: 12, color: '#64748b', marginTop: 4, fontWeight: 'bold' },
  progresso: { fontSize: 13, color: '#475569', marginTop: 6 },
  badgeVerde: { backgroundColor: '#10b981', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  badgeLaranja: { backgroundColor: '#f59e0b', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 50, fontSize: 16 }
});