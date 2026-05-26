import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ActivityIndicator, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

export default function Login({ navigation }: any) {
  const [usuarioLocal, setUsuarioLocal] = useState(''); 
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  async function handleLogin() {
  if (!usuarioLocal || !senha) return Alert.alert('Erro', 'Preencha o Usuário e Senha!'); 
  setLoading(true);
  
  try {
      const res = await api.post('/auth/login', { usuario: usuarioLocal, senha });
      
      // MUDANÇA AQUI: Trocamos 'user' para 'usuario' para bater com o servidor
      const { token, usuario } = res.data; 
      
      if (!token || !usuario) {
        throw new Error("Dados de usuário não retornados corretamente pelo servidor.");
      }
      
      // Salva os dados usando a variável correta
      await AsyncStorage.setItem('@RondasApp:token', token);
      await AsyncStorage.setItem('@RondasApp:user', JSON.stringify(usuario));
      
      // Define o token globalmente
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      // Redireciona
      redirecionarPorPerfil(usuario.perfil);
    } catch (e: any) { 
      Alert.alert('Erro de Conexão', 'Verifique usuário e senha ou se o servidor está ativo.');
      console.log("Erro completo:", e.response?.data || e.message);
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
      {/* ADICIONADO: placeholderTextColor para forçar a cor do texto de fundo */}
      <TextInput 
        style={styles.input} 
        placeholder="Usuário" 
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
          <Ionicons name={mostrarSenha ? "eye-off" : "eye"} size={24} color="#64748b" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Conectar</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 20 },
  logo: { width: 250, height: 100, marginBottom: 30 },
  
  // ADICIONADO: Fundo #f8fafc (cinza clarinho) para dar contraste com o fundo branco
  input: { width: '100%', height: 55, backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 15, marginBottom: 15, borderWidth: 1, borderColor: '#cbd5e1', color: '#1e293b', fontSize: 16 },
  passwordContainer: { flexDirection: 'row', width: '100%', height: 55, backgroundColor: '#f8fafc', borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center' },
  passwordInput: { flex: 1, paddingHorizontal: 15, color: '#1e293b', fontSize: 16 },
  
  eyeIcon: { padding: 15 },
  button: { width: '100%', height: 55, backgroundColor: '#0056b3', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' }
});