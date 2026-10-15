"use client";

/**
 * ipevox — operações de escrita (modelo SEM SERVIDOR)
 * =============================================================================
 * Substitui o antigo cliente de Cloud Functions.
 *
 * Com o Cloud Functions fora (o plano gratuito do Firebase não permite publicar
 * funções), não existe mais um árbitro no servidor: as operações abaixo são
 * escritas diretas no Firestore, e quem decide o que é permitido é o arquivo
 * `firestore.rules`.
 *
 * Consequência que precisa estar clara em quem for manter isto: a validação
 * deixou de ser "o servidor verifica" e passou a ser "a regra do banco verifica,
 * e o cliente coopera". As regras cobrem o essencial (um voto por unidade,
 * opção existente na proposta, assembleia ativa, resultado imutável), mas um
 * cliente mal-intencionado não é impedido pelo código do site — só pela regra.
 *
 * Por isso cada função aqui faz DUAS coisas: escreve e devolve erro legível.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { obterAuth, obterDb } from './firebase';
import { lerAssembleia, lerPropostas, lerVotosIndividuais } from './data';
import {
  COLECOES,
  STATUS_ASSEMBLEIA,
  STATUS_COMPROVANTE,
  contarVotosConsiderados,
  idComprovante,
  idUnidadeCatalogo,
  idVoto,
  normalizarNumeroUnidade,
} from './schema';

/** Erro de operação com código estável, para a UI decidir o que mostrar. */
export class ErroOperacao extends Error {
  constructor(mensagem, codigo) {
    super(mensagem);
    this.name = 'ErroOperacao';
    this.codigo = codigo;
  }
}

/** Traduz o erro do SDK para algo que o usuário entenda. */
export function normalizarErro(erro) {
  const codigo = typeof erro?.code === 'string' ? erro.code : '';

  if (codigo === 'permission-denied') {
    return new ErroOperacao(
      'O banco recusou a operação. Você pode não ter permissão para isso, ou a '
      + 'assembleia pode já estar encerrada.',
      'sem-permissao'
    );
  }
  if (codigo === 'unavailable' || codigo === 'deadline-exceeded') {
    return new ErroOperacao(
      'Sem conexão com o banco. Verifique a internet e tente novamente.',
      'rede'
    );
  }
  if (codigo === 'already-exists') {
    return new ErroOperacao('Este registro já existe.', 'ja-existe');
  }
  if (codigo === 'not-found') {
    return new ErroOperacao('Registro não encontrado.', 'nao-encontrado');
  }

  return new ErroOperacao(erro?.message ?? 'Não foi possível concluir a operação.', 'desconhecido');
}

async function executar(acao) {
  try {
    return await acao();
  } catch (erro) {
    throw normalizarErro(erro);
  }
}

/**
 * Remove os campos com valor `undefined` antes de gravar.
 *
 * O Firestore RECUSA valor indefinido e aborta a operação inteira:
 *
 *     Function setDoc() called with invalid data.
 *     Unsupported field value: undefined (found in field uid in document ...)
 *
 * Este defeito apareceu TRÊS vezes no projeto, sempre do mesmo jeito: uma função
 * ganha um campo novo e alguma tela não o envia. Cada ocorrência custou uma
 * rodada de investigação, porque a mensagem do Firestore aponta o campo mas não
 * a origem.
 *
 * A proteção certa é na fronteira com o banco, não em cada tela: aqui nenhum
 * campo indefinido escapa, e a função nova já nasce protegida.
 *
 * `undefined` é OMITIDO, e não convertido em `null`. A diferença importa: `null`
 * é um valor gravado (e as regras podem exigi-lo, como em `encerradoEm: null`);
 * omitir deixa o campo ausente, que é o significado correto de "não informado".
 */
function semIndefinidos(dados) {
  return Object.fromEntries(
    Object.entries(dados).filter(([, valor]) => valor !== undefined)
  );
}

// -----------------------------------------------------------------------------
// Assembleias
// -----------------------------------------------------------------------------

/**
 * Cria a assembleia com as propostas.
 *
 * A assembleia e as propostas vivem em coleções diferentes (subcoleção), então
 * usamos um batch: ou tudo entra, ou nada entra. Em votação, uma assembleia sem
 * propostas seria um documento quebrado no meio do caminho.
 */
