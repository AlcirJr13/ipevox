"use client";

/**
 * ipevox — Leitura de votos individuais (administrador do sistema)
 * =============================================================================
 * Esta é a tela mais sensível do sistema: ela expõe como cada unidade votou.
 * Três decisões de projeto merecem explicação, porque não são óbvias:
 *
 *  1. Só o ADMINISTRADOR DO SISTEMA enxerga esta tela. O síndico administra a
 *     assembleia, mas não identifica votos — é essa separação que sustenta a
 *     promessa feita ao morador. A restrição real está nas regras do Firestore
 *     (a coleção `/votos` nega a leitura a todo o resto); esconder o botão aqui
 *     só evita oferecer uma ação que seria negada pelas regras.
 *  2. A finalidade é pedida antes de revelar os votos. Não há servidor para
 *     gravá-la: o campo é um compromisso explícito do operador, não um registro
 *     permanente. Isso está dito na própria tela.
 *  3. O resultado da leitura vive apenas em `useState`. Ele nunca vai para
 *     `localStorage`/`sessionStorage`: é dado sensível e efêmero.
 *
 * LIMITAÇÃO REGISTRADA NO README: o espelho usado para apurar
 * (`/votos_contagem`) é legível pelos operadores e vincula a opção ao número da
 * unidade. Ou seja, esta tela não é a única via de identificação — o modelo não
 * garante sigilo perante o operador. Ver a seção "Limitações conhecidas".
 */

import { abrirVotos, listarAuditoria } from '@/lib/api';
import { PainelComBarra } from '@/components/BarraLateral';
import { useExigirAdmin } from '@/lib/auth';
import { escutarAssembleias, escutarPropostas } from '@/lib/data';
import { MODOS, ROTULOS_MODO, formatarData, formatarDataHora } from '@/lib/schema';
import { IconeAlerta, IconeCadeado, IconeCadeadoAberto, IconeEscudo, IconeOlho } from '@/components/Icones';
import { Modal } from '@/components/Modais';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const LIMITE_FINALIDADE = 500;

/** Placeholder que ensina o que escrever: uma finalidade útil cita o processo. */
const PLACEHOLDER_FINALIDADE =
  'Ex.: conferência do resultado, impugnação, determinação judicial';

/** Escapa um campo para CSV com separador `;`: aspas duplicadas e célula citada. */
function escaparCsv(valor) {
  const texto = String(valor ?? '');
  if (texto.includes('"') || texto.includes(';') || texto.includes('\n') || texto.includes('\r')) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

/** Compara números de unidade como números, não como texto ("10" depois de "9"). */
function compararUnidades(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), 'pt-BR', { numeric: true });
}

