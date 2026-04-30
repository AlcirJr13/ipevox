"use client";

import { db } from '@/lib/firebase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Votacao() {
  const router = useRouter();
  const params = useParams();
  const assembleiaId = params.id;

  const [assembleia, setAssembleia] = useState(null);
  const [unidadeId, setUnidadeId] = useState(null);
  const [propostas, setPropostas] = useState([]);
  const [indiceAtual, setIndiceAtual] = useState(0);
  const [opcaoSelecionada, setOpcaoSelecionada] = useState('');
  const [votosEnviados, setVotosEnviados] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [mostrarConfirmacao, setMostrarConfirmacao] = useState(false);
  const [carregandoDados, setCarregandoDados] = useState(true);

  // Carrega dados iniciais da assembleia e sessão
  useEffect(() => {
    async function carregarDados() {
      try {
        const qAssembleia = query(collection(db, 'assembleias'), where('id', '==', assembleiaId));
        const snapAssembleia = await getDocs(qAssembleia);

        if (snapAssembleia.empty) {
          router.push('/');
          return;
        }

        const assembleiaData = snapAssembleia.docs[0].data();

        if (assembleiaData.status === 'encerrada') {
          router.push(`/resultados/${assembleiaId}`);
          return;
        }

        setAssembleia(assembleiaData);
        setPropostas(assembleiaData.propostas || []);

        // 🔒 Busca sessão da unidade pelo ID do sessionStorage
        const sessaoId = sessionStorage.getItem(`unidade_${assembleiaId}`);
        if (!sessaoId) {
          router.push(`/checkin/${assembleiaId}`);
          return;
        }

        const sessaoSnap = await getDoc(doc(db, 'unidades', sessaoId));

        if (!sessaoSnap.exists()) {
          router.push(`/checkin/${assembleiaId}`);
          return;
        }

        const sessaoData = sessaoSnap.data();
        setUnidadeId(sessaoId);

        // 🔒 Verifica quais propostas já foram votadas
        const votosComputados = sessaoData.votosComputados || {};
        const indicesVotados = [];
        propostas.forEach((p, idx) => {
          if (votosComputados[p.titulo]) {
            indicesVotados.push(idx);
          }
        });

        if (indicesVotados.length === assembleiaData.propostas.length) {
          router.push(`/resultados/${assembleiaId}`);
          return;
        }

        setVotosEnviados(indicesVotados);

        const proximoNaoVotado = assembleiaData.propostas.findIndex((p, idx) => !indicesVotados.includes(idx));
        if (proximoNaoVotado !== -1) {
          setIndiceAtual(proximoNaoVotado);
        }

        setCarregandoDados(false);
      } catch (error) {
        console.error('Erro:', error);
        setCarregandoDados(false);
      }
    }

    if (assembleiaId) carregarDados();
  }, [assembleiaId, router]);

  // 🔔 Listener em tempo real para assembleia (atualiza dados + detecta encerramento)
  useEffect(() => {
    if (!assembleiaId) return;

    const q = query(
      collection(db, 'assembleias'),
      where('id', '==', assembleiaId),
      limit(1)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const dados = snapshot.docs[0].data();

        // Se estava ativa e agora é encerrada → redireciona
        if (dados.status === 'encerrada' && assembleia?.status !== 'encerrada') {
          setMensagem('Votação encerrada! Redirecionando...');
          setTimeout(() => {
            router.push(`/resultados/${assembleiaId}`);
          }, 1500);
        }

        // Atualiza dados em tempo real
        setAssembleia(dados);
        setPropostas(dados.propostas || []);
      }
    }, (error) => {
      console.error(' Erro no listener:', error);
    });

    return () => unsub();
  }, [assembleiaId, router, assembleia?.status]);

  function selecionarOpcao(opcao) {
    setOpcaoSelecionada(opcao);
    setMostrarConfirmacao(true);
  }

  async function confirmarVoto() {
    if (!opcaoSelecionada || !unidadeId) return;

    setCarregando(true);
    setMensagem('');

    try {
      const propostaAtual = propostas[indiceAtual];

      await addDoc(collection(db, 'votos'), {
        assembleiaId,
        propostaId: propostaAtual.titulo,
        opcao: opcaoSelecionada,
        unidadeDocId: unidadeId,
        timestamp: serverTimestamp()
      });

      const sessaoRef = doc(db, 'unidades', unidadeId);
      await updateDoc(sessaoRef, {
        [`votosComputados.${propostaAtual.titulo}`]: true,
        ultimaAtualizacao: serverTimestamp()
      });

      if (indiceAtual === propostas.length - 1) {
        await updateDoc(sessaoRef, { status: 'votado' });
      }

      setVotosEnviados([...votosEnviados, indiceAtual]);
      setMensagem('✅ Voto computado com sucesso!');
      setOpcaoSelecionada('');
      setMostrarConfirmacao(false);

      setTimeout(() => {
        if (indiceAtual < propostas.length - 1) {
          setIndiceAtual(indiceAtual + 1);
          setMensagem('');
        } else {
          router.push(`/resultados/${assembleiaId}`);
        }
      }, 1500);

    } catch (error) {
      console.error('Erro ao votar:', error);
      setMensagem('❌ Falha ao enviar voto.');
    } finally {
      setCarregando(false);
    }
  }

  function proximaProposta() {
    if (indiceAtual < propostas.length - 1) {
      const confirmou = window.confirm(
        `⚠️ Você está prestes a pular a proposta "${propostas[indiceAtual].titulo}".\n\nTem certeza que deseja continuar sem votar?`
      );

      if (confirmou) {
        setIndiceAtual(indiceAtual + 1);
        setOpcaoSelecionada('');
        setMostrarConfirmacao(false);
        setMensagem('');
      }
    }
  }

  if (carregandoDados) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Carregando propostas...</p>
      </main>
    );
  }

  if (!assembleia || propostas.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Nenhuma proposta encontrada.</p>
      </main>
    );
  }

  if (votosEnviados.length === propostas.length) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-2xl p-8 text-center max-w-md border border-gray-700">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-white mb-2">Votação Finalizada!</h1>
          <p className="text-gray-400 mb-6">
            Você votou em {votosEnviados.length} de {propostas.length} propostas.
          </p>
          <button
            onClick={() => router.push(`/resultados/${assembleiaId}`)}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
          >
            Ver Resultados
          </button>
        </div>
      </main>
    );
  }

  const proposta = propostas[indiceAtual];
  const progresso = ((indiceAtual) / propostas.length) * 100;

  return (
    <main className="min-h-screen py-8 px-4">
      <div className="max-w-xl mx-auto">
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-xl font-bold text-white">🗳️ Votação</h1>
            <span className="text-sm text-gray-400">
              {indiceAtual + 1} de {propostas.length}
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progresso}%` }}
            />
          </div>
        </div>

        {mensagem && (
          <div className="mb-4 p-3 bg-green-900/30 text-green-300 rounded-lg text-center font-medium border border-green-800">
            {mensagem}
          </div>
        )}

        <div className="bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-2">
            {proposta.titulo}
          </h2>
          {proposta.descricao && (
            <p className="text-gray-400 mb-6">{proposta.descricao}</p>
          )}

          <div className="space-y-3 mb-6">
            {proposta.opcoes.map((opcao, idx) => (
              <label
                key={idx}
                className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition
                  ${opcaoSelecionada === opcao
                    ? 'border-blue-500 bg-blue-900/20'
                    : 'border-gray-700 hover:border-gray-600 hover:bg-gray-700/50'}`}
              >
                <input
                  type="radio"
                  name="votacao"
                  value={opcao}
                  checked={opcaoSelecionada === opcao}
                  onChange={() => selecionarOpcao(opcao)}
                  disabled={carregando}
                  className="mr-3 h-5 w-5 text-blue-600"
                />
                <span className="text-gray-200 font-medium">{opcao}</span>
              </label>
            ))}
          </div>

          <div className="flex gap-3">
            {mostrarConfirmacao && (
              <>
                <button
                  onClick={confirmarVoto}
                  disabled={carregando || !opcaoSelecionada}
                  className={`flex-1 py-3 rounded-lg font-semibold text-white transition
                    ${carregando || !opcaoSelecionada
                      ? 'bg-gray-700 cursor-not-allowed text-gray-400'
                      : 'bg-green-600 hover:bg-green-700'}`}
                >
                  {carregando ? '⏳ Enviando...' : '✅ Confirmar Voto'}
                </button>
                <button
                  onClick={() => {
                    setOpcaoSelecionada('');
                    setMostrarConfirmacao(false);
                  }}
                  disabled={carregando}
                  className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium"
                >
                  Alterar
                </button>
              </>
            )}

            {!mostrarConfirmacao && (
              <button
                onClick={proximaProposta}
                disabled={carregando}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium"
              >
                Pular →
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={() => router.push('/')}
            className="text-sm text-gray-400 hover:text-gray-300 underline"
          >
            Sair da votação
          </button>
        </div>
      </div>
    </main>
  );
}
