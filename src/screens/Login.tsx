import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';

export default function Login({ navigation }: any) {
  const [usuarioLocal, setUsuarioLocal] = useState(''); 
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function verificarLogin() {
      const token = await AsyncStorage.getItem('@RondasApp:token');
      const userString = await AsyncStorage.getItem('@RondasApp:user');
      
      if (token && userString) {
        // === MÁGICA AQUI: Pendura o crachá do usuário antes de abrir a tela ===
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        
        const usuario = JSON.parse(userString);
        redirecionarPorPerfil(usuario.perfil);
      }
    }
    verificarLogin();
  }, []);

  function redirecionarPorPerfil(perfil: string) {
    if (perfil === 'SUPERVISOR') {
      navigation.replace('SupervisorHome'); 
    } else if (perfil === 'POSTO_SERVICO') {
      navigation.replace('VigilanteHome'); // <-- AGORA VAI PARA O MENU INICIAL
    } else {
      Alert.alert('Acesso Negado', 'Seu perfil não tem acesso ao aplicativo mobile.');
      AsyncStorage.clear();
    }
  }

  async function handleLogin() {
    if (!usuarioLocal || !senha) return Alert.alert('Erro', 'Preencha o Usuário e Senha!'); 
    setLoading(true);
    
    try {
      const res = await api.post('/auth/login', { usuario: usuarioLocal, senha });
      const { token, usuario } = res.data;
      
      await AsyncStorage.setItem('@RondasApp:token', token);
      await AsyncStorage.setItem('@RondasApp:user', JSON.stringify(usuario));
      
      // === MÁGICA AQUI: Pendura o crachá do usuário após ele digitar a senha ===
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      redirecionarPorPerfil(usuario.perfil);
    } catch (e: any) { 
      Alert.alert('Erro', e.response?.data?.error || 'Erro ao conectar.'); 
    } finally { 
      setLoading(false); 
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ativar Dispositivo</Text>
      <Text style={styles.subtitle}>Identifique-se para iniciar a operação</Text>
      
      <TextInput style={styles.input} placeholder="Usuário" value={usuarioLocal} onChangeText={setUsuarioLocal} autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Senha" value={senha} onChangeText={setSenha} secureTextEntry />
      
      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Conectar</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 5 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 30, textAlign: 'center' },
  input: { width: '100%', height: 55, backgroundColor: '#FFF', borderRadius: 8, paddingHorizontal: 15, marginBottom: 15, borderWidth: 1, borderColor: '#DDD', fontSize: 18 },
  button: { width: '100%', height: 55, backgroundColor: '#0056b3', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' }
});