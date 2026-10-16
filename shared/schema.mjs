/**
 * ipevox — schema canônico (módulo compartilhado)
 * =============================================================================
 * Este arquivo é a fonte única de verdade sobre a forma dos dados. É importado
 * tanto pelo app Next.js (`src/lib/schema.js` reexporta daqui) quanto pelos
 * scripts da raiz (`scripts/*.mjs`), para que as duas pontas nunca divirjam
 * sobre nomes de coleção, campos ou IDs.
 *
 * Histórico do problema que este arquivo resolve: antes, o vínculo entre voto e
 * unidade era gravado em texto puro (`votos.unidadeDocId`) e a proposta era
 * identificada pelo seu título. Isso quebrava o sigilo e fazia votos sumirem
 * quando um título era renomeado ou repetido. Agora `propostaId` é um UUID
 * imutável; a proposta é identificada por ele, e não pelo título.
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
   * Espelho do voto, para o síndico poder apurar.
   *
   * Contém `propostaId` e `opcao` — sem uid e sem horário. A regra exige que este
   * documento exista com a MESMA opção do voto.
   *
   * LIMITAÇÃO HONESTA: o ID do documento e o campo `tag` são o número
   * normalizado da unidade (`a ~ b ~ tag`). Quem pode ler esta coleção (o
   * síndico/operador) consegue, portanto, montar a tabela "unidade → opção". O
   * sigilo perante o síndico não é garantido por este espelho; ver a nota no
   * README. A alternativa (anonimizar de vez) quebraria a exclusão de
   * inadimplentes, que depende de cruzar a `tag` com o catálogo.
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
    + 'pode ver quem votou o quê.',
  [MODOS.FECHADA]:
    'O voto NÃO é exibido nas telas do sistema — nem ao síndico, nem aos '
    + 'moradores. Durante a votação não há placar: a contagem por opção só é '
    + 'publicada no encerramento, uma única vez, e não pode ser alterada depois. '
    + 'A leitura do voto individual (com unidade e autor) é restrita ao '
    + 'administrador do sistema. Limitação registrada no README: o espelho usado '
    + 'para apurar é legível pelos operadores e vincula a opção ao número da '
    + 'unidade.',
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
 * Tags reais aqui são o número normalizado da unidade (A-Z 0-9 e poucos sinais),
 * então na prática só o `/` seria escapado — mas a função é defensiva porque o
 * catálogo aceita número livre, digitado pelo síndico.
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
 * O nome do documento usa a TAG da unidade. Neste modelo a TAG é o próprio
 * número normalizado (`normalizarNumeroUnidade`), e não um HMAC — não há
 * servidor para calcular segredos. Consequência registrada no README: quem lê a
 * coleção `comprovantes` consegue reconstruir a lista de quem participou, porque
 * o número está no caminho do documento.
 */export function idComprovante(assembleiaId, tagUnidade) {
  return `${segmentoId(assembleiaId)}${SEP}${segmentoId(tagUnidade)}`;
}

/** ID em `votos`: uma cédula por (assembleia, proposta, unidade).
 *
 * `tagUnidade` é o número normalizado da unidade. É este ID determinístico — e
 * não uma consulta — que garante "uma unidade vota uma vez": o Firestore não tem
 * constraint de unicidade, então o caminho do documento faz esse papel.
 */
export function idVoto(assembleiaId, propostaId, tagUnidade) {
  return `${segmentoId(assembleiaId)}${SEP}${segmentoId(propostaId)}${SEP}${segmentoId(tagUnidade)}`;
}

/** `crypto.randomUUID` existe no browser e no Node >= 19. */
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
// Validação (compartilhada entre cliente e testes)
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

/**
 * Configuração visual (cores e estilos) para opções de voto.
 *
 * As cores são devolvidas em HEX + estilos inline, e NÃO como classes do
 * Tailwind. Motivo: as classes viviam neste arquivo (fora de `src/`), e o
 * varredor de classes do Tailwind não as gerava no servidor de desenvolvimento —
 * resultado: as barras ficavam sem cor (e às vezes sem altura, quando a classe
 * `h-2.5` também não era encontrada). Com estilo inline a cor é aplicada direto
 * no elemento, independente de build, purge ou cache do dev server.
 *
 * Opções comuns (Sim, Não, Abstenção) recebem cor semântica; qualquer outra
 * opção cadastrada pelo síndico cai numa paleta, escolhida pela posição dela na
 * proposta — o que dá cores distintas e estáveis para "quantas opções quiser".
 */
export function obterConfigOpcao(nomeOpcao, indice = 0) {
  const norm = String(nomeOpcao ?? '').trim().toLowerCase();

  // Opções afirmativas
  if (['sim', 'a favor', 'aprovo', 'favorável', 'favoravel', 'concordo', 'aceito'].includes(norm)) {
    return montarConfigOpcao('sim', '#2dd4bf');
  }

  // Opções negativas
  if (['não', 'nao', 'contra', 'rejeito', 'desfavorável', 'desfavoravel', 'discordo', 'recuso'].includes(norm)) {
    return montarConfigOpcao('nao', '#f43f5e');
  }

  // Opções neutras
  if (['abstenção', 'abstencao', 'abster', 'em branco', 'branco', 'nulo', 'neutro'].includes(norm)) {
    return montarConfigOpcao('abstencao', '#fbbf24');
  }

  // Outras opções personalizadas cadastradas pelo síndico
  const paletaCustom = [
    { chave: 'azul', hex: '#38bdf8' },
    { chave: 'roxo', hex: '#c084fc' },
    { chave: 'laranja', hex: '#fb923c' },
    { chave: 'rosa', hex: '#f472b6' },
    { chave: 'verde-lima', hex: '#a3e635' },
    { chave: 'indigo', hex: '#818cf8' },
  ];

  const item = paletaCustom[indice % paletaCustom.length];
  return montarConfigOpcao(item.chave, item.hex);
}

/**
 * Monta a configuração visual a partir de uma cor hex base, derivando o estilo
 * inline da barra, do texto e do selo (badge) da opção.
 */
function montarConfigOpcao(chave, hex) {
  return {
    chave,
    hex,
    corBarra: hex,
    estiloBarra: { backgroundColor: hex },
    estiloTexto: { color: hex },
    estiloBadge: {
      backgroundColor: `${hex}22`,
      color: hex,
      borderColor: `${hex}99`,
    },
  };
}
