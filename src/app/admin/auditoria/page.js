"use client";

/**
 * ipevox — Auditoria (trilha + abertura de votos selados)
 * =============================================================================
 * Esta é a tela mais sensível do sistema: ela concentra o poder de ler votos que
 * foram gravados cifrados e o dever de deixar rastro disso. Três decisões de
 * projeto merecem explicação, porque não são óbvias:
 *
 *  1. Nada aqui lê a coleção `votos` diretamente pelo Firestore. Em votação
 *     fechada o documento contém apenas criptograma (AES-256-GCM), e as regras
 *     negam a leitura de qualquer forma. A única via é a Cloud Function
 *     `abrirVotos`, que exige síndico e grava um evento na trilha.
 *  2. A finalidade é obrigatória. Sem ela, o registro diria "alguém leu", não
 *     "por que leu" — e um poder de leitura sem justificativa é indistinguível
 *     de abuso. É a finalidade que transforma o recurso em procedimento
 *     defensável em uma impugnação judicial.
 *  3. O resultado da abertura vive apenas em `useState`. Ele nunca vai para
 *     `localStorage`/`sessionStorage`: é dado sensível, efêmero, e deixá-lo
 *     gravado no navegador criaria uma cópia dos votos fora da trilha auditada.
 */

import { abrirVotos, listarAuditoria } from '@/lib/api';
import { PainelComBarra } from '@/components/BarraLateral';
import { useExigirAdmin } from '@/lib/auth';
import { escutarAssembleias, escutarPropostas } from '@/lib/data';
import { ACOES_AUDITORIA, MODOS, ROTULOS_MODO, formatarData, formatarDataHora } from '@/lib/schema';
import { IconeAlerta, IconeCadeado, IconeCadeadoAberto, IconeEscudo, IconeOlho } from '@/components/Icones';
import { Modal } from '@/components/Modais';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

const LIMITE_FINALIDADE = 500;
const LIMITE_EVENTOS = 300;

/** Placeholder que ensina o que escrever: uma finalidade útil cita o processo. */
const PLACEHOLDER_FINALIDADE =
  'Ex.: determinação judicial, processo nº 0000000-00.0000.8.26.0000';

/**
 * Rótulo e cor de cada ação da trilha. O evento de abertura de votos é o mais
 * importante desta tela e por isso recebe âmbar e negrito — ele é o único que
 * representa alguém tendo lido conteúdo que deveria estar selado.
 */
const ACOES = {
  [ACOES_AUDITORIA.ASSEMBLEIA_CRIADA]: {
    rotulo: 'Assembleia criada',
    classe: 'bg-blue-900/50 text-blue-200 border-blue-700',
    destaque: false,
  },
  [ACOES_AUDITORIA.ASSEMBLEIA_ENCERRADA]: {
    rotulo: 'Assembleia encerrada',
    classe: 'bg-red-900/50 text-red-200 border-red-800',
    destaque: false,
  },
  [ACOES_AUDITORIA.CHECKIN]: {
    rotulo: 'Check-in de unidade',
    classe: 'bg-gray-700 text-gray-300 border-gray-600',
    destaque: false,
  },
  [ACOES_AUDITORIA.VOTO_REGISTRADO]: {
    rotulo: 'Voto registrado',
    classe: 'bg-green-900/50 text-green-300 border-green-800',
    destaque: false,
  },
  [ACOES_AUDITORIA.VOTOS_ABERTOS]: {
    rotulo: 'VOTOS ABERTOS PELO ADMINISTRADOR',
    classe: 'bg-amber-900/60 text-amber-200 border-amber-600 font-bold',
    destaque: true,
  },
  [ACOES_AUDITORIA.SINDICO_CRIADO]: {
    rotulo: 'Acesso de síndico criado',
    classe: 'bg-indigo-900/50 text-indigo-200 border-indigo-700',
    destaque: false,
  },
  [ACOES_AUDITORIA.SINDICO_REMOVIDO]: {
    rotulo: 'Acesso de síndico revogado',
    classe: 'bg-red-900/50 text-red-300 border-red-800',
    destaque: false,
  },
  [ACOES_AUDITORIA.SUPER_ADMIN_DEFINIDO]: {
    rotulo: 'Administrador do sistema definido',
    classe: 'bg-purple-900/60 text-purple-200 border-purple-600',
    destaque: true,
  },
  [ACOES_AUDITORIA.ADMIN_DEFINIDO]: {
    rotulo: 'Síndico provisionado',
    classe: 'bg-purple-900/50 text-purple-200 border-purple-700',
    destaque: false,
  },
  [ACOES_AUDITORIA.CATALOGO_ALTERADO]: {
    rotulo: 'Catálogo de unidades alterado',
    classe: 'bg-gray-700 text-gray-300 border-gray-600',
    destaque: false,
  },
};

