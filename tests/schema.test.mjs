/**
 * ipevox — testes do schema e da apuração
 * =============================================================================
 * A maioria dos defeitos corrigidos neste projeto era de FORMA DE DADOS: ID
 * determinístico, número de unidade normalizado, proposta identificada por UUID
 * em vez de título, percentual com base de cálculo explícita. Estes testes
 * travam cada uma dessas decisões.
 *
 * Rode com: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  COLECOES,
  MAX_OPCOES,
  MODOS,
  PAPEIS,
  apurarAssembleia,
  apurarProposta,
  compararNumeroUnidade,
  contarVotosConsiderados,
  idComprovante,
  idUnidadeCatalogo,
  idVoto,
  normalizarNumeroUnidade,
  validarNovaAssembleia,
} from '../shared/schema.mjs';

describe('normalizarNumeroUnidade', () => {
  it('trata "01", " 1 " e "1" como a mesma unidade', () => {
    // Sem isso, a mesma unidade votava mais de uma vez digitando "016" em vez
    // de "16" — era um caminho trivial para burlar o limite de um voto.
    const variações = ['1', '01', ' 1 ', '001'];
    const resultados = new Set(variações.map(normalizarNumeroUnidade));
    assert.deepEqual([...resultados], ['1']);
  });

  it('normaliza maiúsculas e remove espaços internos', () => {
    assert.equal(normalizarNumeroUnidade(' bloco a 12 '), 'BLOCOA12');
  });

  it('lida com unidades alfanuméricas sem destruir o texto', () => {
    assert.equal(normalizarNumeroUnidade('casa-03'), 'CASA-3');
    assert.equal(normalizarNumeroUnidade('1204-A'), '1204-A');
  });

  it('devolve string vazia para entrada vazia', () => {
    assert.equal(normalizarNumeroUnidade(''), '');
    assert.equal(normalizarNumeroUnidade('   '), '');
    assert.equal(normalizarNumeroUnidade(null), '');
    assert.equal(normalizarNumeroUnidade(undefined), '');
  });
});

describe('IDs determinísticos', () => {
  it('gera o mesmo ID de voto para a mesma tag e proposta', () => {
    // É esta igualdade que substitui a constraint de unicidade que o Firestore
    // não tem: o caminho do documento passa a ser a própria garantia de que uma
    // unidade vota uma vez por proposta.
    assert.equal(
      idVoto('asb_1', 'prop_1', 'tag-abc'),
      idVoto('asb_1', 'prop_1', 'tag-abc')
    );
  });

  it('separa unidades e propostas no ID do voto', () => {
    const a = idVoto('asb_1', 'prop_1', 'tag-16');
    const b = idVoto('asb_1', 'prop_1', 'tag-17');
    const c = idVoto('asb_1', 'prop_2', 'tag-16');

    assert.notEqual(a, b);
    assert.notEqual(a, c);
  });

  it('gera o mesmo ID de comprovante para a mesma assembleia e tag', () => {
    assert.equal(
      idComprovante('asb_1', 'tag-abc'),
      idComprovante('asb_1', 'tag-abc')
    );
    assert.notEqual(
      idComprovante('asb_1', 'tag-abc'),
      idComprovante('asb_2', 'tag-abc')
    );
  });

  it('usa o número normalizado como ID do catálogo', () => {
    assert.equal(idUnidadeCatalogo('016'), '16');
    assert.equal(idUnidadeCatalogo(' 16 '), '16');
    // Um número gravado como NUMBER também precisa virar o mesmo ID de texto.
    // O seed grava `numero` como string, mas uma unidade adicionada pela tela
    // pode chegar como número — e os dois caminhos têm de coincidir, senão
    // passam a existir dois documentos para a mesma unidade.
    assert.equal(idUnidadeCatalogo(1), '1');
    assert.equal(idUnidadeCatalogo(1), idUnidadeCatalogo('1'));
  });

  it('mantém exportada a função que o script de semeadura importa', () => {
    // REGRESSÃO REAL: durante a refatoração para o modelo sem servidor, um bloco
    // de `shared/schema.mjs` foi reescrito e `idUnidadeCatalogo` deixou de ser
    // exportada. O script `seed-unidades.mjs` continuou importando-a, recebeu
    // `undefined` e chamou `doc(undefined)` — o Firestore gerou IDs ALEATÓRIOS
    // para as 59 unidades.
    //
    // O estrago foi silencioso: o campo `numero` foi gravado certo, então a lista
    // na tela parecia perfeita. Só as operações por ID falhavam, e `deleteDoc` de
    // um documento inexistente devolve SUCESSO — a tela dizia "removido" sem
    // remover nada.
    //
    // Este teste existe para que a remoção de um export usado por script falhe
    // aqui, e não em produção com 59 documentos corrompidos.
    const usadosPorScripts = [
      'idUnidadeCatalogo',
      'normalizarNumeroUnidade',
      'COLECOES',
    ];
    const modulo = { idUnidadeCatalogo, normalizarNumeroUnidade, COLECOES };
    for (const nome of usadosPorScripts) {
      assert.notEqual(modulo[nome], undefined, `${nome} precisa continuar exportada`);
    }
  });

  it('nunca gera barra em nenhum dos IDs determinísticos', () => {
    // Esta invariante é o que permite às regras do Firestore recuperarem a
    // assembleia a partir do ID do documento (`id.split('~')[0]`) e o que impede
    // a criação de um caminho inválido.
    const entradas = ['16', 'A/B', 'CASA-3', 'bloco a 12', 'Não', 'Sim/Não', '1.2'];
    const gerados = [];

    for (const entrada of entradas) {
      gerados.push(idComprovante('asb_1', entrada));
      gerados.push(idVoto('asb_1', 'prop_1', entrada));
      gerados.push(idUnidadeCatalogo(entrada));
    }

    for (const id of gerados) {
      assert.ok(!id.includes('/'), `ID inválido gerado: "${id}"`);
      assert.ok(id.length > 0 && id.length < 1500, `ID fora do limite: "${id}"`);
    }
  });

  it('separa as partes do ID com o mesmo separador usado pelas regras', () => {
    // As regras contam as partes (`split('~').size() == 2`) para validar a forma
    // do comprovante. Se o separador mudasse em um lugar só, toda criação de
    // comprovante passaria a ser negada.
    const partesComprovante = idComprovante('asb_1', 'tag-abc').split('~');
    const partesVoto = idVoto('asb_1', 'prop_1', 'tag-abc').split('~');

    assert.equal(partesComprovante.length, 2);
    assert.equal(partesVoto.length, 3);
    assert.equal(partesVoto[0], 'asb_1');
    // A tag é o último segmento: é assim que `encerrarAssembleia` e `abrirVotos`
    // recuperam a unidade a partir do ID do documento.
    assert.equal(partesVoto[2], 'tag-abc');
  });
});

describe('compararNumeroUnidade', () => {
  it('ordena as 59 unidades de um condomínio em ordem natural', () => {
    // Este é o caso real relatado pelo síndico, e o defeito que ele via:
    // `orderBy('numero')` no Firestore compara strings, então a lista saía
    // 1, 10, 11, 12, …, 19, 2, 20, 21, …, 3, …
    const esperado = Array.from({ length: 59 }, (_, i) => String(i + 1));
    const comoVinhaDoFirestore = [...esperado].sort(); // sort() padrão = lexicográfico
    const comoFicaNaTela = [...comoVinhaDoFirestore].sort(compararNumeroUnidade);

    assert.deepEqual(comoFicaNaTela, esperado);
    // E confirma que a ordem lexicográfica realmente era diferente, para o teste
    // não passar por acidente se alguém "consertar" a entrada.
    assert.notDeepEqual(comoVinhaDoFirestore, esperado);
    assert.equal(comoVinhaDoFirestore[1], '10');
    assert.equal(comoFicaNaTela[1], '2');
  });

  it('coloca 9 antes de 10 e 99 antes de 100', () => {
    assert.deepEqual(['9', '10'].sort(compararNumeroUnidade), ['9', '10']);
    assert.deepEqual(['100', '99'].sort(compararNumeroUnidade), ['99', '100']);
    assert.deepEqual(['1000', '999'].sort(compararNumeroUnidade), ['999', '1000']);
  });

  it('trata zeros à esquerda como o mesmo número', () => {
    // "007" e "7" têm o mesmo valor; a ordem sai determinística, do mais curto
    // para o mais longo.
    assert.deepEqual(['10', '007', '7'].sort(compararNumeroUnidade), ['7', '007', '10']);
  });

  it('lida com unidades alfanuméricas sem quebrar', () => {
    const ordenado = ['CASA-10', 'CASA-2', 'CASA-1'].sort(compararNumeroUnidade);
    assert.deepEqual(ordenado, ['CASA-1', 'CASA-2', 'CASA-10']);
  });

  it('coloca a unidade antes da sua subdivisão', () => {
    assert.deepEqual(['10-A', '10', '9'].sort(compararNumeroUnidade), ['9', '10', '10-A']);
  });

  it('não lança com valores ausentes', () => {
    assert.doesNotThrow(() => [null, undefined, '3'].sort(compararNumeroUnidade));
  });

  it('é determinístico e não depende do ambiente', () => {
    // A implementação é explícita de propósito: `localeCompare` com `numeric`
    // depende de dados de locale do runtime e já devolveu ordem inesperada.
    const entrada = ['11', '2', '1', '10', '20', '3'];
    const primeira = [...entrada].sort(compararNumeroUnidade);
    const segunda = [...entrada].reverse().sort(compararNumeroUnidade);
    assert.deepEqual(primeira, segunda);
  });
});

describe('coleções do modelo sem servidor', () => {
  it('mantém o voto separado do espelho de contagem', () => {
    // Esta separação é o que resolve a contradição do projeto: o síndico precisa
    // APURAR, mas não pode LER votos. O voto completo (com unidade e autor) vive
    // em /votos, de leitura exclusiva do administrador do sistema; o espelho
    // anônimo vive em /votos_contagem, legível por operadores.
    //
    // Se alguém um dia unificar as duas coleções, o sigilo perante o síndico cai
    // sem que nenhum outro teste perceba.
    assert.equal(COLECOES.VOTOS, 'votos');
    assert.equal(COLECOES.VOTOS_CONTAGEM, 'votos_contagem');
    assert.notEqual(COLECOES.VOTOS, COLECOES.VOTOS_CONTAGEM);
  });

  it('não guarda mais o papel de administrador em coleção do banco', () => {
    // No modelo sem servidor, um documento de super admin seria escrito pelo
    // próprio cliente — qualquer pessoa poderia se promover. O papel passou a ser
    // definido por e-mail no arquivo de regras, e esta coleção deixou de existir.
    assert.equal(COLECOES.SUPER_ADMINS, undefined);
    assert.equal(COLECOES.ADMINS, 'admins');
  });

  it('mantém a coleção de controle, que fecha a janela de bootstrap', () => {
    // Regra de segurança não consegue consultar uma coleção inteira. É o
    // documento-marcador em /controle que distingue instalação nova de
    // instalação em uso, permitindo o bootstrap acontecer uma única vez.
    assert.equal(COLECOES.CONTROLE, 'controle');
  });

  it('define exatamente três papéis', () => {
    assert.equal(PAPEIS.MORADOR, 'morador');
    assert.equal(PAPEIS.SINDICO, 'sindico');
    assert.equal(PAPEIS.SUPER_ADMIN, 'super_admin');
    assert.equal(Object.keys(PAPEIS).length, 3);
  });
});

describe('contarVotosConsiderados (inadimplência)', () => {
  const votos = [
    { propostaId: 'p1', opcao: 'Sim', tag: '10' },
    { propostaId: 'p1', opcao: 'Sim', tag: '11' },
    { propostaId: 'p1', opcao: 'Não', tag: '12' },
    { propostaId: 'p2', opcao: 'Sim', tag: '10' },
  ];

  it('conta tudo quando ninguém está inadimplente', () => {
    const r = contarVotosConsiderados(votos, new Set());
    assert.equal(r.contagens.p1.Sim, 2);
    assert.equal(r.contagens.p1.Não, 1);
    assert.equal(r.totalConsiderado, 4);
    assert.equal(r.totalExcluido, 0);
  });

  it('exclui o voto da unidade inadimplente da contagem', () => {
    // Esta é a regra pedida: a unidade em débito PODE votar, mas o voto dela não
    // entra na deliberação.
    const r = contarVotosConsiderados(votos, new Set(['11']));
    assert.equal(r.contagens.p1.Sim, 1, 'o Sim da unidade 11 não pode contar');
    assert.equal(r.contagens.p1.Não, 1);
    assert.equal(r.totalConsiderado, 3);
    assert.equal(r.totalExcluido, 1);
  });

  it('exclui a unidade de TODAS as propostas, não só de uma', () => {
    // Um erro fácil de cometer seria excluir só da proposta corrente. A unidade
    // inadimplente não delibera em nenhuma.
    const r = contarVotosConsiderados(votos, new Set(['10']));

    assert.equal(r.contagens.p1.Sim, 1);
    // A proposta p2 só tinha voto da unidade excluída. O esperado é que ela nem
    // apareça no mapa — uma chave com objeto vazio sugeriria "proposta sem
    // votos", que é informação diferente.
    assert.equal('p2' in r.contagens, false);
    assert.equal(r.totalConsiderado, 2);
    assert.equal(r.totalExcluido, 2);
  });

  it('exclui várias unidades ao mesmo tempo', () => {
    const r = contarVotosConsiderados(votos, new Set(['11', '12']));
    assert.equal(r.totalConsiderado, 2);
    assert.equal(r.totalExcluido, 2);
  });

  it('zera a contagem quando todos são inadimplentes', () => {
    const r = contarVotosConsiderados(votos, new Set(['10', '11', '12']));
    assert.deepEqual(r.contagens, {});
    assert.equal(r.totalConsiderado, 0);
    assert.equal(r.totalExcluido, 4);
  });

  it('não quebra com lista vazia nem com voto incompleto', () => {
    assert.deepEqual(contarVotosConsiderados([], new Set()), {
      contagens: {},
      totalConsiderado: 0,
      totalExcluido: 0,
    });

    const r = contarVotosConsiderados(
      [{ tag: '10' }, { propostaId: 'p1', tag: '11' }, null],
      new Set()
    );
    assert.equal(r.totalConsiderado, 0);
    assert.equal(r.totalExcluido, 0);
  });

  it('compara a tag como texto, para "10" casar com "10"', () => {
    // O `tag` vem do Firestore como string e o conjunto de inadimplentes é
    // montado a partir do ID do documento do catálogo, que também é string.
    // Comparar número com texto aqui excluiria a unidade errada.
    const r = contarVotosConsiderados([{ propostaId: 'p1', opcao: 'Sim', tag: '10' }], new Set(['10']));
    assert.equal(r.totalExcluido, 1);
  });
});

describe('validarNovaAssembleia', () => {
  const base = {
    titulo: 'Assembleia Ordinária',
    descricao: '',
    modo: MODOS.ABERTA,
    propostas: [{ titulo: 'Reforma', opcoes: ['Sim', 'Não'] }],
  };

  it('aceita uma entrada válida', () => {
    const r = validarNovaAssembleia(base);
    assert.equal(r.titulo, 'Assembleia Ordinária');
    assert.equal(r.propostas.length, 1);
    assert.equal(r.propostas[0].ordem, 1);
  });

  it('exige título', () => {
    assert.throws(() => validarNovaAssembleia({ ...base, titulo: '   ' }), /Título/);
  });

  it('exige um modo válido', () => {
    assert.throws(() => validarNovaAssembleia({ ...base, modo: 'secreto' }), /Modo inválido/);
  });

  it('exige ao menos uma proposta', () => {
    assert.throws(() => validarNovaAssembleia({ ...base, propostas: [] }), /pelo menos uma proposta/);
  });

  it('rejeita títulos de proposta repetidos', () => {
    // Títulos iguais faziam a apuração antiga somar os votos das duas propostas
    // na mesma barra.
    assert.throws(
      () => validarNovaAssembleia({
        ...base,
        propostas: [
          { titulo: 'Reforma', opcoes: ['Sim', 'Não'] },
          { titulo: 'reforma', opcoes: ['Sim', 'Não'] },
        ],
      }),
      /duas propostas com o título/
    );
  });

  it('exige o mínimo de opções distintas', () => {
    assert.throws(
      () => validarNovaAssembleia({ ...base, propostas: [{ titulo: 'X', opcoes: ['Sim'] }] }),
      /pelo menos 2 opções/
    );
  });

  it('remove opções duplicadas e vazias antes de contar', () => {
    const r = validarNovaAssembleia({
      ...base,
      propostas: [{ titulo: 'X', opcoes: ['Sim', 'sim', '  ', 'Não', 'Sim'] }],
    });
    assert.deepEqual(r.propostas[0].opcoes, ['Sim', 'Não']);
  });

  it('recusa mais opções do que o limite da interface', () => {
    const opcoes = Array.from({ length: MAX_OPCOES + 1 }, (_, i) => `Opção ${i}`);
    assert.throws(
      () => validarNovaAssembleia({ ...base, propostas: [{ titulo: 'X', opcoes }] }),
      /no máximo/
    );
  });

  it('recusa descrição excessivamente longa', () => {
    assert.throws(
      () => validarNovaAssembleia({ ...base, descricao: 'a'.repeat(1001) }),
      /Descrição/
    );
  });

  it('preserva a ordem declarada das propostas', () => {
    const r = validarNovaAssembleia({
      ...base,
      propostas: [
        { titulo: 'A', opcoes: ['Sim', 'Não'] },
        { titulo: 'B', opcoes: ['Sim', 'Não'] },
        { titulo: 'C', opcoes: ['Sim', 'Não'] },
      ],
    });
    assert.deepEqual(r.propostas.map((p) => p.ordem), [1, 2, 3]);
    assert.deepEqual(r.propostas.map((p) => p.titulo), ['A', 'B', 'C']);
  });
});

describe('apurarProposta', () => {
  it('calcula percentual sobre os votos E sobre as unidades aptas', () => {
    // O defeito que este teste trava: a tela antiga calculava só sobre os
    // votantes, então 3 votos "Sim" de 59 unidades apareciam como "100%".
    const r = apurarProposta({
      opcoes: ['Sim', 'Não', 'Abstenção'],
      contagens: { Sim: 3 },
      unidadesAptas: 59,
    });

    assert.equal(r.totalVotos, 3);
    assert.equal(r.opcoes[0].percentual, 100); // 100% DOS VOTOS…
    assert.equal(r.opcoes[0].percentualAptas, 5); // …mas apenas 5% DAS UNIDADES
    assert.equal(r.quorumPercentual, 5);
    assert.equal(r.maisVotada.opcao, 'Sim');
  });

  it('sinaliza empate em vez de escolher uma vencedora arbitrária', () => {
    const r = apurarProposta({
      opcoes: ['Sim', 'Não'],
      contagens: { Sim: 10, Não: 10 },
      unidadesAptas: 40,
    });

    assert.equal(r.empate, true);
    assert.equal(r.maisVotada, null);
    assert.deepEqual(r.empatadas.sort(), ['Não', 'Sim']);
  });

  it('não divide por zero quando ninguém votou', () => {
    const r = apurarProposta({ opcoes: ['Sim', 'Não'], contagens: {}, unidadesAptas: 59 });

    assert.equal(r.totalVotos, 0);
    assert.equal(r.opcoes[0].percentual, 0);
    assert.equal(r.opcoes[0].percentualAptas, 0);
    assert.equal(r.quorumPercentual, 0);
    assert.equal(r.maisVotada, null);
    assert.equal(r.empate, false);
  });

  it('trata opção sem nenhum voto', () => {
    const r = apurarProposta({
      opcoes: ['Sim', 'Não', 'Abstenção'],
      contagens: { Sim: 5, Não: 5 },
      unidadesAptas: 20,
    });
    const abstencao = r.opcoes.find((o) => o.opcao === 'Abstenção');
    assert.equal(abstencao.votos, 0);
    assert.equal(abstencao.percentual, 0);
  });
});

describe('apurarAssembleia', () => {
  const propostas = [
    { id: 'prop_1', titulo: 'Reforma', opcoes: ['Sim', 'Não'], ordem: 1 },
    { id: 'prop_2', titulo: 'Portaria', opcoes: ['Sim', 'Não'], ordem: 2 },
  ];

  it('apura cada proposta pela sua própria contagem', () => {
    // Antes, a contagem era indexada pelo TÍTULO da proposta. Aqui a chave é o
    // propostaId, então renomear o título não desloca votos.
    const r = apurarAssembleia({
      propostas,
      contagens: {
        prop_1: { Sim: 30, Não: 11 },
        prop_2: { Sim: 5, Não: 36 },
      },
      unidadesAptas: 59,
    });

    assert.equal(r.propostas[0].totalVotos, 41);
    assert.equal(r.propostas[0].maisVotada.opcao, 'Sim');
    assert.equal(r.propostas[1].totalVotos, 41);
    assert.equal(r.propostas[1].maisVotada.opcao, 'Não');
    assert.equal(r.totalParticipacoes, 82);
  });

  it('não quebra quando falta contagem para uma proposta', () => {
    const r = apurarAssembleia({ propostas, contagens: {}, unidadesAptas: 59 });
    assert.equal(r.propostas.length, 2);
    assert.equal(r.propostas[0].totalVotos, 0);
    assert.equal(r.propostas[0].maisVotada, null);
  });

  it('propaga a base de unidades aptas para todas as propostas', () => {
    const r = apurarAssembleia({
      propostas,
      contagens: { prop_1: { Sim: 59 } },
      unidadesAptas: 59,
    });
    assert.equal(r.propostas[0].unidadesAptas, 59);
    assert.equal(r.propostas[0].quorumPercentual, 100);
  });
});

