import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const api = axios.create({
  baseURL: 'https://sulcleansm.ddns.com.br:3443/api', 
});

// Interceptor corrigido: Garante a reidratação a cada chamada
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('@RondasApp:token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default api;