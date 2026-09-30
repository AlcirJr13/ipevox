/**
 * ipevox — recibo do voto (assembleia FECHADA)
 * =============================================================================
 * O QUE É, E POR QUE EXISTE
 *
 * Em assembleia fechada, o conteúdo do voto é cifrado e a chave está no servidor.
 * Isso torna o sigilo real, mas cria um problema prático: se ninguém consegue ler
 * o voto, como o morador prova depois em que votou, por exemplo diante de uma
 * impugnação?
 *
 * A resposta é o recibo. Ao votar, o servidor devolve três valores:
 *
 *   tag          — um HMAC da unidade (não revela o número)
 *   sal          — aleatório, único daquele voto
 *   compromisso  — HMAC(chave, unidade + opção + sal)
 *
 * O compromisso é publicado no snapshot do encerramento, junto com os totais.
 * A partir dele, qualquer pessoa pode conferir que o total contado corresponde
 * exatamente às cédulas gravadas. E o próprio morador consegue recalcular o dele
 * — porque só ele conhece a opção que escolheu.
 *
 * Este arquivo guarda o recibo no localStorage do aparelho. Ele NUNCA vai para o
 * servidor: se fosse, o sigilo voltaria a depender de confiança. Também nunca é
 * apagado automaticamente, porque apagá-lo destruiria a única prova do voto.
 *
 * LIMITE HONESTO DESTE MECANISMO: o recibo prova que um voto específico foi
 * contado. Ele não permite descobrir o voto de outra pessoa sem o recibo dela,
 * nem permite ao síndico identificar um voto isolado sem abrir a assembleia pela
 * função auditada. Isso é intencional — é o que separa sigilo de vigilância.
 */

const CHAVE = 'ipevox:recibos';

function lerTudo() {
  if (typeof window === 'undefined') return {};
  try {
    const bruto = localStorage.getItem(CHAVE);
    return bruto ? JSON.parse(bruto) : {};
  } catch {
    // JSON corrompido: melhor recomeçar do que derrubar a votação.
    return {};
  }
}

function gravarTudo(dados) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CHAVE, JSON.stringify(dados));
  } catch {
    // Armazenamento cheio ou bloqueado: o voto já foi registrado no servidor,
    // então a falha aqui não invalida nada — apenas o morador não terá o recibo.
  }
}

/**
 * Guarda o recibo de um voto. Idempotente: votar de novo na mesma proposta (o
 * servidor devolve `repetido: true`) não duplica a entrada.
 *
 * @returns {Array} lista atualizada da assembleia
 */
export function guardarRecibo(assembleiaId, recibo) {
  const tudo = lerTudo();
  const daAssembleia = Array.isArray(tudo[assembleiaId]) ? tudo[assembleiaId] : [];

  const semDuplicata = daAssembleia.filter((r) => r.propostaId !== recibo.propostaId);
  semDuplicata.push({
    propostaId: recibo.propostaId,
    tag: recibo.tag ?? null,
    sal: recibo.sal ?? null,
    compromisso: recibo.compromisso ?? null,
    registradoEm: new Date().toISOString(),
  });

  tudo[assembleiaId] = semDuplicata;
  gravarTudo(tudo);
  return semDuplicata;
}

export function lerRecibos(assembleiaId) {
  const tudo = lerTudo();
  return Array.isArray(tudo[assembleiaId]) ? tudo[assembleiaId] : [];
}

/**
 * Texto do recibo, formatado para ser impresso, copiado ou anexado a um processo.
 * Inclui as instruções de conferência: sem elas, o morador teria em mãos um
 * amontoado de hashes sem saber o que fazer com eles.
 */
export function recibosParaTexto(assembleiaId, recibos) {
  const linhas = [];

  linhas.push('IPEVOX — RECIBO DE VOTO SELADO');
  linhas.push('='.repeat(60));
  linhas.push('');
  linhas.push(`Assembleia: ${assembleiaId}`);
  linhas.push(`Emitido em: ${new Date().toLocaleString('pt-BR')}`);
  linhas.push(`Votos registrados: ${recibos.length}`);
  linhas.push('');
  linhas.push('O que este documento prova');
  linhas.push('-'.repeat(60));
  linhas.push('Cada bloco abaixo corresponde a um voto seu nesta assembleia.');
  linhas.push('O "compromisso" foi publicado no resultado oficial da assembleia,');
  linhas.push('junto com a contagem. Ele permite conferir que o seu voto está');
  linhas.push('incluído no total, sem que ninguém consiga descobrir o voto de');
  linhas.push('outra pessoa: o cálculo exige saber a opção escolhida.');
  linhas.push('');
  linhas.push('Como conferir');
  linhas.push('-'.repeat(60));
  linhas.push('Um perito recalcula o compromisso a partir de:');
  linhas.push('  unidade + opção escolhida + sal, com a chave de conferência');
  linhas.push('  fornecida pelo condomínio.');
  linhas.push('Se o valor recalculado for igual ao compromisso abaixo, o voto');
  linhas.push('está contido na apuração publicada.');
  linhas.push('');
  linhas.push('ATENÇÃO: este recibo é a única prova do seu voto. Guarde-o. O');
  linhas.push('sistema não mantém cópia — é justamente isso que impede que');
  linhas.push('alguém leia o seu voto sem a sua colaboração.');
  linhas.push('');

  recibos.forEach((r, i) => {
    linhas.push(`Voto ${i + 1} de ${recibos.length}`);
    linhas.push('-'.repeat(60));
    linhas.push(`  Proposta (id): ${r.propostaId}`);
    linhas.push(`  Identificador: ${r.tag ?? '(não informado)'}`);
    linhas.push(`  Sal:           ${r.sal ?? '(não informado)'}`);
    linhas.push(`  Compromisso:   ${r.compromisso ?? '(não informado)'}`);
    linhas.push(`  Registrado em: ${r.registradoEm ?? '(não informado)'}`);
    linhas.push('');
  });

  linhas.push('='.repeat(60));
  linhas.push('ipevox — sistema de votação condominial');
  linhas.push('');

  return linhas.join('\n');
}
