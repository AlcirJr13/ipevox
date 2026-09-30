"use client";

/**
 * ipevox — Resultados e apuração
 * =============================================================================
 * DEFEITOS CORRIGIDOS AQUI:
 *
 *  1. PERCENTUAL ENGANOSO. A tela calculava percentual apenas sobre os votantes,
 *     então 3 votos "Sim" de 59 unidades apareciam como "100%" com barra verde.
 *     Agora todo número tem base explícita: percentual dos votos E percentual
 *     das unidades aptas, mais o quórum.
 *
 *  2. FALHA SILENCIOSA. Se o listener de votos falhasse, o erro caía em
 *     `console.error` e a tela mostrava todas as barras em zero — indistinguível
 *     de "ninguém votou". Agora existe erro visível e estado vazio explícito.
 *
 *  3. LEITURA DE VOTOS INDIVIDUAIS. A tela lia a coleção `votos` inteira e
 *     agregava no cliente — o que, em assembleia aberta, é legítimo, e em
 *     assembleia selada é impossível. Agora o placar vem da coleção `contagem`,
 *     que contém apenas totais; nenhum dado individual trafega até aqui.
 *
 *  4. PDF PESADO NO BUNDLE. `@react-pdf/renderer` era importado no topo. Passa a
 *     ser carregado sob demanda, no clique, porque a maioria das visitas nunca
 *     gera PDF.
 */

import { PainelComBarra } from '@/components/BarraLateral';
import SeloModo from '@/components/SeloModo';
import { IconeAlerta, IconeDocumento } from '@/components/Icones';
import { ModalConfirmacao } from '@/components/Modais';
import { useSessao } from '@/lib/auth';
import { encerrarAssembleia, publicarResultado } from '@/lib/api';
import {
  escutarAssembleia,
  escutarContagem,
  escutarParticipacao,
  escutarResultado,
  lerPropostas,
  montarApuracaoDeResultado,
} from '@/lib/data';
import { MODOS, formatarData } from '@/lib/schema';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

/** Cor da barra por faixa de adesão. Evita o verde automático da versão antiga. */
function corDaBarra(percentualAptas) {
  if (percentualAptas >= 50) return 'bg-green-500';
  if (percentualAptas >= 25) return 'bg-blue-500';
  if (percentualAptas > 0) return 'bg-amber-500';
  return 'bg-gray-700';
}

