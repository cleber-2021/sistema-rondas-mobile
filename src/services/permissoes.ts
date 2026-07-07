// Solicita, de uma vez, todas as permissões que o app usa.
// Chamado no primeiro carregamento do app (App.tsx). Se a permissão já estiver
// concedida (ou negada permanentemente), o SO não pergunta de novo — então é
// seguro chamar em toda abertura.
//
// IMPORTANTE: as permissões do SO (localização, câmera, galeria) vêm PRIMEIRO.
// O notifee.requestPermission() fica por ÚLTIMO e com timeout, porque em alguns
// aparelhos ele pode ficar pendurado (não lança erro, só não resolve) e, sendo
// uma fila sequencial de await, isso impediria os pedidos seguintes de aparecer.
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import notifee from '@notifee/react-native';

// Garante que uma promise nunca trave a fila além de N ms.
function comTimeout<T>(p: Promise<T>, ms = 8000): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function solicitarPermissoesIniciais(): Promise<void> {
  // 1) Localização (bater ponto por GPS)
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') await comTimeout(Location.requestForegroundPermissionsAsync());
  } catch (e) { console.log('Permissão localização:', e); }

  // 2) Câmera (fotos de ocorrência / checklist / QR Code)
  try {
    const { status } = await ImagePicker.getCameraPermissionsAsync();
    if (status !== 'granted') await comTimeout(ImagePicker.requestCameraPermissionsAsync());
  } catch (e) { console.log('Permissão câmera:', e); }

  // 3) Galeria (anexar imagem existente)
  try {
    const { status } = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (status !== 'granted') await comTimeout(ImagePicker.requestMediaLibraryPermissionsAsync());
  } catch (e) { console.log('Permissão galeria:', e); }

  // 4) Notificações (expo)
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') await comTimeout(Notifications.requestPermissionsAsync());
  } catch (e) { console.log('Permissão notificações:', e); }

  // 5) notifee por ÚLTIMO e com timeout (pode pendurar em alguns aparelhos)
  try {
    await comTimeout(notifee.requestPermission());
  } catch (e) { console.log('Permissão notifee:', e); }
}
