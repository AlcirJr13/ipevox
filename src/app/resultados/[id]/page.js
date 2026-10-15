"use client";

/**
 * ipevox — Acompanhamento de resultados e apuração
 * =============================================================================
 * - Placar e gráficos de barras em tempo real durante a votação.
 * - Barras de progresso com cores distintas para cada opção (Sim, Não, Abstenção,
 *   ou outras cadastradas pelo síndico).
 * - Na votação aberta: detalhamento transparente dos votos por casa em grade limpa.
 * - Encerramento imediato sem necessidade de etapa manual de "apurar e publicar".
 */

import { PainelComBarra } from '@/components/BarraLateral';
import { IconeAlerta, IconeCheck, IconeDocumento } from '@/components/Icones';
import { ModalConfirmacao } from '@/components/Modais';
import { useSessao, useSessaoAnonima } from '@/lib/auth';
import { encerrarVotacao, publicarResultadoDeAssembleia } from '@/lib/api';
import {
  escutarAssembleia,
  escutarCatalogoUnidades,
  escutarParticipacao,
  escutarResultado,
  escutarVotos,
  lerPropostas,
  montarApuracaoAoVivo,
} from '@/lib/data';
import { MODOS, formatarData, obterConfigOpcao } from '@/lib/schema';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

export default function Resultados() {
  const router = useRouter();
  const { id: assembleiaId } = useParams();

  // Garante sessão anônima para regras do Firestore
  useSessaoAnonima();
  const { ehOperador } = useSessao();

  const [assembleia, setAssembleia] = useState(null);
  const [propostas, setPropostas] = useState([]);
  const [propostasCarregadas, setPropostasCarregadas] = useState(false);
  const [votos, setVotos] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [participacao, setParticipacao] = useState({ unidadesQueVotaram: 0 });
  const [erro, setErro] = useState('');
  const [encerrando, setEncerrando] = useState(false);
  const [confirmandoEncerrar, setConfirmandoEncerrar] = useState(false);
  const [avisoEncerramento, setAvisoEncerramento] = useState('');
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [consolidando, setConsolidando] = useState(false);

  // Controle de expansão de detalhes de votos por casa na votação aberta (inicia recolhido)
  const [detalhesAbertos, setDetalhesAbertos] = useState({});

  const toggleDetalhes = (propostaId) => {
    setDetalhesAbertos((prev) => ({
      ...prev,
      [propostaId]: !prev[propostaId],
    }));
  };

  const carregando = !erro && (!assembleia || !propostasCarregadas);

  // 1. Carrega propostas da assembleia
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

  // 2. Listeners em tempo real
  useEffect(() => {
    if (!assembleiaId) return;

    const falhaListener = (falha) => {
      console.error('[ipevox] erro no listener:', falha);
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
      (err) => setErro('Não foi possível acompanhar a assembleia: ' + err.message)
    );

    const cancelarCatalogo = escutarCatalogoUnidades(
      (listaUnidades) => setCatalogo(listaUnidades),
      falhaListener
    );

    const cancelarParticipacao = escutarParticipacao(
      assembleiaId,
      (dados) => setParticipacao(dados),
      falhaListener
    );

    const cancelarResultado = escutarResultado(
      assembleiaId,
      (dados) => setResultado(dados),
      falhaListener
    );

    return () => {
      cancelarAssembleia();
      cancelarCatalogo();
      cancelarParticipacao();
      cancelarResultado();
    };
  }, [assembleiaId]);

  // 2b. Votos individuais só são assinados na votação ABERTA (voto atribuível).
  //     Na votação RESTRITA o painel não deve acompanhar a apuração em tempo
  //     real — a contagem só aparece no encerramento, pelo resultado publicado.
  //     Por isso `/votos` não é lido nesse modo (a regra do Firestore também
  //     nega a leitura, exceto ao administrador do sistema).
  const modoVotacao = assembleia?.modo ?? null;
  useEffect(() => {
    if (!assembleiaId) return undefined;
    if (modoVotacao !== MODOS.ABERTA) return undefined;
    return escutarVotos(
      assembleiaId,
      (listaVotos) => setVotos(listaVotos),
      (falha) => console.error('[ipevox] erro no listener de votos:', falha)
    );
  }, [assembleiaId, modoVotacao]);

  // 3. Monta a apuração dinâmica em tempo real
  const exibicao = useMemo(() => {
    return montarApuracaoAoVivo({
      assembleia,
      propostas,
      // Na votação restrita os votos individuais NÃO entram na apuração ao vivo:
      // a contagem vem do resultado publicado (`resultado`) após o encerramento.
      votos: assembleia?.modo === MODOS.ABERTA ? votos : [],
      catalogo,
      resultado,
      participacao,
    });
  }, [assembleia, propostas, votos, catalogo, resultado, participacao]);

  const encerrada = assembleia?.status === 'encerrada';
  const ehVotacaoAberta = assembleia?.modo === MODOS.ABERTA;
  // A contagem de votos e as barras por opção só podem ser exibidas na votação
  // aberta (ao vivo) ou, em qualquer modo, depois do encerramento.
  const votosVisiveis = ehVotacaoAberta || encerrada;
  // Encerramento da assembleia: encerra E publica o resultado numa só operação.
  async function encerrar() {
    setConfirmandoEncerrar(false);
    setEncerrando(true);
    setErro('');
    try {
      await encerrarVotacao(assembleiaId);
      setAvisoEncerramento('Votação encerrada com sucesso! O resultado final está consolidado abaixo.');
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setEncerrando(false);
    }
  }

  // Recuperação: assembleia encerrada por um caminho que não publicou o snapshot
  // (ex.: encerrada pelo histórico). Reconsolida o resultado a partir do banco.
  async function consolidarResultado() {
    setConsolidando(true);
    setErro('');
    try {
      await publicarResultadoDeAssembleia(assembleiaId);
      setAvisoEncerramento('Resultado consolidado com sucesso.');
    } catch (falha) {
      setErro(`Não foi possível consolidar o resultado: ${falha.message}`);
    } finally {
      setConsolidando(false);
    }
  }

  // Geração e download do relatório PDF
  async function baixarPdf() {
    setGerandoPdf(true);
    setErro('');
    try {
      const [moduloPdf, moduloRelatorio] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/components/RelatorioPDF'),
      ]);
      const pdf = moduloPdf.pdf;
      const RelatorioPDF = moduloRelatorio.default;

      // O snapshot publicado em `/resultados` guarda a apuração em formato
      // diferente do que o relatório espera (lista de propostas em `apuracao`,
      // sem `modo`, `titulo` nem `unidadesQueVotaram`). Por isso o PDF é montado
      // a partir da apuração ao vivo (`exibicao`), que já incorpora os números
      // congelados do resultado publicado e as metainformações da assembleia.
      const snapshot = {
        assembleiaId,
        titulo: assembleia?.titulo ?? 'Assembleia',
        descricao: assembleia?.descricao ?? '',
        modo: assembleia?.modo ?? MODOS.ABERTA,
        criadoEm: assembleia?.criadoEm ?? null,
        encerradoEm: assembleia?.encerradoEm ?? resultado?.publicadoEm ?? null,
        unidadesAptas: exibicao.unidadesAptas,
        unidadesQueVotaram: exibicao.unidadesQueVotaram,
        totalVotos: exibicao.totalParticipacoes,
        votosExcluidos: exibicao.votosExcluidos,
        apuracao: exibicao,
      };

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
  }

  if (carregando) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 font-medium text-sm">Carregando votação em tempo real…</p>
        </div>
      </main>
    );
  }

  if (erro && !assembleia) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-gray-900">
        <div className="bg-gray-800 rounded-2xl p-8 text-center max-w-md border border-red-900 shadow-2xl">
          <div className="flex justify-center mb-3 text-red-400">
            <IconeAlerta tamanho={36} />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Erro ao carregar</h1>
          <p className="text-gray-400 mb-6 text-sm">{erro}</p>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
          >
            Voltar ao início
          </button>
        </div>
      </main>
    );
  }

  const conteudo = (
    <>
      {/* Cabeçalho da Assembleia */}
      <div className="flex flex-col md:flex-row justify-between items-start md:gap-6 gap-4 mb-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${encerrada
                ? 'bg-red-900/50 text-red-300 border-red-800'
                : 'bg-green-900/50 text-green-300 border-green-800'
                }`}
            >
              {!encerrada && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
              )}
              {encerrada ? 'Votação encerrada' : 'Ao vivo • Votação em andamento'}
            </span>

            {ehVotacaoAberta ? (
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-900/50 text-blue-200 border border-blue-700">
                Votação aberta (identificação por casa)
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-900/50 text-indigo-200 border border-indigo-700">
                Votação fechada (sigilosa)
              </span>
            )}
          </div>

          <h1 className="text-3xl font-extrabold text-white break-words tracking-tight">
            {assembleia?.titulo ?? 'Assembleia'}
          </h1>

          {assembleia?.descricao && (
            <p className="text-gray-400 text-sm mt-1.5 whitespace-pre-line max-w-2xl leading-relaxed">
              {assembleia.descricao}
            </p>
          )}

          {assembleia?.criadoEm && (
            <p className="text-gray-500 text-xs mt-2 font-mono">
              Iniciada em: {formatarData(assembleia.criadoEm)}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {encerrada && ehOperador && !resultado && (
            <button
              type="button"
              onClick={consolidarResultado}
              disabled={consolidando}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white rounded-xl text-sm font-semibold shadow-lg shadow-amber-900/30 transition"
            >
              {consolidando ? 'Consolidando…' : 'Consolidar resultado'}
            </button>
          )}

          {encerrada && (
            <button
              type="button"
              onClick={baixarPdf}
              disabled={gerandoPdf}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-semibold shadow-lg shadow-blue-900/30 transition"
            >
              <IconeDocumento tamanho={16} />
              {gerandoPdf ? 'Gerando PDF…' : 'Baixar relatório (PDF)'}
            </button>
          )}

          {ehOperador && !encerrada && (
            <button
              type="button"
              onClick={() => setConfirmandoEncerrar(true)}
              disabled={encerrando}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-800 hover:bg-red-700 text-white border border-red-500 rounded-xl text-sm font-semibold shadow-lg shadow-red-950/50 transition"
            >
              {encerrando ? 'Encerrando…' : 'Encerrar votação'}
            </button>
          )}
        </div>
      </div>

      {erro && (
        <div
          role="alert"
          className="mb-6 p-4 bg-red-950/50 border border-red-800 text-red-200 rounded-xl text-sm flex items-start gap-3"
        >
          <div className="shrink-0 text-red-400 mt-0.5">
            <IconeAlerta tamanho={18} />
          </div>
          <div>{erro}</div>
        </div>
      )}

      {avisoEncerramento && (
        <div className="mb-6 p-4 bg-emerald-950/60 border border-emerald-800 text-emerald-200 rounded-xl text-sm flex items-center gap-2.5">
          <IconeCheck tamanho={18} />
          <span>{avisoEncerramento}</span>
        </div>
      )}

      {/* Cards de Quórum e Estatísticas em Tempo Real */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-8">
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4 text-center shadow-lg">
          <div className="text-3xl font-extrabold text-white tracking-tight">
            {exibicao.unidadesQueVotaram}
          </div>
          <div className="text-xs text-gray-400 font-medium mt-1">unidades votaram</div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4 text-center shadow-lg">
          <div className="text-3xl font-extrabold text-white tracking-tight">
            {exibicao.unidadesAptas}
          </div>
          <div className="text-xs text-gray-400 font-medium mt-1">unidades aptas</div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4 text-center shadow-lg">
          <div className="text-3xl font-extrabold text-sky-400 tracking-tight">
            {exibicao.unidadesAptas > 0
              ? Math.round((exibicao.unidadesQueVotaram / exibicao.unidadesAptas) * 100)
              : 0}
            %
          </div>
          <div className="text-xs text-gray-400 font-medium mt-1">participação / quórum</div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4 text-center shadow-lg">
          <div className="text-3xl font-extrabold text-emerald-400 tracking-tight">
            {votosVisiveis ? exibicao.totalParticipacoes : '—'}
          </div>
          <div className="text-xs text-gray-400 font-medium mt-1">votos computados</div>
        </div>
      </div>

      {/* Alerta de inadimplência, se houver */}
      {(exibicao.votosExcluidos > 0 || exibicao.unidadesInadimplentes > 0) && (
        <div className="mb-6 p-4 bg-amber-950/30 border border-amber-900/60 rounded-xl text-xs text-amber-200/90 leading-relaxed">
          <p className="font-semibold mb-0.5">
            Unidades inadimplentes registradas ({exibicao.unidadesInadimplentes})
          </p>
          <p className="text-amber-200/70">
            Os votos de unidades inadimplentes são registrados para auditoria, mas não entram na contagem de deliberação.
            {exibicao.votosExcluidos > 0 && ` (${exibicao.votosExcluidos} voto(s) desconsiderado(s)).`}
          </p>
        </div>
      )}

      {/* Lista de Propostas com UI Baseada em image_0.png */}
      <div className="space-y-6">
        {exibicao.propostas.map((prop, idx) => {
          const totalVotos = prop.totalVotos;
          const temDetalhesAbertos = Boolean(detalhesAbertos[prop.propostaId]);

          return (
            <div
              key={prop.propostaId}
              className="bg-gray-800 rounded-2xl p-6 sm:p-7 border border-gray-700 shadow-2xl transition-all"
            >
              {/* Topo da Proposta: Proposta 1, Título e Total de Votos */}
              <div className="flex justify-between items-start gap-4 mb-4">
                <div>
                  <span className="text-xs font-semibold tracking-wider text-blue-400 uppercase">
                    Proposta {prop.ordem || idx + 1}
                  </span>
                  <h2 className="text-2xl font-bold text-white mt-0.5 tracking-tight">
                    {prop.titulo}
                  </h2>
                  {prop.descricao && (
                    <p className="text-gray-400 text-sm mt-2 whitespace-pre-line leading-relaxed">
                      {prop.descricao}
                    </p>
                  )}
                </div>

                <div className="shrink-0">
                  <span className="px-4 py-1.5 bg-gray-900 text-gray-300 rounded-full text-xs font-mono font-medium border border-gray-700 shadow-sm">
                    {votosVisiveis ? `${totalVotos} voto(s)` : '🔒 sigiloso'}
                  </span>
                </div>
              </div>

              {/* Banner de Resultado / Empate / Líder (Estilo image_0.png) */}
              {votosVisiveis ? (
              <>
              <div className="mb-5">
                {totalVotos === 0 ? (
                  <div className="px-5 py-4 rounded-xl bg-gray-900 border border-gray-700 text-gray-400 text-sm flex items-center gap-2">
                    <span>Aguardando os primeiros votos nesta proposta…</span>
                  </div>
                ) : prop.empate ? (
                  <div className="px-5 py-4 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-300 text-sm font-medium flex items-center gap-2.5 shadow-sm">
                    <span className="text-base">⚖️</span>
                    <span>
                      {encerrada
                        ? 'Resultado final: Empate entre as opções mais votadas'
                        : 'Empate no momento entre as opções mais votadas'}
                    </span>
                  </div>
                ) : prop.aprovada ? (
                  <div
                    className={`px-5 py-4 rounded-xl border text-sm font-medium flex items-center justify-between gap-3 shadow-sm ${encerrada
                        ? 'bg-blue-500/10 border-blue-500/40 text-blue-200'
                        : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                      }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">{encerrada ? '🏆' : '●'}</span>
                      <span>
                        {encerrada ? 'Resultado final: Mais votada — ' : 'Liderando no momento — '}
                        <strong className={`font-bold ${encerrada ? 'text-blue-100' : 'text-emerald-200'}`}>
                          {prop.aprovada.opcao}
                        </strong>
                        {' '}
                        <span className={encerrada ? 'text-blue-300/80' : 'text-emerald-300/80'}>
                          ({prop.aprovada.votos} voto{prop.aprovada.votos === 1 ? '' : 's'})
                        </span>
                      </span>
                    </div>
                    {!encerrada && (
                      <span className="text-[11px] font-mono text-emerald-200 bg-emerald-900 px-2.5 py-1 rounded border border-emerald-600">
                        ao vivo
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="px-5 py-4 rounded-xl bg-gray-900 border border-gray-700 text-gray-400 text-sm">
                    Sem maioria definida.
                  </div>
                )}
              </div>

              {/* Barras de Progresso por Opção com Cores Distintas (Inspiradas em image_0.png) */}
              <div className="space-y-3">
                {prop.opcoes.map((o, opIdx) => {
                  const config = obterConfigOpcao(o.opcao, opIdx);
                  const temVotos = o.votos > 0;

                  return (
                    <div
                      key={o.opcao}
                      className="p-5 rounded-xl bg-gray-900 border border-gray-700 transition-all hover:border-gray-600 shadow-sm"
                    >
                      {/* Linha superior: Nome da Opção na esquerda, contagem e percentual na direita */}
                      <div className="flex justify-between items-baseline gap-3 mb-2.5">
                        <span className="text-white font-semibold text-base tracking-wide">
                          {o.opcao}
                        </span>

                        <div className="text-right shrink-0">
                          {temVotos ? (
                            <>
                              <span className="text-white font-bold text-sm">
                                {o.votos} voto{o.votos === 1 ? '' : 's'}
                              </span>
                              <span className="text-gray-400 font-normal text-xs ml-1.5">
                                ({o.percentual}% dos votos)
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-gray-400 font-medium text-sm">0 votos</span>
                              <span className="text-gray-500 font-normal text-xs ml-1.5">
                                (0% dos votos)
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Barra de progresso horizontal, com cor em estilo INLINE.
                          A cor não pode depender de classe do Tailwind: as classes
                          de opção vivem em `shared/` e o dev server não as gerava,
                          o que deixava a barra invisível. Com style inline a cor
                          entra direto no elemento, sempre. */}
                      <div
                        className="w-full rounded-full overflow-hidden"
                        style={{ height: '10px', backgroundColor: '#374151' }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${temVotos ? Math.max(o.percentual, 3) : 0}%`,
                            backgroundColor: temVotos ? config.hex : 'transparent',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              </>
              ) : (
                <div className="px-5 py-4 rounded-xl bg-gray-900 border border-gray-700 text-gray-400 text-sm flex items-center gap-2.5">
                  <span className="text-base">🔒</span>
                  <span>
                    Votação restrita em andamento — a contagem de votos e as barras por
                    opção serão divulgadas somente após o encerramento.
                  </span>
                </div>
              )}

              {/* Detalhamento dos Votos por Casa na Votação Aberta (Inspirado em image_1.png) */}
              {ehVotacaoAberta && (
                <div className="mt-6 pt-4 border-t border-gray-700/80">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>📄 Votos registrados por casa</span>
                        <span className="text-xs text-blue-400 font-mono font-medium">
                          ({prop.votosPorUnidade?.length ?? 0} voto(s))
                        </span>
                      </h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Transparência total: veja a opção escolhida por cada unidade.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleDetalhes(prop.propostaId)}
                      className="self-start sm:self-auto px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600 rounded-lg text-xs font-semibold transition shadow-sm"
                    >
                      {temDetalhesAbertos ? 'Ocultar detalhes' : 'Ver detalhes'}
                    </button>
                  </div>

                  {/* Grade de Cartões de Casas (Estrutura idêntica a image_1.png) */}
                  {temDetalhesAbertos && (
                    <div className="mt-4 pt-2">
                      {prop.votosPorUnidade && prop.votosPorUnidade.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
                          {prop.votosPorUnidade.map((item) => {
                            const configItem = obterConfigOpcao(
                              item.opcao,
                              Math.max(0, prop.opcoes.findIndex((o) => o.opcao === item.opcao))
                            );

                            return (
                              <div
                                key={item.votoId || `${item.numero}-${item.opcao}`}
                                className={`p-4 rounded-xl border transition flex flex-col justify-between gap-3 ${item.inadimplente
                                  ? 'bg-red-950/20 border-red-900/80 text-red-200'
                                  : 'bg-gray-900 border-gray-700 text-gray-200 hover:border-gray-600'
                                  }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-white text-sm">
                                    Casa {item.numero}
                                  </span>
                                  {item.inadimplente && (
                                    <span className="text-[11px] text-red-400 font-mono font-medium">
                                      inadimplente
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className="text-gray-400 text-xs font-normal">Voto:</span>
                                  <span
                                    className="font-semibold text-xs px-2.5 py-0.5 rounded-md border truncate"
                                    style={configItem.estiloBadge}
                                  >
                                    {item.opcao}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-gray-500 text-xs italic py-2">
                          Nenhum voto registrado para esta proposta até o momento.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Informação sobre sigilo se a votação for restrita */}
              {!ehVotacaoAberta && (
                <div className="mt-5 pt-3 border-t border-gray-700/80 text-xs text-gray-500 flex items-center gap-1.5">
                  <span>🔒 Votação fechada: os votos individuais por unidade são sigilosos.</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {propostas.length === 0 && !erro && (
        <div className="bg-gray-800 rounded-2xl p-12 text-center border border-gray-700">
          <p className="text-gray-400 text-base">Esta assembleia não possui propostas cadastradas.</p>
        </div>
      )}

      {/* Modal de Confirmação de Encerramento */}
      {confirmandoEncerrar && (
        <ModalConfirmacao
          titulo="Encerrar a votação agora?"
          consequencia={
            'Esta ação é irreversível.\n\n'
            + 'Nenhum novo voto será aceito e o resultado final será consolidado imediatamente. '
            + 'Você e todos os participantes poderão visualizar o resultado definitivo e baixar o relatório em PDF.'
          }
          rotuloConfirmar="Encerrar votação"
          rotuloCancelar="Cancelar"
          destrutivo
          processando={encerrando}
          aoConfirmar={encerrar}
          aoFechar={() => setConfirmandoEncerrar(false)}
        />
      )}
    </>
  );

  // Usuário operador/administrador: exibe dentro da barra lateral do painel
  if (ehOperador) {
    return <PainelComBarra largura="max-w-4xl">{conteudo}</PainelComBarra>;
  }

  // Morador ou visitante: layout centralizado imersivo
  return (
    <main className="min-h-screen py-10 px-4 bg-gray-900">
      <div className="max-w-4xl mx-auto">{conteudo}</div>
    </main>
  );
}
