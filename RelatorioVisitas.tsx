import { useState, useEffect } from 'react';
import api from '../services/api';
import Header from '../components/Header';

export default function RelatorioVisitas() {
  const [visitas, setVisitas] = useState<any[]>([]);
  const [locais, setLocais] = useState<any[]>([]);
  const [visitaSelecionada, setVisitaSelecionada] = useState<any | null>(null);
  
  // Estados dos Filtros
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [localId, setLocalId] = useState('');
  const [buscou, setBuscou] = useState(false);

  // === MÁGICA DO IP ===
  // Descobre qual é a URL base do servidor para buscar as imagens corretamente
  const baseUrl = api.defaults.baseURL?.replace('/api', '') || 'http://localhost:3000';

  useEffect(() => {
    carregarLocais();
  }, []);

  async function carregarLocais() {
    try {
      const response = await api.get('/cadastros/locais');
      setLocais(response.data);
    } catch (e) {
      console.error('Erro ao carregar locais', e);
    }
  }

  async function aplicarFiltros(e: React.FormEvent) {
    e.preventDefault();
    setBuscou(true);

    try {
      const response = await api.get('/visitas/historico', {
        params: {
          data_inicio: dataInicio || undefined,
          data_fim: dataFim || undefined,
          local_id: localId || undefined
        }
      });
      setVisitas(response.data);
    } catch (e) {
      alert('Erro ao buscar o histórico de auditorias.');
    }
  }

  function formatarData(dataISO: string) {
    if (!dataISO) return '-';
    const data = new Date(dataISO);
    return data.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <Header />
      <main style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
        
        <h1 style={{ color: '#475569', marginBottom: '30px', fontSize: '28px' }}>📋 Relatório de Auditorias</h1>

        {/* === BARRA DE FILTROS === */}
        <div style={styles.cardFiltro}>
          <h3 style={{ margin: '0 0 15px 0', color: '#334155', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🔍 Filtros e Busca
          </h3>
          <form onSubmit={aplicarFiltros} style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={styles.label}>DATA INÍCIO:</label>
              <input type="date" style={styles.input} value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
            </div>

            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={styles.label}>DATA FIM:</label>
              <input type="date" style={styles.input} value={dataFim} onChange={e => setDataFim(e.target.value)} />
            </div>

            <div style={{ flex: 2, minWidth: '250px' }}>
              <label style={styles.label}>FILTRAR LOCAL:</label>
              <select style={styles.input} value={localId} onChange={e => setLocalId(e.target.value)}>
                <option value="">-- Todos os Locais --</option>
                {locais.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </div>

            <button type="submit" style={styles.btnBuscar}>Aplicar Filtros</button>
          </form>
        </div>

        {/* === TABELA DE RESULTADOS === */}
        <h2 style={{ color: '#475569', marginTop: '40px', marginBottom: '20px', fontSize: '20px' }}>Resultados do Histórico</h2>
        <div style={styles.card}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b', fontSize: '12px', textTransform: 'uppercase' }}>
                <th style={{ padding: '15px' }}>Data / Hora</th>
                <th style={{ padding: '15px' }}>Supervisor</th>
                <th style={{ padding: '15px' }}>Local</th>
                <th style={{ padding: '15px' }}>Checklist</th>
                <th style={{ padding: '15px', textAlign: 'center' }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {visitas.map((v) => (
                <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '15px', color: '#334155', fontWeight: 'bold' }}>{formatarData(v.inicio_em)}</td>
                  <td style={{ padding: '15px', color: '#64748b' }}>{v.supervisor?.nome}</td>
                  <td style={{ padding: '15px', color: '#0369a1', fontWeight: 'bold' }}>{v.local?.nome}</td>
                  <td style={{ padding: '15px', color: '#64748b' }}>{v.checklist?.titulo}</td>
                  <td style={{ padding: '15px', textAlign: 'center' }}>
                    <button style={styles.btnPrimarySm} onClick={() => setVisitaSelecionada(v)}>
                      Ver Respostas 🔍
                    </button>
                  </td>
                </tr>
              ))}
              
              {!buscou && (
                <tr>
                  <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '16px' }}>
                    👆 Utilize os filtros acima e clique em "Aplicar Filtros" para carregar as auditorias.
                  </td>
                </tr>
              )}

              {buscou && visitas.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#ef4444', fontSize: '16px', fontWeight: 'bold' }}>
                    Nenhuma visita encontrada para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* === MODAL DE RESPOSTAS === */}
      {visitaSelecionada && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '15px', marginBottom: '20px' }}>
              <div>
                <h2 style={{ margin: 0, color: '#1e293b' }}>Auditoria: {visitaSelecionada.checklist?.titulo}</h2>
                <p style={{ margin: '5px 0 0 0', color: '#64748b', fontSize: '14px' }}>
                  Local: {visitaSelecionada.local?.nome} | Realizada em: {formatarData(visitaSelecionada.inicio_em)}
                </p>
              </div>
              <button onClick={() => setVisitaSelecionada(null)} style={styles.btnFecharModal}>✕</button>
            </div>

            <div style={{ maxHeight: '65vh', overflowY: 'auto', paddingRight: '10px' }}>
              {visitaSelecionada.respostas?.map((r: any, index: number) => (
                <div key={r.id} style={{ backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #e2e8f0' }}>
                  <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', color: '#334155' }}>
                    {index + 1}. {r.pergunta?.pergunta}
                  </p>
                  
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: r.observacao || r.foto_url ? '10px' : '0' }}>
                    <span style={{ fontWeight: 'bold', color: '#64748b', fontSize: '14px' }}>Resposta:</span>
                    <span style={ r.resposta === 'Conforme' ? styles.badgeSuccess : r.resposta === 'Não Conforme' ? styles.badgeDanger : styles.badgeNeutral }>
                      {r.resposta}
                    </span>
                  </div>

                  {r.observacao && (
                    <div style={{ backgroundColor: '#fff', padding: '10px', borderRadius: '6px', border: '1px dashed #cbd5e1', marginTop: '10px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase' }}>Observação:</span>
                      <p style={{ margin: '5px 0 0 0', color: '#475569', fontSize: '14px' }}>{r.observacao}</p>
                    </div>
                  )}

                  {/* === IMAGEM DE EVIDÊNCIA === */}
                  {r.foto_url && (
                    <div style={{ marginTop: '15px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#0369a1', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>📸 Foto da Evidência:</span>
                      <img 
                        src={`${baseUrl}/uploads/${r.foto_url}`} 
                        alt="Evidência da auditoria" 
                        style={{ width: '100%', maxWidth: '350px', borderRadius: '8px', border: '1px solid #cbd5e1' }} 
                        onError={(e) => { e.currentTarget.style.display = 'none'; }} // Esconde a imagem se o arquivo foi deletado
                      />
                    </div>
                  )}

                </div>
              ))}
              
              {(!visitaSelecionada.respostas || visitaSelecionada.respostas.length === 0) && (
                <p style={{ textAlign: 'center', color: '#64748b' }}>Esta visita foi encerrada sem respostas.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  card: { backgroundColor: '#fff', padding: '10px 30px 30px 30px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' },
  cardFiltro: { backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginBottom: '20px' },
  label: { display: 'block', color: '#64748b', fontSize: '11px', fontWeight: 'bold', marginBottom: '6px' },
  input: { width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', backgroundColor: '#fff', boxSizing: 'border-box' as const },
  btnBuscar: { backgroundColor: '#2b3a70', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', height: '40px' },
  btnPrimarySm: { backgroundColor: '#e0f2fe', color: '#0369a1', border: 'none', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' },
  modalOverlay: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: '#fff', padding: '30px', borderRadius: '12px', width: '90%', maxWidth: '800px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' },
  btnFecharModal: { backgroundColor: '#f1f5f9', color: '#475569', border: 'none', width: '35px', height: '35px', borderRadius: '50%', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  badgeSuccess: { backgroundColor: '#d1fae5', color: '#065f46', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' },
  badgeDanger: { backgroundColor: '#fee2e2', color: '#991b1b', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' },
  badgeNeutral: { backgroundColor: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }
};