/**
 * ipevox — leituras do Firestore (modelo SEM SERVIDOR)
 * =============================================================================
 * O cliente lê direto do banco. Quem decide o que cada um pode ler é o arquivo
 * `firestore.rules`, não este módulo.
 *
 * As três leituras que definem o desenho de sigilo do projeto:
 *
 *   /resultados/{id}      — contagens por opção. Legível por qualquer
 *                           participante. É o que morador e síndico veem.
 *   /votos_contagem/{id}  — proposta e opção, com a tag (número) da unidade.
 *                           Legível por operadores, para apurar. Como o ID e a
 *                           tag embutem o número, o operador consegue associar
 *                           opção a unidade ao ler esta coleção — limitação
 *                           registrada no README.
 *   /votos/{id}           — o voto completo. Legível SOMENTE pelo administrador
 *                           do sistema (definido por e-mail nas regras).
 *
 * Nenhuma tela de morador ou de síndico chama `lerVotosIndividuais`.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { obterDb } from './firebase';
import {
  COLECOES,
  STATUS_ASSEMBLEIA,
  apurarAssembleia,
  compararNumeroUnidade,
  idComprovante,
  normalizarNumeroUnidade,
} from './schema';

// -----------------------------------------------------------------------------
// Assembleias
// -----------------------------------------------------------------------------

export async function lerAssembleia(assembleiaId) {
  const snap = await getDoc(doc(obterDb(), COLECOES.ASSEMBLEIAS, assembleiaId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Propostas em ordem de pauta. */