export async function criarAssembleia({
  titulo,
  descricao,
  modo,
  propostas,
  criadoPor,
  unidadesAptas,
}) {
  return executar(async () => {
    const db = obterDb();
    const assembleiaRef = doc(collection(db, COLECOES.ASSEMBLEIAS));

    // O Firestore RECUSA valor `undefined` em qualquer campo e aborta o lote
    // inteiro. Foi o que quebrou a criação: a tela não passava `criadoPor` e o
    // documento saía com `undefined`, derrubando a assembleia e as propostas
    // junto. Normalizar aqui, na fronteira com o banco, protege todas as
    // chamadas — não só esta.
    const aptas = Number(unidadesAptas);
    const aptasValidas = Number.isFinite(aptas) && aptas >= 0 ? aptas : 0;

    const lote = writeBatch(db);

    lote.set(assembleiaRef, semIndefinidos({
      id: assembleiaRef.id,
      titulo: String(titulo ?? '').trim(),
      descricao: String(descricao ?? '').trim(),
      modo,
      status: STATUS_ASSEMBLEIA.ATIVA,
      unidadesAptas: aptasValidas,
      totalPropostas: propostas.length,
      criadoPor: criadoPor ?? null,
      criadoEm: serverTimestamp(),
      encerradoEm: null,
      resultadoPublicado: false,
    }));

    propostas.forEach((p, indice) => {
      const propostaRef = doc(collection(db, COLECOES.ASSEMBLEIAS, assembleiaRef.id, COLECOES.PROPOSTAS));
      lote.set(propostaRef, {
        id: propostaRef.id,
        titulo: String(p.titulo ?? '').trim(),
        descricao: String(p.descricao ?? '').trim(),
        opcoes: p.opcoes,
        ordem: indice + 1,
      });
    });

    await lote.commit();

    return {
      assembleiaId: assembleiaRef.id,
      unidadesAptas: aptasValidas,
      link: `${window.location.origin}/checkin/${assembleiaRef.id}`,
    };
  });
}

/**
 * Encerra a assembleia. A partir daqui nenhum voto novo é aceito — a regra
 * exige assembleia com status 'ativa' para aceitar voto.
 *
 * A operação é irreversível por regra: o status nunca volta para 'ativa'.
 */
export async function encerrarAssembleia(assembleiaId) {
  return executar(async () => {
    await updateDoc(doc(obterDb(), COLECOES.ASSEMBLEIAS, assembleiaId), {
      status: STATUS_ASSEMBLEIA.ENCERRADA,
      encerradoEm: serverTimestamp(),
    });
    return { ok: true };
  });
}

/**
 * Publica o snapshot da apuração de uma assembleia JÁ existente.
 *
 * Foi separado do encerramento porque uma assembleia pode ter sido encerrada por
 * um caminho que não publicou (era o caso da tela de histórico). Aqui a operação
 * é idempotente na intenção: se o resultado ainda não existe, ele é criado; se já
 * existe, o `setDoc` da regra de `create` é recusado e o erro sobe.
 *
 * Lê as propostas e a base de unidades do PRÓPRIO banco — quem chama não precisa
 * conhecer a forma interna da assembleia.
 */
export async function publicarResultadoDeAssembleia(assembleiaId) {
  const [assembleia, propostas] = await executar(() =>
    Promise.all([lerAssembleia(assembleiaId), lerPropostas(assembleiaId)])
  );

  const resultado = await publicarResultado({
    assembleiaId,
    propostas,
    unidadesAptas: assembleia?.unidadesAptas ?? 0,
    publicadoPor: obterAuth()?.currentUser?.uid ?? null,
  });

  return {
    ...resultado,
    unidadesAptas: assembleia?.unidadesAptas ?? 0,
    titulo: assembleia?.titulo ?? '',
    modo: assembleia?.modo ?? null,
  };
}

/**
 * Encerra a votação E publica o resultado numa única operação.
 *
 * É esta a função que TODAS as telas devem chamar. Antes, a tela de resultados
 * publicava e a de histórico não — e uma assembleia encerrada pelo histórico
 * ficava sem resultado (a votação restrita, em especial, não teria de onde tirar
 * a contagem, porque os votos individuais são sigilosos).
 */
export async function encerrarVotacao(assembleiaId) {
  await encerrarAssembleia(assembleiaId);
  return publicarResultadoDeAssembleia(assembleiaId);
}

// -----------------------------------------------------------------------------
// Catálogo de unidades
// -----------------------------------------------------------------------------

