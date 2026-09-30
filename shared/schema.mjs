/**
 * ipevox — schema canônico (módulo compartilhado)
 * =============================================================================
 * Este arquivo é a fonte única de verdade sobre a forma dos dados. É importado
 * tanto pelo app Next.js (`src/lib/schema.js` reexporta daqui) quanto pelas
 * Cloud Functions (`functions/src/*.js`), para que cliente e servidor nunca
 * divirjam sobre nomes de coleção, campos ou IDs.
 *
 * Histórico do problema que este arquivo resolve: antes, o vínculo entre voto e
 * unidade era gravado em texto puro (`votos.unidadeDocId`) e a proposta era
 * identificada pelo seu título. Isso quebrava o sigilo e fazia votos sumirem
 * quando um título era renomeado ou repetido. Agora `propostaId` é um UUID
 * imutável e, em assembleia FECHADA, o conteúdo do voto é cifrado antes de
 * chegar ao banco.
 */

// -----------------------------------------------------------------------------
// Coleções
// -----------------------------------------------------------------------------

export const COLECOES = {
  ASSEMBLEIAS: 'assembleias',
  PROPOSTAS: 'propostas',
  CATALOGO_UNIDADES: 'catalogo_unidades',
  /** Síndicos autorizados. Ler daqui dentro das regras é o que define o papel. */
  ADMINS: 'admins',
  /**
   * Marcadores internos do sistema. Hoje guarda `sindicos_criados`, que registra
   * que a instalação saiu do estado inicial e a janela de bootstrap se fechou.
   *
   * Existe porque regra de segurança não consegue consultar uma coleção inteira:
   * sem um documento-marcador, não haveria como distinguir "instalação nova" de
   * "instalação em uso" ao decidir se aceita a primeira autopromoção.
   */
  CONTROLE: 'controle',
  /** Comprovante de participação. NÃO contém o voto. */
  COMPROVANTES: 'comprovantes',
  /**
   * O voto. Leitura permitida APENAS ao administrador do sistema (definido por
   * e-mail no arquivo de regras).
   *
   * Observação que precisa ser dita: neste modelo, sem servidor, o voto fica em
   * TEXTO CLARO no banco. A proteção é a regra de leitura, não a criptografia.
   * O dono do projeto consegue lê-lo pelo console do Firebase, que ignora
   * regras; o síndico e o morador, não.
   */
  VOTOS: 'votos',
  /**
   * Espelho ANÔNIMO do voto, para o síndico poder apurar.
   *
   * Contém apenas proposta e opção — sem número de unidade, sem uid e sem
   * horário. É o que permite ao síndico somar os votos sem saber quem votou o
   * quê, resolvendo a contradição entre "o síndico apura" e "o síndico não lê
   * votos". A regra exige que este documento exista com a MESMA opção do voto.
   */
  VOTOS_CONTAGEM: 'votos_contagem',
  /** Snapshot final da apuração, gravado no encerramento: a base da ata. */
  RESULTADOS: 'resultados',
  /**
   * Nome da coleção do modelo ANTIGO que guardava as sessões de votação.
   * Mantido apenas para o script de migração ler os dados legados; o modelo
   * atual usa `comprovantes`, com ID determinístico e sem vínculo com a opção.
   */
  UNIDADES_LEGADO: 'unidades',
};

/**
 * Separador dos IDs determinísticos. `~` é válido em ID de documento do
 * Firestore e não exige escape em regra de segurança, ao contrário de `/`.
 */
export const SEP = '~';

// -----------------------------------------------------------------------------
// Modos de votação
// -----------------------------------------------------------------------------

export const MODOS = {
  /** Voto atribuível: qualquer participante vê quem votou o quê (art. 1.335 CC). */
  ABERTA: 'aberta',
  /**
   * Voto restrito: o conteúdo existe no banco, mas a leitura é negada ao síndico
   * e aos moradores. Só o administrador do sistema lê voto individual.
   *
   * O valor interno continua `fechada` por compatibilidade com os dados já
   * gravados; o RÓTULO exibido é "restrita", porque o voto não é cifrado e
   * chamá-lo de "selado" seria promessa falsa.
   */
  FECHADA: 'fechada',
};

export const MODOS_VALIDOS = Object.values(MODOS);

export const ROTULOS_MODO = {
  [MODOS.ABERTA]: 'Votação aberta',
  [MODOS.FECHADA]: 'Votação restrita',
};