export async function lerPropostas(assembleiaId) {
  const snap = await getDocs(
    query(
      collection(obterDb(), COLECOES.ASSEMBLEIAS, assembleiaId, COLECOES.PROPOSTAS),
      orderBy('ordem', 'asc')
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function escutarAssembleia(assembleiaId, aoAtualizar, aoFalhar) {
  return onSnapshot(
    doc(obterDb(), COLECOES.ASSEMBLEIAS, assembleiaId),
    (snap) => aoAtualizar(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (erro) => aoFalhar?.(erro)
  );
}

export function escutarPropostas(assembleiaId, aoAtualizar, aoFalhar) {
  return onSnapshot(
    query(
      collection(obterDb(), COLECOES.ASSEMBLEIAS, assembleiaId, COLECOES.PROPOSTAS),
      orderBy('ordem', 'asc')
    ),
    (snap) => aoAtualizar(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (erro) => aoFalhar?.(erro)
  );
}

/** Lista assembleias para o histórico e para seletores. Exige operador. */
export function escutarAssembleias(filtro, aoAtualizar, aoFalhar) {
  const base = collection(obterDb(), COLECOES.ASSEMBLEIAS);
  const consulta = filtro === 'ativas'
    ? query(base, where('status', '==', STATUS_ASSEMBLEIA.ATIVA), orderBy('criadoEm', 'desc'))
    : filtro === 'encerradas'
      ? query(base, where('status', '==', STATUS_ASSEMBLEIA.ENCERRADA), orderBy('criadoEm', 'desc'))
      : query(base, orderBy('criadoEm', 'desc'));

  return onSnapshot(
    consulta,
    (snap) => aoAtualizar(snap.docs.map((d) => ({ docId: d.id, ...d.data() }))),
    (erro) => aoFalhar?.(erro)
  );
}

// -----------------------------------------------------------------------------
// Catálogo de unidades
// -----------------------------------------------------------------------------

export async function lerCatalogo() {
  const snap = await getDocs(collection(obterDb(), COLECOES.CATALOGO_UNIDADES));
  return snap.docs
    .map((d) => ({ docId: d.id, ...d.data() }))
    // Ordenação no cliente: `orderBy('numero')` no Firestore compara STRINGS,
    // então "10" viria antes de "2" e a lista sairia embaralhada — foi um defeito
    // relatado pelo usuário.
    .sort((a, b) => compararNumeroUnidade(a.numero, b.numero));
}

// -----------------------------------------------------------------------------
// Participação
// -----------------------------------------------------------------------------

/**
 * Comprovante da unidade. O ID é `{assembleiaId}~{numero}` — determinístico, o
 * que torna esta leitura um `get` por caminho conhecido, sem consulta.
 */
export async function lerComprovante(assembleiaId, numero) {
  const id = idComprovante(assembleiaId, normalizarNumeroUnidade(numero));
  const snap = await getDoc(doc(obterDb(), COLECOES.COMPROVANTES, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Escuta quantos já votaram, em tempo real.
 *
 * É o ÚNICO acompanhamento ao vivo deste modelo: mostra "N de M unidades já
 * votaram" e nada mais. Não existe placar durante a votação — a contagem por
 * opção só aparece depois que o resultado é publicado, no encerramento.
 */
export function escutarParticipacao(assembleiaId, aoAtualizar, aoFalhar) {
  return onSnapshot(
    query(
      collection(obterDb(), COLECOES.COMPROVANTES),
      where('assembleiaId', '==', assembleiaId)
    ),
    (snap) => {
      const votaram = snap.docs.filter((d) => (d.data().votosRegistrados ?? 0) > 0).length;
      aoAtualizar({ unidadesQueVotaram: votaram });
    },
    (erro) => aoFalhar?.(erro)
  );
}

// -----------------------------------------------------------------------------
// Apuração
// -----------------------------------------------------------------------------

export async function lerResultado(assembleiaId) {
  const snap = await getDoc(doc(obterDb(), COLECOES.RESULTADOS, assembleiaId));
  return snap.exists() ? snap.data() : null;
}

/** Escuta o resultado publicado. Fica nulo até o encerramento. */
export function escutarResultado(assembleiaId, aoAtualizar, aoFalhar) {
  return onSnapshot(
    doc(obterDb(), COLECOES.RESULTADOS, assembleiaId),
    (snap) => aoAtualizar(snap.exists() ? snap.data() : null),
    (erro) => aoFalhar?.(erro)
  );
}

/**
 * Votos individuais — COM autor e unidade.
 *
 * Só o administrador do sistema consegue ler isto: a regra de `/votos` nega para
 * todo o resto, inclusive para o síndico. Usado apenas na tela de leitura de
 * votos do administrador.
 */
export async function lerVotosIndividuais(assembleiaId) {
  const snap = await getDocs(
    query(collection(obterDb(), COLECOES.VOTOS), where('assembleiaId', '==', assembleiaId))
  );

  return snap.docs
    .map((d) => ({ votoId: d.id, ...d.data() }))
    .sort((a, b) => compararNumeroUnidade(a.numero, b.numero));
}

/**
 * Escuta os votos individuais em tempo real.
 */
export function escutarVotos(assembleiaId, aoAtualizar, aoFalhar) {
  return onSnapshot(
    query(collection(obterDb(), COLECOES.VOTOS), where('assembleiaId', '==', assembleiaId)),
    (snap) => {
      const lista = snap.docs
        .map((d) => ({ votoId: d.id, ...d.data() }))
        .sort((a, b) => compararNumeroUnidade(a.numero, b.numero));
      aoAtualizar(lista);
    },
    (erro) => aoFalhar?.(erro)
  );
}

/**
 * Escuta o catálogo de unidades em tempo real.
 */
export function escutarCatalogoUnidades(aoAtualizar, aoFalhar) {
  return onSnapshot(
    collection(obterDb(), COLECOES.CATALOGO_UNIDADES),
    (snap) => {
      const lista = snap.docs
        .map((d) => ({ docId: d.id, ...d.data() }))
        .sort((a, b) => compararNumeroUnidade(a.numero, b.numero));
      aoAtualizar(lista);
    },
    (erro) => aoFalhar?.(erro)
  );
}

/**
 * Monta a apuração em tempo real ou a partir do resultado publicado,
 * incluindo o agrupamento de votos por unidade para assembleias abertas.
 */
export function montarApuracaoAoVivo({
  assembleia,
  propostas = [],
  votos = [],
  catalogo = [],
  resultado = null,
  participacao = null,
}) {
  const inadimplentesSet = new Set(
    catalogo
      .filter((u) => u.inadimplente === true)
      .map((u) => normalizarNumeroUnidade(u.numero))
      .filter(Boolean)
  );

  const unidadesNoCatalogo = catalogo.length;
  const unidadesAptasCadastro = assembleia?.unidadesAptas || unidadesNoCatalogo || 0;
  const unidadesAptasParaDeliberar = Math.max(0, unidadesAptasCadastro - inadimplentesSet.size);

  // Unidades que já votaram (pelo menos um voto registrado)
  const unidadesQueVotaramSet = new Set(
    votos.map((v) => normalizarNumeroUnidade(v.numero ?? v.tag)).filter(Boolean)
  );
  const totalUnidadesVotaram = Math.max(
    participacao?.unidadesQueVotaram ?? 0,
    unidadesQueVotaramSet.size
  );

  let totalVotosConsideradosGeral = 0;
  let totalVotosExcluidosGeral = 0;

  const propostasProcessadas = propostas.map((prop, idx) => {
    const propId = prop.id || prop.propostaId;
    const votosDestaProp = votos.filter((v) => v.propostaId === propId);

    const contagens = {};
    const unidadesPorOpcao = {};
    (prop.opcoes ?? []).forEach((op) => {
      contagens[op] = 0;
      unidadesPorOpcao[op] = [];
    });

    const votosPorUnidade = [];
    votosDestaProp.forEach((v) => {
      const numNorm = String(v.numero ?? v.tag ?? '').trim().toUpperCase().replace(/^0+(?=\d)/, '');
      const isInadimplente = inadimplentesSet.has(numNorm);

      votosPorUnidade.push({
        votoId: v.votoId || v.id,
        numero: v.numero || v.tag,
        opcao: v.opcao,
        criadoEm: v.criadoEm || null,
        inadimplente: isInadimplente,
      });

      if (isInadimplente) {
        totalVotosExcluidosGeral += 1;
        return;
      }

      if (prop.opcoes?.includes(v.opcao)) {
        contagens[v.opcao] = (contagens[v.opcao] || 0) + 1;
        unidadesPorOpcao[v.opcao].push(v.numero || v.tag);
        totalVotosConsideradosGeral += 1;
      }
    });

    votosPorUnidade.sort((a, b) => compararNumeroUnidade(a.numero, b.numero));

    // Se houver resultado congelado para esta proposta, podemos respeitar seus números
    const propNoResultado = resultado?.apuracao?.find?.((p) => (p.propostaId || p.id) === propId);

    const opcoesComEstatisticas = (prop.opcoes ?? []).map((opcao) => {
      const votosOpcao = propNoResultado
        ? (propNoResultado.opcoes?.find((o) => o.opcao === opcao)?.votos ?? contagens[opcao] ?? 0)
        : (contagens[opcao] ?? 0);

      const totalVotosProp = propNoResultado
        ? propNoResultado.totalVotos
        : Object.values(contagens).reduce((s, c) => s + c, 0);

      const percentual = totalVotosProp > 0 ? Math.round((votosOpcao / totalVotosProp) * 100) : 0;
      const percentualAptas = unidadesAptasParaDeliberar > 0
        ? Math.round((votosOpcao / unidadesAptasParaDeliberar) * 100)
        : 0;

      const unidades = [...(unidadesPorOpcao[opcao] || [])].sort(compararNumeroUnidade);

      return {
        opcao,
        votos: votosOpcao,
        percentual,
        percentualAptas,
        unidades,
      };
    });

    const totalVotos = propNoResultado
      ? propNoResultado.totalVotos
      : opcoesComEstatisticas.reduce((acc, o) => acc + o.votos, 0);

    const maxVotos = Math.max(0, ...opcoesComEstatisticas.map((o) => o.votos));
    const maisVotadas = maxVotos > 0 ? opcoesComEstatisticas.filter((o) => o.votos === maxVotos) : [];
    const empate = maisVotadas.length > 1;
    const aprovada = maisVotadas.length === 1 ? maisVotadas[0] : null;

    return {
      propostaId: propId,
      titulo: prop.titulo || `Proposta ${idx + 1}`,
      descricao: prop.descricao || '',
      ordem: prop.ordem ?? idx + 1,
      totalVotos,
      opcoes: opcoesComEstatisticas,
      empate,
      aprovada,
      maisVotadas: maisVotadas.map((m) => m.opcao),
      votosPorUnidade,
      totalVotantes: votosDestaProp.length,
    };
  });

  return {
    propostas: propostasProcessadas,
    totalParticipacoes: resultado?.totalVotos ?? totalVotosConsideradosGeral,
    votosExcluidos: resultado?.votosExcluidos ?? totalVotosExcluidosGeral,
    unidadesQueVotaram: totalUnidadesVotaram,
    unidadesAptas: resultado?.unidadesAptas ?? unidadesAptasParaDeliberar,
    unidadesAptasCadastro: resultado?.unidadesAptasCadastro ?? unidadesAptasCadastro,
    unidadesInadimplentes: resultado?.unidadesInadimplentes ?? inadimplentesSet.size,
    publicado: Boolean(resultado?.apuracao),
    emTempoReal: !resultado?.apuracao,
  };
}

/** Apuração calculada, para a tela de publicação. Reusa o schema testado. */
export function calcularApuracao({ propostas, contagens, unidadesAptas }) {
  return apurarAssembleia({ propostas, contagens, unidadesAptas });
}

// -----------------------------------------------------------------------------
// Votação: retomada
// -----------------------------------------------------------------------------

/** Lista os `propostaId` já votados, do campo `votouEm` do comprovante. */
export function propostasVotadas(comprovante) {
  const lista = Array.isArray(comprovante?.votouEm) ? comprovante.votouEm : [];
  return lista
    .map((item) => (typeof item === 'string' ? item : item?.propostaId))
    .filter(Boolean);
}

/**
 * Índice da próxima proposta pendente, ou -1 se concluiu.
 *
 * O bug que isto corrige existia na versão com servidor: a lista de propostas já
 * votadas era montada a partir de um `state` que ainda estava vazio dentro do
 * efeito, e por isso nunca reconhecia voto já dado — quem recarregasse a página
 * votava de novo e inflava a contagem.
 */
export function proximaPropostaPendente(propostas, votouEm = []) {
  const jaVotadas = new Set(
    (Array.isArray(votouEm) ? votouEm : [])
      .map((item) => (typeof item === 'string' ? item : item?.propostaId))
      .filter(Boolean)
  );
  return propostas.findIndex((p) => !jaVotadas.has(p.id));
}

export { normalizarNumeroUnidade };