/**
 * Referência de um documento do catálogo.
 *
 * USA O `docId` QUANDO ELE EXISTE, e só recorre ao número como fallback.
 *
 * Isto corrige um defeito real: as unidades foram semeadas com ID ALEATÓRIO
 * (`Y9wstFXx5PZqAkmcJoUf`) em vez de `"1"`, porque o script de semeadura importa
 * `idUnidadeCatalogo` de `shared/schema.mjs` e, na época em que foi executado,
 * essa função não existia mais ali — a refatoração para o modelo sem servidor a
 * havia removido. `doc(undefined)` faz o Firestore gerar um ID automático.
 *
 * A consequência era silenciosa e cruel: `deleteDoc` de um documento inexistente
 * NÃO dá erro. A tela dizia "removido", e nada era removido.
 *
 * Recalcular o ID a partir do número é frágil por natureza — depende de todo
 * documento ter sido gravado com o ID derivado. Ler o ID que o banco realmente
 * tem elimina essa suposição.
 */
function refDaUnidade(catalogo, { docId, numero }) {
  if (docId) return doc(catalogo, docId);
  return doc(catalogo, idUnidadeCatalogo(normalizarNumeroUnidade(numero)));
}

export async function gerenciarUnidades({ acao, numero, docId, de, ate }) {
  return executar(async () => {
    const db = obterDb();
    const catalogo = collection(db, COLECOES.CATALOGO_UNIDADES);

    if (acao === 'adicionar') {
      const limpo = normalizarNumeroUnidade(numero);
      if (!limpo) throw new ErroOperacao('Número de unidade inválido.', 'dados-invalidos');

      const ref = doc(catalogo, idUnidadeCatalogo(limpo));
      if ((await getDoc(ref)).exists()) {
        throw new ErroOperacao(`A unidade ${limpo} já está cadastrada.`, 'ja-existe');
      }

      // `setDoc` e não `addDoc`: o ID é o próprio número, o que faz o check-in
      // ser um `get` por caminho conhecido em vez de uma consulta.
      await setDoc(ref, {
        numero: limpo,
        ativo: true,
        inadimplente: false,
        criadoEm: serverTimestamp(),
      });

      return { numero: limpo };
    }

    if (acao === 'alternar') {
      const ref = refDaUnidade(catalogo, { docId, numero });
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        throw new ErroOperacao(
          `Unidade não encontrada. Procurei pelo documento "${ref.id}".`,
          'nao-encontrado'
        );
      }

      const ativo = snap.data().ativo !== true;
      await updateDoc(ref, { ativo });
      return { numero: normalizarNumeroUnidade(numero), ativo };
    }

    /**
     * Marca ou desmarca a unidade como INADIMPLENTE.
     *
     * O que isso muda: a unidade continua podendo votar — o voto dela é
     * registrado normalmente —, mas NÃO entra na contagem publicada. É uma
     * decisão de assembleia: em condomínio, é comum que a unidade em débito
     * perca o direito de deliberar sem perder o direito de se manifestar.
     *
     * O registro do voto é mantido de propósito. Apagar seria pior: se a
     * inadimplência for depois contestada ou regularizada, o voto existe e pode
     * ser reconsiderado. O que a inadimplência faz é excluir da CONTAGEM.
     */
    if (acao === 'alternar_inadimplencia') {
      const ref = refDaUnidade(catalogo, { docId, numero });
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        throw new ErroOperacao(
          `Unidade não encontrada. Procurei pelo documento "${ref.id}".`,
          'nao-encontrado'
        );
      }

      const inadimplente = snap.data().inadimplente !== true;
      await updateDoc(ref, { inadimplente });
      return { numero: normalizarNumeroUnidade(numero), inadimplente };
    }

    if (acao === 'remover') {
      // Sem verificação de existência: `deleteDoc` de um documento inexistente
      // não dá erro e devolve sucesso. Confiar nesse retorno foi o que fez a tela
      // exibir "removido" sem remover nada.
      const ref = refDaUnidade(catalogo, { docId, numero });
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        throw new ErroOperacao(
          `A unidade não foi encontrada para remoção (documento "${ref.id}"). `
          + 'A lista pode estar desatualizada — recarregue a página.',
          'nao-encontrado'
        );
      }

      await deleteDoc(ref);
      return { numero: normalizarNumeroUnidade(numero), removida: true };
    }

    if (acao === 'lote') {
      const inicio = Math.max(1, Number(de) || 1);
      const fim = Math.min(2000, Number(ate) || 59);
      if (fim < inicio) throw new ErroOperacao('Intervalo inválido.', 'dados-invalidos');
      if (fim - inicio > 500) {
        throw new ErroOperacao('Cadastre no máximo 500 unidades por vez.', 'dados-invalidos');
      }

      // Lê o que já existe de uma vez: um `get` da coleção em vez de uma
      // consulta por número, que era o defeito da primeira versão.
      const existentes = await getDocs(catalogo);
      const jaTem = new Set(existentes.docs.map((d) => d.id));

      let lote = writeBatch(db);
      let noLote = 0;
      let criadas = 0;

      for (let i = inicio; i <= fim; i += 1) {
        const limpo = normalizarNumeroUnidade(String(i));
        if (!limpo || jaTem.has(idUnidadeCatalogo(limpo))) continue;

        lote.set(doc(catalogo, idUnidadeCatalogo(limpo)), {
          numero: limpo,
          ativo: true,
          inadimplente: false,
          criadoEm: serverTimestamp(),
        });
        noLote += 1;
        criadas += 1;

        if (noLote === 450) {
          await lote.commit();
          lote = writeBatch(db);
          noLote = 0;
        }
      }

      if (noLote > 0) await lote.commit();

      return { criadas, de: inicio, ate: fim };
    }

    /**
     * Renomeia os documentos para o ID determinístico (o número normalizado).
     *
     * Serve para consertar catálogos gravados ANTES desta correção, em que o ID
     * saiu aleatório porque `idUnidadeCatalogo` estava indefinida na época. Sem
     * isto, o check-in por número falharia: ele procura pelo ID derivado, e os
     * documentos existentes têm ID aleatório.
     *
     * É idempotente — rodar de novo não faz nada, porque depois da primeira
     * passagem todo ID já é o número normalizado. Isso importa: a tela oferece a
     * ação como um botão, e ninguém deve precisar saber se já rodou.
     */
    if (acao === 'normalizar_ids') {
      const existentes = await getDocs(catalogo);
      const renomeados = [];

      for (const d of existentes.docs) {
        const dados = d.data();
        const esperado = idUnidadeCatalogo(dados.numero);
        if (!esperado || d.id === esperado) continue;

        // Se já existe um documento com o ID correto, o antigo é uma sobra:
        // apagamos para não deixar duas entradas para a mesma unidade.
        const destino = doc(catalogo, esperado);
        if ((await getDoc(destino)).exists()) {
          await deleteDoc(d.ref);
          renomeados.push({ de: d.id, para: esperado, acao: 'duplicata_removida' });
          continue;
        }

        const lote = writeBatch(db);
        lote.set(destino, dados);
        lote.delete(d.ref);
        await lote.commit();
        renomeados.push({ de: d.id, para: esperado, acao: 'renomeado' });
      }

      return { total: existentes.size, ajustados: renomeados.length, renomeados };
    }

    if (acao === 'remover_todas') {
      const existentes = await getDocs(catalogo);
      const docs = existentes.docs;

      for (let i = 0; i < docs.length; i += 450) {
        const lote = writeBatch(db);
        docs.slice(i, i + 450).forEach((d) => lote.delete(d.ref));
        await lote.commit();
      }

      return { removidas: docs.length };
    }

    throw new ErroOperacao(`Ação desconhecida: "${acao}".`, 'dados-invalidos');
  });
}