export const DESCRICAO_MODO = {
  [MODOS.ABERTA]:
    'O voto fica registrado junto ao número da unidade. Qualquer participante '
    + 'pode ver quem votou o que. É o formato previsto no art. 1.335 do Código '
    + 'Civil e o mais simples de defender em uma impugnação.',
  [MODOS.FECHADA]:
    'O voto NÃO é exibido ao síndico nem aos moradores, em nenhum momento. '
    + 'Durante a votação não há placar: a contagem por opção só é publicada no '
    + 'encerramento, uma única vez, e não pode ser alterada depois. A '
    + 'identificação de como cada unidade votou fica restrita ao administrador '
    + 'do sistema.',
};

export const STATUS_ASSEMBLEIA = {
  ATIVA: 'ativa',
  ENCERRADA: 'encerrada',
};

export const STATUS_COMPROVANTE = {
  VOTANDO: 'votando',
  VOTADO: 'votado',
};

/**
 * Papéis de quem opera o sistema.
 *
 * `MORADOR` é o participante comum, que vota pelo QR Code com sessão anônima.
 * Os outros dois são deliberadamente distintos: o síndico cuida das assembleias
 * do seu condomínio, o super admin provisiona síndicos.
 */
export const PAPEIS = {
  MORADOR: 'morador',
  SINDICO: 'sindico',
  SUPER_ADMIN: 'super_admin',
};

/** Ações registradas na trilha de auditoria. */
export const ACOES_AUDITORIA = {
  ASSEMBLEIA_CRIADA: 'assembleia_criada',
  ASSEMBLEIA_ENCERRADA: 'assembleia_encerrada',
  CHECKIN: 'checkin',
  VOTO_REGISTRADO: 'voto_registrado',
  /**
   * Identificação de como cada unidade votou. Ação do SUPER ADMIN, registrada
   * de forma permanente: autor, data, escopo e finalidade ficam gravados.
   */
  VOTOS_ABERTOS: 'votos_abertos',
  ADMIN_DEFINIDO: 'admin_definido',
  CATALOGO_ALTERADO: 'catalogo_alterado',
  /** Promoção do operador do sistema. Evento raro e de alto impacto. */
  SUPER_ADMIN_DEFINIDO: 'super_admin_definido',
  /** Criação de acesso de síndico pelo super admin. */
  SINDICO_CRIADO: 'sindico_criado',
  /** Revogação de acesso de síndico. */
  SINDICO_REMOVIDO: 'sindico_removido',
};

// -----------------------------------------------------------------------------
// Regras de negócio compartilhadas
// -----------------------------------------------------------------------------

export const MIN_OPCOES = 2;
export const MAX_OPCOES = 10;
export const MAX_TITULO = 120;
export const MAX_DESCRICAO = 1000;
export const MAX_OPCAO = 60;

/**
 * Após este período sem atividade, um comprovante em `votando` é considerado
 * abandonado e a unidade pode retomar o voto em outro aparelho.
 */
export const TIMEOUT_MINUTOS = 15;

// -----------------------------------------------------------------------------
// Identificadores determinísticos
// -----------------------------------------------------------------------------
//
// O Firestore não possui constraint de unicidade. A única forma confiável de
// garantir "uma unidade vota uma vez" sem risco de corrida é derivar o ID do
// documento a partir de dados que já identificam aquele voto. Com ID
// determinístico, uma segunda criação no mesmo caminho falha: o próprio banco
// passa a ser a constraint.
//
// A transação com consulta usada antes NÃO garantia isso: duas abas abertas
// antes de qualquer documento existir enxergavam "vazio" e criavam duas sessões
// para a mesma unidade, permitindo votar duas vezes.

/**
 * Normaliza o número da unidade para que "01", " 1 " e "1" sejam a mesma coisa.
 * Sem isso, a mesma unidade votava mais de uma vez digitando "16" e "016".
 */
export function normalizarNumeroUnidade(numero) {
  const bruto = String(numero ?? '').trim();
  if (!bruto) return '';
  return bruto
    .toUpperCase()
    .replace(/(^|[^0-9])0+([0-9])/g, '$1$2')
    .replace(/\s+/g, '');
}

