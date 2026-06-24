import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Vibration, Alert, KeyboardAvoidingView, Platform, ScrollView, BackHandler
} from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import { pararAlarme } from '../services/despertaAlarme';

// Padrão de vibração: vibra 1s, pausa 0.5s, repete
const VIBRATION_PATTERN = [0, 1000, 500];

interface Props {
  despertaId: string;
  nome: string;
  slotKey: string;
  disparoEm?: string;
  onConfirmado: () => void;
}

export default function DespertaAlarm({ despertaId, nome, slotKey, disparoEm, onConfirmado }: Props) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const vibrandoRef = useRef(false);

  useEffect(() => {
    iniciarVibracaoLoop();

    // Bloqueia o botão "voltar" do Android: a tela só sai com a senha correta.
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => true);

    return () => {
      Vibration.cancel();
      vibrandoRef.current = false;
      backSub.remove();
    };
  }, []);

  function iniciarVibracaoLoop() {
    vibrandoRef.current = true;
    Vibration.vibrate(VIBRATION_PATTERN, true);
  }

  async function confirmar() {
    if (!senha.trim()) { setErro('Digite a senha.'); return; }
    setConfirmando(true);
    setErro('');
    try {
      await api.post(`/desperta/${despertaId}/confirmar`, { senha: senha.trim(), slot_key: slotKey, disparo_em: disparoEm });
      Vibration.cancel();
      vibrandoRef.current = false;
      // Para a sirene do notifee (loop) e remove a notificação ongoing
      await pararAlarme(slotKey);
      // Salva localmente que já confirmou este slot
      await AsyncStorage.setItem(`@desperta_confirmado:${despertaId}:${slotKey}`, '1');
      onConfirmado();
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'Erro ao confirmar.';
      setErro(msg === 'Senha incorreta.' ? 'Senha incorreta! Tente novamente.' : msg);
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.iconBox}>
          <Text style={styles.icon}>🔔</Text>
        </View>
        <Text style={styles.title}>DESPERTA PORTEIRO</Text>
        <Text style={styles.subtitle}>{nome}</Text>
        <Text style={styles.instrucao}>Digite a senha para confirmar presença:</Text>

        <TextInput
          style={styles.input}
          value={senha}
          onChangeText={setSenha}
          placeholder="Senha..."
          placeholderTextColor="#94a3b8"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={confirmar}
        />

        {!!erro && <Text style={styles.erro}>{erro}</Text>}

        <TouchableOpacity
          style={[styles.btn, confirmando && styles.btnDisabled]}
          onPress={confirmar}
          disabled={confirmando}
        >
          <Text style={styles.btnText}>{confirmando ? 'Confirmando...' : '✓ CONFIRMAR PRESENÇA'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#1e293b' },
  container: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  iconBox: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#dc2626', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  icon: { fontSize: 48 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#f8fafc', letterSpacing: 2, marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#94a3b8', marginBottom: 32, textAlign: 'center' },
  instrucao: { fontSize: 14, color: '#cbd5e1', marginBottom: 12, textAlign: 'center' },
  input: {
    width: '100%', backgroundColor: '#334155', color: '#f8fafc',
    borderRadius: 10, padding: 16, fontSize: 20, textAlign: 'center',
    borderWidth: 2, borderColor: '#475569', marginBottom: 8, letterSpacing: 4
  },
  erro: { color: '#f87171', marginBottom: 12, fontSize: 14, textAlign: 'center' },
  btn: { width: '100%', backgroundColor: '#16a34a', borderRadius: 10, padding: 18, alignItems: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