/** Apaga o catálogo inteiro. A palavra de confirmação é exigida pela TELA. */
export const excluirTodasUnidades = () => gerenciarUnidades({ acao: 'remover_todas' });

// -----------------------------------------------------------------------------
// Síndicos (administrador do sistema)
// -----------------------------------------------------------------------------

/**
 * Cria o registro de permissão de um síndico.
 *
 * DIFERENÇA IMPORTANTE em relação ao modelo com servidor: aqui NÃO é possível
 * criar a conta de login do síndico. Criar usuário no Firebase Authentication
 * exige o SDK de administrador, que só roda em servidor. Então este fluxo grava
 * a permissão, e a conta de login é criada em Authentication → Users, no console
 * — pelo próprio síndico, usando "esqueci minha senha", ou por você.
 */
export async function criarSindico({ uid, nome, email, condominio, telefone }) {
  return executar(async () => {
    const limpo = String(uid ?? '').trim();
    if (!limpo) {
      throw new ErroOperacao(
        'Informe o UID do síndico. Ele aparece em Authentication → Usuários, '
        + 'depois que a conta de login é criada.',
        'dados-invalidos'
      );
    }
    if (!String(nome ?? '').trim()) {
      throw new ErroOperacao('Informe o nome do síndico.', 'dados-invalidos');
    }

    await setDoc(doc(obterDb(), COLECOES.ADMINS, limpo), {
      nome: String(nome).trim(),
      email: String(email ?? '').trim().toLowerCase(),
      condominio: String(condominio ?? '').trim(),
      telefone: String(telefone ?? '').trim(),
      ativo: true,
      criadoEm: serverTimestamp(),
    });

    // Marca que o sistema saiu do estado inicial. É este documento que encerra
    // a janela de bootstrap: depois dele, ninguém mais cria a própria permissão.
    await setDoc(
      doc(obterDb(), COLECOES.CONTROLE, 'sindicos_criados'),
      { criadoEm: serverTimestamp() },
      { merge: true }
    );

    return { uid: limpo };
  });
}

