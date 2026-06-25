import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';

export default function SupervisorVisitaDetalhe({ navigation, route }: any) {
  const { roteiroId, nome } = route.params;
  const [roteiro, setRoteiro] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [iniciandoId, setIniciandoId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [])
  );

  async function carregar() {
    setLoading(true);
    try {
      const res = await api.get('/supervisao/roteiros/mobile');
      const r = res.data.find((x: any) => x.id === roteiroId);
      setRoteiro(r || null);
    } catch (e: any) {
      Alert.alert('Erro', e.response?.data?.error || 'Erro ao carregar o roteiro.');
    } finally {
      setLoading(false);
    }
  }

  async function handleIniciarVisita(local: any, checklist: any) {
    setIniciandoId(local.id);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Aviso', 'A permissão de GPS é obrigatória.');
        setIniciandoId(null); return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const response = await api.post('/visitas/iniciar', {
        local_id: local.id, checklist_id: checklist.id, roteiro_id: roteiroId,
        latitude: location.coords.latitude, longitude: location.coords.longitude
      });
      navigation.navigate('ResponderChecklist', {
        visita_id: response.data.visita.id, local_id: local.id, checklist: checklist
      });
    } catch (error: any) {
      Alert.alert('Aviso', error.response?.data?.error || 'Erro ao validar localização GPS.');
    } finally { setIniciandoId(null); }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 15 }}>
          <Ionicons name="arrow-back" size={28} color="#1e293b" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{nome}</Text>
          <Text style={styles.subtitle}>
            {roteiro ? `${roteiro.total_feitos}/${roteiro.total_itens} locais visitados` : 'Locais da rota'}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>
      ) : (
        <FlatList
          data={roteiro?.itens || []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20 }}
          renderItem={({ item: it }) => (
            <View style={[styles.itemCard, it.feito && styles.itemCardFeito]}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.itemLocal}>📍 {it.local.nome}</Text>
                <Text style={styles.itemChecklist}>📋 {it.checklist.titulo}</Text>
              </View>

              {it.feito ? (
                <View style={styles.badgeFeito}>
                  <Ionicons name="checkmark-circle" size={16} color="#fff" />
                  <Text style={styles.badgeFeitoText}>Feito</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.btnIniciar, iniciandoId === it.local.id && { backgroundColor: '#94a3b8' }]}
                  onPress={() => handleIniciarVisita(it.local, it.checklist)}
                  disabled={iniciandoId === it.local.id}
                >
                  {iniciandoId === it.local.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnText}>Iniciar</Text>}
                </TouchableOpacity>
              )}
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum local nesta rota.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 25, paddingTop: 60, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1e293b' },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 4 },
  itemCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0', elevation: 1 },
  itemCardFeito: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  itemLocal: { fontSize: 15, fontWeight: 'bold', color: '#334155' },
  itemChecklist: { fontSize: 12, color: '#64748b', marginTop: 2 },
  btnIniciar: { backgroundColor: '#2563eb', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 6 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  badgeFeito: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#10b981', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12 },
  badgeFeitoText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 50, fontSize: 16 }
});
