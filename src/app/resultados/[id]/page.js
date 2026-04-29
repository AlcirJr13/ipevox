"use client";

import RelatorioPDF from '@/components/RelatorioPDF';
import { db } from '@/lib/firebase';
import { pdf } from '@react-pdf/renderer';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where
} from 'firebase/firestore';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Resultados() {
  const router = useRouter();
  const { id } = useParams(); // ID personalizado (asb_xxxxx)

  const [assembleia, setAssembleia] = useState(null);
  const [assembleiaDocId, setAssembleiaDocId] = useState(null); // ID real do Firestore
  const [votosAgrupados, setVotosAgrupados] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [isAdmin, setIsAdmin] = useState(
    typeof window !== 'undefined' && sessionStorage.getItem('is_admin') === 'true'
  );


  useEffect(() => {
    async function carregarDadosIniciais() {
      if (!id) {
        setErro('ID da assembleia não fornecido.');
        setCarregando(false);
        return;
      }

      try {
        // 🔍 Busca a assembleia pelo campo 'id' personalizado
        const q = query(collection(db, 'assembleias'), where('id', '==', id));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
          console.error('Assembleia não encontrada com ID:', id);
          setErro(`Assembleia "${id}" não encontrada.`);
          setCarregando(false);
          return;
        }

        const docSnap = snapshot.docs[0];
        setAssembleiaDocId(docSnap.id); // Salva o ID real do Firestore
        setAssembleia(docSnap.data());

        // 🔔 Listener em tempo real para votos
        const qVotos = query(collection(db, 'votos'), where('assembleiaId', '==', id));

        const unsubVotos = onSnapshot(
          qVotos,
          (snapshot) => {
            const agrupamento = {};

            snapshot.forEach(doc => {
              const { propostaId, opcao } = doc.data();
              if (!agrupamento[propostaId]) {
                agrupamento[propostaId] = {};
              }
              agrupamento[propostaId][opcao] = (agrupamento[propostaId][opcao] || 0) + 1;
            });

            setVotosAgrupados(agrupamento);
            setCarregando(false);
          },
          (error) => {
            console.error('Erro no listener de votos:', error);
            setCarregando(false);
          }
        );

        return () => unsubVotos();

      } catch (error) {
        console.error('Erro ao carregar:', error);
        setErro(`Erro: ${error.message}`);
        setCarregando(false);
      }
    }

    carregarDadosIniciais();
  }, [id]);

  async function encerrarAssembleia() {
    if (!assembleia || !assembleiaDocId) return;

    if (window.confirm('⚠️ Tem certeza? Após encerrar, nenhum novo voto será aceito.')) {
      try {
        await updateDoc(doc(db, 'assembleias', assembleiaDocId), { status: 'encerrada' });
        alert('✅ Assembleia encerrada com sucesso!');
      } catch (error) {
        console.error('Erro ao encerrar:', error);
        alert('❌ Erro ao encerrar assembleia.');
      }
    }
  }

  if (carregando) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 animate-pulse">Carregando apuração...</p>
      </main>
    );
  }

  if (erro || !assembleia) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-2xl p-8 text-center max-w-md border border-gray-700">
          <div className="text-4xl mb-4">❌</div>
          <h1 className="text-xl font-bold text-white mb-2">Erro ao Carregar</h1>
          <p className="text-gray-400 mb-6">{erro || 'Assembleia não encontrada.'}</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
          >
            Voltar ao Início
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">{assembleia.titulo}</h1>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${assembleia.status === 'ativa' ? 'bg-green-900/50 text-green-300 border border-green-800' : 'bg-red-900/50 text-red-300 border border-red-800'}`}>
                {assembleia.status === 'ativa' ? '🟢 Em andamento' : '🔴 Encerrada'}
              </span>
              <span className="text-gray-500 text-sm">
                {assembleia.criadoEm?.seconds ? new Date(assembleia.criadoEm.seconds * 1000).toLocaleDateString() : ''}
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            {assembleia.status === 'encerrada' && (
              <button
                onClick={baixarPDF}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition"
              >
                📄 Baixar PDF
              </button>
            )}

            {isAdmin && assembleia.status === 'ativa' && (
              <>
                <button onClick={encerrarAssembleia} className="px-4 py-2 bg-red-900/50 hover:bg-red-900/80 text-red-300 border border-red-800 rounded-lg text-sm transition">
                  🔒 Encerrar Votação
                </button>
              </>
            )}
            {isAdmin && (
              <button onClick={() => router.push('/admin/historico')} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition">
                Voltar
              </button>
            )}
            <button onClick={() => router.push('/')} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition">
              Sair
            </button>
          </div>
        </div>

        {/* Cards de Resultados */}
        <div className="space-y-6">
          {assembleia.propostas?.map((prop, idx) => {
            const votosProp = votosAgrupados[prop.titulo] || {};
            const totalVotos = Object.values(votosProp).reduce((acc, curr) => acc + curr, 0);

            return (
              <div key={idx} className="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-lg">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-white">{idx + 1}. {prop.titulo}</h2>
                  <span className="bg-gray-900 text-gray-400 px-3 py-1 rounded-full text-xs font-mono">
                    {totalVotos} votos
                  </span>
                </div>

                <div className="space-y-4">
                  {prop.opcoes?.map((opcao) => {
                    const count = votosProp[opcao] || 0;
                    const pct = totalVotos > 0 ? Math.round((count / totalVotos) * 100) : 0;

                    const corBarra = pct >= 50 ? 'bg-green-500' : pct >= 30 ? 'bg-blue-500' : 'bg-gray-600';

                    return (
                      <div key={opcao}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-300 font-medium">{opcao}</span>
                          <span className="text-gray-400">{count} ({pct}%)</span>
                        </div>
                        <div className="w-full bg-gray-900 rounded-full h-3 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ease-out ${corBarra}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

async function baixarPDF() {
  const relatorio = <RelatorioPDF assembleia={assembleia} votosAgrupados={votosAgrupados} />;
  const blob = await pdf(relatorio).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `resultado-${assembleia.titulo.toLowerCase().replace(/\s+/g, '-')}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}