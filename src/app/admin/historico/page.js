"use client";

import { db } from '@/lib/firebase';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function HistoricoAssembleias() {
  const router = useRouter();
  const [assembleias, setAssembleias] = useState([]);
  const [filtro, setFiltro] = useState('todas'); // 'todas', 'ativas', 'encerradas'
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function carregarAssembleias() {
      try {
        let q = query(collection(db, 'assembleias'), orderBy('criadoEm', 'desc'));

        if (filtro === 'ativas') {
          q = query(collection(db, 'assembleias'), where('status', '==', 'ativa'), orderBy('criadoEm', 'desc'));
        } else if (filtro === 'encerradas') {
          q = query(collection(db, 'assembleias'), where('status', '==', 'encerrada'), orderBy('criadoEm', 'desc'));
        }

        const snapshot = await getDocs(q);
        const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAssembleias(lista);
      } catch (error) {
        console.error('Erro ao carregar:', error);
      } finally {
        setCarregando(false);
      }
    }

    carregarAssembleias();
  }, [filtro]);

  async function contarVotos(assembleiaId) {
    const snapshot = await getDocs(query(collection(db, 'votos'), where('assembleiaId', '==', assembleiaId)));
    return snapshot.size;
  }

  return (
    <main className="min-h-screen py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-white">📊 Histórico de Assembleias</h1>
          <button onClick={() => router.push('/admin')} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition">
            Voltar
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
              <div key={asb.id} className="bg-gray-800 border border-gray-700 rounded-xl p-6 hover:border-gray-600 transition">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-1">{asb.titulo}</h3>
                    <p className="text-gray-400 text-sm">
                      {new Date(asb.criadoEm?.seconds * 1000).toLocaleDateString('pt-BR')} • {asb.propostas?.length || 0} proposta(s)
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${asb.status === 'ativa'
                    ? 'bg-green-900/50 text-green-300 border border-green-800'
                    : 'bg-gray-700 text-gray-300 border border-gray-600'
                    }`}>
                    {asb.status === 'ativa' ? '🟢 Ativa' : '🔴 Encerrada'}
                  </span>
                </div>

                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => router.push(`/resultados/${asb.id}`)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition"
                  >
                    📊 Ver Resultados
                  </button>
                  {asb.status === 'ativa' && (
                    <button
                      onClick={() => router.push(`/admin`)}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition"
                    >
                      ➕ Nova Proposta
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}