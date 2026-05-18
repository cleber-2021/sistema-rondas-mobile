import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ⚠️ IMPORTANTE: Substitua o "192.168.1.X" pelo IPv4 do seu computador!
const api = axios.create({
  baseURL: 'https://sulcleansm.ddns.com.br:3443/api', 
});

// Interceptor: Pega o token salvo e injeta em todas as requisições
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('@RondasApp:token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;