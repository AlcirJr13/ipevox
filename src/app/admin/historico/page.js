"use client";

import { db } from '@/lib/firebase';
import { collection, doc, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';

export default function HistoricoAssembleias() {
  const router = useRouter();
  const [assembleias, setAssembleias] = useState([]);
  const [filtro, setFiltro] = useState('todas');
  const [carregando, setCarregando] = useState(true);
  const [qrCodeAssembleia, setQrCodeAssembleia] = useState(null);

  // 🔔 Listener em tempo real para assembleias
  useEffect(() => {
    let q;
    if (filtro === 'ativas') {
      q = query(collection(db, 'assembleias'), where('status', '==', 'ativa'), orderBy('criadoEm', 'desc'));
    } else if (filtro === 'encerradas') {
      q = query(collection(db, 'assembleias'), where('status', '==', 'encerrada'), orderBy('criadoEm', 'desc'));
    } else {
      q = query(collection(db, 'assembleias'), orderBy('criadoEm', 'desc'));
    }

    const unsub = onSnapshot(q, (snapshot) => {
      const lista = snapshot.docs.map((docSnap) => ({
        docId: docSnap.id,
        ...docSnap.data(),
      }));
      setAssembleias(lista);
      setCarregando(false);
    }, (error) => {
      console.error('Erro no listener:', error);
      setCarregando(false);
    });

    return () => unsub();
  }, [filtro]);

  async function encerrarAssembleia(docId) {
    const confirmado = confirm('Tem certeza que deseja encerrar esta assembleia? Os votos serão bloqueados.');
    if (!confirmado) return;

    try {
      await updateDoc(doc(db, 'assembleias', docId), { status: 'encerrada' });
      // ✅ O onSnapshot atualiza a lista automaticamente em tempo real
    } catch (error) {
      console.error('Erro ao encerrar:', error);
      alert('❌ Erro ao encerrar assembleia.');
    }
  }

  function abrirQRCode(assembleia) {
    setQrCodeAssembleia(assembleia);
  }

  function fecharQRCode() {
    setQrCodeAssembleia(null);
  }

  return (
    <main className="min-h-screen py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-white">📊 Histórico de Assembleias</h1>
          <button onClick={() => router.push('/admin')} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition">
            Painel do síndico
          </button>
        </div>

        {/* Filtros */}
        <div className="flex gap-3 mb-6">
          {['todas', 'ativas', 'encerradas'].map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-4 py-2 rounded-lg font-medium transition ${filtro === f
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {carregando ? (
          <p className="text-gray-400 text-center">Carregando...</p>
        ) : assembleias.length === 0 ? (
          <p className="text-gray-400 text-center">Nenhuma assembleia encontrada.</p>
        ) : (
          <div className="grid gap-4">
            {assembleias.map((asb) => (
              <div key={asb.docId} className="bg-gray-800 border border-gray-700 rounded-xl p-6 hover:border-gray-600 transition">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-1">{asb.titulo}</h3>
                    <p className="text-gray-400 text-sm">
                      {asb.criadoEm?.seconds ? new Date(asb.criadoEm.seconds * 1000).toLocaleDateString('pt-BR') : 'Data ind.'}
                      • {asb.propostas?.length || 0} proposta(s)
                    </p>
                  </div>

                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${asb.status === 'ativa'
                    ? 'bg-green-900/50 text-green-300 border border-green-800'
                    : 'bg-gray-700 text-gray-300 border border-gray-600'
                    }`}>
                    {asb.status === 'ativa' ? '🟢 Ativa' : '🔴 Encerrada'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-gray-700/50">
                  <button
                    onClick={() => router.push(`/resultados/${asb.id}`)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition flex items-center gap-2"
                  >
                    Ver Resultados
                  </button>

                  {asb.status === 'ativa' && (
                    <button
                      onClick={() => abrirQRCode(asb)}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm transition flex items-center gap-2"
                    >
                      📱 QR Code
                    </button>
                  )}

                  {asb.status === 'ativa' && (
                    <button
                      onClick={() => encerrarAssembleia(asb.docId)}
                      className="px-4 py-2 bg-red-900/40 hover:bg-red-900/70 text-red-300 border border-red-900 rounded-lg text-sm transition flex items-center gap-2"
                    >
                      🔒 Encerrar Agora
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {qrCodeAssembleia && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={fecharQRCode}>
          <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full text-center border border-gray-700 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-4xl mb-4">📱</div>
            <h2 className="text-2xl font-bold text-white mb-2">{qrCodeAssembleia.titulo}</h2>
            <p className="text-gray-400 mb-6">Exiba este QR Code para os participantes</p>

            <div className="bg-white p-4 rounded-xl inline-block mb-6">
              <QRCodeSVG
                value={`${window.location.origin}/checkin/${qrCodeAssembleia.id}`}
                size={250}
              />
            </div>

            <div className="bg-gray-900 p-3 rounded-lg break-all text-sm text-blue-400 font-mono mb-6">
              {`${window.location.origin}/checkin/${qrCodeAssembleia.id}`}
            </div>

            <button
              onClick={fecharQRCode}
              className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
