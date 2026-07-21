// Captura de foto DENTRO do app (não abre o app de câmera do sistema).
//
// Por quê: em vários aparelhos (ex.: Motorola) a intent do app de câmera
// (ImagePicker.launchCameraAsync -> MediaStore.ACTION_IMAGE_CAPTURE) simplesmente
// não abre — o processo da câmera sobe e é congelado pelo sistema, sem nenhuma
// Activity. Usando o CameraView do expo-camera (o mesmo que já lê o QR Code nas
// rondas, e que funciona nesses aparelhos) a foto é tirada dentro do app,
// sem intent, sem FileProvider e sem activity-result.
//
// A imagem é redimensionada/comprimida antes de virar base64 (upload rápido).
import React, { useRef, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';

const LARGURA_MAX = 1280;
const COMPRESSAO = 0.6;

type Props = {
  visible: boolean;
  /** Recebe a foto pronta como data URI (data:image/jpeg;base64,...) */
  onFoto: (dataUri: string) => void;
  onFechar: () => void;
};

export default function CameraCaptura({ visible, onFoto, onFechar }: Props) {
  const cameraRef = useRef<CameraView>(null);
  const [permissao, pedirPermissao] = useCameraPermissions();
  const [capturando, setCapturando] = useState(false);

  async function capturar() {
    if (!cameraRef.current || capturando) return;
    setCapturando(true);
    try {
      const foto = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (!foto?.uri) return;
      const otimizada = await ImageManipulator.manipulateAsync(
        foto.uri,
        [{ resize: { width: LARGURA_MAX } }],
        { compress: COMPRESSAO, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (otimizada.base64) {
        onFoto(`data:image/jpeg;base64,${otimizada.base64}`);
        onFechar();
      }
    } catch (e: any) {
      Alert.alert('Erro na câmera', e?.message || 'Não foi possível capturar a foto.');
    } finally {
      setCapturando(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onFechar}>
      <View style={styles.container}>
        {!permissao?.granted ? (
          // Só pede a permissão se realmente ainda não estiver concedida.
          <View style={styles.centro}>
            <Ionicons name="camera-outline" size={56} color="#94a3b8" />
            <Text style={styles.aviso}>Precisamos da câmera para tirar a foto.</Text>
            <TouchableOpacity style={styles.btnPermissao} onPress={() => pedirPermissao()}>
              <Text style={styles.btnPermissaoText}>Permitir câmera</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onFechar} style={{ marginTop: 18 }}>
              <Text style={styles.cancelarText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back" />

            <TouchableOpacity style={styles.btnFechar} onPress={onFechar}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>

            <View style={styles.barraInferior}>
              <TouchableOpacity
                style={[styles.btnCapturar, capturando && { opacity: 0.6 }]}
                onPress={capturar}
                disabled={capturando}
              >
                {capturando ? <ActivityIndicator color="#1e293b" /> : <View style={styles.btnCapturarInterno} />}
              </TouchableOpacity>
              <Text style={styles.dica}>{capturando ? 'Processando...' : 'Toque para tirar a foto'}</Text>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, backgroundColor: '#0f172a' },
  aviso: { color: '#e2e8f0', fontSize: 16, textAlign: 'center', marginTop: 14, marginBottom: 22 },
  btnPermissao: { backgroundColor: '#2563eb', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 8 },
  btnPermissaoText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  cancelarText: { color: '#94a3b8', fontSize: 15 },
  btnFechar: { position: 'absolute', top: 50, right: 20, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 22, padding: 10 },
  barraInferior: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 40, paddingTop: 20, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  btnCapturar: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#cbd5e1' },
  btnCapturarInterno: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  dica: { color: '#e2e8f0', marginTop: 12, fontSize: 13 },
});