/**
 * Codifica um valor para virar SEGMENTO de ID de documento do Firestore.
 *
 * Por que isso é necessário: o Firestore rejeita `/` em ID de documento, e um
 * valor sem escape contendo barra transformaria o caminho em outro caminho —
 * `idComprovante('asb_1', 'A/B')` viraria `comprovantes/asb_1~A/B`, ou seja, o
 * documento `B` dentro da coleção `asb_1~A`. Seria um erro silencioso de
 * endereçamento, não apenas um ID feio.
 *
 * O separador `~` também é escapado: ele é o delimitador dos nossos IDs, e um
 * valor que o contivesse criaria uma parte a mais na contagem que as regras do
 * Firestore fazem (`split('~').size()`), fazendo a criação ser negada.
 *
 * Tags reais são base64 (A-Z a-z 0-9 + / =), então na prática só o `/` seria
 * escapado — mas a função é defensiva porque o catálogo aceita número livre,
 * digitado pelo síndico.
 */
export function segmentoId(valor) {
  return String(valor ?? '').replace(/~/g, '%7E').replace(/\//g, '%2F');
}

/** ID do catálogo: o número normalizado, codificado. Torna o check-in um `get`. */
export function idUnidadeCatalogo(numero) {
  return segmentoId(normalizarNumeroUnidade(numero));
}

/**
 * Compara números de unidade do jeito que um humano espera: 2 antes de 10.
 *
 * O defeito que isto corrige: `orderBy('numero', 'asc')` no Firestore compara
 * STRINGS, então a lista saía `1, 10, 11, 12, …, 19, 2, 20, 21, …, 29, 3, …` —
 * exatamente o que o síndico via na tela.
 *
 * Implementação deliberadamente explícita, em vez de depender de
 * `localeCompare(..., { numeric: true })`: aquele caminho é sensível a ambiente
 * (ICU do Node, dados de locale do navegador) e devolveu ordem inesperada em
 * teste. Aqui a regra é nossa e é testável: compara pedaços de dígitos como
 * NÚMEROS, e o resto como texto.
 */
export function compararNumeroUnidade(a, b) {
  const textoA = String(a ?? '');
  const textoB = String(b ?? '');
  if (textoA === textoB) return 0;

  // Compara pedaços de dígitos como números e o resto como texto. Dentro de um
  // mesmo pedaço numérico, o comprimento decide antes dos dígitos: assim "9" vem
  // antes de "10" (1 dígito contra 2), enquanto "10" vem antes de "11" (mesmo
  // comprimento, compara dígito a dígito, sem risco de estourar a precisão de
  // um número de ponto flutuante em valores muito longos).
  const pedacos = /(\d+)|(\D+)/g;
  const partesA = textoA.match(pedacos) ?? [];
  const partesB = textoB.match(pedacos) ?? [];

  const total = Math.min(partesA.length, partesB.length);

  for (let i = 0; i < total; i += 1) {
    const parteA = partesA[i];
    const parteB = partesB[i];
    if (parteA === parteB) continue;

    const numericaA = /^\d+$/.test(parteA);
    const numericaB = /^\d+$/.test(parteB);

    // Número antes de texto: "10" antes de "10-A", que é como se lê uma lista de
    // unidades com subdivisões.
    if (numericaA !== numericaB) return numericaA ? -1 : 1;

    if (numericaA) {
      // Zeros à esquerda não mudam o valor: "007" e "7" são o mesmo número.
      const limpaA = parteA.replace(/^0+(?=\d)/, '');
      const limpaB = parteB.replace(/^0+(?=\d)/, '');
      if (limpaA.length !== limpaB.length) return limpaA.length - limpaB.length;
      if (limpaA !== limpaB) return limpaA < limpaB ? -1 : 1;
      // Mesmo valor numérico com escrita diferente ("7" e "007"): o mais curto
      // primeiro, para a ordem ser determinística e estável.
      return parteA.length - parteB.length;
    }

    // Texto: ordem alfabética simples, sem depender de locale.
    return parteA.toLowerCase() < parteB.toLowerCase() ? -1 : 1;
  }

  return partesA.length - partesB.length;
}

/** ID em `comprovantes`: uma sessão por (assembleia, unidade).
 *
 * O nome do documento usa a TAG da unidade (um HMAC), não o número. Guardar o
 * número no caminho do documento recriaria o problema que este modelo existe
 * para resolver: quem lê a coleção `comprovantes` montaria a lista de quem
 * participou, e cruzando com o nome determinístico da cédula voltaria a existir
 * a tabela "unidade → voto".
 */export function idComprovante(assembleiaId, tagUnidade) {
  return `${segmentoId(assembleiaId)}${SEP}${segmentoId(tagUnidade)}`;
}

/** ID em `votos`: uma cédula por (assembleia, proposta, unidade).
 *
 * `tagUnidade` é o HMAC da unidade. É este ID determinístico — e não uma
 * consulta — que garante "uma unidade vota uma vez": o Firestore não tem
 * constraint de unicidade, então o caminho do documento faz esse papel.
 */
export function idVoto(assembleiaId, propostaId, tagUnidade) {
  return `${segmentoId(assembleiaId)}${SEP}${segmentoId(propostaId)}${SEP}${segmentoId(tagUnidade)}`;
}

/** ID em `contagem`: uma linha de total por (assembleia, proposta, opção). */
export function idContagem(assembleiaId, propostaId, opcao) {
  return `${segmentoId(assembleiaId)}${SEP}${segmentoId(propostaId)}${SEP}${segmentoId(codificarOpcao(opcao))}`;
}

/** ID do contador de participação: um por assembleia. */
export function idParticipacao(assembleiaId) {
  return segmentoId(assembleiaId);
}

/**
 * Codifica a opção para uso em ID de documento. O Firestore rejeita `/` em IDs, e
 * a chave de campo `votosComputados.{titulo}` usada antes quebrava quando o
 * título tinha ponto, barra ou espaço.
 */
export function codificarOpcao(opcao) {
  return String(opcao ?? '')
    .trim()
    .replace(/\//g, '∕') // barra de divisão U+2215: visualmente igual, válida em ID
    .replace(/\s+/g, '_');
}

/** `crypto.randomUUID` existe no browser e no Node >= 19 (runtime das Functions). */
function uuid() {
  return globalThis.crypto.randomUUID();
}

/** ID do subdocumento em `assembleias/{id}/propostas`. */
export function novoPropostaId() {
  return `prop_${uuid()}`;
}

/** ID da assembleia. Substitui o antigo `asb_${Date.now()}`, que colidia. */
export function novaAssembleiaId() {
  return `asb_${uuid()}`;
}

// -----------------------------------------------------------------------------
// Envelope de criptografia (assembleia FECHADA)
// -----------------------------------------------------------------------------
//
// O voto é cifrado com AES-256-GCM usando uma chave que existe SOMENTE no Secret
// Manager, acessível apenas pelas Cloud Functions. A chave nunca chega ao
// cliente e nunca é gravada no Firestore.
//
// Consequências verificáveis:
//  - Quem lê o Firestore (inclusive pelo console) vê apenas ruído.
//  - Duas pessoas votando "Sim" produzem criptogramas diferentes (IV aleatório),
//    então não há padrão para correlacionar.
//  - A única forma de ler é chamar `abrirVotos`, que exige admin e registra a
//    leitura em /auditoria.

export const CRYPTO = {
  ALGORITMO: 'aes-256-gcm',
  VERSAO: 'v1',
  TAMANHO_IV: 12, // 96 bits: recomendado para GCM
  TAMANHO_CHAVE: 32, // 256 bits
  TAMANHO_TAG: 16,
  /** Segredo do Secret Manager que cifra a cédula. */
  SEGREDO: 'IPEVOX_KEK',
  /** Variável de ambiente equivalente (emulador e execução local). */
  ENV: 'IPEVOX_KEK',
  /**
   * Segredo SEPARADO, usado para pseudonimizar a unidade e publicar o
   * compromisso verificável do voto.
   *
   * Por que separado, e não a mesma chave: esta é lida apenas no ENCERRAMENTO.
   * Enquanto a assembleia está em andamento, a função `votar` não tem como
   * derivar o identificador opaco de uma cédula a partir do vínculo guardado no
   * comprovante — ou seja, nem quem opera a infraestrutura consegue correlacionar
   * voto e unidade durante a votação.
   */
  SEGREDO_HASH: 'IPEVOX_HASH_KEY',
  /**
   * Contexto autenticado (AAD) do envelope. Amarra o criptograma à versão, à
   * assembleia, à proposta e à TAG da unidade — de modo que copiar uma cédula
   * para a linha de outra unidade não abre, mesmo com a chave em mãos.
   */
  aad(assembleiaId, propostaId, tagDaUnidade = '') {
    return `${CRYPTO.VERSAO}:${assembleiaId}:${propostaId}:${tagDaUnidade}`;
  },
};

/** Monta o documento de voto em assembleia FECHADA. */
export function envelopeVotoSelado({ iv, ciphertext, authTag }) {
  return {
    selado: true,
    v: CRYPTO.VERSAO,
    alg: CRYPTO.ALGORITMO,
    iv,
    ciphertext,
    authTag,
  };
}

// -----------------------------------------------------------------------------
// Validação (compartilhada entre Cloud Functions, cliente e testes)
// -----------------------------------------------------------------------------

/**
 * Valida os dados de uma assembleia em criação. Lança Error com mensagem em
 * português, pronta para exibição ao síndico.
 */
export function validarNovaAssembleia({ titulo, descricao = '', modo, propostas }) {
  const tituloLimpo = String(titulo ?? '').trim();
  if (!tituloLimpo) throw new Error('Título é obrigatório.');
  if (tituloLimpo.length > MAX_TITULO) {
    throw new Error(`Título deve ter no máximo ${MAX_TITULO} caracteres.`);
  }

  const descricaoLimpa = String(descricao ?? '').trim();
  if (descricaoLimpa.length > MAX_DESCRICAO) {
    throw new Error(`Descrição deve ter no máximo ${MAX_DESCRICAO} caracteres.`);
  }

  if (!MODOS_VALIDOS.includes(modo)) {
    throw new Error(`Modo inválido. Use "${MODOS.ABERTA}" ou "${MODOS.FECHADA}".`);
  }

  if (!Array.isArray(propostas) || propostas.length === 0) {
    throw new Error('Adicione pelo menos uma proposta.');
  }

  const titulosVistos = new Set();
  const limpas = propostas.map((p, i) => {
    const numero = i + 1;
    const t = String(p?.titulo ?? '').trim();
    if (!t) throw new Error(`A proposta ${numero} está sem título.`);
    if (t.length > MAX_TITULO) {
      throw new Error(`O título da proposta ${numero} excede ${MAX_TITULO} caracteres.`);
    }
    // Títulos repetidos quebravam a apuração antiga, que agrupava por título.
    const chave = t.toLowerCase();
    if (titulosVistos.has(chave)) {
      throw new Error(`Há duas propostas com o título "${t}". Dê nomes diferentes.`);
    }
    titulosVistos.add(chave);

    const desc = String(p?.descricao ?? '').trim();
    if (desc.length > MAX_DESCRICAO) {
      throw new Error(`A descrição da proposta ${numero} excede ${MAX_DESCRICAO} caracteres.`);
    }

    const opcoesBrutas = Array.isArray(p?.opcoes) ? p.opcoes : [];
    const opcoes = [];
    for (const o of opcoesBrutas) {
      const limpa = String(o ?? '').trim();
      if (!limpa) continue;
      if (limpa.length > MAX_OPCAO) {
        throw new Error(`A opção "${limpa}" excede ${MAX_OPCAO} caracteres.`);
      }
      if (opcoes.some((x) => x.toLowerCase() === limpa.toLowerCase())) continue;
      opcoes.push(limpa);
    }
    if (opcoes.length < MIN_OPCOES) {
      throw new Error(`A proposta "${t}" precisa de pelo menos ${MIN_OPCOES} opções distintas.`);
    }
    if (opcoes.length > MAX_OPCOES) {
      throw new Error(`A proposta "${t}" aceita no máximo ${MAX_OPCOES} opções.`);
    }

    return { titulo: t, descricao: desc, opcoes, ordem: numero };
  });

  return { titulo: tituloLimpo, descricao: descricaoLimpa, modo, propostas: limpas };
}

// -----------------------------------------------------------------------------
// Datas
// -----------------------------------------------------------------------------

/**
 * Normaliza um valor de data vindo do Firestore, que pode ser Timestamp,
 * string ISO ou ausente. Antes, `criadoEm` era gravado como string em um lugar
 * e como Timestamp em outro, o que impedia ordenar por data.
 */
export function paraData(valor) {
  if (!valor) return null;
  if (typeof valor.toDate === 'function') return valor.toDate();
  if (typeof valor.seconds === 'number') return new Date(valor.seconds * 1000);
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatarData(valor) {
  const d = paraData(valor);
  return d ? d.toLocaleDateString('pt-BR') : '—';
}

export function formatarDataHora(valor) {
  const d = paraData(valor);
  return d ? d.toLocaleString('pt-BR') : '—';
}

// -----------------------------------------------------------------------------
// Apuração
// -----------------------------------------------------------------------------

/**
 * Conta os votos de uma assembleia, EXCLUINDO as unidades inadimplentes.
 *
 * Regra de assembleia de condomínio: a unidade em débito pode se manifestar, mas
 * o voto dela não entra na deliberação. Aqui isso significa: o voto é preservado
 * no banco e apenas a CONTAGEM o ignora.
 *
 * Por que preservar em vez de apagar: se a inadimplência for contestada ou
 * regularizada depois, o voto existe e pode ser reconsiderado. Apagar seria
 * irreversível, e irreversibilidade sem necessidade é o que se evita aqui.
 *
 * @param {Array} votos lista de `{ propostaId, opcao, tag }`
 * @param {Set<string>} inadimplentes números de unidade (a `tag`) em débito
 */
export function contarVotosConsiderados(votos = [], inadimplentes = new Set()) {
  const contagens = {};
  let totalConsiderado = 0;
  let totalExcluido = 0;

  for (const voto of votos) {
    // A checagem de inadimplência vem ANTES de qualquer criação de estrutura.
    // Se ela viesse depois, um voto excluído ainda criaria a entrada da proposta
    // no mapa — deixando uma chave vazia que sugere "proposta sem votos" quando
    // na verdade a proposta nem foi considerada.
    const tag = String(voto?.tag ?? '');
    if (inadimplentes.has(tag)) {
      totalExcluido += 1;
      continue;
    }
    if (!voto?.propostaId || !voto?.opcao) continue;

    const linha = (contagens[voto.propostaId] ??= {});
    linha[voto.opcao] = (linha[voto.opcao] ?? 0) + 1;
    totalConsiderado += 1;
  }

  return { contagens, totalConsiderado, totalExcluido };
}

/**
 * Apura uma proposta com a base de cálculo explícita.
 *
 * O bug corrigido aqui: a tela antiga calculava percentual apenas sobre os
 * votantes, então 3 votos "Sim" de 59 unidades apareciam como "100%" com barra
 * verde. Para ata, o que importa é a base — votantes sobre unidades aptas.
 *
 * Com a inadimplência, "unidades aptas" passou a ser o número de unidades com
 * direito de deliberar, já descontadas as inadimplentes.
 */
export function apurarProposta({ opcoes = [], contagens = {}, unidadesAptas = 0 }) {
  const porOpcao = opcoes.map((opcao) => ({
    opcao,
    votos: contagens[opcao] ?? 0,
  }));

  const totalVotos = porOpcao.reduce((acc, o) => acc + o.votos, 0);
  const aptas = unidadesAptas > 0 ? unidadesAptas : totalVotos;

  const comPercentual = porOpcao.map((o) => ({
    ...o,
    // Participação relativa entre quem votou.
    percentual: totalVotos > 0 ? Math.round((o.votos / totalVotos) * 100) : 0,
    // Peso real na deliberação, sobre as unidades aptas.
    percentualAptas: aptas > 0 ? Math.round((o.votos / aptas) * 100) : 0,
  }));

  const maisVotada = comPercentual.reduce(
    (melhor, o) => (o.votos > (melhor?.votos ?? -1) ? o : melhor),
    null
  );

  // Empate é informação para a ata, não detalhe de UI.
  const maxima = maisVotada?.votos ?? 0;
  const empatadas = maxima > 0 ? comPercentual.filter((o) => o.votos === maxima) : [];

  return {
    opcoes: comPercentual,
    totalVotos,
    unidadesAptas: aptas,
    quorumAtingido: aptas > 0 ? totalVotos / aptas : 0,
    quorumPercentual: aptas > 0 ? Math.round((totalVotos / aptas) * 100) : 0,
    maisVotada: empatadas.length === 1 ? maisVotada : null,
    empate: empatadas.length > 1,
    empatadas: empatadas.map((o) => o.opcao),
  };
}

/**
 * Aplica a apuração a todas as propostas de uma assembleia.
 * Usado tanto no placar ao vivo quanto no snapshot e no PDF, para que os três
 * nunca divirjam.
 */
export function apurarAssembleia({ propostas = [], contagens = {}, unidadesAptas = 0 }) {
  const porProposta = propostas.map((p) => ({
    propostaId: p.id,
    titulo: p.titulo,
    descricao: p.descricao ?? '',
    ordem: p.ordem ?? 0,
    opcoes: p.opcoes ?? [],
    ...apurarProposta({
      opcoes: p.opcoes ?? [],
      contagens: contagens[p.id] ?? {},
      unidadesAptas,
    }),
  }));

  const totalParticipacoes = porProposta.reduce((acc, p) => acc + p.totalVotos, 0);

  return {
    propostas: porProposta,
    unidadesAptas: unidadesAptas,
    totalParticipacoes,
  };
}