export async function removerSindico(uid) {
  return executar(async () => {
    await deleteDoc(doc(obterDb(), COLECOES.ADMINS, uid));
    return { uid };
  });
}

// -----------------------------------------------------------------------------
// Participante: check-in e voto
// -----------------------------------------------------------------------------

/**
 * Abre (ou retoma) a sessão da unidade na assembleia.
 *
 * O ID do comprovante é determinístico — `assembleia~tag` —, então o próprio
 * caminho do documento garante uma sessão por unidade, sem consulta.
 */
export async function checkIn({ assembleiaId, numero, tag, uid }) {
  return executar(async () => {
    const db = obterDb();
    const limpo = normalizarNumeroUnidade(numero);
    const comprovanteId = idComprovante(assembleiaId, tag);
    const ref = doc(db, COLECOES.COMPROVANTES, comprovanteId);

    const existente = await getDoc(ref);

    if (existente.exists()) {
      const dados = existente.data();

      if (dados.status === STATUS_COMPROVANTE.VOTADO) {
        return { status: 'votado', comprovanteId, numero: limpo };
      }

      // Retomada: renova o heartbeat para o timeout não travar a unidade.
      await updateDoc(ref, { ultimaAtualizacao: serverTimestamp() });
      return { status: 'votando', comprovanteId, numero: limpo, retomada: true };
    }

    // A unidade precisa existir no catálogo e estar ativa.
    //
    // A consulta é pelo CAMPO `numero`, e não pelo ID do documento. Antes ela
    // usava o ID derivado do número, o que quebrava o check-in sempre que o
    // documento tivesse ID diferente — que é o caso de todas as unidades
    // semeadas antes da correção (o Firestore gerou IDs aleatórios porque
    // `idUnidadeCatalogo` estava indefinida no momento da semeadura).
    //
    // Consultar pelo campo depende de um índice, mas funciona com qualquer ID.
    // É a escolha certa: o dado que identifica a unidade é o número, não o
    // endereço do documento.
    const unidadeSnap = await getDocs(
      query(
        collection(db, COLECOES.CATALOGO_UNIDADES),
        where('numero', '==', limpo),
        limit(1)
      )
    );

    if (unidadeSnap.empty) {
      throw new ErroOperacao(
        'Unidade não cadastrada no condomínio. Contate o síndico.',
        'nao-encontrado'
      );
    }
    if (unidadeSnap.docs[0].data().ativo === false) {
      throw new ErroOperacao('Esta unidade está desativada. Contate o síndico.', 'sem-permissao');
    }

    // `semIndefinidos` protege contra o campo `uid` chegar indefinido: a tela de
    // check-in não o envia, e o Firestore recusa gravar `undefined` — abortando
    // a criação da sessão e impedindo o morador de entrar. Foi exatamente esse
    // erro que apareceu em produção, com a mensagem apontando o campo e não a
    // origem.
    await setDoc(ref, semIndefinidos({
      assembleiaId,
      tag,
      numero: limpo,
      status: STATUS_COMPROVANTE.VOTANDO,
      votosRegistrados: 0,
      votouEm: [],
      criadoEm: serverTimestamp(),
      ultimaAtualizacao: serverTimestamp(),
      uid,
    }));

    return { status: 'votando', comprovanteId, numero: limpo, novo: true };
  });
}

