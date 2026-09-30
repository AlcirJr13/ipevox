/**
 * ipevox — cliente Firebase (inicialização preguiçosa)
 * =============================================================================
 * POR QUE ESTE ARQUIVO NÃO CRIA NADA NO ESCOPO DO MÓDULO
 *
 * A versão anterior chamava `initializeApp` e `getAuth` na avaliação do módulo.
 * Isso parecia inofensivo, mas quebrava o `next build`: ao pré-renderizar as
 * páginas, o Next.js avalia esses módulos NO SERVIDOR, e o SDK do Firebase tenta
 * validar a chave de API — que só existe no bundle do cliente. Resultado:
 * "FirebaseError: auth/invalid-api-key" durante o build, num lugar onde não há
 * usuário nenhum para autenticar.
 *
 * Agora nada é criado na importação. Cada acesso passa pelas funções abaixo, que
 * inicializam uma única vez, sob demanda, e só no ambiente onde fazem sentido.
 * Importar `@/lib/firebase` deixou de ter efeito colateral.
 *
 * `getAuth(app)` e `getFirestore(app)` já são idempotentes no SDK: para o mesmo
 * app, devolvem sempre a mesma instância. Por isso não há cache manual aqui — o
 * que precisa de guarda é o `initializeApp` e a conexão com os emuladores, que
 * não podem acontecer duas vezes.
 */

import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

/** Região das Cloud Functions (São Paulo). */
export const REGIAO_FUNCTIONS = 'southamerica-east1';

const usarEmuladores = process.env.NEXT_PUBLIC_USAR_EMULADORES === 'true';

let emuladoresConectados = false;
let persistenciaConfigurada = false;

/** Erro de configuração ausente. Tipado para a UI poder tratar sem inspecionar string. */
export class ErroConfiguracao extends Error {
  constructor(mensagem, faltando = []) {
    super(mensagem);
    this.name = 'ErroConfiguracao';
    this.codigo = 'configuracao-ausente';
    this.faltando = faltando;
  }
}

// =============================================================================
// ATENÇÃO — leia antes de alterar
// =============================================================================
// O Next.js substitui `process.env.NEXT_PUBLIC_X` pelo valor LITERAL no bundle,
// mas só quando o acesso é ESTÁTICO: a propriedade precisa estar escrita no
// código. Acesso dinâmico — `process.env[chave]`, com a chave vinda de um array —
// NÃO é resolvido pelo bundler e sobrevive até o tempo de execução, onde, no
// navegador, esse objeto não existe.
//
// Foi exatamente este o defeito da primeira versão desta função: o verificador
// usava `process.env[chave]` e por isso relatava TODAS as seis variáveis como
// ausentes mesmo com o .env.local correto. O sintoma enganava porque parecia
// problema de configuração, quando era de código.
//
// Por isso a conferência abaixo nomeia cada variável, uma a uma. É verboso de
// propósito: é a única forma que o bundler consegue substituir.

/** Nomes das variáveis ausentes. Lista vazia significa configuração completa. */
export function variaveisAusentes() {
  const faltando = [];
  if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) faltando.push('NEXT_PUBLIC_FIREBASE_API_KEY');
  if (!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) faltando.push('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
  if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) faltando.push('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  if (!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) faltando.push('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET');
  if (!process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID) faltando.push('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID');
  if (!process.env.NEXT_PUBLIC_FIREBASE_APP_ID) faltando.push('NEXT_PUBLIC_FIREBASE_APP_ID');
  return faltando;
}

export function configuracaoCompleta() {
  return variaveisAusentes().length === 0;
}

function configuracao() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

/**
 * App do Firebase, criado na primeira chamada.
 * Reaproveita a instância existente para não lançar
 * "Firebase App named '[DEFAULT]' already exists" (que era exatamente o risco da
 * duplicação de `firebase.js` que existia no projeto).
 */
export function obterApp() {
  if (getApps().length > 0) return getApp();

  const faltando = variaveisAusentes();
  if (faltando.length > 0) {
    // Erro tipado, e não `Error` genérico: a fronteira de erro da aplicação
    // (`app/error.js`) reconhece este tipo e mostra uma tela de instruções em vez
    // do stack trace. Sem isso, esquecer o .env.local derrubava a página inteira
    // com um erro vermelho — péssimo para um problema de instalação.
    throw new ErroConfiguracao(
      `Configuração do Firebase incompleta: ${faltando.join(', ')}. `
      + 'Copie .env.example para .env.local e preencha com os dados do console do '
      + 'Firebase. Em produção (Vercel), cadastre as mesmas variáveis no painel do '
      + 'projeto.',
      faltando
    );
  }

  return initializeApp(configuracao());
}

/** Conexões com o emulador — só em desenvolvimento e uma única vez. */
function conectarEmuladores() {
  if (emuladoresConectados) return;
  if (!usarEmuladores) return;
  if (typeof window === 'undefined') return;

  emuladoresConectados = true;
  connectAuthEmulator(getAuth(obterApp()), 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(getFirestore(obterApp()), '127.0.0.1', 8080);
  connectFunctionsEmulator(getFunctions(obterApp(), REGIAO_FUNCTIONS), '127.0.0.1', 5001);
}

export function obterAuth() {
  const auth = getAuth(obterApp());

  // Persistência local: o morador que fecha e reabre a aba não perde a sessão.
  if (!persistenciaConfigurada && typeof window !== 'undefined') {
    persistenciaConfigurada = true;
    setPersistence(auth, browserLocalPersistence).catch(() => {
      // Navegador bloqueando persistência não é motivo para derrubar a página:
      // o login continua funcionando apenas em memória.
    });
  }

  conectarEmuladores();
  return auth;
}

export function obterDb() {
  const db = getFirestore(obterApp());
  conectarEmuladores();
  return db;
}

export function obterFunctions() {
  const functions = getFunctions(obterApp(), REGIAO_FUNCTIONS);
  conectarEmuladores();
  return functions;
}
