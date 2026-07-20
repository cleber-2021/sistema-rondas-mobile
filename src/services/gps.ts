import * as Location from 'expo-location';

// Obtém a localização de forma BLINDADA (nunca pendura).
// - getLastKnownPositionAsync e getCurrentPositionAsync podem TRAVAR em alguns
//   aparelhos/estados (não resolvem nem rejeitam). Por isso tudo passa por um
//   timeout com Promise.race — no pior caso retorna null (e o chamador avisa).
// - 1º tenta a última posição conhecida (instantânea). Se não vier, tenta o GPS
//   ao vivo. Nunca bloqueia além dos timeouts.
function comTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function obterLocalizacao(): Promise<Location.LocationObject | null> {
  const ultima = await comTimeout(Location.getLastKnownPositionAsync(), 3000);
  if (ultima) return ultima as Location.LocationObject;
  const atual = await comTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    9000,
  );
  return (atual as Location.LocationObject) || null;
}
