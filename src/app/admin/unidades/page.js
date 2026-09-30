"use client";

import { ERRO, excluirTodasUnidades, gerenciarUnidades } from '@/lib/api';
import { PainelComBarra } from '@/components/BarraLateral';
import { useExigirAdmin } from '@/lib/auth';
import { lerCatalogo } from '@/lib/data';
import { normalizarNumeroUnidade } from '@/lib/schema';
import { Modal, ModalConfirmacaoTexto } from '@/components/Modais';
import { IconeAlerta, IconeCheck, IconeLixeira, IconeLupa, IconeX } from '@/components/Icones';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

const MAX_POR_LOTE = 500;

/**
 * A implementação do modal foi consolidada em `@/components/Modais`.
 *
 * Havia três cópias quase idênticas dela (histórico, unidades e auditoria),
 * criadas em paralelo durante a migração das telas. Uma focava o painel, outra
 * focava o primeiro botão e a terceira não focava nada — ou seja, a
 * acessibilidade variava conforme a tela. Agora a regra é única: o foco vai para
 * o primeiro elemento acionável, `Escape` fecha e o clique no fundo também.
 *
 * O modal existe em vez de `window.confirm` porque o diálogo nativo ignora o
 * tema escuro, não permite explicar o efeito da ação e, no iOS, aparece fora do
 * padrão da página. Aqui a confirmação mostra qual unidade será afetada.
 */
