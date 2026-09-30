"use client";

/**
 * ipevox — Votação
 * =============================================================================
 * Uma proposta por tela, com confirmação antes de enviar.
 *
 * DEFEITOS CORRIGIDOS AQUI (todos existiam na versão anterior):
 *
 *  1. VOTO DUPLICADO NA RETOMADA. O efeito de carga montava a lista de propostas
 *     já votadas iterando sobre o `state` `propostas`, que naquele instante ainda
 *     era `[]` (closure), e o efeito não tinha `propostas` nas dependências —
 *     então nunca re-executava. Resultado: `indicesVotados` ficava sempre vazio,
 *     e quem recarregasse a página no meio da assembleia voltava para a proposta
 *     1 e votava de novo. Agora o servidor grava `votouEm` no comprovante e é
 *     dela que vem a retomada.
 *
 *  2. VOTO CONTADO SEM REGISTRO. Antes, o cliente gravava o voto com `addDoc` e
 *     depois atualizava `votosComputados` em uma segunda escrita. Se a segunda
 *     falhasse, a tela dizia "falha ao enviar" mas o voto JÁ estava contado, e o
 *     morador votava de novo. Agora voto e contadores são escritos na mesma
 *     transação, no servidor.
 *
 *  3. DUAS FONTES DE VERDADE. Havia um `getDocs` inicial E um `onSnapshot`
 *     buscando a mesma coleção, competindo para sobrescrever o mesmo state.
 *
 *  4. O SIGILO. Antes cada voto ia para o banco com `unidadeDocId`, permitindo
 *     montar a tabela "unidade → voto". Em assembleia fechada, o voto agora é
 *     cifrado no servidor, o nome do documento é uma tag HMAC da unidade, e o
 *     morador recebe um recibo que permite conferir o próprio voto no
 *     encerramento sem abrir o de ninguém.
 */

import { IconeAlerta, IconeCadeado, IconeCheck, IconeDocumento, IconeSair } from '@/components/Icones';
import { ModalConfirmacao } from '@/components/Modais';
import SeloModo from '@/components/SeloModo';
import { finalizarSessao, votar } from '@/lib/api';
import { useSessaoAnonima } from '@/lib/auth';
import {
  lerAssembleia,
  lerComprovante,
  lerPropostas,
  proximaPropostaPendente,
  propostasVotadas,
} from '@/lib/data';
import { MODOS, normalizarNumeroUnidade } from '@/lib/schema';
import { esquecerSessao, lerComprovanteId, lerNumeroUnidade } from '@/lib/sessao';
import { guardarRecibo, lerRecibos, recibosParaTexto } from '@/lib/recibo';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