export default function Auditoria() {
  const router = useRouter();
  const { autorizado, ehSuperAdmin } = useExigirAdmin(router);

  // ---------------------------------------------------------------------------
  // Assembleias e propostas (para os seletores)
  // ---------------------------------------------------------------------------
  const [assembleias, setAssembleias] = useState([]);
  const [carregandoAssembleias, setCarregandoAssembleias] = useState(true);
  const [erroAssembleias, setErroAssembleias] = useState('');

  // As propostas ficam num MAPA por assembleia, e não numa lista única. O motivo
  // é evitar setState dentro do corpo do efeito (regra
  // `react-hooks/set-state-in-effect`, que dispara renders em cascata): trocar de
  // assembleia não precisa limpar nada — a lista da assembleia anterior
  // simplesmente não é a chave consultada.
  const [propostasPorAssembleia, setPropostasPorAssembleia] = useState({});
  const [erroPropostasPorAssembleia, setErroPropostasPorAssembleia] = useState({});

  const [assembleiaId, setAssembleiaId] = useState('');
  const [propostaId, setPropostaId] = useState('');
  const [finalidade, setFinalidade] = useState('');

  /** Propostas da assembleia selecionada. Vazio enquanto o listener não responde. */
  const propostas = assembleiaId ? (propostasPorAssembleia[assembleiaId] ?? []) : [];
  const erroPropostas = assembleiaId ? Boolean(erroPropostasPorAssembleia[assembleiaId]) : false;
  const carregandoPropostas = Boolean(assembleiaId)
    && !erroPropostas
    && propostasPorAssembleia[assembleiaId] === undefined;

  // ---------------------------------------------------------------------------
  // Leitura dos votos
  // ---------------------------------------------------------------------------
  const [aConfirmar, setAConfirmar] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  const [erroAbertura, setErroAbertura] = useState('');
  const [resultado, setResultado] = useState(null);

  /** Aviso honesto sobre o registro de leitura (que este modelo não possui). */
  const [avisoLeitura, setAvisoLeitura] = useState('');

  const assembleiaSelecionada = assembleias.find((a) => (a.docId ?? a.id) === assembleiaId) ?? null;
  const modoAberto = assembleiaSelecionada?.modo === MODOS.ABERTA;

  // Lista de assembleias em tempo real. A falha vai para a tela: uma lista vazia
  // sem explicação não distingue "não há assembleia" de "perdi permissão".
  useEffect(() => {
    if (!autorizado) return undefined;

    // `carregandoAssembleias` já nasce `true`: repetir o setState aqui só
    // causaria render em cascata (regra `react-hooks/set-state-in-effect`).
    const cancelar = escutarAssembleias(
      'todas',
      (lista) => {
        setAssembleias(lista);
        setErroAssembleias('');
        setCarregandoAssembleias(false);
      },
      () => {
        setAssembleias([]);
        setErroAssembleias(
          'Não foi possível carregar as assembleias. Verifique sua conexão e se '
          + 'a sua conta ainda tem permissão de operador.'
        );
        setCarregandoAssembleias(false);
      }
    );

    return cancelar;
  }, [autorizado]);

  // Propostas da assembleia escolhida. A proposta é opcional na leitura: serve
  // para filtrar a tabela de resultado.
  useEffect(() => {
    if (!autorizado || !assembleiaId) return undefined;

    const cancelar = escutarPropostas(
      assembleiaId,
      (lista) => {
        setPropostasPorAssembleia((anterior) => ({ ...anterior, [assembleiaId]: lista }));
        setErroPropostasPorAssembleia((anterior) => ({ ...anterior, [assembleiaId]: false }));
      },
      () => {
        // Segue sendo possível ler todas as propostas de uma vez; o que não pode
        // é o seletor parecer vazio sem que o operador saiba o motivo.
        setPropostasPorAssembleia((anterior) => ({ ...anterior, [assembleiaId]: [] }));
        setErroPropostasPorAssembleia((anterior) => ({ ...anterior, [assembleiaId]: true }));
      }
    );

    return cancelar;
  }, [assembleiaId, autorizado]);

  // Explica a ausência de um registro de leitura, lendo a mensagem da própria
  // API (fonte única) em vez de repetir o texto na tela.
  useEffect(() => {
    if (!autorizado) return undefined;

    let ativo = true;
    listarAuditoria()
      .then((resposta) => {
        if (ativo) setAvisoLeitura(resposta?.motivo ?? '');
      })
      .catch(() => {
        if (ativo) setAvisoLeitura('');
      });

    return () => { ativo = false; };
  }, [autorizado]);

  function trocarAssembleia(novoId) {
    setAssembleiaId(novoId);
    setPropostaId('');
    // O resultado pertence à assembleia consultada: manter na tela após trocar
    // o seletor misturaria votos de assembleias diferentes.
    setResultado(null);
    setErroAbertura('');
  }

  const finalidadeLimpa = finalidade.trim();
  const podeAbrir = Boolean(assembleiaId) && Boolean(finalidadeLimpa) && !abrindo;

  async function confirmarAbertura() {
    setAbrindo(true);
    setErroAbertura('');

    try {
      const resposta = await abrirVotos({ assembleiaId, finalidade: finalidadeLimpa });
      setResultado(resposta);
      setAConfirmar(false);
    } catch (falha) {
      setAConfirmar(false);
      setErroAbertura(falha.message);
    } finally {
      setAbrindo(false);
    }
  }

  const tituloPorProposta = new Map(propostas.map((p) => [p.id, p.titulo]));
  const cedulas = (resultado?.cedulas ?? [])
    .filter((c) => !propostaId || c.propostaId === propostaId)
    .map((c) => ({
      ...c,
      propostaTitulo: tituloPorProposta.get(c.propostaId) ?? c.propostaId ?? '—',
    }))
    .sort((a, b) => compararUnidades(a.numero, b.numero));
  const totalCedulas = cedulas.length;

  /**
   * CSV gerado no cliente: os votos lidos não passam por nenhum servidor de
   * arquivo, e o operador leva o relatório para anexar ao processo.
   * `;` porque é o separador que o Excel em português espera; `\uFEFF` porque sem
   * o BOM o Excel lê os acentos errado.
   */
  function baixarCsv() {
    if (totalCedulas === 0) return;

    const linhas = [
      ['unidade', 'proposta', 'voto', 'registrado_em'].join(';'),
      ...cedulas.map((c) => [
        escaparCsv(c.numero),
        escaparCsv(c.propostaTitulo),
        escaparCsv(c.opcao),
        escaparCsv(formatarDataHora(c.criadoEm)),
      ].join(';')),
    ];

    const conteudo = `\uFEFF${linhas.join('\r\n')}`;
    const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const ancora = document.createElement('a');
    ancora.href = url;
    ancora.download = `votos-individuais-${resultado?.assembleiaId ?? assembleiaId ?? 'todas'}.csv`;
    document.body.appendChild(ancora);
    ancora.click();
    ancora.remove();

    // Revoga depois do clique: liberar a URL antes do navegador iniciar o
    // download cancelaria o próprio arquivo que o operador acabou de pedir.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  if (!autorizado) {
    return <p className="text-gray-400 text-center py-12">Verificando acesso…</p>;
  }

  return (
    <PainelComBarra largura="max-w-6xl">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-3xl font-bold text-white">
          <IconeEscudo tamanho={28} />
          Votos individuais
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          {assembleias.length} assembleia(s) na base · leitura restrita ao administrador do sistema
        </p>
      </div>

      {/* ===================================================================
          Seção A — Ler votos individuais

          Visível apenas para o ADMINISTRADOR DO SISTEMA.
          O síndico administra a assembleia, mas não identifica votos: essa
          separação é o que dá sentido à promessa de sigilo feita ao morador.
          A restrição real está nas regras do Firestore (`/votos` nega a todo o
          resto); esconder aqui só evita oferecer um botão que seria negado.
          =================================================================== */}
      {ehSuperAdmin ? (
        <>
          <section className="bg-gray-800 border border-gray-700 rounded-2xl p-6 mb-8">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-white mb-2">
              <IconeCadeadoAberto tamanho={20} />
              Ler votos individuais
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              Aqui os votos da assembleia são exibidos <strong>com unidade e autor</strong>.
              Isso só é permitido ao administrador do sistema; o síndico e os
              moradores não têm acesso a esta leitura.
            </p>

            {erroAssembleias && (
              <div
                role="alert"
                className="mb-6 p-4 bg-red-900/30 border border-red-800 text-red-300 rounded-xl flex items-start justify-between gap-4"
              >
                <span className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-red-400"><IconeAlerta tamanho={16} /></span>
                  <span>{erroAssembleias}</span>
                </span>
                <button
                  onClick={() => setErroAssembleias('')}
                  aria-label="Fechar aviso de erro das assembleias"
                  className="text-red-400 hover:text-red-200 underline shrink-0"
                >
                  fechar
                </button>
              </div>
            )}

            {erroAbertura && (
              <div
                role="alert"
                className="mb-6 p-4 bg-red-900/30 border border-red-800 text-red-300 rounded-xl flex items-start justify-between gap-4"
              >
                <span className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-red-400"><IconeAlerta tamanho={16} /></span>
                  <span>{erroAbertura}</span>
                </span>
                <button
                  onClick={() => setErroAbertura('')}
                  aria-label="Fechar aviso de erro da leitura"
                  className="text-red-400 hover:text-red-200 underline shrink-0"
                >
                  fechar
                </button>
              </div>
            )}

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label
                  htmlFor="auditoria-assembleia"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  Assembleia *
                </label>
                <select
                  id="auditoria-assembleia"
                  value={assembleiaId}
                  onChange={(e) => trocarAssembleia(e.target.value)}
                  disabled={carregandoAssembleias}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60"
                >
                  <option value="">
                    {carregandoAssembleias ? 'Carregando assembleias…' : 'Selecione uma assembleia'}
                  </option>
                  {!carregandoAssembleias && assembleias.length === 0 && (
                    <option value="" disabled>
                      Nenhuma assembleia disponível
                    </option>
                  )}
                  {assembleias.map((a) => {
                    const id = a.docId ?? a.id;
                    return (
                      <option key={id} value={id}>
                        {a.titulo} — {formatarData(a.criadoEm)} —{' '}
                        {ROTULOS_MODO[a.modo] ?? a.modo ?? 'modo não informado'}
                      </option>
                    );
                  })}
                </select>

                {assembleiaSelecionada && (
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${assembleiaSelecionada.modo === MODOS.FECHADA
                        ? 'bg-indigo-900/50 text-indigo-200 border-indigo-700'
                        : 'bg-blue-900/50 text-blue-200 border-blue-700'
                        }`}
                    >
                      {assembleiaSelecionada.modo === MODOS.FECHADA
                        ? <IconeCadeado tamanho={13} />
                        : <IconeOlho tamanho={13} />}
                      {ROTULOS_MODO[assembleiaSelecionada.modo] ?? 'Modo não informado'}
                    </span>
                    <span className="text-gray-500 text-xs">
                      Criada em {formatarData(assembleiaSelecionada.criadoEm)}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label
                  htmlFor="auditoria-proposta"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  Proposta (opcional)
                </label>
                <select
                  id="auditoria-proposta"
                  value={propostaId}
                  onChange={(e) => setPropostaId(e.target.value)}
                  disabled={!assembleiaId || carregandoPropostas}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60"
                >
                  <option value="">Todas as propostas</option>
                  {propostas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.titulo}
                    </option>
                  ))}
                </select>
                <p className="text-gray-500 text-xs mt-3">
                  {!assembleiaId
                    ? 'Escolha uma assembleia para listar as propostas.'
                    : erroPropostas
                      ? 'Não foi possível carregar as propostas desta assembleia. Você '
                        + 'ainda pode ler todos os votos de uma vez.'
                      : carregandoPropostas
                        ? 'Carregando propostas…'
                        : `${propostas.length} proposta(s). A leitura traz os votos da assembleia; `
                          + 'a proposta apenas filtra o que é exibido.'}
                </p>
              </div>
            </div>

            {/* Aviso de votação aberta: o voto já é atribuível e público, então a
                leitura não revela nada novo — mas continua permitida por
                consistência. */}
            {modoAberto && (
              <div className="mt-6 p-4 bg-amber-900/30 border border-amber-700 text-amber-200 rounded-xl text-sm">
                <p className="font-semibold mb-1">Votação aberta</p>
                <p>
                  Nesta assembleia os votos já são atribuíveis e públicos: qualquer
                  participante vê quem votou o quê. Esta tela serve para conferência,
                  não para revelar algo novo.
                </p>
              </div>
            )}

            <div className="mt-6">
              <label
                htmlFor="auditoria-finalidade"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                Finalidade da leitura *
              </label>
              <textarea
                id="auditoria-finalidade"
                value={finalidade}
                onChange={(e) => setFinalidade(e.target.value.slice(0, LIMITE_FINALIDADE))}
                rows={3}
                maxLength={LIMITE_FINALIDADE}
                placeholder={PLACEHOLDER_FINALIDADE}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              />
              <div className="flex flex-wrap justify-between gap-2 mt-2">
                <p className="text-gray-500 text-xs">
                  Este sistema não grava a finalidade: sem servidor, não há registro
                  permanente. O campo existe para exigir uma justificativa explícita
                  antes de revelar os votos.
                </p>
                <span className="text-gray-500 text-xs shrink-0">
                  {finalidade.length}/{LIMITE_FINALIDADE}
                </span>
              </div>
            </div>

            <button
              onClick={() => setAConfirmar(true)}
              disabled={!podeAbrir}
              className={`mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition ${podeAbrir
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
            >
              <IconeCadeadoAberto tamanho={17} />
              {abrindo ? 'Lendo…' : 'Ler votos individuais'}
            </button>
          </section>

          {/* Resultado da leitura: efêmero, só em memória, some ao recarregar. */}
          {resultado && (
            <section className="bg-gray-800 border border-gray-700 rounded-2xl p-6 mb-8">
              <div className="mb-6 p-4 bg-green-900/30 border border-green-800 text-green-200 rounded-xl">
                <p className="font-semibold">Votos lidos.</p>
                <p className="text-sm mt-1 text-green-300">
                  {resultado.titulo} · {ROTULOS_MODO[resultado.modo] ?? (resultado.modo || '—')} ·
                  somente nesta tela, não gravados.
                </p>
              </div>

              <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
                <p className="text-white font-semibold">{totalCedulas} voto(s) exibido(s)</p>
                <button
                  onClick={baixarCsv}
                  disabled={totalCedulas === 0}
                  aria-label="Baixar o resultado da leitura em CSV"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${totalCedulas === 0
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                >
                  ⬇️ Baixar CSV
                </button>
              </div>

              {totalCedulas === 0 ? (
                <p className="text-gray-400 text-sm">
                  Nenhum voto retornado para este escopo.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 text-left border-b border-gray-700">
                        <th scope="col" className="py-3 pr-4 font-medium">Unidade</th>
                        <th scope="col" className="py-3 pr-4 font-medium">Proposta</th>
                        <th scope="col" className="py-3 pr-4 font-medium">Voto</th>
                        <th scope="col" className="py-3 font-medium">Registrado em</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700/50">
                      {cedulas.map((c) => (
                        <tr key={c.votoId} className="text-gray-200">
                          <td className="py-3 pr-4 font-mono font-semibold">{c.numero ?? '—'}</td>
                          <td className="py-3 pr-4">{c.propostaTitulo ?? '—'}</td>
                          <td className="py-3 pr-4 font-semibold">{c.opcao ?? '—'}</td>
                          <td className="py-3 text-gray-400">{formatarDataHora(c.criadoEm)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      ) : (
        /* Sem ser super admin, a seção inteira dá lugar a esta explicação. Um
           formulário de leitura visível mas sempre negado seria pior que a
           ausência dele: pareceria defeito. */
        <section className="bg-gray-800 border border-gray-700 rounded-2xl p-6 mb-8">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-white mb-2">
            <IconeCadeado tamanho={20} />
            Identificação de votos
          </h2>
          <p className="text-gray-300 text-sm leading-relaxed mb-3">
            Você administra as assembleias e vê o <strong>resultado</strong> —
            totais, quórum e o relatório da ata. A leitura do voto individual, com
            unidade e autor, é restrita ao administrador do sistema.
          </p>
          <p className="text-gray-500 text-xs leading-relaxed">
            Essa separação é o que sustenta o sigilo perante o morador: quem
            organiza a votação não lê o voto individual na interface do sistema. Se
            for necessário identificar votos — por determinação judicial, por
            exemplo — procure o administrador do sistema.
          </p>
        </section>
      )}

      {/* ===================================================================
          Seção B — Registro de leitura
          =================================================================== */}
      <section className="bg-gray-800 border border-gray-700 rounded-2xl p-6">
        <h2 className="text-xl font-semibold text-white mb-2">Registro de leitura</h2>
        <p className="text-gray-400 text-sm">
          {avisoLeitura
            || 'Este sistema não mantém um registro de eventos de leitura.'}
        </p>
      </section>

      {aConfirmar && (
        <Modal
          aoFechar={() => {
            if (!abrindo) setAConfirmar(false);
          }}
          rotulo="Confirmar leitura dos votos individuais"
          larguraMaxima="max-w-lg"
        >
          <div className="flex justify-center mb-4 text-amber-400">
            <IconeCadeadoAberto tamanho={36} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Ler os votos?</h2>
          <p className="text-gray-300 mb-1">{assembleiaSelecionada?.titulo ?? 'Assembleia'}</p>
          <p className="text-gray-500 text-xs mb-4">
            {assembleiaSelecionada
              ? `${ROTULOS_MODO[assembleiaSelecionada.modo] ?? 'Modo não informado'} · criada em `
                + `${formatarData(assembleiaSelecionada.criadoEm)}`
              : 'Modo da assembleia não informado.'}
          </p>

          <div className="bg-red-900/20 border border-red-900 text-red-200 rounded-xl p-4 text-sm mb-6 space-y-3">
            <p>
              Os votos serão exibidos com unidade e autor apenas nesta tela. Eles
              <strong> não são gravados</strong> em lugar nenhum.
            </p>
            <p>
              Escopo:{' '}
              <strong>
                {propostaId
                  ? (propostas.find((p) => p.id === propostaId)?.titulo ?? 'proposta selecionada')
                  : 'todas as propostas'}
              </strong>
            </p>
            <p className="break-words">
              Finalidade: <strong>{finalidadeLimpa}</strong>
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setAConfirmar(false)}
              disabled={abrindo}
              className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={confirmarAbertura}
              disabled={abrindo}
              className={`flex-1 py-3 rounded-lg font-semibold transition ${abrindo
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-amber-600 hover:bg-amber-700 text-white'
                }`}
            >
              {abrindo ? 'Lendo…' : 'Confirmar leitura'}
            </button>
          </div>
        </Modal>
      )}
    </PainelComBarra>
  );
}
