// Solicita, de uma vez, todas as permissões que o app usa.
// Chamado no primeiro carregamento do app (App.tsx). Se a permissão já estiver
// concedida (ou negada permanentemente), o SO não pergunta de novo — então é
// seguro chamar em toda abertura.
//
// IMPORTANTE: as permissões do SO (localização, câmera, galeria) vêm PRIMEIRO.
// O notifee.requestPermission() fica por ÚLTIMO e com timeout, porque em alguns
// aparelhos ele pode ficar pendurado (não lança erro, só não resolve) e, sendo
// uma fila sequencial de await, isso impediria os pedidos seguintes de aparecer.
import { Alert, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import notifee from '@notifee/react-native';

// Garante a permissão da câmera na hora de usar. Se estiver bloqueada
// ("não perguntar mais"), oferece abrir as Configurações num toque.
// Retorna true se pode usar a câmera.
export async function garantirPermissaoCamera(): Promise<boolean> {
  try {
    const atual = await ImagePicker.getCameraPermissionsAsync();
    if (atual.status === 'granted') return true;
    const req = await ImagePicker.requestCameraPermissionsAsync();
    if (req.status === 'granted') return true;
    if (req.canAskAgain === false) {
      Alert.alert(
        'Permissão da câmera',
        'A câmera está bloqueada. Toque em "Abrir Configurações" e ative a permissão de Câmera para tirar fotos.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Abrir Configurações', onPress: () => Linking.openSettings() },
        ],
      );
    } else {
      Alert.alert('Aviso', 'Precisamos da câmera para tirar a foto.');
    }
    return false;
  } catch {
    return false;
  }
}

// Garante que uma promise nunca trave a fila além de N ms.
function comTimeout<T>(p: Promise<T>, ms = 8000): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ]);
}

// Abre a câmera de forma robusta e retorna a foto em data URI (base64) ou null.
// - Garante a permissão (com atalho para Configurações se bloqueada).
// - NÃO usa allowsEditing (o recorte trava a abertura da câmera em vários Androids).
// - Captura erros do launch e mostra a causa real, em vez de "não abrir" silencioso.
export async function tirarFotoBase64(): Promise<string | null> {
  const ok = await garantirPermissaoCamera();
  if (!ok) return null;
  try {
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.3, base64: true });
    if (!result.canceled && result.assets?.[0]?.base64) {
      return `data:image/jpeg;base64,${result.assets[0].base64}`;
    }
    return null;
  } catch (e: any) {
    Alert.alert('Erro na câmera', e?.message || 'Não foi possível abrir a câmera neste aparelho.');
    return null;
  }
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