export default function AdminUnidades() {
  const router = useRouter();
  const { autorizado } = useExigirAdmin(router);

  const [unidades, setUnidades] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [novaUnidade, setNovaUnidade] = useState('');
  const [adicionando, setAdicionando] = useState(false);
  const [de, setDe] = useState('1');
  const [ate, setAte] = useState('59');
  const [loteEmAndamento, setLoteEmAndamento] = useState(false);
  const [unidadeParaRemover, setUnidadeParaRemover] = useState(null);
  const [removendo, setRemovendo] = useState(false);
  const [excluirTudoAberto, setExcluirTudoAberto] = useState(false);
  const [excluindoTudo, setExcluindoTudo] = useState(false);
  const [normalizando, setNormalizando] = useState(false);

  // Handler estável: recriado a cada render, o efeito do modal rodaria de novo e
  // roubaria o foco do botão de remover no meio da confirmação.
  const fecharRemocao = useCallback(() => {
    if (!removendo) setUnidadeParaRemover(null);
  }, [removendo]);

  // Recarrega o catálogo do servidor. O cliente não escreve no Firestore: toda
  // mutação passa por Cloud Function e o estado local vem da releitura.
  async function recarregar() {
    const lista = await lerCatalogo();
    setUnidades(lista);
    return lista;
  }

  useEffect(() => {
    if (!autorizado) return undefined;

    let ativo = true;
    // `carregando` já nasce `true`, então não há setState sincrono aqui — o que
    // evita render em cascata (regra `react-hooks/set-state-in-effect`). Quem
    // desliga a flag é o `finally`, abaixo.

    lerCatalogo()
      .then((lista) => {
        if (!ativo) return;
        setUnidades(lista);
        setErro('');
      })
      .catch((falha) => {
        if (!ativo) return;
        setErro(falha?.message || 'Não foi possível carregar o catálogo de unidades.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [autorizado]);

  async function adicionarUnidade(evento) {
    evento.preventDefault();

    // Normaliza antes de enviar: "01" e "1" são a mesma unidade, e o catálogo
    // usa o número normalizado como ID do documento.
    const numero = normalizarNumeroUnidade(novaUnidade);
    if (!numero) {
      setErro('Digite o número da unidade.');
      return;
    }

    setAdicionando(true);
    setErro('');

    try {
      await gerenciarUnidades({ acao: 'adicionar', numero });
      setNovaUnidade('');
      await recarregar();
    } catch (falha) {
      setErro(
        falha.codigo === ERRO.JA_EXISTE
          ? 'Essa unidade já está cadastrada.'
          : falha.message
      );
    } finally {
      setAdicionando(false);
    }
  }

  async function cadastrarIntervalo(evento) {
    evento.preventDefault();

    const valorDe = Number(de);
    const valorAte = Number(ate);

    if (!Number.isInteger(valorDe) || !Number.isInteger(valorAte) || valorDe < 1) {
      setErro('Informe números de unidade inteiros e maiores que zero.');
      return;
    }
    // Validação no cliente para dar resposta imediata; o servidor repete as
    // mesmas checagens, porque validação de cliente não é garantia.
    if (valorAte < valorDe) {
      setErro('O número final precisa ser maior ou igual ao inicial.');
      return;
    }
    if (valorAte - valorDe + 1 > MAX_POR_LOTE) {
      setErro(`Cadastre no máximo ${MAX_POR_LOTE} unidades por vez.`);
      return;
    }

    setLoteEmAndamento(true);
    setErro('');

    try {
      const resposta = await gerenciarUnidades({ acao: 'lote', de: valorDe, ate: valorAte });
      await recarregar();
      setErro('');
      setAviso(`${resposta.criadas} unidades criadas (de ${resposta.de} a ${resposta.ate}).`);
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setLoteEmAndamento(false);
    }
  }

  async function alternarAtivo(unidade) {
    setErro('');
    try {
      // `docId` é o ID REAL do documento no Firestore. Passar o número e deixar
      // a API recalcular o ID era frágil: os documentos existentes foram
      // gravados com ID aleatório e a operação falhava em silêncio.
      await gerenciarUnidades({
        acao: 'alternar',
        numero: unidade.numero,
        docId: unidade.docId,
      });
      await recarregar();
    } catch (falha) {
      setErro(falha.message);
    }
  }

  /**
   * Marca ou desmarca a unidade como inadimplente.
   *
   * Efeito: a unidade continua votando normalmente, mas o voto dela NÃO entra na
   * contagem publicada — nem no numerador, nem no denominador do percentual
   * sobre as unidades aptas.
   */
  async function alternarInadimplencia(unidade) {
    setErro('');
    setAviso('');
    try {
      const resposta = await gerenciarUnidades({
        acao: 'alternar_inadimplencia',
        numero: unidade.numero,
        // Ver o comentário em `alternarAtivo`: o ID real, não o recalculado.
        docId: unidade.docId,
      });
      await recarregar();
      setAviso(
        resposta.inadimplente
          ? `Unidade ${resposta.numero} marcada como inadimplente. Ela pode votar, `
            + 'mas o voto dela não entrará na contagem.'
          : `Unidade ${resposta.numero} voltou a ter o voto contado.`
      );
    } catch (falha) {
      setErro(falha.message);
    }
  }

  async function confirmarRemocao() {
    if (!unidadeParaRemover) return;

    setRemovendo(true);
    setErro('');

    try {
      await gerenciarUnidades({
        acao: 'remover',
        numero: unidadeParaRemover.numero,
        // O ID real do documento. Sem ele, a API procurava por um ID derivado do
        // número que não existia — e `deleteDoc` de inexistente devolve SUCESSO,
        // então a tela dizia "removido" sem remover nada.
        docId: unidadeParaRemover.docId,
      });
      setUnidadeParaRemover(null);
      await recarregar();
    } catch (falha) {
      setUnidadeParaRemover(null);
      setErro(falha.message);
    } finally {
      setRemovendo(false);
    }
  }

  /**
   * Reparo de catálogos gravados com ID aleatório. NÃO tem botão na tela: as
   * unidades já foram corrigidas e a ação é idempotente, então o painel virou
   * ruído permanente. O código fica porque um catálogo antigo ainda pode
   * aparecer, e apagar a única via de conserto seria pior que manter a função.
   */
  async function normalizarIds() {
    setNormalizando(true);
    setErro('');
    setAviso('');
    try {
      const resposta = await gerenciarUnidades({ acao: 'normalizar_ids' });
      await recarregar();
      setAviso(
        resposta.ajustados === 0
          ? `Nada a corrigir: as ${resposta.total} unidades já usam o identificador correto.`
          : `${resposta.ajustados} de ${resposta.total} unidade(s) foram renomeadas para o `
            + 'identificador correto. O check-in por número agora funciona.'
      );
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setNormalizando(false);
    }
  }

  /**
   * Apaga o catálogo inteiro. A palavra de confirmação é exigida pelo servidor,
   * então esta chave não é apenas cosmética: sem ela a chamada é recusada mesmo
   * que alguém invoque a função direto.
   */
  async function confirmarExclusaoTotal() {
    setExcluindoTudo(true);
    setErro('');

    try {
      const resposta = await excluirTodasUnidades();
      setExcluirTudoAberto(false);
      await recarregar();
      setBusca('');
      setAviso(`${resposta.removidas} unidade(s) excluída(s) do catálogo.`);
    } catch (falha) {
      setExcluirTudoAberto(false);
      setErro(falha.message);
    } finally {
      setExcluindoTudo(false);
    }
  }

  if (!autorizado) {
    return <p className="text-gray-400 text-center py-12">Verificando acesso…</p>;
  }

  const termo = busca.trim().toLowerCase();
  const unidadesFiltradas = unidades.filter((u) => {
    if (termo && !String(u.numero).toLowerCase().includes(termo)) {
      return false;
    }
    if (filtro === 'ativas') return u.ativo;
    if (filtro === 'inativas') return !u.ativo;
    if (filtro === 'inadimplentes') return u.inadimplente === true;
    if (filtro === 'aptas') return u.ativo && u.inadimplente !== true;
    return true;
  });

  const ativas = unidades.filter((u) => u.ativo).length;
  const inativas = unidades.length - ativas;
  const inadimplentes = unidades.filter((u) => u.inadimplente === true).length;
  /** Base de cálculo da apuração: ativas menos as inadimplentes. */
  const aptasParaDeliberar = unidades.filter(
    (u) => u.ativo && u.inadimplente !== true
  ).length;

  return (
    <PainelComBarra largura="max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Unidades</h1>
        <p className="text-gray-500 text-sm mt-1">
          Cadastro do condomínio, inadimplência e exclusão.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            onClick={() => setFiltro((prev) => (prev === 'ativas' ? 'todas' : 'ativas'))}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
              filtro === 'ativas'
                ? 'bg-green-700 text-white border-green-500 shadow-sm'
                : 'bg-green-900/50 text-green-300 border-green-800 hover:bg-green-900/80'
            }`}
          >
            {ativas} ativa(s)
          </button>
          <button
            type="button"
            onClick={() => setFiltro((prev) => (prev === 'inativas' ? 'todas' : 'inativas'))}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
              filtro === 'inativas'
                ? 'bg-gray-600 text-white border-gray-400 shadow-sm'
                : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
            }`}
          >
            {inativas} inativa(s)
          </button>
          {inadimplentes > 0 && (
            <button
              type="button"
              onClick={() => setFiltro((prev) => (prev === 'inadimplentes' ? 'todas' : 'inadimplentes'))}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                filtro === 'inadimplentes'
                  ? 'bg-red-700 text-white border-red-500 shadow-sm'
                  : 'bg-red-900/50 text-red-300 border-red-800 hover:bg-red-900/80'
              }`}
            >
              {inadimplentes} inadimplente(s)
            </button>
          )}
          <button
            type="button"
            onClick={() => setFiltro((prev) => (prev === 'aptas' ? 'todas' : 'aptas'))}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
              filtro === 'aptas'
                ? 'bg-blue-700 text-white border-blue-500 shadow-sm'
                : 'bg-blue-900/50 text-blue-200 border-blue-800 hover:bg-blue-900/80'
            }`}
          >
            {aptasParaDeliberar} apta(s) a deliberar
          </button>
          <button
            type="button"
            onClick={() => setFiltro('todas')}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
              filtro === 'todas'
                ? 'bg-gray-700 text-white border-gray-500 shadow-sm'
                : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'
            }`}
          >
            {unidades.length} total
          </button>
        </div>
      </div>

        {erro && (
          <div
            role="alert"
            className="mb-6 p-4 bg-red-900/30 border border-red-800 text-red-300 rounded-xl flex items-start justify-between gap-4"
          >
            <span className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-red-400"><IconeAlerta tamanho={16} /></span>
              <span>{erro}</span>
            </span>
            <button
              onClick={() => setErro('')}
              aria-label="Fechar aviso de erro"
              className="text-red-400 hover:text-red-200 underline shrink-0"
            >
              fechar
            </button>
          </div>
        )}

        {aviso && (
          <div
            role="status"
            className="mb-6 p-4 bg-green-900/30 border border-green-800 text-green-200 rounded-xl flex items-start justify-between gap-4"
          >
            <span className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-green-400"><IconeCheck tamanho={16} /></span>
              <span>{aviso}</span>
            </span>
            <button
              onClick={() => setAviso('')}
              aria-label="Fechar aviso de sucesso"
              className="text-green-300 hover:text-green-100 underline shrink-0"
            >
              fechar
            </button>
          </div>
        )}

        {/* Ação em lote: intervalo livre em vez do "1 a 59" fixo, que era o
            número de um condomínio específico gravado no código da interface. */}
        <form
          onSubmit={cadastrarIntervalo}
          className="bg-gray-800 border border-gray-700 rounded-2xl p-6 mb-6"
        >
          <h2 className="text-lg font-semibold text-white mb-1">Cadastrar intervalo</h2>
          <p className="text-gray-500 text-sm mb-4">
            Cria de uma vez as unidades que ainda não existem (máximo {MAX_POR_LOTE} por vez).
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm text-gray-400">
              de
              <input
                type="number"
                min="1"
                value={de}
                onChange={(e) => setDe(e.target.value)}
                className="w-28 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-gray-400">
              até
              <input
                type="number"
                min="1"
                value={ate}
                onChange={(e) => setAte(e.target.value)}
                className="w-28 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={loteEmAndamento}
              className={`px-5 py-3 rounded-lg font-medium text-sm transition ${loteEmAndamento
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
            >
              {loteEmAndamento ? 'Cadastrando…' : '📋 Cadastrar intervalo'}
            </button>
          </div>
        </form>

        {/* Adicionar unidade individual */}
        <form
          onSubmit={adicionarUnidade}
          className="bg-gray-800 border border-gray-700 rounded-2xl p-6 mb-6"
        >
          <h2 className="text-lg font-semibold text-white mb-4">Adicionar unidade</h2>
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              value={novaUnidade}
              onChange={(e) => setNovaUnidade(e.target.value)}
              placeholder="Número da unidade"
              aria-label="Número da unidade a adicionar"
              className="flex-1 min-w-[12rem] px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button
              type="submit"
              disabled={adicionando || !novaUnidade.trim()}
              className={`px-6 py-3 rounded-lg font-medium transition ${adicionando || !novaUnidade.trim()
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
            >
              {adicionando ? 'Adicionando…' : 'Adicionar'}
            </button>
          </div>
        </form>

        {/* Lista de unidades */}
        {carregando ? (
          <div className="bg-gray-800/80 border border-gray-700 rounded-2xl p-12 text-center">
            <div className="inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-gray-400 text-sm">Carregando unidades…</p>
          </div>
        ) : unidades.length === 0 ? (
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 text-center">
            <p className="text-gray-400 mb-4">Nenhuma unidade cadastrada.</p>
            <p className="text-gray-500 text-sm">
              Use o campo Cadastrar intervalo para criar várias de uma vez.
            </p>
          </div>
        ) : (
          <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden shadow-xl">
            {/* Barra superior de busca e filtros rápidos */}
            <div className="p-4 sm:p-5 border-b border-gray-700 bg-gray-900/60 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-gray-900 border border-gray-700 rounded-xl focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition max-w-md w-full">
                  <span className="text-gray-400 shrink-0 flex items-center justify-center pointer-events-none">
                    <IconeLupa tamanho={18} />
                  </span>
                  <input
                    type="search"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por número da unidade…"
                    aria-label="Buscar unidade por número"
                    className="w-full bg-transparent text-white placeholder-gray-500 outline-none text-sm"
                  />
                  {busca && (
                    <button
                      type="button"
                      onClick={() => setBusca('')}
                      className="text-gray-400 hover:text-white transition p-0.5 shrink-0"
                      aria-label="Limpar busca"
                    >
                      <IconeX tamanho={14} />
                    </button>
                  )}
                </div>

                <div className="text-xs text-gray-400 font-medium">
                  Exibindo <span className="text-white font-semibold font-mono">{unidadesFiltradas.length}</span> de <span className="text-white font-semibold font-mono">{unidades.length}</span> unidades
                </div>
              </div>

              {/* Filtros rápidos em abas */}
              <div className="flex flex-wrap gap-2 items-center text-xs">
                <span className="text-gray-400 mr-1 font-medium">Filtrar:</span>
                <button
                  type="button"
                  onClick={() => setFiltro('todas')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition ${
                    filtro === 'todas'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 border border-gray-700'
                  }`}
                >
                  Todas ({unidades.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltro('ativas')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition ${
                    filtro === 'ativas'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-gray-800 text-gray-400 hover:text-emerald-300 hover:bg-gray-700 border border-gray-700'
                  }`}
                >
                  Ativas ({ativas})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltro('inativas')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition ${
                    filtro === 'inativas'
                      ? 'bg-gray-600 text-white shadow-sm'
                      : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700 border border-gray-700'
                  }`}
                >
                  Inativas ({inativas})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltro('inadimplentes')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition ${
                    filtro === 'inadimplentes'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'bg-gray-800 text-gray-400 hover:text-red-300 hover:bg-gray-700 border border-gray-700'
                  }`}
                >
                  Inadimplentes ({inadimplentes})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltro('aptas')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition ${
                    filtro === 'aptas'
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'bg-gray-800 text-gray-400 hover:text-sky-300 hover:bg-gray-700 border border-gray-700'
                  }`}
                >
                  Aptas ({aptasParaDeliberar})
                </button>
              </div>
            </div>

            {/* Tabela Horizontal */}
            {unidadesFiltradas.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-gray-400 text-sm mb-2">
                  Nenhuma unidade encontrada para os critérios selecionados.
                </p>
                {(busca || filtro !== 'todas') && (
                  <button
                    type="button"
                    onClick={() => {
                      setBusca('');
                      setFiltro('todas');
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300 underline font-medium"
                  >
                    Limpar busca e filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-900 text-gray-400 text-xs font-semibold uppercase tracking-wider sticky top-0 z-10 border-b border-gray-700 shadow-sm">
                    <tr>
                      <th scope="col" className="px-6 py-3.5 w-24 text-left">Nº</th>
                      <th scope="col" className="px-6 py-3.5 text-center">Status</th>
                      <th scope="col" className="px-6 py-3.5 text-center">Situação</th>
                      <th scope="col" className="px-6 py-3.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/50 text-sm">
                    {unidadesFiltradas.map((u) => (
                      <tr
                        key={u.docId}
                        className="hover:bg-gray-700/30 transition group"
                      >
                        <td className="px-6 py-4 font-mono text-white font-semibold whitespace-nowrap text-left">
                          {u.numero}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span
                            className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-medium border ${
                              u.ativo
                                ? 'bg-green-900/50 text-green-300 border-green-800'
                                : 'bg-gray-700 text-gray-400 border-gray-600'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                u.ativo ? 'bg-emerald-400' : 'bg-gray-500'
                              }`}
                            />
                            {u.ativo ? 'Ativa' : 'Inativa'}
                          </span>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span
                            className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-medium border ${
                              u.inadimplente === true
                                ? 'bg-red-900/50 text-red-300 border-red-800'
                                : 'bg-blue-900/50 text-blue-200 border-blue-800'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                u.inadimplente === true ? 'bg-red-400' : 'bg-blue-400'
                              }`}
                            />
                            {u.inadimplente === true ? 'Inadimplente' : 'Adimplente'}
                          </span>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex flex-nowrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => alternarInadimplencia(u)}
                              title={
                                u.inadimplente === true
                                  ? 'Marcar como adimplente: o voto desta unidade volta a entrar na contagem.'
                                  : 'Marcar como inadimplente: ela continua podendo votar, mas o voto não entra na contagem.'
                              }
                              style={
                                u.inadimplente === true
                                  ? {
                                      color: '#93c5fd',
                                      borderColor: '#3b82f6',
                                      backgroundColor: 'rgba(30, 58, 138, 0.4)',
                                    }
                                  : {
                                      color: '#fb923c',
                                      borderColor: '#ea580c',
                                      backgroundColor: 'rgba(154, 52, 18, 0.4)',
                                    }
                              }
                              className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded text-xs font-medium border transition ${
                                u.inadimplente === true
                                  ? 'hover:brightness-125'
                                  : 'hover:brightness-125'
                              }`}
                            >
                              {u.inadimplente === true ? 'Adimplente' : 'Inadimplente'}
                            </button>

                            <button
                              type="button"
                              onClick={() => alternarAtivo(u)}
                              title={
                                u.ativo
                                  ? 'Desativar: a unidade deixa de poder fazer check-in.'
                                  : 'Ativar: a unidade volta a poder fazer check-in.'
                              }
                              className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded text-xs font-medium border transition ${
                                u.ativo
                                  ? 'bg-yellow-900/40 text-yellow-300 border-yellow-800/60 hover:bg-yellow-900/70'
                                  : 'bg-green-900/40 text-green-300 border-green-800/60 hover:bg-green-900/70'
                              }`}
                            >
                              {u.ativo ? 'Desativar' : 'Ativar'}
                            </button>

                            <button
                              type="button"
                              onClick={() => setUnidadeParaRemover(u)}
                              aria-label={`Remover a unidade ${u.numero}`}
                              className="shrink-0 whitespace-nowrap px-3 py-1.5 bg-red-900/40 text-red-300 hover:bg-red-900/70 rounded text-xs font-medium border border-red-800/60 transition"
                            >
                              Remover
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/*
          Zona de perigo, separada de tudo o mais e depois da lista: apagar o
          catálogo inteiro é irreversível e não deve ficar ao lado de ações do dia
          a dia. Só aparece quando existe algo para apagar.
        */}
        {!carregando && unidades.length > 0 && (
          <div className="mt-8 border border-red-900/60 bg-red-950/20 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-red-200 mb-1">Zona de perigo</h2>
            <p className="text-red-300/80 text-sm mb-4 leading-relaxed">
              Apaga <strong>todas as {unidades.length} unidades</strong> do catálogo de
              uma vez. Use quando precisar recomeçar o cadastro do zero.
              <br />
              O histórico de assembleias não é afetado: você poderá reabrir os votos já
              registrados. Mas nenhuma unidade conseguirá fazer check-in em novas
              assembleias até ser cadastrada de novo.
            </p>
            <button
              type="button"
              onClick={() => setExcluirTudoAberto(true)}
              className="px-5 py-2.5 bg-red-800 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition"
            >
              Excluir todas as unidades
            </button>
          </div>
        )}

        {/*
          O painel "Consertar identificadores" foi REMOVIDO depois de cumprir a
          função: as 59 unidades foram renomeadas para o ID correto e a ação é
          idempotente. Mantê-lo seria oferecer um botão de reparo para um defeito
          que não existe mais — ruído permanente na tela.

          A ação continua disponível em `gerenciarUnidades({ acao: 'normalizar_ids' })`
          caso apareça um catálogo antigo. O que saiu foi o BOTÃO, não a
          possibilidade de consertar.
        */}

      {unidadeParaRemover && (
        <Modal
          aoFechar={fecharRemocao}
          rotulo={`Confirmar remoção da unidade ${unidadeParaRemover.numero}`}
        >
          <h2 className="text-2xl font-bold text-white mb-2">Remover unidade?</h2>
          <p className="text-gray-300 mb-6">
            A unidade <strong className="font-mono">{unidadeParaRemover.numero}</strong> será
            removida do catálogo. Ela deixará de conseguir fazer check-in nas próximas
            assembleias.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setUnidadeParaRemover(null)}
              disabled={removendo}
              className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={confirmarRemocao}
              disabled={removendo}
              className={`flex-1 py-3 rounded-lg font-semibold transition ${removendo
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
            >
              {removendo ? 'Removendo…' : 'Remover'}
            </button>
          </div>
        </Modal>
      )}

      {excluirTudoAberto && (
        <ModalConfirmacaoTexto
          titulo="Excluir todas as unidades?"
          palavra="EXCLUIR"
          consequencia={
            `Serão apagadas ${unidades.length} unidades do catálogo, de uma vez.\n\n`
            + 'Esta ação não pode ser desfeita. Depois dela, nenhuma unidade conseguirá '
            + 'fazer check-in em novas assembleias até ser cadastrada novamente.\n\n'
            + 'O histórico de assembleias e os votos já registrados NÃO são apagados.'
          }
          rotuloConfirmar="Excluir todas"
          processando={excluindoTudo}
          aoConfirmar={confirmarExclusaoTotal}
          aoFechar={() => setExcluirTudoAberto(false)}
        />
      )}
    </PainelComBarra>
  );
}
