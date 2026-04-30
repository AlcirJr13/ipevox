"use client";

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where
} from 'firebase/firestore';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Checkin() {
  const router = useRouter();
  const params = useParams();
  const assembleiaId = params.id;

  const [unidade, setUnidade] = useState('');
  const [assembleia, setAssembleia] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState({ tipo: '', texto: '' });
  const [carregandoAssembleia, setCarregandoAssembleia] = useState(true);

  // Busca dados da assembleia
  useEffect(() => {
    async function carregarAssembleia() {
      try {
        const q = query(collection(db, 'assembleias'), where('id', '==', assembleiaId));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
          setMensagem({ tipo: 'erro', texto: 'Assembleia não encontrada.' });
          setCarregandoAssembleia(false);
          return;
        }

        const data = snapshot.docs[0].data();

        // Verifica se assembleia está encerrada
        if (data.status === 'encerrada') {
          setMensagem({ tipo: 'erro', texto: 'Esta assembleia já foi encerrada.' });
          setCarregandoAssembleia(false);
          return;
        }

        setAssembleia(data);
        setCarregandoAssembleia(false);
      } catch (error) {
        console.error('Erro ao carregar:', error);
        setMensagem({ tipo: 'erro', texto: 'Erro ao carregar assembleia.' });
        setCarregandoAssembleia(false);
      }
    }

    if (assembleiaId) carregarAssembleia();
  }, [assembleiaId]);

  async function validarEntrada(e) {
    e.preventDefault();
    setCarregando(true);
    setMensagem({ tipo: '', texto: '' });

    try {
      const valor = unidade.trim();

      if (!valor) {
        setMensagem({ tipo: 'erro', texto: 'Digite o número da unidade.' });
        setCarregando(false);
        return;
      }

      // 🔒 PASSO 1: Verificar se a unidade existe no catálogo do condomínio
      const catalogoRef = collection(db, 'catalogo_unidades');
      const qCatalogo = query(catalogoRef, where('numero', '==', valor));
      const snapCatalogo = await getDocs(qCatalogo);

      if (snapCatalogo.empty) {
        setMensagem({ tipo: 'erro', texto: '🚫 Unidade não cadastrada no condomínio. Contate o síndico.' });
        setCarregando(false);
        return;
      }

      const unidadeCatalogo = snapCatalogo.docs[0];
      const dadosCatalogo = unidadeCatalogo.data();

      if (dadosCatalogo.ativo === false) {
        setMensagem({ tipo: 'erro', texto: '🚫 Esta unidade está desativada. Contate o síndico.' });
        setCarregando(false);
        return;
      }

      // 🔒 PASSO 2: Verificar/criar registro de sessão na assembleia
      const unidadesRef = collection(db, 'unidades');
      const qSessao = query(
        unidadesRef,
        where('assembleiaId', '==', assembleiaId),
        where('catalogoUnidadeId', '==', unidadeCatalogo.id)
      );

      // Timeout: se sessão está 'votando' há mais de 10 min, considera abandonada
      const TIMEOUT_MINUTOS = 10;
      const agora = Date.now();

      // Usa transação para garantir atomicidade
      await runTransaction(db, async (transaction) => {
        const snapshot = await getDocs(qSessao);

        if (snapshot.empty) {
          // Primeira vez nesta assembleia: cria registro de sessão
          const novaUnidadeRef = doc(unidadesRef);
          transaction.set(novaUnidadeRef, {
            assembleiaId,
            catalogoUnidadeId: unidadeCatalogo.id,
            numero: valor,
            status: 'votando',
            criadoEm: serverTimestamp()
          });

          // Armazena o ID para redirecionamento
          sessionStorage.setItem(`unidade_${assembleiaId}`, novaUnidadeRef.id);
          return;
        }

        const unidadeDoc = snapshot.docs[0];
        const unidadeData = unidadeDoc.data();
        const unidadeRef = doc(db, 'unidades', unidadeDoc.id);

        // Verifica status DENTRO da transação
        if (unidadeData.status === 'votado') {
          throw new Error('Esta unidade já finalizou o voto.');
        }

        if (unidadeData.status === 'votando') {
          // 🔒 Verifica se está presa (mais de 10 min sem atividade)
          const ultimaAtualizacao = unidadeData.ultimaAtualizacao?.toDate?.()
            || unidadeData.criadoEm?.toDate?.();

          if (ultimaAtualizacao) {
            const diffMinutos = (agora - ultimaAtualizacao.getTime()) / 60000;
            if (diffMinutos < TIMEOUT_MINUTOS) {
              const restante = Math.ceil(TIMEOUT_MINUTOS - diffMinutos);
              throw new Error(`Esta unidade está votando em outro dispositivo. Libera em ${restante} min.`);
            }
          }

          // Timeout expirado: reseta e permite continuar
          transaction.update(unidadeRef, {
            status: 'votando',
            ultimaAtualizacao: serverTimestamp()
          });
          sessionStorage.setItem(`unidade_${assembleiaId}`, unidadeDoc.id);
          return;
        }

        // Status não esperado: atualiza para votando
        transaction.update(unidadeRef, {
          status: 'votando',
          ultimaAtualizacao: serverTimestamp()
        });

        // Armazena o ID para redirecionamento
        sessionStorage.setItem(`unidade_${assembleiaId}`, unidadeDoc.id);
      });

      // Se chegou aqui, a transação foi bem-sucedida
      router.push(`/votacao/${assembleiaId}`);

    } catch (error) {
      console.error('Erro:', error);

      // Mensagens específicas para erros de transação
      if (error.message?.includes('já finalizou')) {
        setMensagem({ tipo: 'erro', texto: '🔒 ' + error.message });
      } else if (error.message?.includes('já está votando')) {
        setMensagem({ tipo: 'erro', texto: '⏳ ' + error.message });
      } else {
        setMensagem({ tipo: 'erro', texto: '❌ Falha no check-in: ' + error.message });
      }
      setCarregando(false);
    }
  }

  if (carregandoAssembleia) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Carregando assembleia...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-800 rounded-2xl shadow-2xl p-8 border border-gray-700">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">🌳 ipevox</h1>
          <p className="text-gray-400 text-sm mb-4">{assembleia?.titulo}</p>
        </div>

        <form onSubmit={validarEntrada} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Número da Unidade
            </label>
            <input
              type="text"
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
              placeholder="Ex: 16"
              disabled={carregando}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-center text-lg placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={carregando || unidade.length < 1}
            className={`w-full py-3 rounded-lg font-semibold text-lg transition
              ${carregando || unidade.length < 1
                ? 'bg-gray-700 cursor-not-allowed text-gray-400'
                : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
          >
            {carregando ? 'Verificando...' : 'Entrar'}
          </button>
        </form>

        {mensagem.texto && (
          <div className={`mt-4 p-3 rounded-lg text-center text-sm ${mensagem.tipo === 'erro' ? 'bg-red-900/30 text-red-300 border border-red-800' : 'bg-green-900/30 text-green-300 border border-green-800'}`}>
            {mensagem.texto}
          </div>
        )}
      </div>
    </main>
  );
}