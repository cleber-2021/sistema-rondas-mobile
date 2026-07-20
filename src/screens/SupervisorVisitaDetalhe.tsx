import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, TextInput } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { obterLocalizacao } from '../services/gps';


export default function SupervisorVisitaDetalhe({ navigation, route }: any) {
  const { roteiroId, nome } = route.params;
  const [roteiro, setRoteiro] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [iniciandoId, setIniciandoId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [localAberto, setLocalAberto] = useState<string | null>(null);

  // Agrupa os itens (local+checklist) por local
  const grupos = useMemo(() => {
    const map: Record<string, any> = {};
    (roteiro?.itens || []).forEach((it: any) => {
      const lid = it.local_id || it.local?.id;
      if (!map[lid]) {
        map[lid] = { local: it.local, checklists: [], feitos: 0, visitasFeitas: 0, metaTotal: 0, postos: new Set() };
      }
      map[lid].checklists.push(it);
      if (it.feito) map[lid].feitos++;
      // Meta e visitas são por LOCAL+POSTO (uma ida = 1 visita). Não somar por checklist:
      // conta uma vez por posto (todos os checklists do mesmo posto já trazem o mesmo valor).
      const pkey = it.posto_id || '_sem_posto_';
      if (!map[lid].postos.has(pkey)) {
        map[lid].postos.add(pkey);
        map[lid].visitasFeitas += (it.visitas_feitas ?? (it.feito ? 1 : 0));
        map[lid].metaTotal += (typeof it.meta === 'number' ? it.meta : 1);
      }
    });
    return Object.values(map);
  }, [roteiro]);

  // Filtra os locais pela busca
  const gruposFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return grupos;
    return grupos.filter((g: any) => (g.local?.nome || '').toLowerCase().includes(termo));
  }, [grupos, busca]);

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
      // GPS blindado (nunca pendura — sempre retorna ou avisa)
      const location = await obterLocalizacao();
      if (!location) {
        Alert.alert('Aviso', 'Não foi possível obter o GPS. Tente novamente, de preferência próximo a uma janela ou ao ar livre.');
        setIniciandoId(null); return;
      }
      // A lista vem SEM as perguntas (para carregar rápido). Buscamos o checklist
      // completo só agora, no momento de iniciar — é uma requisição pequena.
      const [response, chkFull] = await Promise.all([
        api.post('/visitas/iniciar', {
          local_id: local.id, checklist_id: checklist.id, roteiro_id: roteiroId,
          posto_id: item.posto_id || null,
          latitude: location.coords.latitude, longitude: location.coords.longitude
        }),
        api.get(`/supervisao/checklists/${checklist.id}`),
      ]);
      navigation.navigate('ResponderChecklist', {
        visita_id: response.data.visita.id, local_id: local.id, checklist: chkFull.data,
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
            {roteiro
              ? `${grupos.reduce((s: number, g: any) => s + (g.visitasFeitas || 0), 0)}/${grupos.reduce((s: number, g: any) => s + (g.metaTotal || 0), 0)} visitas no mês`
              : 'Locais da rota'}
          </Text>
        </View>
      </View>

      {/* Busca de locais */}
      {!loading && grupos.length > 0 && (
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="🔍 Buscar local..."
            placeholderTextColor="#94a3b8"
            value={busca}
            onChangeText={setBusca}
            autoCapitalize="none"
          />
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>
      ) : (
        <FlatList
          data={gruposFiltrados}
          keyExtractor={(g: any) => g.local?.id || g.local?.nome}
          contentContainerStyle={{ padding: 20, paddingTop: 10 }}
          renderItem={({ item: g }: any) => {
            const tudoFeito = g.feitos === g.checklists.length;
            const localId = g.local?.id || g.local?.nome;
            const aberto = localAberto === localId;
            return (
              <View style={styles.localCard}>
                {/* Cabeçalho do local — toca para abrir/fechar os checklists */}
                <TouchableOpacity
                  style={styles.localHeader}
                  activeOpacity={0.7}
                  onPress={() => setLocalAberto(aberto ? null : localId)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.localNome}>📍 {g.local?.nome}</Text>
                    <Text style={styles.localMeta}>
                      {g.visitasFeitas}/{g.metaTotal} visitas no mês · {g.checklists.length} checklist(s)
                    </Text>
                  </View>
                  {tudoFeito ? (
                    <View style={styles.badgeFeito}>
                      <Ionicons name="checkmark-circle" size={16} color="#fff" />
                      <Text style={styles.badgeFeitoText}>Meta OK</Text>
                    </View>
                  ) : (
                    <View style={styles.badgePendente}>
                      <Text style={styles.badgePendenteText}>{g.visitasFeitas}/{g.metaTotal}</Text>
                    </View>
                  )}
                  <Ionicons name={aberto ? 'chevron-up' : 'chevron-down'} size={22} color="#94a3b8" style={{ marginLeft: 10 }} />
                </TouchableOpacity>

                {/* Checklists do local — só aparecem quando o local está aberto */}
                {aberto && g.checklists.map((it: any) => {
                  // Novo modelo: meta mensal + contagem. Fallback: boolean "feito" (backend antigo).
                  const temMeta = typeof it.meta === 'number';
                  const feitas = it.visitas_feitas ?? (it.feito ? 1 : 0);
                  const meta = it.meta ?? 1;
                  const metaBatida = temMeta ? feitas >= meta : !!it.feito;
                  // O supervisor pode SEMPRE visitar (mesmo após bater a meta), exceto no
                  // backend antigo, onde "feito" trava (comportamento anterior preservado).
                  const mostrarBotao = temMeta || !it.feito;
                  return (
                  <View key={it.id} style={[styles.chkRow, metaBatida && styles.chkRowFeito]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.chkTitulo}>📋 {it.checklist.titulo}</Text>
                      {it.posto?.nome && <Text style={{ fontSize: 12, color: '#7c3aed' }}>👷 {it.posto.nome}</Text>}
                      {temMeta && (
                        <Text style={{ fontSize: 12, color: metaBatida ? '#16a34a' : '#64748b', fontWeight: '600' }}>
                          {feitas}/{meta} visitas no mês {metaBatida ? '✓' : ''}
                        </Text>
                      )}
                    </View>
                    {mostrarBotao ? (
                      <TouchableOpacity
                        style={[styles.btnIniciar, metaBatida && { backgroundColor: '#16a34a' }, iniciandoId === it.id && { backgroundColor: '#94a3b8' }]}
                        onPress={() => handleIniciarVisita(it)}
                        disabled={iniciandoId === it.id}
                      >
                        {iniciandoId === it.id
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text style={styles.btnText}>{metaBatida ? 'Visitar +' : 'Iniciar'}</Text>}
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.badgeFeitoSm}>
                        <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
                        <Text style={styles.badgeFeitoSmText}>Feito</Text>
                      </View>
                    )}
                  </View>
                  );
                })}
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>{busca ? 'Nenhum local encontrado.' : 'Nenhum local nesta rota.'}</Text>}
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
  searchContainer: { paddingHorizontal: 20, paddingTop: 15, paddingBottom: 0 },
  searchInput: { backgroundColor: '#fff', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', fontSize: 15, color: '#1e293b' },
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
  badgePendente: { backgroundColor: '#fef3c7', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12 },
  badgePendenteText: { color: '#b45309', fontWeight: 'bold', fontSize: 13 },
  badgeFeitoSm: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#dcfce7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  badgeFeitoSmText: { color: '#16a34a', fontWeight: 'bold', fontSize: 12 },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 50, fontSize: 16 }
});
