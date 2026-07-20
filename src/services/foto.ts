// Captura de foto OTIMIZADA para envio.
//
// Problema: a câmera devolve a imagem na resolução cheia (ex.: 12MP). Mesmo com
// quality baixa, o base64 fica enorme — o encode em JS é lento e o upload demora.
//
// Solução: redimensiona para no máximo 1280px de largura e comprime ANTES de
// gerar o base64. Resultado típico: ~100–200 KB em vez de vários MB.
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

const LARGURA_MAX = 1280;
const COMPRESSAO = 0.6;

async function garantirPermissaoCamera(): Promise<boolean> {
  // SEMPRE solicita (não confia no cache): se o Android revogou a permissão em
  // segundo plano (hibernação/auto-revoke), o status em cache pode dizer "granted"
  // mas a câmera falha. requestCameraPermissionsAsync re-valida e re-pede se preciso.
  const req = await ImagePicker.requestCameraPermissionsAsync();
  if (req.status === 'granted') return true;
  if (req.canAskAgain === false) {
    Alert.alert('Permissão da câmera', 'A câmera está bloqueada. Abra as Configurações do app e ative a permissão de Câmera.');
  } else {
    Alert.alert('Permissão da câmera', 'Precisamos da câmera para tirar a foto.');
  }
  return false;
}

/**
 * Abre a câmera, redimensiona/comprime e devolve o data URI (base64) pronto
 * para enviar — ou null se o usuário cancelar/negar.
 */
export async function tirarFotoOtimizada(): Promise<string | null> {
  const ok = await garantirPermissaoCamera();
  if (!ok) return null;
  try {
    // Sem allowsEditing (o recorte trava a câmera em vários Androids) e sem
    // base64 aqui — pegamos só a URI e otimizamos depois.
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || !result.assets?.[0]?.uri) return null;

    const otimizada = await ImageManipulator.manipulateAsync(
      result.assets[0].uri,
      [{ resize: { width: LARGURA_MAX } }],
      { compress: COMPRESSAO, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    if (!otimizada.base64) return null;
    return `data:image/jpeg;base64,${otimizada.base64}`;
  } catch (e: any) {
    Alert.alert('Erro na câmera', e?.message || 'Não foi possível abrir a câmera.');
    return null;
  }
}