/** A string literal que o servidor grava no lugar da opção em votação fechada. */
const OPCAO_SELADA = '[selado]';

/** Linha de campo dentro do painel de detalhes de um evento. */
function Campo({ nome, children, tom = 'text-gray-200' }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <span className="text-gray-500">{nome}:</span>
      <span className={`break-words ${tom}`}>{children}</span>
    </div>
  );
}

/**
 * A implementação do modal foi consolidada em `@/components/Modais`.
 *
 * Havia três cópias quase idênticas dela (histórico, unidades e auditoria),
 * criadas em paralelo durante a migração das telas. Uma focava o painel, outra
 * focava o primeiro botão e a terceira não focava nada. Agora a regra é única.
 *
 * O modal existe em vez de `window.confirm` porque o diálogo nativo ignora o
 * tema escuro e não permite mostrar a finalidade que será gravada na trilha. Em
 * uma ação que deixa registro permanente, a confirmação precisa ser explícita.
 */

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

/**
 * Alguns eventos gravam os campos diretamente em `detalhes`; outros (versões
 * anteriores, ou o envelope `{ detalhes: {...} }`) aninham um nível. Achatar aqui
 * evita que a UI dependa de qual formato o servidor produziu.
 */
function achatarDetalhes(evento) {
  const bruto = evento?.detalhes;
  if (!bruto || typeof bruto !== 'object') return {};
  const aninhado = bruto.detalhes;
  if (aninhado && typeof aninhado === 'object') return { ...bruto, ...aninhado };
  return bruto;
}

