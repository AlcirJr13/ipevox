/**
 * Verificações de integração entre telas e biblioteca.
 *
 * Estes testes existem por um motivo concreto: o projeto acumulou SEIS defeitos
 * do mesmo tipo — uma função da biblioteca exigia algo que a tela não enviava, ou
 * um componente precisava de uma prop que a tela não passava. Nenhum deles era
 * detectável por lint, build ou teste unitário; todos só apareceram no uso:
 *
 *   1. `criarAssembleia` exigia `criadoPor`        -> tela não enviava
 *   2. `criarAssembleia` exigia `unidadesAptas`    -> tela não calculava
 *   3. `checkIn` gravava `uid`                     -> tela não enviava
 *   4. `votar` exigia 8 campos                     -> tela enviava 4
 *   5. `ModalConfirmacao` precisa de `aoConfirmar` -> omitido, botão inerte
 *   6. `publicarResultado` comparava ID com número -> inadimplência não excluía
 *
 * Estes testes leem o código-fonte e conferem as ligações. É verificação
 * estática: não substitui testar a aplicação, mas pega a classe de erro que o
 * compilador não vê.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { describe, it } from 'node:test';

function ler(caminho) {
  return readFileSync(caminho, 'utf8');
}

/**
 * Extrai o conteúdo entre chaves de uma chamada, contando o aninhamento.
 *
 * Necessário porque uma chamada como `criarAssembleia({ ... })` ocupa várias
 * linhas, e uma regex não-gulosa para no primeiro `}`. Foi exatamente esse
 * defeito que fez a primeira versão deste teste acusar campos que ESTAVAM
 * presentes — o teste estava errado, não o código.
 */
function corpoDaChamada(texto, padraoInicio) {
  const inicio = texto.search(padraoInicio);
  if (inicio < 0) return null;

  const abreChaves = texto.indexOf('{', inicio);
  if (abreChaves < 0) return null;

  let profundidade = 0;
  for (let i = abreChaves; i < texto.length; i += 1) {
    if (texto[i] === '{') profundidade += 1;
    else if (texto[i] === '}') {
      profundidade -= 1;
      if (profundidade === 0) return texto.slice(abreChaves, i + 1);
    }
  }
  return null;
}

describe('modais de confirmação', () => {
  const telas = [
    'src/app/resultados/[id]/page.js',
    'src/app/admin/unidades/page.js',
    'src/app/admin/sindicos/page.js',
    'src/app/admin/historico/page.js',
  ];

  it('todo ModalConfirmacao recebe aoConfirmar e aoFechar', () => {
    // O defeito real: o modal de publicar resultado não recebia `aoConfirmar`.
    // O botão chamava `undefined` e clicar não fazia absolutamente nada — sem
    // erro no console, sem mudança visual. Indistinguível de "travou".
    const faltando = [];

    for (const arquivo of telas) {
      if (!existsSync(arquivo)) continue;
      const conteudo = ler(arquivo);
      const modais = [...conteudo.matchAll(/<ModalConfirmacao[\s\S]*?\/>/g)].map((m) => m[0]);

      modais.forEach((modal, indice) => {
        const titulo = (modal.match(/titulo="([^"]+)"/) || [])[1] || `#${indice + 1}`;
        if (!/aoConfirmar=/.test(modal)) faltando.push(`${arquivo} -> "${titulo}" sem aoConfirmar`);
        if (!/aoFechar=/.test(modal)) faltando.push(`${arquivo} -> "${titulo}" sem aoFechar`);
      });
    }

    assert.deepEqual(faltando, [], `modais incompletos:\n${faltando.join('\n')}`);
  });
});

