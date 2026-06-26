import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';

const PERIODO_PT: Record<string, string> = { DIARIO: 'Diário', SEMANAL: 'Semanal', QUINZENAL: 'Quinzenal', MENSAL: 'Mensal' };

export default function SupervisorVisitaDetalhe({ navigation, route }: any) {
  const { roteiroId, nome } = route.params;
  const [roteiro, setRoteiro] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [iniciandoId, setIniciandoId] = useState<string | null>(null);

  // Agrupa os itens (local+checklist) por local
  const grupos = useMemo(() => {
    const map: Record<string, any> = {};
    (roteiro?.itens || []).forEach((it: any) => {
      const lid = it.local_id || it.local?.id;
      if (!map[lid]) {
        map[lid] = { local: it.local, periodicidade: it.periodicidade, checklists: [], feitos: 0 };
      }
      map[lid].checklists.push(it);
      if (it.feito) map[lid].feitos++;
    });
    return Object.values(map);
  }, [roteiro]);

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

  async function handleIniciarVisita(item: any) {
    const local = item.local;
    const checklist = item.checklist;
    setIniciandoId(item.id);
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
            {roteiro ? `${roteiro.total_feitos}/${roteiro.total_itens} checklists realizados` : 'Locais da rota'}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>
      ) : (
        <FlatList
          data={grupos}
          keyExtractor={(g: any) => g.local?.id || g.local?.nome}
          contentContainerStyle={{ padding: 20 }}
          renderItem={({ item: g }: any) => {
            const tudoFeito = g.feitos === g.checklists.length;
            return (
              <View style={styles.localCard}>
                {/* Cabeçalho do local */}
                <View style={styles.localHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.localNome}>📍 {g.local?.nome}</Text>
                    <Text style={styles.localMeta}>
                      {PERIODO_PT[g.periodicidade] || g.periodicidade} · {g.feitos}/{g.checklists.length} checklists
                    </Text>
                  </View>
                  {tudoFeito && (
                    <View style={styles.badgeFeito}>
                      <Ionicons name="checkmark-circle" size={16} color="#fff" />
                      <Text style={styles.badgeFeitoText}>Completo</Text>
                    </View>
                  )}
                </View>

                {/* Checklists do local */}
                {g.checklists.map((it: any) => (
                  <View key={it.id} style={[styles.chkRow, it.feito && styles.chkRowFeito]}>
                    <Text style={styles.chkTitulo}>📋 {it.checklist.titulo}</Text>
                    {it.feito ? (
                      <View style={styles.badgeFeitoSm}>
                        <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
                        <Text style={styles.badgeFeitoSmText}>Feito</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[styles.btnIniciar, iniciandoId === it.id && { backgroundColor: '#94a3b8' }]}
                        onPress={() => handleIniciarVisita(it)}
                        disabled={iniciandoId === it.id}
                      >
                        {iniciandoId === it.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnText}>Iniciar</Text>}
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            );
          }}
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
  // Card do local (agrupado)
  localCard: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 14, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden', elevation: 1 },
  localHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#f1f5f9', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  localNome: { fontSize: 16, fontWeight: 'bold', color: '#1e293b' },
  localMeta: { fontSize: 12, color: '#64748b', marginTop: 2, fontWeight: '600' },
  // Linha de checklist dentro do local
  chkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  chkRowFeito: { backgroundColor: '#f0fdf4' },
  chkTitulo: { fontSize: 14, color: '#334155', flex: 1, paddingRight: 10 },
  btnIniciar: { backgroundColor: '#2563eb', paddingVertical: 9, paddingHorizontal: 18, borderRadius: 6 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  badgeFeito: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#10b981', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12 },
  badgeFeitoText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  badgeFeitoSm: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#dcfce7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  badgeFeitoSmText: { color: '#16a34a', fontWeight: 'bold', fontSize: 12 },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 50, fontSize: 16 }
});
