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

function comTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ]);
}

async function garantirPermissaoCamera(): Promise<boolean> {
  // VERIFICA primeiro (getCameraPermissionsAsync é instantâneo). Só PEDE
  // (requestCameraPermissionsAsync) se ainda não estiver concedida — porque em
  // vários aparelhos o "request" PENDURA quando a permissão já foi concedida, e
  // aí a câmera "não abre". Verificar primeiro evita chamar o request à toa.
  const atual = await comTimeout(ImagePicker.getCameraPermissionsAsync(), 4000);
  if (atual && atual.status === 'granted') return true;

  const req = await comTimeout(ImagePicker.requestCameraPermissionsAsync(), 8000);
  if (!req) {
    Alert.alert('Permissão da câmera', 'O pedido de permissão não respondeu. Feche e reabra o app e tente de novo.');
    return false;
  }
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
