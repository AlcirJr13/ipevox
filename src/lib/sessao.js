/**
 * ipevox — sessão local do participante
 * =============================================================================
 * Guarda, no sessionStorage, o que a navegação entre telas precisa:
 *
 *   - o NÚMERO da unidade, para exibição ("Unidade 16");
 *   - o ID do COMPROVANTE, que endereça o documento da sessão no banco.
 *
 * O ID do comprovante é derivado do número da unidade (`assembleia~numero`), então
 * guardá-lo aqui é conveniência de navegação, não segredo. A limitação está
 * registrada no README: como o número compõe o ID, quem lê a coleção
 * `comprovantes` consegue reconstruir a lista de participantes.
 *
 * Nada disto é credencial. A autoridade é o documento no servidor, validado a
 * cada voto. Confiar no sessionStorage para autenticar seria repetir o erro do
 * modelo anterior, em que uma flag `is_admin` decidia quem era síndico.
 */

const PREFIXO_NUMERO = 'ipevox:unidade:';
const PREFIXO_COMPROVANTE = 'ipevox:comprovante:';

function ler(chave) {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravar(chave, valor) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(chave, valor);
  } catch {
    // Modo privado com armazenamento bloqueado: o fluxo continua, apenas sem
    // lembrar os dados entre telas.
  }
}

function apagar(chave) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(chave);
  } catch {
    /* inofensivo */
  }
}

/** Sessão completa de uma assembleia: número + comprovanteId. */
export function guardarSessao(assembleiaId, { numero, comprovanteId }) {
  if (numero) gravar(PREFIXO_NUMERO + assembleiaId, numero);
  if (comprovanteId) gravar(PREFIXO_COMPROVANTE + assembleiaId, comprovanteId);
}

export function lerNumeroUnidade(assembleiaId) {
  return ler(PREFIXO_NUMERO + assembleiaId);
}

export function lerComprovanteId(assembleiaId) {
  return ler(PREFIXO_COMPROVANTE + assembleiaId);
}

export function esquecerSessao(assembleiaId) {
  apagar(PREFIXO_NUMERO + assembleiaId);
  apagar(PREFIXO_COMPROVANTE + assembleiaId);
}