/** Converte um valor desconhecido em texto exibível, sem quebrar a renderização. */
function texto(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  if (Array.isArray(valor)) return valor.map((v) => texto(v)).filter(Boolean).join(', ');
  return JSON.stringify(valor);
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
  // Abertura de votos
  // ---------------------------------------------------------------------------
  const [aConfirmar, setAConfirmar] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  const [erroAbertura, setErroAbertura] = useState('');
  const [resultado, setResultado] = useState(null);

  // ---------------------------------------------------------------------------
  // Trilha de auditoria
  // ---------------------------------------------------------------------------
  const [eventos, setEventos] = useState([]);
  const [carregandoTrilha, setCarregandoTrilha] = useState(true);
  const [erroTrilha, setErroTrilha] = useState('');

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
          + 'a sua conta ainda tem permissão de síndico.'
        );
        setCarregandoAssembleias(false);
      }
    );

    return cancelar;
  }, [autorizado]);

  // Propostas da assembleia escolhida. A proposta é opcional na abertura, mas
  // refinar por ela é o único jeito de ler além do limite de cédulas.
  //
  // O estado guarda um MAPA por assembleia (e não uma lista única) de propósito:
  // assim a troca de assembleia não precisa limpar nada dentro do efeito, e a
  // lista antiga simplesmente não aparece porque pertence a outra chave. Sem
  // isso, seria necessário chamar setState no corpo do efeito, o que dispara
  // renders em cascata (regra `react-hooks/set-state-in-effect`).
  useEffect(() => {
    if (!autorizado || !assembleiaId) return undefined;

    const cancelar = escutarPropostas(
      assembleiaId,
      (lista) => {
        setPropostasPorAssembleia((anterior) => ({ ...anterior, [assembleiaId]: lista }));
        setErroPropostasPorAssembleia((anterior) => ({ ...anterior, [assembleiaId]: false }));
      },
      () => {
        // Segue sendo possível abrir todas as propostas de uma vez; o que não
        // pode é o seletor parecer vazio sem que o síndico saiba o motivo.
        setPropostasPorAssembleia((anterior) => ({ ...anterior, [assembleiaId]: [] }));
        setErroPropostasPorAssembleia((anterior) => ({ ...anterior, [assembleiaId]: true }));
      }
    );

    return cancelar;
  }, [assembleiaId, autorizado]);

  const recarregarTrilha = useCallback(async () => {
    if (!autorizado) return;

    setCarregandoTrilha(true);
    setErroTrilha('');

    try {
      // `assembleiaId` nulo traz a trilha inteira: é o que permite auditar o
      // sistema como um todo, inclusive aberturas de assembleias já excluídas.
      const resposta = await listarAuditoria({
        assembleiaId: assembleiaId || null,
        limite: LIMITE_EVENTOS,
      });
      setEventos(resposta?.eventos ?? []);
    } catch (falha) {
      setEventos([]);
      setErroTrilha(falha.message);
    } finally {
      setCarregandoTrilha(false);
    }
  }, [assembleiaId, autorizado]);

  // Carrega a trilha na primeira renderização autorizada e sempre que o filtro
  // de assembleia muda — mas não quando `recarregarTrilha` muda de identidade
  // por outro motivo, o que provocaria uma segunda busca idêntica.
  const trilhaCarregadaPara = useRef(null);
  useEffect(() => {
    if (!autorizado) return;
    if (trilhaCarregadaPara.current === assembleiaId) return;
    trilhaCarregadaPara.current = assembleiaId;
    recarregarTrilha();
  }, [assembleiaId, autorizado, recarregarTrilha]);

  function trocarAssembleia(novoId) {
    setAssembleiaId(novoId);
    setPropostaId('');
    // O resultado pertence à assembleia consultada: manter na tela após trocar
    // o seletor misturaria cédulas de assembleias diferentes.
    setResultado(null);
    setErroAbertura('');
  }

  const finalidadeLimpa = finalidade.trim();
  const podeAbrir = Boolean(assembleiaId) && Boolean(finalidadeLimpa) && !abrindo;

  async function confirmarAbertura() {
    setAbrindo(true);
    setErroAbertura('');

    try {
      const resposta = await abrirVotos({
        assembleiaId,
        // Proposta nula significa "todas as propostas da assembleia".
        propostaId: propostaId || null,
        finalidade: finalidadeLimpa,
      });
      setResultado(resposta);
      setAConfirmar(false);
      // A própria abertura gerou um evento novo: a trilha precisa refletir isso.
      await recarregarTrilha();
    } catch (falha) {
      setAConfirmar(false);
      setErroAbertura(falha.message);
    } finally {
      setAbrindo(false);
    }
  }

  const cedulas = resultado?.cedulas ? [...resultado.cedulas].sort((a, b) => compararUnidades(a.numero, b.numero)) : [];
  const totalCedulas = cedulas.length;
  const aberturasRegistradas = eventos.filter(
    (e) => e.acao === ACOES_AUDITORIA.VOTOS_ABERTOS
  ).length;

  /**
   * CSV gerado no cliente: os votos abertos não passam por nenhum servidor de
   * arquivo, e o síndico leva o relatório para anexar ao processo.
   * `;` porque é o separador que o Excel em português espera; `\uFEFF` porque sem
   * o BOM o Excel lê os acentos errado.
   */
  function baixarCsv() {
    if (totalCedulas === 0) return;

    const linhas = [
      ['unidade', 'proposta', 'voto', 'selado', 'registrado_em'].join(';'),
      ...cedulas.map((c) => [
        escaparCsv(c.numero),
        escaparCsv(c.propostaTitulo),
        escaparCsv(c.opcao),
        escaparCsv(c.selado ? 'sim' : 'nao'),
        escaparCsv(formatarDataHora(c.criadoEm)),
      ].join(';')),
    ];

    const conteudo = `\uFEFF${linhas.join('\r\n')}`;
    const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const ancora = document.createElement('a');
    ancora.href = url;
    ancora.download = `votos-abertos-${resultado?.assembleiaId ?? assembleiaId ?? 'todas'}.csv`;
    document.body.appendChild(ancora);
    ancora.click();
    ancora.remove();

    // Revoga depois do clique: liberar a URL antes do navegador iniciar o
    // download cancelaria o próprio arquivo que o síndico acabou de pedir.
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
          Auditoria
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          {assembleias.length} assembleia(s) na base · {eventos.length} evento(s) na trilha ·{' '}
          {aberturasRegistradas} abertura(s) de votos
        </p>
      </div>

        {/* ===================================================================
            Seção A — Abrir votos

            Visível apenas para o ADMINISTRADOR DO SISTEMA (super admin).
            O síndico administra a assembleia, mas não identifica votos: essa
            separação é o que dá sentido à promessa de sigilo feita ao morador.
            A restrição real está no servidor (`abrirVotos` exige super admin);
            esconder aqui só evita oferecer um botão que seria negado.
            =================================================================== */}
        {ehSuperAdmin ? (
          <>
            <section className="bg-gray-800 border border-gray-700 rounded-2xl p-6 mb-8">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-white mb-2">
                <IconeCadeadoAberto tamanho={20} />
                Abrir votos
              </h2>
              <p className="text-gray-400 text-sm mb-6">
                Em votação fechada o conteúdo do voto é cifrado e ilegível no banco.
                Esta é a única via de leitura — e cada uso dela fica gravado, com
                autor, data e finalidade.
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
                    aria-label="Fechar aviso de erro da abertura"
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
                      + 'ainda pode abrir todas as propostas de uma vez.'
                    : carregandoPropostas
                      ? 'Carregando propostas…'
                      : `${propostas.length} proposta(s). Limitar a uma proposta é o que permite `
                        + 'ler além do limite de 1000 cédulas por consulta.'}
              </p>
            </div>
          </div>

          {/* Aviso de votação aberta: o voto já é atribuível e público, então a
              abertura não revela nada novo — mas ela continua permitida porque
              bloquear geraria um registro de auditoria ausente onde alguém
              esperava encontrá-lo. */}
          {modoAberto && (
            <div className="mt-6 p-4 bg-amber-900/30 border border-amber-700 text-amber-200 rounded-xl text-sm">
              <p className="font-semibold mb-1">Votação aberta</p>
              <p>
                Nesta assembleia os votos já são atribuíveis e públicos: qualquer
                participante vê quem votou o quê. A leitura continuará sendo
                registrada na trilha, mas ela não é necessária para conhecer os votos.
              </p>
            </div>
          )}

          <div className="mt-6">
            <label
              htmlFor="auditoria-finalidade"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Finalidade da abertura *
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
                Este texto fica gravado permanentemente na trilha de auditoria, junto
                com seu usuário e a data.
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
                {abrindo ? 'Abrindo…' : 'Abrir votos'}
              </button>
            </section>

            {/* Resultado da abertura: efêmero, só em memória, some ao recarregar. */}
            {resultado && (
          <section className="bg-gray-800 border border-gray-700 rounded-2xl p-6 mb-8">
            <div className="mb-6 p-4 bg-green-900/30 border border-green-800 text-green-200 rounded-xl">
              <p className="font-semibold">Leitura registrada na trilha de auditoria.</p>
              <p className="text-sm mt-1 text-green-300">
                {resultado.titulo} · {ROTULOS_MODO[resultado.modo] ?? (resultado.modo || '—')} ·
                finalidade: {resultado.finalidade}
              </p>
            </div>

            {resultado.truncado && (
              <div className="mb-4 p-4 bg-amber-900/30 border border-amber-700 text-amber-200 rounded-xl text-sm">
                ⚠️ Foram lidas apenas as primeiras 1000 cédulas. Refine por proposta
                para ver o restante.
              </div>
            )}

            {resultado.cedulasIlegiveis > 0 && (
              <div className="mb-4 p-4 bg-red-900/30 border border-red-800 text-red-300 rounded-xl text-sm">
                ⚠️ {resultado.cedulasIlegiveis} cédulas não puderam ser decifradas. Isso
                indica adulteração do documento ou troca da chave de criptografia —
                investigue antes de usar este resultado.
              </div>
            )}

            <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
              <p className="text-white font-semibold">{totalCedulas} cédulas lidas</p>
              <button
                onClick={baixarCsv}
                disabled={totalCedulas === 0}
                aria-label="Baixar o resultado da abertura em CSV"
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
                Nenhuma cédula retornada para este escopo. A leitura, ainda assim, foi
                registrada na trilha.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-left border-b border-gray-700">
                      <th scope="col" className="py-3 pr-4 font-medium">Unidade</th>
                      <th scope="col" className="py-3 pr-4 font-medium">Proposta</th>
                      <th scope="col" className="py-3 pr-4 font-medium">Voto</th>
                      <th scope="col" className="py-3 pr-4 font-medium">Selado</th>
                      <th scope="col" className="py-3 font-medium">Registrado em</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {cedulas.map((c) => (
                      <tr key={c.votoId} className="text-gray-200">
                        <td className="py-3 pr-4 font-mono font-semibold">{c.numero ?? '—'}</td>
                        <td className="py-3 pr-4">{c.propostaTitulo ?? '—'}</td>
                        <td className="py-3 pr-4 font-semibold">{c.opcao ?? '—'}</td>
                        <td className="py-3 pr-4 text-gray-400">
                          {c.selado ? 'Sim' : 'Não'}
                        </td>
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
             formulário de abertura visível mas sempre negado seria pior que a
             ausência dele: pareceria defeito. */
          <section className="bg-gray-800 border border-gray-700 rounded-2xl p-6 mb-8">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-white mb-2">
              <IconeCadeado tamanho={20} />
              Identificação de votos
            </h2>
            <p className="text-gray-300 text-sm leading-relaxed mb-3">
              Você administra as assembleias e vê o <strong>resultado</strong> —
              totais, quórum e o relatório da ata. A identificação de como cada
              unidade votou é restrita ao administrador do sistema.
            </p>
            <p className="text-gray-500 text-xs leading-relaxed">
              Essa separação é o que sustenta o sigilo perante o morador: quem
              organiza a votação não consegue descobrir o voto de ninguém. Se for
              necessário identificar votos — por determinação judicial, por exemplo —
              procure o administrador do sistema, que registra a abertura com
              finalidade, autor e data.
            </p>
          </section>
        )}

        {/* ===================================================================
            Seção B — Trilha de auditoria
            =================================================================== */}
        <section className="bg-gray-800 border border-gray-700 rounded-2xl p-6">
          <div className="flex flex-wrap justify-between items-center gap-4 mb-2">
            <h2 className="text-xl font-semibold text-white">📜 Trilha de auditoria</h2>
            <button
              onClick={recarregarTrilha}
              disabled={carregandoTrilha}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${carregandoTrilha
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
                }`}
            >
              {carregandoTrilha ? 'Atualizando…' : 'Atualizar'}
            </button>
          </div>
          <p className="text-gray-400 text-sm mb-6">
            {assembleiaSelecionada
              ? `Eventos de ${assembleiaSelecionada.titulo}, do mais recente para o mais antigo.`
              : `Todos os eventos do sistema, até ${LIMITE_EVENTOS}, do mais recente para o mais antigo.`}
          </p>

          {erroTrilha && (
            <div
              role="alert"
              className="mb-6 p-4 bg-red-900/30 border border-red-800 text-red-300 rounded-xl flex items-start justify-between gap-4"
            >
              <span>⚠️ {erroTrilha}</span>
              <button
                onClick={() => setErroTrilha('')}
                aria-label="Fechar aviso de erro da trilha"
                className="text-red-400 hover:text-red-200 underline shrink-0"
              >
                fechar
              </button>
            </div>
          )}

          {carregandoTrilha ? (
            <p className="text-gray-400 text-center py-8 animate-pulse">Carregando trilha…</p>
          ) : eventos.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Nenhum evento registrado.</p>
          ) : (
            <ul className="space-y-3">
              {eventos.map((evento) => {
                const acao = ACOES[evento.acao];
                const d = achatarDetalhes(evento);
                const opcaoSelada = evento.acao === ACOES_AUDITORIA.VOTO_REGISTRADO
                  && texto(d.opcao) === OPCAO_SELADA;

                return (
                  <li
                    key={evento.id}
                    className={`rounded-xl border p-4 ${acao?.destaque
                      ? 'bg-amber-950/40 border-amber-700'
                      : 'bg-gray-900 border-gray-700'
                      }`}
                  >
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <span
                        className={`px-3 py-1 rounded-full text-xs border ${acao?.classe ?? 'bg-gray-700 text-gray-300 border-gray-600'
                          }`}
                      >
                        {/* Ação desconhecida aparece crua: é melhor ver um código
                            estranho do que esconder um evento do síndico. */}
                        {acao?.rotulo ?? evento.acao ?? 'ação não informada'}
                      </span>
                      <span className="text-gray-400 text-xs">{formatarDataHora(evento.em)}</span>
                    </div>

                    <div className="space-y-1 text-sm">
                      <Campo nome="Assembleia">{evento.assembleiaId ?? '—'}</Campo>
                      <Campo nome="Autor (uid)">{evento.uid ?? '—'}</Campo>

                      {evento.acao === ACOES_AUDITORIA.VOTOS_ABERTOS && (
                        <>
                          <Campo nome="Finalidade" tom="text-amber-200 font-semibold">
                            {texto(d.finalidade) || '—'}
                          </Campo>
                          <Campo nome="Cédulas lidas" tom="text-amber-200">
                            {texto(d.cedulasLidas) || '0'}
                          </Campo>
                          <Campo nome="Proposta aberta">
                            {d.propostaId === 'todas'
                              ? 'Todas as propostas'
                              : texto(d.propostaId) || '—'}
                          </Campo>
                          <Campo nome="Modo da assembleia">
                            {ROTULOS_MODO[d.modo] ?? (texto(d.modo) || '—')}
                          </Campo>
                          {texto(d.cedulasIlegiveis) && (
                            <Campo nome="Cédulas ilegíveis" tom="text-red-300">
                              {texto(d.cedulasIlegiveis)}
                            </Campo>
                          )}
                        </>
                      )}

                      {evento.acao === ACOES_AUDITORIA.ASSEMBLEIA_CRIADA && (
                        <>
                          <Campo nome="Modo">
                            {ROTULOS_MODO[d.modo] ?? (texto(d.modo) || '—')}
                          </Campo>
                          {texto(d.propostas) && (
                            <Campo nome="Propostas">{texto(d.propostas)}</Campo>
                          )}
                          {texto(d.unidadesAptas) && (
                            <Campo nome="Unidades aptas">{texto(d.unidadesAptas)}</Campo>
                          )}
                        </>
                      )}

                      {evento.acao === ACOES_AUDITORIA.ASSEMBLEIA_ENCERRADA && (
                        <>
                          {texto(d.totalVotos) && (
                            <Campo nome="Total de votos">{texto(d.totalVotos)}</Campo>
                          )}
                          {texto(d.votosSelados) && (
                            <Campo nome="Votos selados">{texto(d.votosSelados)}</Campo>
                          )}
                          {texto(d.votosAbertos) && (
                            <Campo nome="Votos abertos">{texto(d.votosAbertos)}</Campo>
                          )}
                          {texto(d.unidadesQueVotaram) && (
                            <Campo nome="Unidades que votaram">
                              {texto(d.unidadesQueVotaram)}
                            </Campo>
                          )}
                        </>
                      )}

                      {evento.acao === ACOES_AUDITORIA.CHECKIN && (
                        <>
                          <Campo nome="Unidade">{texto(d.numero) || '—'}</Campo>
                          {(d.novo === true || d.retomada === true || d.jaVotou === true) && (
                            <Campo nome="Situação">
                              {d.novo === true
                                ? 'primeiro check-in da unidade'
                                : d.retomada === true
                                  ? 'retomada de sessão abandonada'
                                  : 'unidade já havia votado'}
                            </Campo>
                          )}
                        </>
                      )}

                      {evento.acao === ACOES_AUDITORIA.VOTO_REGISTRADO && (
                        <>
                          <Campo nome="Unidade">{texto(d.numero) || '—'}</Campo>
                          <Campo nome="Proposta">{texto(d.propostaId) || '—'}</Campo>
                          {opcaoSelada ? (
                            /*
                             * Em votação fechada o servidor grava a string literal
                             * "[selado]" no lugar da opção. É intencional: registrar
                             * o voto em texto puro na trilha anularia o sigilo que a
                             * criptografia garantiu — a trilha seria o vazamento.
                             * O conteúdo real só aparece na abertura registrada.
                             */
                            /* O bloco fica fora de <Campo> de propósito: é um aviso
                               de várias linhas, não uma linha "rótulo: valor". */
                            <div className="mt-2 p-3 bg-indigo-900/30 border border-indigo-800 text-indigo-200 rounded-lg">
                              <p className="font-semibold">
                                Opção: voto selado (não registrado na auditoria)
                              </p>
                              <p className="text-indigo-300 text-xs mt-1">
                                Intencional. Em votação fechada a trilha não guarda em
                                que se votou, para que ela própria não seja o vazamento
                                do sigilo. Para conhecer o conteúdo é preciso abrir os
                                votos — e isso gera outro evento, registrado acima.
                              </p>
                            </div>
                          ) : (
                            <Campo nome="Opção">{texto(d.opcao) || '—'}</Campo>
                          )}
                        </>
                      )}

                      {evento.acao === ACOES_AUDITORIA.ADMIN_DEFINIDO && (
                        <>
                          <Campo nome="Síndico provisionado">
                            {texto(d.alvo) || '—'}
                          </Campo>
                          {d.bootstrap === true && (
                            <Campo nome="Origem" tom="text-purple-200">
                              provisão inicial da instalação (bootstrap)
                            </Campo>
                          )}
                        </>
                      )}

                      {evento.acao === ACOES_AUDITORIA.CATALOGO_ALTERADO && (
                        <>
                          {texto(d.acao) && <Campo nome="Operação">{texto(d.acao)}</Campo>}
                          {texto(d.numero) && <Campo nome="Unidade">{texto(d.numero)}</Campo>}
                          {texto(d.total) && <Campo nome="Total">{texto(d.total)}</Campo>}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

      {aConfirmar && (
        <Modal
          aoFechar={() => {
            if (!abrindo) setAConfirmar(false);
          }}
          rotulo="Confirmar abertura de votos selados"
          larguraMaxima="max-w-lg"
        >
          <div className="flex justify-center mb-4 text-amber-400">
            <IconeCadeadoAberto tamanho={36} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Abrir os votos?</h2>
          <p className="text-gray-300 mb-1">{assembleiaSelecionada?.titulo ?? 'Assembleia'}</p>
          <p className="text-gray-500 text-xs mb-4">
            {assembleiaSelecionada
              ? `${ROTULOS_MODO[assembleiaSelecionada.modo] ?? 'Modo não informado'} · criada em `
                + `${formatarData(assembleiaSelecionada.criadoEm)}`
              : 'Modo da assembleia não informado.'}
          </p>

          <div className="bg-red-900/20 border border-red-900 text-red-200 rounded-xl p-4 text-sm mb-6 space-y-3">
            <p>
              Esta leitura será registrada permanentemente na trilha de auditoria,
              com seu usuário, a data e a finalidade informada.
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
              {abrindo ? 'Abrindo…' : 'Confirmar e registrar'}
            </button>
          </div>
        </Modal>
      )}
    </PainelComBarra>
  );
}
