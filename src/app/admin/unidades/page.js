"use client";

import { db } from '@/lib/firebase';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function AdminUnidades() {
  const router = useRouter();

  const [unidades, setUnidades] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [isAdmin, setIsAdmin] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('is_admin') === 'true';
    }
    return false;
  });
  const [erro, setErro] = useState('');
  const [novaUnidade, setNovaUnidade] = useState('');
  const [adicionando, setAdicionando] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      router.push('/admin/login');
      return;
    }
    carregarUnidades();
  }, [isAdmin, router]);

  async function carregarUnidades() {
    setCarregando(true);
    try {
      const q = query(collection(db, 'catalogo_unidades'), orderBy('numero', 'asc'));
      const snapshot = await getDocs(q);
      const lista = snapshot.docs.map((docSnap) => ({
        docId: docSnap.id,
        ...docSnap.data(),
      }));
      setUnidades(lista);
    } catch (error) {
      console.error('Erro ao carregar unidades:', error);
      setErro('Erro ao carregar unidades.');
    } finally {
      setCarregando(false);
    }
  }

  async function adicionarUnidade(e) {
    e.preventDefault();
    const numero = novaUnidade.trim();

    if (!numero) {
      setErro('Digite o número da unidade.');
      return;
    }

    // Verifica se já existe
    const q = query(collection(db, 'catalogo_unidades'), where('numero', '==', numero));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      setErro('Essa unidade já está cadastrada.');
      return;
    }

    setAdicionando(true);
    setErro('');

    try {
      await addDoc(collection(db, 'catalogo_unidades'), {
        numero,
        ativo: true,
        criadoEm: new Date().toISOString(),
      });
      setNovaUnidade('');
      await carregarUnidades();
    } catch (error) {
      console.error('Erro ao adicionar:', error);
      setErro('Erro ao adicionar unidade.');
    } finally {
      setAdicionando(false);
    }
  }

  async function toggleAtivo(docId, estadoAtual) {
    try {
      await updateDoc(doc(db, 'catalogo_unidades', docId), {
        ativo: !estadoAtual,
      });
      setUnidades((prev) =>
        prev.map((u) => (u.docId === docId ? { ...u, ativo: !u.ativo } : u))
      );
    } catch (error) {
      console.error('Erro ao atualizar:', error);
      setErro('Erro ao atualizar unidade.');
    }
  }

  async function removerUnidade(docId) {
    if (!confirm('Tem certeza que deseja remover esta unidade?')) return;

    try {
      await deleteDoc(doc(db, 'catalogo_unidades', docId));
      setUnidades((prev) => prev.filter((u) => u.docId !== docId));
    } catch (error) {
      console.error('Erro ao remover:', error);
      setErro('Erro ao remover unidade.');
    }
  }

  async function cadastrarTodas() {
    if (!confirm('Isso criará as unidades de 1 a 59 (se não existirem). Continuar?')) return;

    setAdicionando(true);
    setErro('');

    let cadastradas = 0;
    for (let i = 1; i <= 59; i++) {
      const q = query(collection(db, 'catalogo_unidades'), where('numero', '==', String(i)));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        try {
          await addDoc(collection(db, 'catalogo_unidades'), {
            numero: String(i),
            ativo: true,
            criadoEm: new Date().toISOString(),
          });
          cadastradas++;
        } catch (error) {
          console.error(`Erro ao cadastrar unidade ${i}:`, error);
        }
      }
    }

    await carregarUnidades();
    setAdicionando(false);
    if (cadastradas > 0) {
      setErro('');
    }
  }

  if (!isAdmin) return null;

  const unidadesAtivas = unidades.filter((u) => u.ativo).length;
  const unidadesInativas = unidades.filter((u) => !u.ativo).length;

  return (
    <main className="min-h-screen py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">🏠 Gerenciar Unidades</h1>
            <p className="text-gray-400 text-sm mt-1">
              {unidadesAtivas} ativa(s) · {unidadesInativas} inativa(s) · {unidades.length} total
            </p>
          </div>
          <button
            onClick={() => router.push('/admin')}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition"
          >
            Voltar ao painel
          </button>
        </div>

        {erro && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-800 text-red-300 rounded-xl">
            ⚠️ {erro}
            <button
              onClick={() => setErro('')}
              className="ml-3 text-red-400 hover:text-red-200 underline"
            >
              fechar
            </button>
          </div>
        )}

        {/* Ações em lote */}
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Ações rápidas</h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={cadastrarTodas}
              disabled={adicionando}
              className={`px-5 py-2.5 rounded-lg font-medium text-sm transition ${adicionando
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
            >
              {adicionando ? 'Cadastrando...' : '📋 Cadastrar 1 a 59'}
            </button>
          </div>
        </div>

        {/* Adicionar unidade individual */}
        <form
          onSubmit={adicionarUnidade}
          className="bg-gray-800 border border-gray-700 rounded-2xl p-6 mb-6"
        >
          <h2 className="text-lg font-semibold text-white mb-4">Adicionar unidade</h2>
          <div className="flex gap-3">
            <input
              type="text"
              value={novaUnidade}
              onChange={(e) => setNovaUnidade(e.target.value)}
              placeholder="Número da unidade"
              className="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button
              type="submit"
              disabled={adicionando || !novaUnidade.trim()}
              className={`px-6 py-3 rounded-lg font-medium transition ${adicionando || !novaUnidade.trim()
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
            >
              Adicionar
            </button>
          </div>
        </form>

        {/* Lista de unidades */}
        {carregando ? (
          <p className="text-gray-400 text-center py-8">Carregando unidades...</p>
        ) : unidades.length === 0 ? (
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 text-center">
            <p className="text-gray-400 mb-4">Nenhuma unidade cadastrada.</p>
            <p className="text-gray-500 text-sm">
              Use o botão Cadastrar 1 a 59 para criar todas de uma vez.
            </p>
          </div>
        ) : (
          <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-12 gap-2 p-4 bg-gray-900 text-gray-400 text-sm font-medium border-b border-gray-700">
              <div className="col-span-2">Nº</div>
              <div className="col-span-3">Status</div>
              <div className="col-span-4">Criado em</div>
              <div className="col-span-3 text-right">Ações</div>
            </div>
            <div className="divide-y divide-gray-700/50 max-h-96 overflow-y-auto">
              {unidades.map((u) => (
                <div
                  key={u.docId}
                  className="grid grid-cols-12 gap-2 p-4 items-center hover:bg-gray-750 transition"
                >
                  <div className="col-span-2 font-mono text-white font-semibold">
                    {u.numero}
                  </div>
                  <div className="col-span-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${u.ativo
                        ? 'bg-green-900/50 text-green-300 border border-green-800'
                        : 'bg-gray-700 text-gray-400 border border-gray-600'
                        }`}
                    >
                      {u.ativo ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>
                  <div className="col-span-4 text-gray-500 text-sm">
                    {u.criadoEm
                      ? new Date(u.criadoEm).toLocaleDateString('pt-BR')
                      : '—'}
                  </div>
                  <div className="col-span-3 flex justify-end gap-2">
                    <button
                      onClick={() => toggleAtivo(u.docId, u.ativo)}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition ${u.ativo
                        ? 'bg-yellow-900/40 text-yellow-300 hover:bg-yellow-900/70'
                        : 'bg-green-900/40 text-green-300 hover:bg-green-900/70'
                        }`}
                    >
                      {u.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                    <button
                      onClick={() => removerUnidade(u.docId)}
                      className="px-3 py-1.5 bg-red-900/40 text-red-300 hover:bg-red-900/70 rounded text-xs font-medium transition"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
