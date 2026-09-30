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
 *   /votos_contagem/{id}  — proposta e opção, sem unidade e sem autor. Legível
 *                           por operadores, para apurar.
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
  const id = `${assembleiaId}~${normalizarNumeroUnidade(numero)}`;
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
 * Contagem por (proposta, opção), a partir do espelho anônimo.
 *
 * É o que alimenta a publicação do resultado. Não devolve nada por voto: apenas
 * os totais — e só quando alguém com permissão pede a apuração.
 */
export async function contarVotos(assembleiaId) {
  const snap = await getDocs(
    query(
      collection(obterDb(), COLECOES.VOTOS_CONTAGEM),
      where('assembleiaId', '==', assembleiaId)
    )
  );

  const contagens = {};
  snap.forEach((d) => {
    const { propostaId, opcao } = d.data();
    if (!propostaId || !opcao) return;
    const linha = (contagens[propostaId] ??= {});
    linha[opcao] = (linha[opcao] ?? 0) + 1;
  });

  return { contagens, total: snap.size };
}

/**
 * Votos individuais — COM autor e unidade.
 *
 * Só o administrador do sistema consegue ler isto: a regra de `/votos` nega para
 * todo o resto, inclusive para o síndico. Usado apenas na tela de auditoria.
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
 * Monta a apuração para exibição a partir do resultado PUBLICADO.
 *
 * Enquanto não houver resultado, devolve `publicado: false` — é assim que a tela
 * distingue "ainda não apurado" de "apurado com zero votos". Essa distinção
 * importa: a primeira diz "clique em publicar", a segunda diz "ninguém votou".
 *
 * Os campos de inadimplência viajam junto porque a ata precisa deles: sem
 * `votosExcluidos` e `unidadesInadimplentes`, o número publicado não bate com o
 * de unidades que votaram, e a diferença fica sem explicação para quem lê.
 */
export function montarApuracaoDeResultado({ resultado, unidadesAptas, participacao }) {
  if (!resultado?.apuracao) {
    return {
      propostas: [],
      totalParticipacoes: 0,
      unidadesAptas: 0,
      unidadesQueVotaram: participacao?.unidadesQueVotaram ?? 0,
      publicado: false,
    };
  }

  return {
    propostas: resultado.apuracao,
    totalParticipacoes: resultado.totalVotos ?? 0,
    unidadesAptas: resultado.unidadesAptas ?? unidadesAptas ?? 0,
    unidadesAptasCadastro: resultado.unidadesAptasCadastro ?? unidadesAptas ?? 0,
    unidadesInadimplentes: resultado.unidadesInadimplentes ?? 0,
    votosExcluidos: resultado.votosExcluidos ?? 0,
    unidadesQueVotaram: participacao?.unidadesQueVotaram ?? 0,
    publicado: true,
    publicadoEm: resultado.publicadoEm ?? null,
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

// -----------------------------------------------------------------------------
// Compatibilidade com as telas escritas para o modelo com placar ao vivo
// -----------------------------------------------------------------------------

/**
 * "Contagem ao vivo" não existe mais: o projeto decidiu não mostrar placar
 * parcial durante a votação, para o número não influenciar quem ainda vai votar.
 *
 * Esta função permanece para as telas que a importavam e devolve, uma única vez,
 * o resultado PUBLICADO convertido para o formato de contagens. Se não houver
 * resultado publicado, devolve vazio — e a tela mostra o estado "ainda não
 * apurado", que é a informação correta.
 */
export function escutarContagem(assembleiaId, aoAtualizar, aoFalhar) {
  return onSnapshot(
    doc(obterDb(), COLECOES.RESULTADOS, assembleiaId),
    (snap) => {
      if (!snap.exists()) {
        aoAtualizar({});
        return;
      }

      const contagens = {};
      (snap.data().apuracao ?? []).forEach((prop) => {
        const linha = (contagens[prop.propostaId] ??= {});
        (prop.opcoes ?? []).forEach((o) => {
          linha[o.opcao] = o.votos ?? 0;
        });
      });
      aoAtualizar(contagens);
    },
    (erro) => aoFalhar?.(erro)
  );
}

/**
 * Monta a apuração exibida a partir do resultado publicado.
 *
 * Nome mantido por compatibilidade com as telas existentes. A diferença em
 * relação à versão com servidor: o total NÃO é somado de contadores ao vivo, e
 * sim lido do documento de resultado — que é imutável por regra. Sem resultado
 * publicado, devolve lista vazia, nunca zeros (zeros pareceriam "ninguém votou").
 */
export function montarApuracao({ assembleia, propostas = [], resultado, participacao }) {
  const publicado = resultado?.apuracao;

  if (!publicado) {
    return {
      propostas: [],
      totalParticipacoes: 0,
      unidadesAptas: assembleia?.unidadesAptas ?? 0,
      unidadesQueVotaram: participacao?.unidadesQueVotaram ?? 0,
      publicado: false,
      modo: assembleia?.modo ?? null,
      status: assembleia?.status ?? null,
    };
  }

  return {
    propostas: publicado,
    totalParticipacoes: resultado.totalVotos ?? 0,
    unidadesAptas: resultado.unidadesAptas ?? assembleia?.unidadesAptas ?? 0,
    unidadesQueVotaram: participacao?.unidadesQueVotaram ?? 0,
    publicado: true,
    publicadoEm: resultado.publicadoEm ?? null,
    modo: assembleia?.modo ?? null,
    status: assembleia?.status ?? null,
    propostasBase: propostas,
  };
}

export { normalizarNumeroUnidade };
