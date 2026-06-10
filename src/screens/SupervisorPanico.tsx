// src/screens/SupervisorPanico.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Vibration, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

export default function SupervisorPanico({ navigation }: any) {
  const [panicos, setPanicos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState<string | null>(null);

  // Padrão de vibração pesada: [Espera 0ms, Vibra 1s, Espera 0.5s]
  const PADRAO_VIBRACAO = [0, 1000, 500];

  useEffect(() => {
    carregarPanicos();
    // Atualiza silenciosamente a cada 10 segundos para verificar novas emergências ou alterações da base
    const interval = setInterval(carregarPanicos, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // A vibração só é acionada se houver alguma ocorrência crítica com status PENDENTE
    const temPendente = panicos.some(oc => oc.status === 'PENDENTE');
    if (temPendente) {
      Vibration.vibrate(PADRAO_VIBRACAO, true); 
    } else {
      Vibration.cancel();
    }
    return () => Vibration.cancel();
  }, [panicos]);

  async function carregarPanicos() {
    try {
      // Busca as ocorrências recentes registradas no servidor
      const res = await api.get('/ocorrencias', { params: { limit: 50 } });
      
      // FILTRO CRÍTICO: Traz apenas pânicos ativos (PENDENTE ou EM_ANALISE). 
      // Assim que muda para RESOLVIDO ou REJEITADO, some automaticamente desta tela.
      const listaPanicos = res.data.data.filter(
        (oc: any) => oc.titulo.includes('PÂNICO') && oc.status !== 'RESOLVIDO' && oc.status !== 'REJEITADO'
      );
      setPanicos(listaPanicos);
    } catch (e) {
      console.log('Erro ao carregar pânicos:', e);
    } finally {
      setLoading(false);
    }
  }

  async function atualizarStatusPanico(id: string, novoStatus: string, obs: string) {
    setProcessando(id);
    try {
      await api.put(`/ocorrencias/${id}/analisar`, {
        status: novoStatus,
        observacao: obs
      });
      // Recarrega imediatamente para remover do fluxo ou atualizar visualmente o card
      await carregarPanicos(); 
    } catch (e) {
      console.log('Erro ao atualizar status', e);
    } finally {
      setProcessando(null);
    }
  }

  function abrirMapa(texto: string) {
    // Procura por qualquer link http ou https no meio do texto
    const urlEncontrada = texto.match(/https?:\/\/[^\s]+/);
    if (urlEncontrada) {
      Linking.openURL(urlEncontrada[0]).catch(() => {
        alert("Não foi possível abrir o Google Maps.");
      });
    } else {
      alert("Link de GPS inválido ou não encontrado.");
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 15 }}>
          <Ionicons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>CRISES ATIVAS</Text>
          <Text style={styles.subtitle}>Sinais de Pânico em Resposta</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {loading && <ActivityIndicator size="large" color="#dc2626" style={{ marginTop: 50 }} />}
        
        {!loading && panicos.length === 0 && (
          <View style={styles.areaLimpa}>
            <Ionicons name="shield-checkmark" size={70} color="#10b981" />
            <Text style={styles.textoLimpo}>Nenhum Alerta Ativo</Text>
            <Text style={styles.subTextoLimpo}>Todos os postos operam em total segurança.</Text>
          </View>
        )}

        {panicos.map(oc => {
          const isPendente = oc.status === 'PENDENTE';
          const borderColor = isPendente ? '#dc2626' : '#ea580c';
          const bgColorBox = isPendente ? '#fef2f2' : '#fff7ed';
          const iconName = isPendente ? 'warning' : 'car';

          return (
            <View key={oc.id} style={[styles.cardCritico, { borderColor: borderColor }]}>
              <View style={[styles.topoCard, { borderBottomColor: borderColor }]}>
                <Ionicons name={iconName} size={26} color={borderColor} />
                <Text style={[styles.tituloAlerta, { color: borderColor }]}>
                  {isPendente ? '🚨 EMERGENCIAL (PENDENTE)' : '🔄 ALERTA EM ATENDIMENTO'}
                </Text>
              </View>
              
              <View style={[styles.infoBox, { backgroundColor: bgColorBox }]}>
                <Text style={styles.infoText}>📍 <Text style={{fontWeight:'bold'}}>Local:</Text> {oc.nome_local}</Text>
                <Text style={styles.infoText}>👤 <Text style={{fontWeight:'bold'}}>Operador:</Text> {oc.usuarios?.nome || 'Desconhecido'}</Text>
                <Text style={styles.infoText}>⏰ <Text style={{fontWeight:'bold'}}>Acionado em:</Text> {new Date(oc.criado_em).toLocaleString('pt-BR')}</Text>
              </View>

              {/* Botão de Rota do GPS */}
              {oc.observacao && (oc.observacao.includes('http') || oc.observacao.includes('google')) && (
                <TouchableOpacity style={styles.btnMapa} onPress={() => abrirMapa(oc.observacao)}>
                  <Ionicons name="map" size={20} color="#fff" />
                  <Text style={styles.btnMapaText}>ABRIR ROTA NO GPS</Text>
                </TouchableOpacity>
              )}

              {/* Etapa 1: Supervisor assume o controle e silencia a sirene local */}
              {isPendente && (
                <TouchableOpacity 
                  style={[styles.btnAcao, { backgroundColor: '#ea580c' }]} 
                  onPress={() => atualizarStatusPanico(oc.id, 'EM_ANALISE', 'Supervisor assumiu a ocorrência e iniciou o deslocamento.')}
                  disabled={processando === oc.id}
                >
                  {processando === oc.id ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnAcaoText}>1. ASSUMIR E DESARMAR ALARME</Text>}
                </TouchableOpacity>
              )}

              {/* Etapa 2: Ocorre quando o supervisor chega ao local e finaliza a crise */}
              {!isPendente && (
                <TouchableOpacity 
                  style={[styles.btnAcao, { backgroundColor: '#10b981' }]} 
                  onPress={() => atualizarStatusPanico(oc.id, 'RESOLVIDO', 'Atendimento de pânico concluído e encerrado em campo.')}
                  disabled={processando === oc.id}
                >
                  {processando === oc.id ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnAcaoText}>2. ENCERRAR E ARQUIVAR OCORRÊNCIA</Text>}
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e293b' }, // Fundo slate escuro profissional
  header: { flexDirection: 'row', alignItems: 'center', padding: 25, paddingTop: 60, backgroundColor: '#0f172a' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 14, color: '#94a3b8' },
  scroll: { padding: 20 },
  cardCritico: { backgroundColor: '#fff', borderRadius: 12, padding: 20, marginBottom: 20, borderWidth: 3, elevation: 6 },
  topoCard: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingBottom: 15, marginBottom: 15 },
  tituloAlerta: { fontSize: 16, fontWeight: 'bold', marginLeft: 10 },
  infoBox: { padding: 15, borderRadius: 8, marginBottom: 15 },
  infoText: { fontSize: 15, color: '#1e293b', marginBottom: 6 },
  btnMapa: { flexDirection: 'row', backgroundColor: '#2563eb', padding: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  btnMapaText: { color: '#fff', fontWeight: 'bold', fontSize: 14, marginLeft: 10 },
  btnAcao: { padding: 16, borderRadius: 8, alignItems: 'center', elevation: 2 },
  btnAcaoText: { color: '#fff', fontWeight: 'bold', fontSize: 14, textAlign: 'center' },
  areaLimpa: { alignItems: 'center', marginTop: 120, padding: 20 },
  textoLimpo: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginTop: 15 },
  subTextoLimpo: { color: '#94a3b8', fontSize: 14, textAlign: 'center', marginTop: 5 }
});