/**
 * Registra o voto.
 *
 * Grava DOIS documentos no mesmo batch, com o mesmo ID:
 *
 *   /votos/{id}           — voto completo; leitura só do administrador do sistema
 *   /votos_contagem/{id}  — apenas proposta e opção; leitura pelos operadores,
 *                           para o síndico poder apurar sem saber quem votou
 *
 * A regra de `/votos` exige que o espelho exista com a mesma opção, então os
 * dois documentos não podem divergir sem que a escrita seja recusada.
 */
export async function votar({
  assembleiaId,
  propostaId,
  opcao,
  numero,
  tag,
  uid,
  comprovanteId,
  votosRegistrados,
  votouEm,
}) {
  return executar(async () => {
    const db = obterDb();
    const votoId = idVoto(assembleiaId, propostaId, tag);

    const lote = writeBatch(db);

    lote.set(doc(db, COLECOES.VOTOS, votoId), semIndefinidos({
      assembleiaId,
      propostaId,
      tag,
      numero: normalizarNumeroUnidade(numero),
      opcao,
      uid,
      criadoEm: serverTimestamp(),
    }));

    lote.set(doc(db, COLECOES.VOTOS_CONTAGEM, votoId), semIndefinidos({
      assembleiaId,
      propostaId,
      tag,
      opcao,
    }));

    const registrados = Number(votosRegistrados ?? 0) + 1;
    lote.update(doc(db, COLECOES.COMPROVANTES, comprovanteId), {
      votosRegistrados: registrados,
      votouEm: [...(votouEm ?? []), { propostaId, tag }],
      ultimaAtualizacao: serverTimestamp(),
    });

    await lote.commit();

    return { votosRegistrados: registrados, votoId };
  });
}

/** Marca a sessão como concluída quando a unidade votou em todas as propostas. */
export async function finalizarSessao(comprovanteId) {
  return executar(async () => {
    await updateDoc(doc(obterDb(), COLECOES.COMPROVANTES, comprovanteId), {
      status: STATUS_COMPROVANTE.VOTADO,
      ultimaAtualizacao: serverTimestamp(),
    });
    return { ok: true };
  });
}

// -----------------------------------------------------------------------------
// Apuração
// -----------------------------------------------------------------------------

/**
 * Publica a apuração. Lê o espelho anônimo, soma e grava o resultado.
 *
 * INADIMPLENTES FICAM FORA DA CONTAGEM. A unidade em débito vota normalmente — o
 * voto dela é registrado e preservado —, mas não entra no total publicado, nem no
 * denominador do percentual. Isso exige cruzar o espelho com o catálogo, porque o
 * espelho guarda a tag (o número da unidade) e o catálogo é quem sabe quem está
 * inadimplente.
 *
 * O cruzamento acontece AQUI, no momento da publicação, e não na gravação do
 * voto: assim, marcar uma unidade como inadimplente depois da votação e antes de
 * publicar já produz o efeito correto, sem precisar reescrever voto nenhum.
 *
 * O documento de resultado é IMUTÁVEL por regra: gravado uma vez, nunca
 * alterado. É essa imutabilidade que substitui, no modelo sem servidor, a
 * garantia que a transação do servidor dava.
 */
