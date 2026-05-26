import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import api from '../services/api';

export default function VigilanteHome({ navigation }: any) {
  const [nomePosto, setNomePosto] = useState('');
  const [segurandoPanico, setSegurandoPanico] = useState(false);
  const [timerPanico, setTimerPanico] = useState<any>(null);

  useEffect(() => {
    async function carregarUser() {
      const userString = await AsyncStorage.getItem('@RondasApp:user');
      if (userString) {
        setNomePosto(JSON.parse(userString).nome);
      }
    }
    carregarUser();
  }, []);

  // === NOVO: RADAR DE RONDAS (DESPERTADOR LOCAL) ===
  // Agenda os alarmes de ronda assim que o vigilante entra na tela inicial
  useEffect(() => {
    async function programarAlarmesDasRondas() {
      try {
        const res = await api.get('/rotas');
        
        // Limpa alarmes antigos para não tocar duplicado
        await Notifications.cancelAllScheduledNotificationsAsync();

        res.data.forEach(async (rota: any) => {
          if (rota.intervalo_minutos && rota.ultima_execucao) {
            const ultimaTs = new Date(rota.ultima_execucao).getTime();
            const proximaTs = ultimaTs + (rota.intervalo_minutos * 60000);

            // Se a próxima ronda ainda vai acontecer no futuro, agenda o alarme!
            if (proximaTs > Date.now()) {
              await Notifications.scheduleNotificationAsync({
                content: { 
                  title: "⏰ Hora da Patrulha!", 
                  body: `Atenção Vigilante: O roteiro "${rota.nome}" está liberado. Inicie agora!`, 
                  sound: true, 
                  priority: Notifications.AndroidNotificationPriority.MAX,
                  // @ts-ignore
                  channelId: 'rondas-default'
                },
                trigger: { date: new Date(proximaTs) },
              });
            }
          }
        });
      } catch (e) {
        console.log("Erro ao programar alarmes das rondas:", e);
      }
    }

    programarAlarmesDasRondas();

    // Recalcula os alarmes a cada 5 minutos caso o app fique muito tempo aberto
    const interval = setInterval(programarAlarmesDasRondas, 5 * 60000);
    return () => clearInterval(interval);
  }, []);

  async function deslogar() {
    await Notifications.cancelAllScheduledNotificationsAsync(); // Limpa alarmes ao sair
    await AsyncStorage.clear();
    api.defaults.headers.common['Authorization'] = '';
    navigation.replace('Login');
  }

  async function dispararSinalPanico() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return Alert.alert('Permissão Negada', 'O App precisa de acesso ao GPS para enviar o Pânico.');
      }

      let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await api.post('/ocorrencias/panico', { latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      Alert.alert('🆘 SINAL ENVIADO', 'A central foi notificada.');
    } catch (e: any) { 
      console.log("Erro Pânico:", e.response?.data || e.message);
      Alert.alert('Erro', 'Falha ao enviar sinal de pânico.'); 
    }
  }

  const handleStartPanico = () => {
    setSegurandoPanico(true);
    setTimerPanico(setTimeout(() => { dispararSinalPanico(); setSegurandoPanico(false); }, 1500));
  };
  
  const handleCancelPanico = () => { 
    if (timerPanico) clearTimeout(timerPanico); 
    setSegurandoPanico(false); 
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{nomePosto}</Text>
        <Text style={styles.subtitle}>Operação de Vigilância Ativa</Text>
      </View>

      <View style={styles.menuContainer}>
        <TouchableOpacity style={styles.cardMenu} onPress={() => navigation.navigate('VigilanteRondas')}>
          <View style={[styles.iconBox, { backgroundColor: '#e0f2fe' }]}>
            <Ionicons name="shield-checkmark-outline" size={32} color="#0284c7" />
          </View>
          <View style={{ flex: 1, marginLeft: 15 }}>
            <Text style={styles.cardTitle}>Realizar Rondas</Text>
            <Text style={styles.cardDesc}>Aceder aos roteiros de patrulha e ler QR Codes.</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#cbd5e1" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.cardMenu} onPress={() => navigation.navigate('VigilantePassagem')}>
          <View style={[styles.iconBox, { backgroundColor: '#fef3c7' }]}>
            <Ionicons name="clipboard-outline" size={32} color="#d97706" />
          </View>
          <View style={{ flex: 1, marginLeft: 15 }}>
            <Text style={styles.cardTitle}>Passagem de Serviço</Text>
            <Text style={styles.cardDesc}>Preencher os checklists de início ou fim de turno.</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#cbd5e1" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.cardMenu} onPress={() => navigation.navigate('VigilanteOcorrencia')}>
          <View style={[styles.iconBox, { backgroundColor: '#fee2e2' }]}>
            <Ionicons name="warning-outline" size={32} color="#dc2626" />
          </View>
          <View style={{ flex: 1, marginLeft: 15 }}>
            <Text style={styles.cardTitle}>Registrar Ocorrência</Text>
            <Text style={styles.cardDesc}>Reportar anomalias com foto para a central.</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#cbd5e1" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={[styles.btnPanico, segurandoPanico && { backgroundColor: '#000', transform: [{ scale: 1.1 }] }]} onPressIn={handleStartPanico} onPressOut={handleCancelPanico}>
        <Text style={styles.textPanico}>{segurandoPanico ? 'ENVIANDO...' : 'S.O.S'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btnLogout} onPress={deslogar}>
        <Ionicons name="log-out-outline" size={20} color="#dc2626" />
        <Text style={styles.btnLogoutText}>Desconectar</Text>
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
  btnLogout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: 30, padding: 15, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#fecaca', marginBottom: 40 },
  btnLogoutText: { color: '#dc2626', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
  btnPanico: { position: 'absolute', bottom: 110, right: 20, width: 75, height: 75, borderRadius: 40, backgroundColor: '#dc2626', justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, zIndex: 100 },
  textPanico: { color: '#fff', fontWeight: 'bold', fontSize: 16, textAlign: 'center' }
});