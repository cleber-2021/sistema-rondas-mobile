import * as Location from 'expo-location';

// Obtém a localização de forma BLINDADA (nunca pendura).
// - requestForegroundPermissionsAsync, getLastKnownPositionAsync e
//   getCurrentPositionAsync podem TRAVAR em alguns aparelhos/estados (não
//   resolvem nem rejeitam). Por isso TODAS passam por timeout com Promise.race.
// - 1º garante a permissão, 2º tenta a última posição conhecida (instantânea),
//   3º tenta o GPS ao vivo. Nunca bloqueia além dos timeouts.
// - Devolve { location, motivo } para o chamador saber EXATAMENTE onde falhou.
function comTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ]);
}

export type ResultadoLocalizacao = {
  location: Location.LocationObject | null;
  motivo?: 'permissao' | 'gps';
};

export async function obterLocalizacaoDetalhada(): Promise<ResultadoLocalizacao> {
  // 1) Permissão — com timeout (a própria chamada nativa pode pendurar).
  const perm = await comTimeout(Location.requestForegroundPermissionsAsync(), 8000);
  if (!perm || perm.status !== 'granted') return { location: null, motivo: 'permissao' };

  // 2) Última posição conhecida (instantânea).
  const ultima = await comTimeout(Location.getLastKnownPositionAsync(), 3000);
  if (ultima) return { location: ultima as Location.LocationObject };

  // 3) GPS ao vivo.
  const atual = await comTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    9000,
  );
  if (atual) return { location: atual as Location.LocationObject };
  return { location: null, motivo: 'gps' };
}

// Mantido por compatibilidade (encerrar visita usa só a posição).
export async function obterLocalizacao(): Promise<Location.LocationObject | null> {
  const r = await obterLocalizacaoDetalhada();
  return r.location;
}