export async function publicarResultado({
  assembleiaId,
  propostas,
  unidadesAptas,
  publicadoPor,
}) {
  return executar(async () => {
    const db = obterDb();

    // Quem está inadimplente, segundo o catálogo atual.
    const catalogoSnap = await getDocs(collection(db, COLECOES.CATALOGO_UNIDADES));
    // O `numero` da unidade, não o ID do documento.
    //
    // DEFEITO CORRIGIDO: esta linha usava `d.id`, mas as unidades foram semeadas
    // com ID ALEATÓRIO (o `idUnidadeCatalogo` não existia no schema na época), e o
    // número está no CAMPO `numero`. O conjunto comparava "Y9wstFXx..." com
    // `voto.tag` ("1"), nunca casava, e a inadimplência não excluía voto nenhum —
    // a unidade inadimplente continuava contando na apuração.
    const inadimplentes = new Set(
      catalogoSnap.docs
        .filter((d) => d.data().inadimplente === true)
        .map((d) => String(d.data().numero ?? ''))
        .filter(Boolean)
    );

    const votosSnap = await getDocs(collection(db, COLECOES.VOTOS_CONTAGEM));
    const todos = votosSnap.docs
      .map((d) => d.data())
      .filter((v) => v.assembleiaId === assembleiaId);

    // `tag` é o número normalizado da unidade; é por ele que cruzamos com o
    // catálogo, cujo ID também é o número normalizado.
    //
    // A contagem em si vive no schema compartilhado, e tem teste: é a regra mais
    // sensível da apuração — quem entra e quem fica de fora da deliberação.
    const { contagens, totalConsiderado, totalExcluido } = contarVotosConsiderados(
      todos,
      inadimplentes
    );

    // DIAGNÓSTICO TEMPORÁRIO — remover depois de identificar por que a publicação
    // não produz efeito. Registra o que foi lido do banco, que é o dado que não
    // temos de fora.
    console.log('[ipevox] publicarResultado:', {
      assembleiaId,
      totalUnidadesNoCatalogo: catalogoSnap.size,
      inadimplentes: [...inadimplentes],
      totalVotosNaColecao: votosSnap.size,
      votosDestaAssembleia: todos.length,
      propostasRecebidas: propostas?.length ?? 0,
      totalConsiderado,
      totalExcluido,
      amostraDeVoto: todos[0] ?? null,
    });

    // As unidades aptas a deliberar excluem as inadimplentes: sem isso, o
    // percentual sobre as unidades sairia subestimado.
    const aptasParaDeliberar = Math.max(0, Number(unidadesAptas || 0) - inadimplentes.size);

    const apuracao = propostas.map((p) => {
      const porOpcao = (p.opcoes ?? []).map((opcao) => ({
        opcao,
        votos: contagens[p.id]?.[opcao] ?? 0,
      }));
      const total = porOpcao.reduce((soma, o) => soma + o.votos, 0);
      const maxima = porOpcao.reduce((m, o) => Math.max(m, o.votos), 0);
      const vencedoras = maxima > 0 ? porOpcao.filter((o) => o.votos === maxima) : [];

      return {
        propostaId: p.id,
        titulo: p.titulo,
        ordem: p.ordem ?? 0,
        totalVotos: total,
        opcoes: porOpcao.map((o) => ({
          ...o,
          percentual: total > 0 ? Math.round((o.votos / total) * 100) : 0,
          percentualAptas: aptasParaDeliberar > 0
            ? Math.round((o.votos / aptasParaDeliberar) * 100)
            : 0,
        })),
        empate: vencedoras.length > 1,
        aprovada: vencedoras.length === 1 ? vencedoras[0] : null,
      };
    });

    // DIAGNÓSTICO TEMPORÁRIO: se a gravação for recusada, este log mostra o
    // documento que tentamos gravar, e o erro do Firestore vem logo abaixo.
    console.log('[ipevox] gravando /resultados/' + assembleiaId, {
      unidadesAptas: aptasParaDeliberar,
      totalVotos: totalConsiderado,
      votosExcluidos: totalExcluido,
      publicadoPor,
      propostasNaApuracao: apuracao.length,
    });

    try {
      await setDoc(doc(db, COLECOES.RESULTADOS, assembleiaId), semIndefinidos({
        assembleiaId,
        // `unidadesAptas` aqui é a base de cálculo usada no percentual: já exclui
        // as inadimplentes. `unidadesAptasCadastro` guarda o número bruto, para a
        // ata poder mostrar as duas informações sem ambiguidade.
        unidadesAptas: aptasParaDeliberar,
        unidadesAptasCadastro: Number(unidadesAptas) || 0,
        unidadesInadimplentes: inadimplentes.size,
        votosExcluidos: totalExcluido,
        totalVotos: totalConsiderado,
        apuracao,
        publicadoPor,
        publicadoEm: serverTimestamp(),
      }));
      console.log('[ipevox] /resultados gravado com sucesso');
    } catch (erroGravacao) {
      console.error('[ipevox] FALHA ao gravar /resultados:', {
        code: erroGravacao?.code,
        message: erroGravacao?.message,
      });
      throw erroGravacao;
    }

    try {
      await updateDoc(doc(db, COLECOES.ASSEMBLEIAS, assembleiaId), {
        resultadoPublicado: true,
      });
      console.log('[ipevox] assembleia marcada como publicada');
    } catch (erroUpdate) {
      console.error('[ipevox] FALHA ao marcar assembleia como publicada:', {
        code: erroUpdate?.code,
        message: erroUpdate?.message,
      });
      // Não relançamos: o resultado JÁ foi gravado, e ele é o documento que
      // importa. A flag é conveniência de exibição; a tela passou a decidir pelo
      // documento de resultado, e não por esta flag.
    }

    return {
      totalVotos: totalConsiderado,
      votosExcluidos: totalExcluido,
      inadimplentes: inadimplentes.size,
      apuracao,
    };
  });
}

