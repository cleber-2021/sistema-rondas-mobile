import * as Location from 'expo-location';

// Obtém a localização de forma BLINDADA (nunca pendura).
// - IMPORTANTE: a permissão é VERIFICADA primeiro (getForegroundPermissionsAsync,
//   instantânea). Só PEDIMOS (requestForegroundPermissionsAsync) se ainda não
//   estiver concedida — porque em vários aparelhos o "request" PENDURA (não
//   resolve) quando a permissão já foi concedida. Foi isso que causava o
//   travamento ao iniciar visita.
// - getLastKnownPositionAsync e getCurrentPositionAsync também passam por timeout.
// - Devolve { location, motivo } para o chamador saber onde falhou.
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

async function garantirPermissaoLocalizacao(): Promise<boolean> {
  // 1) Verifica (instantâneo, não pendura).
  const atual = await comTimeout(Location.getForegroundPermissionsAsync(), 4000);
  if (atual && atual.status === 'granted') return true;
  // 2) Só pede se realmente não estiver concedida.
  const req = await comTimeout(Location.requestForegroundPermissionsAsync(), 8000);
  return !!req && req.status === 'granted';
}

export async function obterLocalizacaoDetalhada(): Promise<ResultadoLocalizacao> {
  const ok = await garantirPermissaoLocalizacao();
  if (!ok) return { location: null, motivo: 'permissao' };

  // Última posição conhecida (instantânea).
  const ultima = await comTimeout(Location.getLastKnownPositionAsync(), 3000);
  if (ultima) return { location: ultima as Location.LocationObject };

  // GPS ao vivo.
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
