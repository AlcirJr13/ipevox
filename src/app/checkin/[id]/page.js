"use client";

/**
 * ipevox — Check-in da unidade
 * =============================================================================
 * O morador digita o número da unidade; o servidor decide se ele pode entrar.
 *
 * O que mudou em relação à versão anterior, e por quê:
 *
 *  1. A validação saiu do browser. Antes, o cliente consultava
 *     `catalogo_unidades` com um `where('numero','==',valor)` e decidia sozinho
 *     se a unidade existia — decisão que qualquer pessoa podia simplesmente não
 *     tomar, chamando o Firestore direto. Agora é `checkIn`, uma Cloud Function.
 *
 *  2. A corrida que permitia votar duas vezes foi eliminada. A versão anterior
 *     abria uma transação que lia um RESULTADO DE CONSULTA: duas abas abertas
 *     antes de qualquer documento existir enxergavam "vazio" e criavam duas
 *     sessões para a mesma unidade. Agora o ID do comprovante é determinístico
 *     (`{assembleiaId}~{numero}`), então o próprio caminho do documento é a
 *     constraint de unicidade — o Firestore não tem constraint, então o ID faz
 *     esse papel.
 *
 *  3. "01", " 1 " e "1" passaram a ser a mesma unidade. Antes, digitar "016"
 *     criava uma sessão nova e permitia votar de novo.
 *
 *  4. O número é normalizado: a mesma forma é usada como chave em todo lugar.
 */

import { checkIn } from '@/lib/api';
import { useSessaoAnonima } from '@/lib/auth';
import { obterAuth } from '@/lib/firebase';
import { normalizarNumeroUnidade } from '@/lib/schema';
import { lerAssembleia } from '@/lib/data';
import { formatarData } from '@/lib/schema';
import { guardarSessao } from '@/lib/sessao';
import SeloModo from '@/components/SeloModo';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Checkin() {
  const router = useRouter();
  const params = useParams();
  const assembleiaId = params.id;

  // Sessão anônima: necessária porque as regras do Firestore exigem usuário
  // autenticado. O morador não digita senha nem cria conta.
  const { pronta: sessaoPronta, erro: erroSessao } = useSessaoAnonima();

  const [unidade, setUnidade] = useState('');
  const [assembleia, setAssembleia] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [carregandoAssembleia, setCarregandoAssembleia] = useState(true);

  useEffect(() => {
    if (!assembleiaId) return;
    let ativo = true;

    (async () => {
      try {
        const dados = await lerAssembleia(assembleiaId);
        if (!ativo) return;

        if (!dados) {
          setErro('Assembleia não encontrada. Confira o QR Code ou peça um novo link ao síndico.');
          return;
        }
        if (dados.status === 'encerrada') {
          setErro('Esta assembleia já foi encerrada.');
          setAssembleia(dados);
          return;
        }

        setAssembleia(dados);
      } catch {
        if (ativo) setErro('Não foi possível carregar a assembleia. Verifique sua conexão.');
      } finally {
        if (ativo) setCarregandoAssembleia(false);
      }
    })();

    return () => { ativo = false; };
  }, [assembleiaId]);

  async function entrar(e) {
    e.preventDefault();
    setErro('');

    const valor = unidade.trim();
    if (!valor) {
      setErro('Digite o número da sua unidade.');
      return;
    }

    if (!sessaoPronta) {
      setErro(erroSessao || 'Preparando sua sessão. Aguarde um instante e tente de novo.');
      return;
    }

    setCarregando(true);
    try {
      // `tag` é o número da unidade. Antes ele NÃO era passado, e o comprovante
      // era gravado em `comprovantes/{assembleiaId}~` — com nada depois do `~`.
      // O Firestore aceita escrever nesse caminho, mas recusa o campo `tag`
      // indefinido e aborta a operação. Efeito prático: o morador não conseguia
      // entrar em nenhuma assembleia.
      const resposta = await checkIn({
        assembleiaId,
        numero: valor,
        tag: normalizarNumeroUnidade(valor),
        // O `uid` da sessão anônima acompanha o comprovante. Ele NÃO identifica o
        // morador (a sessão é anônima), mas permite ao administrador rastrear de
        // qual sessão veio um voto em caso de disputa. Era ele que chegava
        // indefinido e derrubava o check-in.
        uid: obterAuth().currentUser?.uid ?? null,
      });

      // Guarda número e comprovanteId para as telas seguintes. O comprovanteId
      // não é derivável pelo cliente — ele embute a tag HMAC da unidade, que só
      // o servidor sabe calcular.
      guardarSessao(assembleiaId, {
        numero: resposta.numero,
        comprovanteId: resposta.comprovanteId,
      });

      if (resposta.status === 'votado') {
        // Já concluiu tudo nesta assembleia: vai direto para os resultados.
        router.replace(`/resultados/${assembleiaId}`);
        return;
      }

      router.replace(`/votacao/${assembleiaId}`);
    } catch (falha) {
      setErro(falha.message);
      setCarregando(false);
    }
  }

  if (carregandoAssembleia) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 animate-pulse">Carregando assembleia…</p>
      </main>
    );
  }

  const encerrada = assembleia?.status === 'encerrada';

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-800 rounded-2xl shadow-2xl p-8 border border-gray-700">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">🌳 ipevox</h1>
          {assembleia?.titulo && (
            <p className="text-gray-300 font-medium">{assembleia.titulo}</p>
          )}
          {assembleia?.criadoEm && (
            <p className="text-gray-500 text-xs mt-1">{formatarData(assembleia.criadoEm)}</p>
          )}
        </div>

        {/*
          O morador precisa saber, ANTES de votar, qual regra está valendo. Sem
          isso o consentimento é vazio e a assembleia fica questionável.
        */}
        {assembleia?.modo && !encerrada && (
          <SeloModo modo={assembleia.modo} className="mb-6" />
        )}

        {encerrada ? (
          <div className="text-center">
            <p className="text-red-300 bg-red-900/30 border border-red-800 rounded-lg p-3 mb-4 text-sm">
              Esta assembleia já foi encerrada. Não é mais possível votar.
            </p>
            <button
              type="button"
              onClick={() => router.push(`/resultados/${assembleiaId}`)}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition"
            >
              Ver resultados
            </button>
          </div>
        ) : (
          <form onSubmit={entrar} className="space-y-4">
            <div>
              <label
                htmlFor="numero-unidade"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                Número da sua unidade
              </label>
              <input
                id="numero-unidade"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
                placeholder="Ex: 16"
                disabled={carregando}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-center text-lg placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60"
              />
              <p className="text-xs text-gray-500 mt-2">
                Use o mesmo número que consta na lista de unidades do condomínio.
              </p>
            </div>

            <button
              type="submit"
              disabled={carregando || !unidade.trim() || !sessaoPronta}
              className={`w-full py-3 rounded-lg font-semibold text-lg transition ${
                carregando || !unidade.trim() || !sessaoPronta
                  ? 'bg-gray-700 cursor-not-allowed text-gray-400'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {carregando ? 'Verificando…' : 'Entrar e votar'}
            </button>
          </form>
        )}

        {(erro || erroSessao) && (
          <div
            role="alert"
            className="mt-4 p-3 rounded-lg text-center text-sm bg-red-900/30 text-red-300 border border-red-800"
          >
            {erro || erroSessao}
          </div>
        )}

        <button
          type="button"
          onClick={() => router.push('/')}
          className="w-full mt-6 text-gray-500 hover:text-gray-300 text-xs underline underline-offset-4"
        >
          Sair
        </button>
      </div>
    </main>
  );
}