// -----------------------------------------------------------------------------
// Administrador do sistema: listar síndicos, abrir votos, auditoria
// -----------------------------------------------------------------------------

/**
 * Códigos de erro com o mesmo formato que o antigo cliente de funções usava.
 * A interface já estava escrita esperando `falha.codigo` — mantê-lo evita
 * reescrever as telas só por causa da mudança de transporte.
 */
export const ERRO = {
  SEM_PERMISSAO: 'sem-permissao',
  NAO_ENCONTRADO: 'nao-encontrado',
  JA_EXISTE: 'ja-existe',
  ESTADO_INVALIDO: 'estado-invalido',
  DADOS_INVALIDOS: 'dados-invalidos',
  REDE: 'rede',
  DESCONHECIDO: 'desconhecido',
};

/**
 * Lista os síndicos cadastrados.
 *
 * Leitura direta da coleção: a regra permite que o administrador do sistema leia
 * todos os documentos de `/admins`. Um síndico comum só lê o próprio — não
 * existe, no cliente, leitura da lista por quem não é administrador.
 */
export async function listarSindicos() {
  return executar(async () => {
    const snap = await getDocs(collection(obterDb(), COLECOES.ADMINS));

    const sindicos = snap.docs.map((d) => {
      const dados = d.data();
      return {
        uid: d.id,
        nome: dados.nome ?? '',
        email: dados.email ?? '',
        condominio: dados.condominio ?? '',
        telefone: dados.telefone ?? '',
        ativo: dados.ativo !== false,
        criadoEm: dados.criadoEm?.toDate?.().toISOString?.() ?? null,
      };
    });

    sindicos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return { sindicos };
  });
}

/**
 * Lê os votos INDIVIDUAIS de uma assembleia — com unidade e autor.
 *
 * Só o administrador do sistema consegue: a regra de `/votos` nega para o
 * síndico, e é isso que sustenta o sigilo perante quem administra a votação.
 *
 * Diferente da versão com servidor, NÃO há trilha de auditoria registrando a
 * leitura: sem servidor, nada obriga o registro. Está documentado como limitação
 * no topo de `firestore.rules`.
 */
export async function abrirVotos({ assembleiaId, finalidade }) {
  return executar(async () => {
    if (!String(finalidade ?? '').trim()) {
      throw new ErroOperacao(
        'Descreva a finalidade da abertura (ex.: "conferência do resultado" ou '
        + '"determinação judicial, processo nº ...").',
        'dados-invalidos'
      );
    }

    const [cedulas, assembleia] = await Promise.all([
      lerVotosIndividuais(assembleiaId),
      lerAssembleia(assembleiaId),
    ]);

    return {
      assembleiaId,
      titulo: assembleia?.titulo ?? '',
      modo: assembleia?.modo ?? null,
      cedulas,
      totalCedulas: cedulas.length,
      finalidade,
    };
  });
}

/**
 * A trilha de auditoria deixou de existir como recurso confiável.
 *
 * Sem servidor, nada força o registro de eventos: uma trilha gravada pelo
 * cliente é uma trilha que o cliente pode simplesmente não gravar. A função
 * permanece para a tela não quebrar e devolve lista vazia COM O MOTIVO — melhor
 * uma tela que explica a ausência do que uma tela que finge ter dados.
 */
export async function listarAuditoria() {
  return {
    eventos: [],
    indisponivel: true,
    motivo:
      'A trilha de auditoria dependia de um servidor para registrar os eventos. '
      + 'Como o projeto passou a operar só com recursos gratuitos, ela não existe '
      + 'neste modelo. Os votos individuais continuam acessíveis ao administrador '
      + 'do sistema na aba "Votos", com a contagem por opção.',
  };
}

/**
 * Compatibilidade: não há mais promoção de administrador pelo aplicativo.
 *
 * O papel de administrador do sistema é decidido pelo e-mail fixado em
 * `firestore.rules`. Manter isto devolvendo sucesso silencioso evita que a tela
 * de login quebre, e o comentário registra que não há nada a fazer aqui.
 */
export async function promoverSuperAdmin() {
  return { ok: true, via: 'regras' };
}
