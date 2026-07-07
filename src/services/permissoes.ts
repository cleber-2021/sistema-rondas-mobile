// Solicita, de uma vez, todas as permissões que o app usa.
// Chamado no primeiro carregamento do app (App.tsx). Se a permissão já estiver
// concedida (ou negada permanentemente), o SO não pergunta de novo — então é
// seguro chamar em toda abertura.
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import notifee from '@notifee/react-native';

export async function solicitarPermissoesIniciais(): Promise<void> {
  // As solicitações são sequenciais para os diálogos aparecerem um após o outro.

  // 1) Notificações (alarme de ronda / desperta)
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') await Notifications.requestPermissionsAsync();
    // notifee cobre canais/full-screen intent no Android
    await notifee.requestPermission();
  } catch (e) { console.log('Permissão notificações:', e); }

  // 2) Localização (bater ponto por GPS)
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') await Location.requestForegroundPermissionsAsync();
  } catch (e) { console.log('Permissão localização:', e); }

  // 3) Câmera (fotos de ocorrência / checklist / QR Code)
  try {
    const { status } = await ImagePicker.getCameraPermissionsAsync();
    if (status !== 'granted') await ImagePicker.requestCameraPermissionsAsync();
  } catch (e) { console.log('Permissão câmera:', e); }

  // 4) Galeria (anexar imagem existente)
  try {
    const { status } = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (status !== 'granted') await ImagePicker.requestMediaLibraryPermissionsAsync();
  } catch (e) { console.log('Permissão galeria:', e); }
}
