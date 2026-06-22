// screens/Login.tsx
// ALTERAÃ‡Ã•ES: apÃ³s login bem-sucedido, obtÃ©m o Expo Push Token do dispositivo
// e envia para o servidor via POST /auth/push-token.
// Sem isso o servidor nÃ£o sabe para qual dispositivo enviar as notificaÃ§Ãµes.

import React, { useState } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import api from '../services/api';

/**
 * ObtÃ©m o Expo Push Token do dispositivo fÃ­sico.
 * Retorna null em emuladores (nÃ£o suportam push real).
 */
async function obterExpoPushToken(): Promise<string | null> {
  // Push sÃ³ funciona em dispositivos fÃ­sicos
  if (!Device.isDevice) {
    console.warn('Push notifications nÃ£o funcionam em emuladores.');
    return null;
  }

  const { status: statusAtual } = await Notifications.getPermissionsAsync();
  let statusFinal = statusAtual;

  if (statusAtual !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    statusFinal = status;
  }

  if (statusFinal !== 'granted') {
    console.warn('PermissÃ£o de notificaÃ§Ãµes negada pelo usuÃ¡rio.');
    return null;
  }

  try {
    // projectId vem do app.json â†’ expo.extra.eas.projectId
    // Se nÃ£o estiver usando EAS, pode passar projectId manualmente abaixo
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: '4f2624c7-5be3-4c31-b4e3-338facfa89ce' });
    return tokenData.data;
  } catch (e) {
    console.error('Erro ao obter push token:', e);
    return null;
  }
}

export default function Login({ navigation }: any) {
  const [usuarioLocal, setUsuarioLocal] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  async function handleLogin() {
    if (!usuarioLocal || !senha) {
      return Alert.alert('Erro', 'Preencha o UsuÃ¡rio e Senha!');
    }
    setLoading(true);

    try {
      // 1. Faz o login normal
      const res = await api.post('/auth/login', { usuario: usuarioLocal, senha });
      const { token, usuario } = res.data;

      if (!token || !usuario) {
        throw new Error('Dados de usuÃ¡rio nÃ£o retornados corretamente pelo servidor.');
      }

      // 1b. Restringe o acesso ao app: apenas vigilante (POSTO_SERVICO) e
      // supervisor de campo (SUPERVISOR) podem usar o mobile. Perfis de gestÃ£o
      // e monitoramento usam apenas o painel web.
      const perfisMobile = ['SUPERVISOR', 'POSTO_SERVICO'];
      if (!perfisMobile.includes(usuario.perfil)) {
        setLoading(false);
        return Alert.alert(
          'Acesso restrito',
          'Este aplicativo Ã© exclusivo para operadores e supervisores de campo. Acesse o painel web com este perfil.'
        );
      }

      // 2. Persiste token e dados do usuÃ¡rio
      await AsyncStorage.setItem('@RondasApp:token', token);
      await AsyncStorage.setItem('@RondasApp:user', JSON.stringify(usuario));
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      // 3. Registra o push token no servidor (nÃ£o bloqueia o login se falhar)
      try {
        const pushToken = await obterExpoPushToken();
        if (pushToken) {
          await api.post('/auth/push-token', { expo_push_token: pushToken });
          console.log('ðŸ“² Push token registrado:', pushToken);
        }
      } catch (pushError) {
        // Erro de push nÃ£o impede o login
        console.warn('NÃ£o foi possÃ­vel registrar o push token:', pushError);
      }

      // 4. Redireciona por perfil
      redirecionarPorPerfil(usuario.perfil);
    } catch (e: any) {
      Alert.alert('Erro de ConexÃ£o', 'Verifique usuÃ¡rio e senha ou se o servidor estÃ¡ ativo.');
      console.log('Erro completo:', e.response?.data || e.message);
    } finally {
      setLoading(false);
    }
  }

  function redirecionarPorPerfil(perfil: string) {
    if (perfil === 'SUPERVISOR') navigation.replace('SupervisorHome');
    else if (perfil === 'POSTO_SERVICO') navigation.replace('VigilanteHome');
  }

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/logo_empresa.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      <TextInput
        style={styles.input}
        placeholder="UsuÃ¡rio"
        placeholderTextColor="#94a3b8"
        value={usuarioLocal}
        onChangeText={setUsuarioLocal}
        autoCapitalize="none"
      />

      <View style={styles.passwordContainer}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Senha"
          placeholderTextColor="#94a3b8"
          value={senha}
          onChangeText={setSenha}
          secureTextEntry={!mostrarSenha}
        />
        <TouchableOpacity style={styles.eyeIcon} onPress={() => setMostrarSenha(!mostrarSenha)}>
          <Ionicons name={mostrarSenha ? 'eye-off' : 'eye'} size={24} color="#64748b" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.buttonText}>Conectar</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  logo: { width: 250, height: 100, marginBottom: 30 },
  input: {
    width: '100%', height: 55, backgroundColor: '#f8fafc',
    borderRadius: 8, paddingHorizontal: 15, marginBottom: 15,
    borderWidth: 1, borderColor: '#cbd5e1', color: '#1e293b', fontSize: 16,
  },
  passwordContainer: {
    flexDirection: 'row', width: '100%', height: 55,
    backgroundColor: '#f8fafc', borderRadius: 8, marginBottom: 15,
    borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center',
  },
  passwordInput: { flex: 1, paddingHorizontal: 15, color: '#1e293b', fontSize: 16 },
  eyeIcon: { padding: 15 },
  button: {
    width: '100%', height: 55, backgroundColor: '#0056b3',
    borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  buttonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
});