export default function Votacao() {
  const router = useRouter();
  const params = useParams();
  const assembleiaId = params.id;

  const { pronta: sessaoPronta, erro: erroSessao } = useSessaoAnonima();

  // Leitura síncrona do sessionStorage: em client component o primeiro render já
  // roda no browser, então não há divergência de hidratação.
  const [numero] = useState(() => lerNumeroUnidade(assembleiaId));
  const [comprovanteId] = useState(() => lerComprovanteId(assembleiaId));

  const [assembleia, setAssembleia] = useState(null);
  const [propostas, setPropostas] = useState([]);
  /**
   * Comprovante da sessão. Precisa estar em estado, não só em variável local:
   * `votosRegistrados` e `votouEm` são enviados a cada voto, e usar o valor da
   * carga inicial faria o segundo voto sobrescrever o primeiro com a lista
   * antiga — a unidade perderia o registro de ter votado.
   */
  const [comprovante, setComprovante] = useState(null);
  const [votadas, setVotadas] = useState([]);
  const [indiceAtual, setIndiceAtual] = useState(0);
  const [opcaoSelecionada, setOpcaoSelecionada] = useState('');
  const [mostrarConfirmacao, setMostrarConfirmacao] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [recibos, setRecibos] = useState([]);
  const [reciboCopiado, setReciboCopiado] = useState(false);
  const [confirmandoPular, setConfirmandoPular] = useState(false);

  // --- Carga inicial ---------------------------------------------------------
  useEffect(() => {
    if (!assembleiaId) return;
    if (!numero || !comprovanteId) {
      // Sem sessão de unidade não há o que votar: volta para o check-in.
      router.replace(`/checkin/${assembleiaId}`);
      return;
    }
    if (!sessaoPronta) return;

    let ativo = true;

    (async () => {
      try {
        const [dadosAssembleia, listaPropostas, comprovante] = await Promise.all([
          lerAssembleia(assembleiaId),
          lerPropostas(assembleiaId),
          // A assinatura é `(assembleiaId, numero)`, não o comprovanteId. A
          // versão anterior passava o ID do comprovante e a leitura devolvia
          // sempre nulo — a retomada de votação nunca funcionava e o morador era
          // mandado de volta ao check-in no meio do processo.
          lerComprovante(assembleiaId, numero),
        ]);
        if (!ativo) return;

        if (!dadosAssembleia || listaPropostas.length === 0) {
          setErro('Assembleia não encontrada ou sem propostas.');
          setCarregando(false);
          return;
        }

        if (dadosAssembleia.status === 'encerrada') {
          router.replace(`/resultados/${assembleiaId}`);
          return;
        }

        if (!comprovante) {
          // Comprovante inexistente (sessão limpa ou link direto): refaz o check-in.
          router.replace(`/checkin/${assembleiaId}`);
          return;
        }

        const jaVotadas = propostasVotadas(comprovante);

        setAssembleia(dadosAssembleia);
        setPropostas(listaPropostas);
        setComprovante(comprovante);
        setVotadas(jaVotadas);
        setRecibos(lerRecibos(assembleiaId));

        const pendente = proximaPropostaPendente(listaPropostas, comprovante.votouEm ?? []);
        setIndiceAtual(pendente === -1 ? 0 : pendente);

        if (comprovante.status === 'votado' && pendente !== -1) {
          // Estado inconsistente: a sessão foi finalizada mas faltam propostas.
          // Mais seguro avisar do que votar por cima.
          setAviso(
            'Sua sessão foi finalizada, mas há propostas sem voto registrado. '
            + 'Peça ajuda ao síndico antes de continuar.'
          );
        }

        setCarregando(false);
      } catch (falha) {
        if (!ativo) return;
        setErro(falha?.message ?? 'Não foi possível carregar a votação.');
        setCarregando(false);
      }
    })();

    return () => { ativo = false; };
  }, [assembleiaId, numero, comprovanteId, sessaoPronta, router]);

  const pendentes = useMemo(
    () => propostas.filter((p) => !votadas.includes(p.id)),
    [propostas, votadas]
  );

  const concluiu = propostas.length > 0 && pendentes.length === 0;
  const proposta = propostas[indiceAtual] ?? null;
  const total = propostas.length;
  const numVotadas = votadas.length;
  const selada = assembleia?.modo === MODOS.FECHADA;

  // --- Ações -----------------------------------------------------------------

  const selecionar = useCallback((opcao) => {
    setOpcaoSelecionada(opcao);
    setMostrarConfirmacao(true);
    setErro('');
  }, []);

  const confirmarVoto = useCallback(async () => {
    if (!opcaoSelecionada || !proposta || enviando) return;

    setEnviando(true);
    setErro('');

    try {
      const resposta = await votar({
        assembleiaId,
        propostaId: proposta.id,
        opcao: opcaoSelecionada,
        numero,
        // `tag` é o número da unidade: é ele que compõe o ID determinístico do
        // voto (`assembleia~proposta~tag`) e é o que garante um voto por unidade
        // por proposta. Sem ele, o ID saía com "undefined" no lugar da unidade.
        tag: normalizarNumeroUnidade(numero),
        // O comprovante é atualizado no MESMO lote da gravação do voto. Estes
        // três campos vinham indefinidos, e o Firestore recusa valor indefinido —
        // a votação não gravava nada.
        comprovanteId,
        votosRegistrados: comprovante?.votosRegistrados ?? 0,
        votouEm: comprovante?.votouEm ?? [],
      });

      // Atualização funcional: o `votadas` do closure pode estar desatualizado.
      setVotadas((anterior) =>
        anterior.includes(proposta.id) ? anterior : [...anterior, proposta.id]
      );

      // Atualiza o comprovante local com o que o servidor confirmou. Sem isto, o
      // próximo voto enviaria a lista antiga de `votouEm` e apagaria o registro
      // do voto anterior.
      setComprovante((anterior) => ({
        ...(anterior ?? {}),
        votosRegistrados: resposta?.votosRegistrados ?? anterior?.votosRegistrados ?? 0,
        votouEm: [
          ...(anterior?.votouEm ?? []),
          { propostaId: proposta.id, tag: normalizarNumeroUnidade(numero) },
        ],
      }));

      // Recibo do voto selado: é o único meio de o morador provar depois em que
      // votou. Fica no aparelho dele, nunca no servidor.
      if (resposta?.recibo) {
        setRecibos(guardarRecibo(assembleiaId, resposta.recibo));
      }

      setOpcaoSelecionada('');
      setMostrarConfirmacao(false);

      // A tela de conclusão aparece sozinha: `concluiu` é DERIVADO de
      // "não há propostas pendentes", então basta marcar a sessão como votada e
      // atualizar a lista local. A versão anterior verificava
      // `resposta.concluido`, um campo que a função `votar` nunca devolveu — a
      // condição era sempre falsa e a unidade ficava presa na tela de votação.
      const registrados = resposta?.votosRegistrados ?? 0;
      if (registrados >= propostas.length) {
        await finalizarSessao(comprovanteId);
        esquecerSessao(assembleiaId);
        return;
      }

      setAviso(resposta?.repetido ? 'Este voto já havia sido registrado.' : '');
      setIndiceAtual((atual) => {
        const seguinte = propostas.findIndex(
          (p, i) => i > atual && !votadas.includes(p.id) && p.id !== proposta.id
        );
        if (seguinte !== -1) return seguinte;
        const qualquer = propostas.findIndex(
          (p) => !votadas.includes(p.id) && p.id !== proposta.id
        );
        return qualquer === -1 ? atual : qualquer;
      });
    } catch (falha) {
      setErro(falha.message);
      setMostrarConfirmacao(false);
      setOpcaoSelecionada('');
    } finally {
      setEnviando(false);
    }
  }, [
    assembleiaId,
    enviando,
    numero,
    opcaoSelecionada,
    proposta,
    propostas,
    votadas,
    // O comprovante é lido dentro da função para enviar `votosRegistrados` e
    // `votouEm`; sem estas dependências o callback guardaria a lista antiga de
    // votos e sobrescreveria o registro do voto anterior.
    comprovante,
    comprovanteId,
  ]);

  function sairDaVotacao() {
    // Só limpa o estado local. O servidor libera a unidade pelo timeout de
    // inatividade — não existe endpoint público de "destravar", porque isso
    // seria um caminho para liberar a unidade de outra pessoa.
    esquecerSessao(assembleiaId);
    router.push('/');
  }

  /** Pular é irreversível para esta proposta, então pede confirmação explícita. */
  function pularProposta() {
    setConfirmandoPular(true);
  }

  function confirmarPulo() {
    setConfirmandoPular(false);
    if (!proposta) return;

    const proximo = propostas.findIndex((p, i) => i > indiceAtual && !votadas.includes(p.id));
    const alvo = proximo !== -1 ? proximo : propostas.findIndex((p) => !votadas.includes(p.id));
    if (alvo !== -1) setIndiceAtual(alvo);

    setOpcaoSelecionada('');
    setMostrarConfirmacao(false);
    setErro('');
  }

  async function copiarRecibo() {
    try {
      await navigator.clipboard.writeText(recibosParaTexto(assembleiaId, recibos));
      setReciboCopiado(true);
      setTimeout(() => setReciboCopiado(false), 2500);
    } catch {
      setErro('Não foi possível copiar o recibo. Selecione o texto manualmente.');
    }
  }

  function baixarRecibo() {
    const conteudo = recibosParaTexto(assembleiaId, recibos);
    const blob = new Blob([conteudo], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ipevox-recibo-${assembleiaId}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  // --- Estados de tela -------------------------------------------------------

  if (carregando) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 animate-pulse">Carregando propostas…</p>
      </main>
    );
  }

  if (erro && !proposta) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div
          role="alert"
          className="bg-gray-800 rounded-2xl p-8 text-center max-w-md border border-red-900"
        >
          <div className="flex justify-center mb-3 text-red-400">
            <IconeAlerta tamanho={36} />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Não foi possível votar</h1>
          <p className="text-gray-400 mb-6">{erro}</p>
          <button
            type="button"
            onClick={() => router.push(`/checkin/${assembleiaId}`)}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
          >
            Voltar ao check-in
          </button>
        </div>
      </main>
    );
  }

  if (concluiu) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-gray-800 rounded-2xl p-8 border border-gray-700">
          <div className="flex justify-center mb-4 text-green-400">
            <IconeCheck tamanho={52} />
          </div>
          <h1 className="text-2xl font-bold text-white text-center mb-2">
            Votação concluída
          </h1>
          <p className="text-gray-400 text-center mb-4">
            Unidade {numero} · {numVotadas} de {total} proposta(s) com voto registrado.
          </p>

          {selada && (
            <div className="bg-indigo-900/30 border border-indigo-700 rounded-xl p-4 mb-6">
              <p className="flex items-center gap-2 text-indigo-200 font-semibold text-sm mb-2">
                <IconeCadeado tamanho={16} />
                Guarde o seu recibo
              </p>
              <p className="text-xs text-indigo-100/90 leading-relaxed mb-3">
                Seus votos foram cifrados antes de serem gravados: o sistema não
                exibe o conteúdo porque ninguém — nem o síndico, nem o servidor —
                o mantém legível. O recibo abaixo é o <strong>único meio</strong> de
                comprovar depois em que você votou. Ele fica apenas neste aparelho.
              </p>

              {recibos.length === 0 ? (
                <p className="text-xs text-amber-200 bg-amber-900/20 border border-amber-800/60 rounded-lg p-3">
                  Nenhum recibo encontrado neste aparelho. Isso acontece quando a
                  votação foi feita em outro dispositivo ou o armazenamento do
                  navegador foi limpo. Para identificar seu voto será necessária
                  uma abertura formal pelo síndico, registrada em auditoria.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <button
                      type="button"
                      onClick={copiarRecibo}
                      className="inline-flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition"
                    >
                      <IconeDocumento tamanho={15} />
                      {reciboCopiado ? 'Copiado' : 'Copiar recibo'}
                    </button>
                    <button
                      type="button"
                      onClick={baixarRecibo}
                      className="inline-flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition"
                    >
                      Baixar .txt
                    </button>
                  </div>
                  <pre className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-[10px] leading-relaxed text-gray-300 overflow-x-auto whitespace-pre">
                    {recibosParaTexto(assembleiaId, recibos)}
                  </pre>
                </>
              )}
            </div>
          )}

          {!selada && (
            <p className="text-xs text-blue-300 mb-6 leading-relaxed">
              Seus votos estão registrados junto ao número da sua unidade e podem
              ser conferidos no resultado da assembleia.
            </p>
          )}

          <button
            type="button"
            onClick={() => router.push(`/resultados/${assembleiaId}`)}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition"
          >
            Acompanhar resultados
          </button>
        </div>
      </main>
    );
  }

  if (!proposta) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <p className="text-gray-400">Nenhuma proposta pendente.</p>
      </main>
    );
  }

  const progresso = total > 0 ? Math.round((numVotadas / total) * 100) : 0;

  return (
    <main className="min-h-screen py-8 px-4">
      <div className="max-w-xl mx-auto">
        <div className="mb-6">
          <div className="flex justify-between items-start gap-3 mb-3">
            <div>
              <h1 className="text-xl font-bold text-white">{assembleia?.titulo}</h1>
              <p className="text-gray-500 text-xs mt-1">
                Unidade {numero} · {numVotadas} de {total} votada(s)
              </p>
            </div>
            {assembleia?.modo && <SeloModo modo={assembleia.modo} compacto />}
          </div>

          <div
            className="w-full bg-gray-700 rounded-full h-2"
            role="progressbar"
            aria-valuenow={progresso}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progresso da votação"
          >
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progresso}%` }}
            />
          </div>
        </div>

        {erro && (
          <div
            role="alert"
            className="mb-4 p-3 bg-red-900/30 text-red-300 rounded-lg text-sm border border-red-800"
          >
            {erro}
          </div>
        )}

        {aviso && (
          <div className="mb-4 p-3 bg-amber-900/20 text-amber-200 rounded-lg text-sm border border-amber-800/60">
            {aviso}
          </div>
        )}

        <div className="bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-700">
          <p className="text-xs text-gray-500 mb-1">
            Proposta {indiceAtual + 1} de {total}
          </p>
          <h2 className="text-xl font-semibold text-white mb-2">{proposta.titulo}</h2>
          {proposta.descricao && (
            <p className="text-gray-400 mb-6 whitespace-pre-line">{proposta.descricao}</p>
          )}

          <fieldset className="space-y-3 mb-6" disabled={enviando}>
            <legend className="sr-only">Escolha uma opção</legend>
            {proposta.opcoes.map((opcao) => (
              <label
                key={opcao}
                className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition ${
                  opcaoSelecionada === opcao
                    ? 'border-blue-500 bg-blue-900/20'
                    : 'border-gray-700 hover:border-gray-600 hover:bg-gray-700/50'
                }`}
              >
                <input
                  type="radio"
                  name={`proposta-${proposta.id}`}
                  value={opcao}
                  checked={opcaoSelecionada === opcao}
                  onChange={() => selecionar(opcao)}
                  disabled={enviando}
                  className="mr-3 h-5 w-5 accent-blue-600"
                />
                <span className="text-gray-200 font-medium">{opcao}</span>
              </label>
            ))}
          </fieldset>

          {selada && (
            <p className="flex items-start gap-2 text-xs text-indigo-300/80 mb-5 leading-relaxed">
              <span className="mt-0.5 shrink-0"><IconeCadeado tamanho={14} /></span>
              Este voto será cifrado antes de ser gravado. O conteúdo não fica
              legível no banco de dados, e você receberá um recibo para conferi-lo
              depois.
            </p>
          )}

          <div className="flex gap-3">
            {mostrarConfirmacao ? (
              <>
                <button
                  type="button"
                  onClick={confirmarVoto}
                  disabled={enviando || !opcaoSelecionada}
                  className={`flex-1 py-3 rounded-lg font-semibold transition ${
                    enviando || !opcaoSelecionada
                      ? 'bg-gray-700 cursor-not-allowed text-gray-400'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  {enviando ? 'Enviando…' : 'Confirmar voto'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpcaoSelecionada('');
                    setMostrarConfirmacao(false);
                  }}
                  disabled={enviando}
                  className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition disabled:opacity-60"
                >
                  Alterar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={pularProposta}
                disabled={enviando || pendentes.length <= 1}
                title={pendentes.length <= 1 ? 'Esta é a última proposta pendente.' : undefined}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Pular proposta
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 text-center space-y-3">
          {pendentes.length > 1 && (
            <p className="text-xs text-gray-500">
              Restam {pendentes.length} propostas para você votar.
            </p>
          )}
          <button
            type="button"
            onClick={sairDaVotacao}
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 underline underline-offset-4"
          >
            <IconeSair tamanho={14} />
            Sair da votação
          </button>
          <p className="text-xs text-gray-600 max-w-sm mx-auto leading-relaxed">
            Se você sair agora, a unidade ficará reservada por alguns minutos antes
            de poder ser retomada em outro aparelho.
          </p>
        </div>
      </div>

      {confirmandoPular && proposta && (
        <ModalConfirmacao
          titulo="Pular esta proposta?"
          consequencia={
            `Nenhum voto será registrado para "${proposta.titulo}".\n\n`
            + 'A votação seguirá para a próxima proposta pendente. Enquanto a '
            + 'assembleia estiver aberta e você ainda não tiver votado em todas, '
            + 'esta proposta continua pendente e pode ser respondida depois.'
          }
          rotuloConfirmar="Pular sem votar"
          rotuloCancelar="Voltar e votar"
          aoConfirmar={confirmarPulo}
          aoFechar={() => setConfirmandoPular(false)}
        />
      )}
    </main>
  );
}
