import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

export default function SupervisorHome({ navigation }: any) {
  const [nome, setNome] = useState('');

  useEffect(() => {
    async function carregarUser() {
      const userString = await AsyncStorage.getItem('@RondasApp:user');
      if (userString) {
        setNome(JSON.parse(userString).nome);
      }
    }
    carregarUser();
  }, []);

  // Monitoramento de Pânico em tempo real (Polling)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await api.get('/ocorrencias/panico-ativo');
        if (res.data && res.data.existe_panico) {
          Alert.alert(
            "🆘 ALERTA DE PÂNICO", 
            `O vigilante ${res.data.nome_vigilante || 'em campo'} disparou o pânico!`,
            [{ text: "OK, visualizado" }]
          );
        }
      } catch (e) {
        // Silencioso para não incomodar se a rede oscilar
      }
    }, 10000); // Checa a cada 10 segundos
    return () => clearInterval(interval);
  }, []);

  async function deslogar() {
    await AsyncStorage.clear();
    api.defaults.headers.common['Authorization'] = '';
    navigation.replace('Login');
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Olá, {nome.split(' ')[0]}</Text>
        <Text style={styles.subtitle}>O que deseja fazer agora?</Text>
      </View>

      <View style={styles.menuContainer}>
        
        {/* BOTÃO DE VISITAS */}
        <TouchableOpacity 
          style={styles.cardMenu} 
          onPress={() => navigation.navigate('SupervisorDashboard')}
        >
          <View style={[styles.iconBox, { backgroundColor: '#e0f2fe' }]}>
            <Ionicons name="clipboard-outline" size={32} color="#0284c7" />
          </View>
          <View style={{ flex: 1, marginLeft: 15 }}>
            <Text style={styles.cardTitle}>Visitas Pendentes</Text>
            <Text style={styles.cardDesc}>Iniciar auditorias e checklists nos postos de serviço.</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#cbd5e1" />
        </TouchableOpacity>

        {/* BOTÃO DE OCORRÊNCIAS */}
        <TouchableOpacity 
          style={styles.cardMenu} 
          onPress={() => navigation.navigate('SupervisorOcorrencias')}
        >
          <View style={[styles.iconBox, { backgroundColor: '#fee2e2' }]}>
            <Ionicons name="warning-outline" size={32} color="#dc2626" />
          </View>
          <View style={{ flex: 1, marginLeft: 15 }}>
            <Text style={styles.cardTitle}>Registrar Ocorrência</Text>
            <Text style={styles.cardDesc}>Reportar problemas pontuais encontrados nas instalações.</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#cbd5e1" />
        </TouchableOpacity>

      </View>

      {/* A VÍRGULA PERDIDA FOI REMOVIDA DESTA LINHA */}
      <TouchableOpacity style={styles.btnLogout} onPress={deslogar}>
        <Ionicons name="log-out-outline" size={20} color="#dc2626" />
        <Text style={styles.btnLogoutText}>Sair da Conta</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { padding: 25, paddingTop: 70, backgroundColor: '#1e293b', borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 16, color: '#cbd5e1', marginTop: 5 },
  
  menuContainer: { flex: 1, padding: 20, marginTop: 10 },
  
  cardMenu: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 20, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#e2e8f0', elevation: 2 },
  iconBox: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  cardDesc: { fontSize: 13, color: '#64748b', marginTop: 4, lineHeight: 18 },
  
  btnLogout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: 30, padding: 15, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#fecaca' },
  btnLogoutText: { color: '#dc2626', fontWeight: 'bold', fontSize: 16, marginLeft: 8 }
});