describe('chamadas das telas batem com as funções', () => {
  const api = ler('src/lib/api.js');

  /**
   * Cada chamada de tela que precisa enviar campos obrigatórios.
   *
   * `campos` lista o que a função GRAVA. Campo ausente significa `undefined` no
   * Firestore, que recusa a operação inteira — foi a causa de três defeitos.
   */
  const chamadas = [
    {
      arquivo: 'src/app/checkin/[id]/page.js',
      funcao: 'checkIn',
      campos: ['assembleiaId', 'numero', 'tag', 'uid'],
    },
    {
      arquivo: 'src/app/votacao/[id]/page.js',
      funcao: 'votar',
      campos: ['assembleiaId', 'propostaId', 'opcao', 'numero', 'tag', 'comprovanteId', 'votosRegistrados', 'votouEm'],
    },
    {
      arquivo: 'src/app/admin/page.js',
      funcao: 'criarAssembleia',
      campos: ['titulo', 'modo', 'propostas', 'criadoPor', 'unidadesAptas'],
    },
  ];

  for (const { arquivo, funcao, campos } of chamadas) {
    it(`${funcao} é chamada com todos os campos exigidos`, () => {
      const conteudo = ler(arquivo);
      const corpo = corpoDaChamada(conteudo, new RegExp(`await ${funcao}\\(`));

      assert.notEqual(corpo, null, `não encontrei a chamada a ${funcao} em ${arquivo}`);

      const faltando = campos.filter(
        // Duas formas válidas em JavaScript: `campo: valor` e a propriedade
        // abreviada `campo,`. A primeira versão deste teste só aceitava a
        // primeira, e por isso acusava campos que ESTAVAM presentes —
        // `assembleiaId,` é abreviação de `assembleiaId: assembleiaId`.
        (campo) => !new RegExp(`(^|[\\s{,])${campo}\\s*[,:}]`, 'm').test(corpo)
      );
      assert.deepEqual(
        faltando,
        [],
        `${arquivo} chama ${funcao} sem: ${faltando.join(', ')}\n\nchamada encontrada:\n${corpo.slice(0, 400)}`
      );
    });
  }

  it('as funções continuam aceitando os campos que as telas enviam', () => {
    // A proteção simétrica: se alguém renomear um parâmetro na função, a tela
    // continua enviando o nome antigo e o campo chega indefinido. Este teste
    // quebra aqui, e não em produção.
    const faltando = [];

    for (const { funcao, campos } of chamadas) {
      const assinatura = api.match(
        new RegExp(`export async function ${funcao}\\(\\{([\\s\\S]*?)\\}\\s*\\)`)
      );
      if (!assinatura) {
        faltando.push(`${funcao}: assinatura não encontrada em api.js`);
        continue;
      }
      for (const campo of campos) {
        if (!new RegExp(`\\b${campo}\\b`).test(assinatura[1])) {
          faltando.push(`${funcao} deixou de aceitar "${campo}"`);
        }
      }
    }

    assert.deepEqual(faltando, [], faltando.join('\n'));
  });
});

describe('papel usado para liberar telas do painel', () => {
  it('telas do painel checam ehOperador, não ehAdmin', () => {
    // `ehAdmin` é verdadeiro apenas para quem tem documento em /admins/{uid} — o
    // síndico cadastrado. O ADMINISTRADOR DO SISTEMA é reconhecido pelo e-mail
    // nas regras, o que define `ehSuperAdmin`, e `ehAdmin` fica falso para ele.
    //
    // Usar `ehAdmin` escondia a barra lateral e os botões de operador do próprio
    // administrador — ele não conseguia encerrar nem publicar resultado.
    const telas = ['src/app/resultados/[id]/page.js'];
    const suspeitas = [];

    for (const arquivo of telas) {
      const conteudo = ler(arquivo);
      // Ignora comentários: o nome aparece neles explicando justamente o motivo.
      const codigo = conteudo
        .split('\n')
        .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
        .join('\n');

      if (/\behAdmin\b/.test(codigo)) {
        suspeitas.push(`${arquivo} usa ehAdmin no código (deveria ser ehOperador)`);
      }
    }

    assert.deepEqual(suspeitas, [], suspeitas.join('\n'));
  });
});

describe('inadimplência na apuração', () => {
  it('o conjunto de inadimplentes usa o campo numero, não o ID do documento', () => {
    // DEFEITO REAL: a apuração montava o conjunto com `d.id`. Como as unidades
    // foram semeadas com ID ALEATÓRIO, o conjunto continha "Y9wstFXx..." enquanto
    // o voto traz `tag: "1"`. Nunca casava, e a unidade inadimplente continuava
    // contando — a funcionalidade inteira estava inerte, sem nenhum sinal.
    const api = ler('src/lib/api.js');
    const trecho = api.slice(api.indexOf('inadimplente === true'));

    assert.ok(
      /\.map\(\(d\)\s*=>\s*String\(d\.data\(\)\.numero/.test(trecho),
      'o conjunto de inadimplentes deve ser montado com d.data().numero, não com d.id'
    );
  });
});
