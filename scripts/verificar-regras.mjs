#!/usr/bin/env node
/**
 * ipevox — verificação das regras do Firestore no emulador
 * =============================================================================
 * As regras de segurança só se provam EXECUTANDO. Este script usa o SDK Web do
 * cliente (o mesmo que o site usa) apontado para os emuladores locais e tenta
 * exatamente as operações que devem ser NEGADAS por um morador anônimo.
 *
 * Uso:
 *   1. em um terminal:  npm run emuladores
 *   2. em outro:        npm run verificar:regras
 *
 * Requer os emuladores de Auth (9099) e Firestore (8080) rodando. Não usa
 * nenhuma dependência além do SDK `firebase` já instalado — de propósito, para
 * não adicionar pacote só de teste.
 */

import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import {
  addDoc,
  collection,
  connectFirestoreEmulator,
  doc,
  getDocs,
  setDoc,
} from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';

const PROJETO = process.env.GCLOUD_PROJECT || 'ipevox-emulador';

const app = initializeApp({ projectId: PROJETO, apiKey: 'emulador' });
const auth = getAuth(app);
const db = getFirestore(app);

connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFirestoreEmulator(db, '127.0.0.1', 8080);

function ehNegado(erro) {
  return erro?.code === 'permission-denied';
}

const falhas = [];

/**
 * Executa uma operação que DEVE ser negada. Se ela passar, é uma falha de regra.
 */
async function deveNegar(nome, operacao) {
  try {
    await operacao();
    falhas.push(`${nome}: a operação foi PERMITIDA (deveria ser negada)`);
    console.error(`✗ ${nome} — permitida (falha de regra)`);
  } catch (erro) {
    if (ehNegado(erro)) {
      console.log(`✓ ${nome} — negada`);
    } else {
      falhas.push(`${nome}: falhou por outro motivo (${erro?.code ?? erro})`);
      console.error(`? ${nome} — erro inesperado: ${erro?.code ?? erro}`);
    }
  }
}

async function main() {
  console.log('Entrando como morador anônimo no emulador…');
  await signInAnonymously(auth);

  // 1. Gravar um voto direto na coleção /votos: só quem vota (via api) pode, e a
  //    regra exige o espelho correspondente. Um anônimo arbitrário não deve poder.
  await deveNegar('criar doc em /votos', () =>
    addDoc(collection(db, 'votos'), { assembleiaId: 'x', propostaId: 'y', tag: '1', opcao: 'Sim' })
  );

  // 2. Ler a coleção /votos: exclusiva do administrador do sistema.
  await deveNegar('ler /votos', () => getDocs(collection(db, 'votos')));

  // 3. Escrever no catálogo de unidades: só operadores.
  await deveNegar('escrever em /catalogo_unidades', () =>
    setDoc(doc(db, 'catalogo_unidades', 'inexistente'), { numero: '999', ativo: true })
  );

  // 4. Publicar um resultado direto: só operadores.
  await deveNegar('publicar em /resultados', () =>
    setDoc(doc(db, 'resultados', 'forjado'), { apuracao: [] })
  );

  if (falhas.length > 0) {
    console.error(`\n${falhas.length} verificação(ões) falharam:\n- ${falhas.join('\n- ')}`);
    process.exitCode = 1;
    return;
  }
  console.log('\nTodas as operações proibidas foram negadas pelas regras.');
}

main().catch((erro) => {
  console.error(
    '\nNão foi possível falar com os emuladores. Eles estão rodando? (npm run emuladores)\n',
    erro?.message ?? erro
  );
  process.exitCode = 1;
});
