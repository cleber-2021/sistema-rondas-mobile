import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Modal, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CameraCaptura from '../components/CameraCaptura';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

export default function VigilantePassagem({ navigation }: any) {
  const [checklistsServico, setChecklistsServico] = useState<any[]>([]);
  const [execucoesHoje, setExecucoesHoje] = useState<any[]>([]);
  const [modalPassagem, setModalPassagem] = useState(false);
  const [checklistAtivo, setChecklistAtivo] = useState<any>(null);
  const [respostasPassagem, setRespostasPassagem] = useState<any>({});
  const [loadingPassagem, setLoadingPassagem] = useState(false);
  const [horaAtualDaUI, setHoraAtualDaUI] = useState(Date.now());
  // Id da pergunta cuja foto está sendo tirada (null = câmera fechada).
  const [alvoFoto, setAlvoFoto] = useState<string | null>(null);

  useEffect(() => {
    const timerRelogio = setInterval(() => setHoraAtualDaUI(Date.now()), 10000);
    carregarChecklists();
    return () => clearInterval(timerRelogio);
  }, []);

  async function carregarChecklists() {
    try {
      const res = await api.get('/checklists-servico/app');
      setChecklistsServico(res.data.checklists || []);
      setExecucoesHoje(res.data.execucoes_hoje || []);
    } catch (e) {}
  }

  function obterStatusChecklist(chk: any) {
    const horarios = chk.horarios.split(',').map((h: string) => h.trim());
    let janelaAberta = null;
    let proximoHorario = null;
    let jaRespondido = false;

    const timestamps = horarios.map((h: string) => {
      const [hora, min] = h.split(':').map(Number);
      const d = new Date(horaAtualDaUI);
      d.setHours(hora, min, 0, 0);
      return d.getTime();
    }).sort((a: number, b: number) => a - b);

    for (const ts of timestamps) {
      const inicioJanela = ts - (30 * 60000); // 30 min antes
      const fimJanela = ts + (30 * 60000);   // 30 min depois

      const execucaoNaJanela = execucoesHoje.find((e: any) => {
        if (e.checklist_id !== chk.id) return false;
        const execTs = new Date(e.criado_em).getTime();
        return execTs >= inicioJanela && execTs <= fimJanela;
      });

      if (horaAtualDaUI >= inicioJanela && horaAtualDaUI <= fimJanela) {
        if (execucaoNaJanela) jaRespondido = true;
        else janelaAberta = ts;
      }
      if (ts > horaAtualDaUI && !proximoHorario && !janelaAberta && !jaRespondido) {
        proximoHorario = ts;
      }
    }
    if (!janelaAberta && !proximoHorario && timestamps.length > 0) { proximoHorario = timestamps[0] + 86400000; }
    return { janelaAberta, proximoHorario, jaRespondido };
  }

  function iniciarPassagemServico(chk: any) {
    setChecklistAtivo(chk);
    const initial: any = {};
    chk.perguntas.forEach((p: any) => {
      initial[p.id] = { pergunta_id: p.id, resposta: 'Conforme', observacao: '', foto_base64: null };
    });
    setRespostasPassagem(initial);
    setModalPassagem(true);
  }

  function atualizarResposta(perguntaId: string, campo: string, valor: any) {
    setRespostasPassagem((prev: any) => ({
      ...prev, [perguntaId]: { ...prev[perguntaId], [campo]: valor }
    }));
  }

  function tirarFotoPassagem(perguntaId: string) {
    setAlvoFoto(perguntaId);
  }

  function receberFoto(dataUri: string) {
    if (alvoFoto) atualizarResposta(alvoFoto, 'foto_base64', dataUri);
  }

  async function enviarPassagemServico() {
    for (const p of checklistAtivo.perguntas) {
      if (p.exige_foto && !respostasPassagem[p.id].foto_base64) {
        return Alert.alert('Atenção', `A pergunta "${p.pergunta}" exige uma foto.`);
      }
    }
    setLoadingPassagem(true);
    try {
      const respostasArray = Object.values(respostasPassagem);
      await api.post('/checklists-servico/app/responder', { checklist_id: checklistAtivo.id, respostas: respostasArray });
      Alert.alert('Sucesso', 'Passagem de serviço registrada!');
      setModalPassagem(false);
      carregarChecklists(); 
    } catch (e: any) { Alert.alert('Erro', 'Falha ao registrar passagem.'); } finally { setLoadingPassagem(false); }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 15 }}>
          <Ionicons name="arrow-back" size={28} color="#1e293b" />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Passagem de Serviço</Text>
          <Text style={styles.subtitle}>Formulários de Turno</Text>
        </View>
      </View>

      <ScrollView style={{ padding: 20 }}>
        {checklistsServico.length === 0 ? (
          <Text style={{ textAlign: 'center', color: '#64748b', marginTop: 50 }}>Nenhum checklist de serviço configurado para este posto.</Text>
        ) : (
          checklistsServico.map(chk => {
            const status = obterStatusChecklist(chk);
            let btnColor = '#94a3b8'; let texto = '';

            if (status.jaRespondido) {
              btnColor = '#10b981'; texto = '✅ Respondido';
            } else if (status.janelaAberta) {
              btnColor = '#ea580c'; texto = '📝 Preencher Agora';
            } else {
              const dataProxima = new Date(status.proximoHorario || 0);
              texto = `⏳ Aguarde as ${dataProxima.getHours().toString().padStart(2, '0')}:${dataProxima.getMinutes().toString().padStart(2, '0')}`;
            }

            return (
              <View key={chk.id} style={styles.chkCard}>
                <View style={{ flex: 1, paddingRight: 15 }}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1e293b' }}>{chk.titulo}</Text>
                  <Text style={{ color: '#64748b', fontSize: 12 }}>Tolerância de 30 minutos</Text>
                </View>
                <TouchableOpacity 
                  style={[styles.btnIniciar, { backgroundColor: btnColor }]} 
                  onPress={() => status.janelaAberta ? iniciarPassagemServico(chk) : Alert.alert('Aviso', status.jaRespondido ? 'Formulário já preenchido.' : `Liberado próximo das ${texto.replace('⏳ Aguarde as ', '')}.`)}
                >
                  <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{texto}</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* === MODAL DA PASSAGEM DE SERVIÇO === */}
      <Modal visible={modalPassagem} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#f8fafc', paddingTop: 50 }}>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#1e293b', marginBottom: 5, textAlign: 'center' }}>{checklistAtivo?.titulo}</Text>
            <Text style={{ fontSize: 14, color: '#64748b', marginBottom: 25, textAlign: 'center' }}>Responda com atenção.</Text>

            {checklistAtivo?.perguntas.map((p: any, index: number) => (
              <View key={p.id} style={{ backgroundColor: '#fff', padding: 20, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#e2e8f0' }}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#334155', marginBottom: 15 }}>{index + 1}. {p.pergunta}</Text>
                
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 15 }}>
                  <TouchableOpacity style={[styles.btnToggle, respostasPassagem[p.id]?.resposta === 'Conforme' ? { backgroundColor: '#10b981', borderColor: '#10b981' } : {}]} onPress={() => atualizarResposta(p.id, 'resposta', 'Conforme')}>
                    <Text style={{ color: respostasPassagem[p.id]?.resposta === 'Conforme' ? '#fff' : '#64748b', fontWeight: 'bold' }}>Conforme</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnToggle, respostasPassagem[p.id]?.resposta === 'Não Conforme' ? { backgroundColor: '#ef4444', borderColor: '#ef4444' } : {}]} onPress={() => atualizarResposta(p.id, 'resposta', 'Não Conforme')}>
                    <Text style={{ color: respostasPassagem[p.id]?.resposta === 'Não Conforme' ? '#fff' : '#64748b', fontWeight: 'bold' }}>Com Defeito</Text>
                  </TouchableOpacity>
                </View>

                <TextInput 
                  style={[styles.inputArea, { height: 45, marginBottom: p.exige_foto ? 15 : 0 }]} 
                  placeholder="Observações (Opcional)..." 
                  placeholderTextColor="#94a3b8" 
                  value={respostasPassagem[p.id]?.observacao} 
                  onChangeText={txt => atualizarResposta(p.id, 'observacao', txt)} 
                />

                {p.exige_foto && (
                  <TouchableOpacity style={[styles.btnCamera, { backgroundColor: respostasPassagem[p.id]?.foto_base64 ? '#10b981' : '#475569' }]} onPress={() => tirarFotoPassagem(p.id)}>
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>{respostasPassagem[p.id]?.foto_base64 ? '📸 Imagem Capturada' : '📸 Tirar Foto (Obrigatório)'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, paddingBottom: 40 }}>
              <TouchableOpacity style={{ flex: 1, padding: 15, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, alignItems: 'center' }} onPress={() => setModalPassagem(false)}><Text style={{ fontWeight: 'bold' }}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, padding: 15, backgroundColor: '#2563eb', borderRadius: 8, alignItems: 'center' }} onPress={enviarPassagemServico} disabled={loadingPassagem}>{loadingPassagem ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: 'bold' }}>🚀 Finalizar</Text>}</TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <CameraCaptura
        visible={alvoFoto !== null}
        onFoto={receberFoto}
        onFechar={() => setAlvoFoto(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 25, paddingTop: 60, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1e293b' },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 2 },
  chkCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', padding: 20, borderRadius: 12, marginBottom: 15, elevation: 2 },
  btnIniciar: { paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8 },
  btnToggle: { flex: 1, padding: 12, borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  inputArea: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 15, fontSize: 14, color: '#1e293b' },
  btnCamera: { padding: 15, borderRadius: 8, alignItems: 'center' }
});