export default function Resultados() {
  const router = useRouter();
  const { id: assembleiaId } = useParams();
  /**
   * `ehOperador` e NÃO `ehAdmin`.
   *
   * Esta tela usava `ehAdmin`, que é verdadeiro apenas para quem tem documento em
   * `/admins/{uid}` — ou seja, o síndico cadastrado. O ADMINISTRADOR DO SISTEMA é
   * reconhecido pelo e-mail fixado em `firestore.rules`, o que define
   * `ehSuperAdmin`, e `ehAdmin` fica FALSO para ele.
   *
   * O efeito era duplo e silencioso: a barra lateral não aparecia (o casco caía
   * no formato de morador) e os botões "Encerrar votação" e "Apurar e publicar"
   * não eram renderizados — o administrador não conseguia encerrar nem publicar
   * resultado, exatamente as duas ações que só ele pode fazer.
   */
  const { ehOperador, usuario } = useSessao();

  // DIAGNÓSTICO TEMPORÁRIO: mostra o papel resolvido, que decide se a barra
  // lateral e os botões de operador aparecem. Se `ehOperador` for falso para o
  // administrador, é aqui que se vê.
  console.log('[ipevox] resultados — papeis:', {
    temUsuario: Boolean(usuario),
    email: usuario?.email ?? null,
    uid: usuario?.uid ?? null,
    ehOperador,
  });

  const [assembleia, setAssembleia] = useState(null);
  const [propostas, setPropostas] = useState([]);
  const [propostasCarregadas, setPropostasCarregadas] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [participacao, setParticipacao] = useState({ unidadesQueVotaram: 0 });
  const [erro, setErro] = useState('');
  const [encerrando, setEncerrando] = useState(false);
  const [confirmandoEncerrar, setConfirmandoEncerrar] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [confirmandoPublicar, setConfirmandoPublicar] = useState(false);
  const [avisoEncerramento, setAvisoEncerramento] = useState('');
  const [gerandoPdf, setGerandoPdf] = useState(false);

  // `carregando` é DERIVADO, não um state à parte. Manter um state separado
  // exigia um efeito para sincronizá-lo — e a tela podia ficar presa em
  // "Carregando…" quando havia erro, porque nada desligava a flag.
  const carregando = !erro && (!assembleia || !propostasCarregadas);

  // Propostas: leitura única. A pauta não muda depois de criada.
  useEffect(() => {
    if (!assembleiaId) return;
    let ativo = true;

    (async () => {
      try {
        const lista = await lerPropostas(assembleiaId);
        if (!ativo) return;
        setPropostas(lista);
        setPropostasCarregadas(true);
      } catch (falha) {
        if (!ativo) return;
        setErro(
          'Não foi possível carregar as propostas. '
          + (falha?.message ?? 'Verifique sua conexão.')
        );
        setPropostasCarregadas(true);
      }
    })();

    return () => { ativo = false; };
  }, [assembleiaId]);

  // Assembleia, placar e participação em tempo real.
  useEffect(() => {
    if (!assembleiaId) return;

    const falhaListener = (falha) => {
      setErro(
        'Não foi possível acompanhar a apuração em tempo real. '
        + (falha?.message ?? 'Verifique sua conexão.')
      );
    };

    const cancelarAssembleia = escutarAssembleia(
      assembleiaId,
      (dados) => {
        if (!dados) {
          setErro('Assembleia não encontrada.');
          return;
        }
        setAssembleia(dados);
      },
      falhaListener
    );

    // O RESULTADO PUBLICADO é a fonte da apuração nesta tela.
    //
    // O defeito corrigido aqui: a tela montava a apuração a partir de
    // `contagens` (placar ao vivo) e `participacao`. Como o placar ao vivo foi
    // removido do projeto, `contagens` ficava permanentemente `{}` — a tela
    // exibia "0 votos registrados" e nenhuma proposta, mesmo com votos gravados.
    // Nada aqui lia o documento `/resultados`, que é onde a apuração realmente
    // vive depois de publicada.
    const cancelarResultado = escutarResultado(
      assembleiaId,
      (dados) => setResultado(dados),
      falhaListener
    );

    const cancelarParticipacao = escutarParticipacao(assembleiaId, setParticipacao, falhaListener);

    return () => {
      cancelarAssembleia();
      cancelarResultado();
      cancelarParticipacao();
    };
  }, [assembleiaId]);

  /**
   * Dados exibidos. Duas situações bem diferentes, que antes se confundiam:
   *
   *   publicada   -> a apuração vem do documento imutável `/resultados`;
   *   não publicada -> mostra apenas quantas unidades votaram, sem contagem.
   *
   * A distinção é o que permite a mensagem correta: "ainda não publicado" não é
   * a mesma coisa que "apurado com zero votos".
   */
  const exibicao = useMemo(
    () => montarApuracaoDeResultado({
      resultado,
      unidadesAptas: assembleia?.unidadesAptas ?? 0,
      participacao,
    }),
    [resultado, assembleia?.unidadesAptas, participacao]
  );

  /**
   * Há resultado publicado?
   *
   * Distinguir "não apurado" de "apurado com zero votos" importa: enquanto não
   * houver publicação, a tela mostra apenas quantas unidades votaram. Foi uma
   * decisão do projeto não exibir placar durante a votação.
   *
   * O critério é a EXISTÊNCIA do documento de resultado, não a flag
   * `resultadoPublicado` da assembleia. A flag é gravada num segundo `setDoc`,
   * depois do resultado — então, por um instante, ela estaria `false` com o
   * resultado já presente. O documento é a fonte da verdade.
   */
  const publicado = Boolean(resultado?.apuracao);

  /**
   * Unidades com direito de deliberar: as aptas do cadastro menos as
   * inadimplentes, cujo voto não entra na contagem.
   *
   * É esta a base do percentual "das unidades aptas" no resultado. As
   * inadimplentes não votam PARA EFEITO DE DELIBERAÇÃO, então também não podem
   * inflar o denominador — senão o percentual sairia subestimado.
   *
   * Depois de publicada, usa o número CONGELADO no resultado: a inadimplência
   * pode ter mudado entre a publicação e agora, e o documento da ata precisa
   * refletir o que valia no momento da apuração.
   */
  const unidadesAptasParaDeliberar = useMemo(() => {
    if (publicado && typeof exibicao.unidadesAptas === 'number') {
      return exibicao.unidadesAptas;
    }
    const total = assembleia?.unidadesAptas ?? 0;
    const inadimplentes = exibicao.unidadesInadimplentes ?? 0;
    return Math.max(0, total - inadimplentes);
  }, [publicado, exibicao.unidadesAptas, exibicao.unidadesInadimplentes, assembleia?.unidadesAptas]);

  // Extraído do objeto de sessão: `usuario` é recriado a cada render, e usá-lo
  // direto numa dependência de `useCallback` quebra a memoização — o lint acusa
  // `react-hooks/preserve-manual-memoization`. O `uid` é um valor estável.
  const uidPublicador = usuario?.uid ?? null;

  const encerrar = useCallback(async () => {
    setConfirmandoEncerrar(false);
    setEncerrando(true);
    setErro('');
    try {
      // `encerrarAssembleia` devolve apenas `{ ok: true }` — o resumo com
      // contagem NÃO vem daqui. A versão anterior desta tela lia
      // `resumo.totalVotos` e exibia "undefined voto(s) de undefined unidade(s)".
      // O número de votantes está em `participacao`, que já é acompanhada ao
      // vivo, e as unidades aptas estão na assembleia.
      await encerrarAssembleia(assembleiaId);
      setAvisoEncerramento(
        `Votação encerrada: ${participacao.unidadesQueVotaram} unidade(s) votaram `
        + `de ${unidadesAptasParaDeliberar} apta(s). `
        + 'Agora use "Apurar e publicar resultado" para gerar a contagem por opção.'
      );
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setEncerrando(false);
    }
  }, [assembleiaId, participacao.unidadesQueVotaram, unidadesAptasParaDeliberar]);

  /**
   * Publica a apuração. Lê o espelho anônimo, exclui as unidades inadimplentes e
   * grava o resultado — que passa a ser imutável.
   *
   * Não é memoizada de propósito: é acionada por clique, nunca por efeito, então
   * o `useCallback` não trazia ganho nenhum — e a regra
   * `react-hooks/preserve-manual-memoization` do React 19 recusava a memoização
   * por causa das dependências derivadas da assembleia.
   */
  async function publicar() {
    // DIAGNÓSTICO TEMPORÁRIO — precisamos saber se o clique chega aqui.
    console.log('[ipevox] publicar() chamada', {
      assembleiaId,
      propostas: propostas?.length ?? 0,
      unidadesAptas: assembleia?.unidadesAptas,
      uidPublicador,
      encerrada: assembleia?.status,
    });

    setConfirmandoPublicar(false);
    setPublicando(true);
    setErro('');
    try {
      const resumo = await publicarResultado({
        assembleiaId,
        propostas,
        unidadesAptas: assembleia?.unidadesAptas ?? 0,
        publicadoPor: uidPublicador,
      });

      console.log('[ipevox] publicar() concluiu', resumo);

      setAvisoEncerramento(
        `Resultado publicado: ${resumo.totalVotos} voto(s) considerado(s)`
        + (resumo.votosExcluidos > 0
          ? `, ${resumo.votosExcluidos} excluído(s) por inadimplência.`
          : '.')
      );
    } catch (falha) {
      console.error('[ipevox] publicar() falhou', {
        message: falha?.message,
        codigo: falha?.codigo,
      });
      setErro(falha.message);
    } finally {
      setPublicando(false);
    }
  }

  const baixarPdf = useCallback(async () => {
    setGerandoPdf(true);
    setErro('');
    try {
      // Carregamento sob demanda: o pacote de PDF (@react-pdf/renderer é pesado)
      // só entra no bundle quando alguém realmente pede o relatório.
      //
      // ATENÇÃO ao formato do import: `pdf` é um export NOMEADO. Escrever
      // `const [{ pdf }] = await Promise.all([import('@react-pdf/renderer')])`
      // produz `undefined`, porque o namespace do módulo ES não entrega os
      // exports nomeados como propriedades desestruturáveis desse jeito.
      const [moduloPdf, moduloRelatorio] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/components/RelatorioPDF'),
      ]);
      const pdf = moduloPdf.pdf;
      const RelatorioPDF = moduloRelatorio.default;

      // O relatório usa o snapshot gravado no encerramento, não o estado da
      // tela: é o que faz o PDF corresponder ao que foi registrado.
      const snapshot = await lerResultado(assembleiaId);
      if (!snapshot) {
        throw new Error(
          'O snapshot da apuração ainda não foi gerado. Encerre a votação primeiro.'
        );
      }

      const blob = await pdf(<RelatorioPDF snapshot={snapshot} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ipevox-${String(snapshot.titulo ?? assembleiaId)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (falha) {
      setErro(`Falha ao gerar o PDF: ${falha?.message ?? 'erro desconhecido'}`);
    } finally {
      setGerandoPdf(false);
    }
  }, [assembleiaId]);

  if (carregando) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 animate-pulse">Carregando apuração…</p>
      </main>
    );
  }

  if (erro && !assembleia) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-2xl p-8 text-center max-w-md border border-red-900">
          <div className="flex justify-center mb-3 text-red-400">
            <IconeAlerta tamanho={36} />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Erro ao carregar</h1>
          <p className="text-gray-400 mb-6">{erro}</p>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
          >
            Voltar ao início
          </button>
        </div>
      </main>
    );
  }

  const encerrada = assembleia?.status === 'encerrada';
  const semVotos = publicado && exibicao.totalParticipacoes === 0;

  // A tela é usada por DOIS públicos, e o casco se adapta a cada um:
  //
  //   administrador/síndico -> dentro do painel, com a barra lateral, para poder
  //                            navegar dali para qualquer outra tela;
  //   morador               -> página limpa, sem barra. Ele chegou pelo QR Code,
  //                            não tem conta no painel e uma barra de navegação
  //                            administrativa só confundiria.
  const conteudo = (
    <>
      {/* Cabeçalho no padrão das outras telas: título, subtítulo e ações. Só o
          administrador vê "Encerrar votação" e "Publicar" — o morador acompanha,
          não decide. */}
      <div className="flex flex-col md:flex-row justify-between items-start md:gap-6 gap-4 mb-8">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-white break-words">
            {assembleia?.titulo ?? 'Assembleia'}
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium border ${
                encerrada
                  ? 'bg-red-900/50 text-red-300 border-red-800'
                  : 'bg-green-900/50 text-green-300 border-green-800'
              }`}
            >
              {encerrada ? 'Encerrada' : 'Em andamento'}
            </span>
            {assembleia?.criadoEm && (
              <span className="text-gray-500 text-sm">
                {formatarData(assembleia.criadoEm)}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          {encerrada && (
            <button
              type="button"
              onClick={baixarPdf}
              disabled={gerandoPdf}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition"
            >
              <IconeDocumento tamanho={16} />
              {gerandoPdf ? 'Gerando…' : 'Baixar relatório'}
            </button>
          )}

          {ehOperador && !encerrada && (
            <button
              type="button"
              onClick={() => setConfirmandoEncerrar(true)}
              disabled={encerrando}
              className="px-4 py-2 bg-red-900/50 hover:bg-red-900/80 disabled:opacity-60 text-red-300 border border-red-800 rounded-lg text-sm font-medium transition"
            >
              {encerrando ? 'Encerrando…' : 'Encerrar votação'}
            </button>
          )}

          {/*
            PUBLICAÇÃO DA APURAÇÃO.
            Sem este botão o resultado nunca aparece: a função existia, mas nada
            a chamava. E sem publicar, o morador e o síndico não veem contagem
            nenhuma — nem depois do encerramento.
          */}
          {ehOperador && encerrada && !publicado && (
            <button
              type="button"
              onClick={() => setConfirmandoPublicar(true)}
              disabled={publicando}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition"
            >
              {publicando ? 'Publicando…' : 'Apurar e publicar resultado'}
            </button>
          )}
        </div>
      </div>

      {assembleia?.modo && <SeloModo modo={assembleia.modo} className="mb-6" />}

      {erro && (
        <div
          role="alert"
          className="mb-6 p-4 bg-red-900/30 border border-red-800 text-red-300 rounded-xl text-sm"
        >
          {erro}
        </div>
      )}

      {avisoEncerramento && (
        <div className="mb-6 p-4 bg-green-900/30 border border-green-800 text-green-300 rounded-xl text-sm">
          {avisoEncerramento}
        </div>
      )}

      {/* Painel de quórum: a base de cálculo, explícita */}
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5 mb-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-white">
              {exibicao.unidadesQueVotaram}
            </div>
            <div className="text-xs text-gray-400 mt-1">unidades votaram</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">
              {unidadesAptasParaDeliberar}
            </div>
            <div className="text-xs text-gray-400 mt-1">unidades aptas</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-400">
              {/* Denominador é a base de deliberação, não o total do cadastro:
                  unidade inadimplente não delibera, então não pode diluir o
                  percentual de participação. */}
              {unidadesAptasParaDeliberar > 0
                ? Math.round(
                    (exibicao.unidadesQueVotaram / unidadesAptasParaDeliberar) * 100
                  )
                : 0}
              %
            </div>
            <div className="text-xs text-gray-400 mt-1">participação</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">
              {exibicao.totalParticipacoes}
            </div>
            <div className="text-xs text-gray-400 mt-1">votos considerados</div>
          </div>
        </div>

        {/*
          Resumo da inadimplência. Existe porque, sem ele, os números não fecham
          para quem lê a ata: "3 unidades votaram" com "1 voto considerado" parece
          erro de contagem. A diferença precisa estar explicada na própria tela.
        */}
        {(exibicao.votosExcluidos > 0 || exibicao.unidadesInadimplentes > 0) && (
          <div className="mt-4 pt-3 border-t border-gray-700/60">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
              {exibicao.unidadesInadimplentes > 0 && (
                <span className="text-red-300">
                  <strong className="font-semibold">{exibicao.unidadesInadimplentes}</strong>{' '}
                  unidade(s) inadimplente(s), fora da base de deliberação
                </span>
              )}
              {exibicao.votosExcluidos > 0 && (
                <span className="text-red-300">
                  <strong className="font-semibold">{exibicao.votosExcluidos}</strong>{' '}
                  voto(s) registrado(s) por essas unidades e NÃO contabilizado(s)
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              A unidade inadimplente vota normalmente, mas o voto dela não entra na
              contagem da deliberação — por isso o número de votos considerados pode
              ser menor que o de unidades que votaram.
            </p>
          </div>
        )}

        <p className="text-xs text-gray-500 mt-4 leading-relaxed border-t border-gray-700/60 pt-3">
          Cada barra mostra dois números: o percentual <strong>dos votos</strong>{' '}
          (participação relativa entre quem votou) e o percentual{' '}
          <strong>das unidades aptas</strong> (peso real na deliberação). O
          segundo é o que vale para a ata.
        </p>
      </div>

      {/* Resultados por proposta */}
      {/*
        Estado "não publicado". A mensagem anterior dizia "A votação foi encerrada
        sem votos" mesmo com votos gravados — porque a tela não lia o resultado e
        interpretava a ausência de PLACAR como ausência de VOTOS. São coisas
        diferentes, e confundir as duas faz o síndico achar que perdeu os votos.
      */}
      {!publicado && (
        <div className="bg-amber-950/30 border border-amber-800/60 rounded-2xl p-6 text-center mb-6">
          <p className="text-amber-100 font-medium">
            {encerrada ? 'Resultado ainda não publicado' : 'Apuracão disponível no encerramento'}
          </p>
          <p className="text-amber-200/70 text-sm mt-2 leading-relaxed">
            {encerrada
              ? 'A votação foi encerrada e os votos estão gravados. Use "Apurar e publicar '
                + 'resultado" para gerar a contagem por opção — ela é publicada uma única vez e '
                + 'não pode ser alterada depois.'
              : 'Durante a votação não há placar: a contagem por opção só é publicada no '
                + 'encerramento, para não influenciar quem ainda vai votar.'}
          </p>
        </div>
      )}

      {semVotos && (
        <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-6 text-center mb-6">
          <p className="text-gray-300 font-medium">Nenhum voto foi considerado.</p>
          <p className="text-gray-500 text-sm mt-2">
            {exibicao.votosExcluidos > 0
              ? `Todos os ${exibicao.votosExcluidos} voto(s) registrados vieram de unidades `
                + 'inadimplentes, que não entram na contagem da deliberação.'
              : 'A votação foi encerrada sem nenhum voto registrado.'}
          </p>
        </div>
      )}

      <div className="space-y-6">
        {exibicao.propostas.map((prop) => {
          const totalVotos = prop.totalVotos;

          return (
            <div
              key={prop.propostaId}
              className="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-lg"
            >
              <div className="flex justify-between items-start gap-3 mb-4">
                <h2 className="text-xl font-semibold text-white">
                  {prop.ordem}. {prop.titulo}
                </h2>
                <span className="shrink-0 bg-gray-900 text-gray-400 px-3 py-1 rounded-full text-xs font-mono">
                  {totalVotos} voto(s)
                </span>
              </div>

              {prop.descricao && (
                <p className="text-gray-400 text-sm mb-4 whitespace-pre-line">
                  {prop.descricao}
                </p>
              )}

              <div className="space-y-4">
                {prop.opcoes.map((o) => (
                  <div key={o.opcao}>
                    <div className="flex justify-between items-baseline text-sm mb-1 gap-3">
                      <span className="text-gray-200 font-medium truncate">
                        {o.opcao}
                      </span>
                      <span className="text-gray-400 shrink-0 text-right">
                        <span className="text-white font-semibold">{o.votos}</span>
                        {' · '}
                        {o.percentual}% dos votos
                        <span className="text-gray-500">
                          {' · '}
                          {o.percentualAptas}% das unidades
                        </span>
                      </span>
                    </div>
                    <div className="w-full bg-gray-900 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ease-out ${corDaBarra(o.percentualAptas)}`}
                        style={{ width: `${o.percentualAptas}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-3 border-t border-gray-700/60 text-sm">
                {/*
                  Campos gravados por `publicarResultado`: `empate` (booleano) e
                  `aprovada` (opção vencedora, ou null em caso de empate).

                  DEFEITO CORRIGIDO: aqui a tela lia `prop.empatadas.join(...)`,
                  `prop.maisVotada` e `prop.quorumPercentual` — três campos que a
                  função NUNCA gravou. Quando `empate` era verdadeiro, o `.join`
                  de `undefined` derrubava a tela inteira com
                  "Cannot read properties of undefined (reading 'join')".
                */}
                {totalVotos === 0 ? (
                  <span className="text-gray-500">Sem votos nesta proposta.</span>
                ) : prop.empate ? (
                  <span className="text-amber-300 font-medium">
                    Empate — não houve maioria nesta proposta.
                  </span>
                ) : prop.aprovada ? (
                  <span className="text-green-300 font-medium">
                    Aceita por maioria: {prop.aprovada.opcao} ({prop.aprovada.votos} voto(s))
                  </span>
                ) : (
                  <span className="text-gray-500">Sem maioria definida.</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {propostas.length === 0 && !erro && (
        <p className="text-gray-500 text-center py-8">
          Esta assembleia não tem propostas registradas.
        </p>
      )}

      {encerrada && assembleia?.modo === MODOS.FECHADA && (
        <p className="text-xs text-gray-500 mt-8 leading-relaxed">
          Esta assembleia teve votos em modo restrito. Os números acima vêm da
          apuração publicada no encerramento, que é gravada uma única vez e não
          pode ser alterada. A identificação de como cada unidade votou fica
          restrita ao administrador do sistema — nem o síndico tem acesso a ela.
        </p>
      )}

      {confirmandoEncerrar && (
        <ModalConfirmacao
          titulo="Encerrar a votação agora?"
          consequencia={
            'Esta ação é irreversível.\n\n'
            + 'Nenhum voto novo será aceito a partir de agora. Encerrar NÃO publica o '
            + 'resultado: depois disso você ainda precisa usar "Apurar e publicar '
            + 'resultado" para que a contagem apareça aos participantes.'
          }
          rotuloConfirmar="Encerrar votação"
          rotuloCancelar="Voltar"
          destrutivo
          processando={encerrando}
          aoConfirmar={encerrar}
          aoFechar={() => setConfirmandoEncerrar(false)}
        />
      )}

      {confirmandoPublicar && (
        <ModalConfirmacao
          titulo="Apurar e publicar o resultado?"
          consequencia={
            `Serão contados os votos registrados em ${propostas.length} proposta(s) e `
            + 'gravada a contagem por opção.\n\n'
            + 'O resultado é gravado UMA ÚNICA VEZ e não pode ser alterado depois — '
            + 'nem por você. Confira se todos os votos esperados já foram '
            + `registrados (${participacao.unidadesQueVotaram} de `
            + `${unidadesAptasParaDeliberar} unidades aptas) antes de publicar.\n\n`
            + 'Os votos de unidades inadimplentes são excluídos da contagem '
            + 'automaticamente.'
          }
          rotuloConfirmar="Publicar resultado"
          rotuloCancelar="Ainda não"
          processando={publicando}
          aoConfirmar={publicar}
          aoFechar={() => setConfirmandoPublicar(false)}
        />
      )}
    </>
  );

  // Morador: página limpa. Administrador e síndico: dentro do painel.
  if (ehOperador) {
    return <PainelComBarra largura="max-w-4xl">{conteudo}</PainelComBarra>;
  }

  return (
    <main className="min-h-screen py-12 px-4">
      <div className="max-w-4xl mx-auto">{conteudo}</div>
    </main>
  );
}
