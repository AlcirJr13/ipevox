"use client";

/**
 * ipevox — página de erro da aplicação
 * =============================================================================
 * Existe principalmente por um caso: **Firebase sem configuração**. Sem esta
 * fronteira, esquecer o `.env.local` derrubava qualquer tela com um erro
 * vermelho e stack trace no meio da página — e a causa (uma variável de ambiente
 * faltando) ficava escondida atrás de um rastreamento de módulos.
 *
 * Agora esse caso tem uma tela que diz o que fazer. Qualquer outro erro continua
 * caindo no bloco genérico, com a mensagem e um botão para tentar de novo.
 *
 * Este arquivo é avaliado no SERVIDOR durante o build, então ele NÃO importa
 * `@/lib/firebase`: importar o SDK do Firebase só para checar configuração
 * traria o pacote inteiro para o bundle de erro. Lemos `process.env` direto.
 */

import Link from 'next/link';
import { useEffect } from 'react';
import { IconeAlerta, IconeCadeado } from '@/components/Icones';

/**
 * Variáveis ausentes, conferidas com acesso ESTÁTICO.
 *
 * O Next.js só substitui `process.env.NEXT_PUBLIC_X` pelo valor literal quando a
 * propriedade está escrita no código. `process.env[chave]` a partir de um array
 * não é resolvido pelo bundler e chega ao navegador como objeto vazio — o que
 * fazia esta lista exibir sempre as seis variáveis, mesmo com a configuração
 * correta, criando um falso diagnóstico de instalação.
 */
function variaveisAusentes() {
  const faltando = [];
  if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) faltando.push('NEXT_PUBLIC_FIREBASE_API_KEY');
  if (!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) faltando.push('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
  if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) faltando.push('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  if (!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) faltando.push('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET');
  if (!process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID) faltando.push('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID');
  if (!process.env.NEXT_PUBLIC_FIREBASE_APP_ID) faltando.push('NEXT_PUBLIC_FIREBASE_APP_ID');
  return faltando;
}

function ehErroDeConfiguracao(erro) {
  if (!erro) return false;
  if (erro.codigo === 'configuracao-ausente') return true;
  return String(erro.message ?? '').includes('Configuração do Firebase incompleta');
}

export default function ErroDaAplicacao({ error, reset }) {
  const configuracaoAusente = ehErroDeConfiguracao(error);

  // Em desenvolvimento, manter o erro no console ajuda a depurar sem precisar
  // ler a tela. Em produção esta chamada é silenciosa para o usuário.
  useEffect(() => {
    if (error) console.error('[ipevox]', error);
  }, [error]);

  if (configuracaoAusente) {
    const faltando = variaveisAusentes();

    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-gray-800 border border-amber-800/60 rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-amber-400"><IconeCadeado tamanho={26} /></span>
            <h1 className="text-2xl font-bold text-white">Falta configurar o Firebase</h1>
          </div>

          <p className="text-gray-300 text-sm leading-relaxed mb-6">
            A aplicação precisa das chaves do projeto Firebase para funcionar. Elas
            não são segredo — vão no bundle do site — mas precisam existir.
          </p>

          {faltando.length > 0 && (
            <div className="mb-6">
              <p className="text-gray-400 text-xs mb-2">Variáveis ausentes:</p>
              <ul className="bg-gray-900 border border-gray-700 rounded-lg p-3 font-mono text-xs text-amber-200 space-y-1">
                {faltando.map((chave) => (
                  <li key={chave}>{chave}</li>
                ))}
              </ul>
            </div>
          )}

          <ol className="text-gray-300 text-sm space-y-3 mb-6 list-decimal list-inside">
            <li>
              Crie o arquivo local a partir do modelo:
              <code className="block mt-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 font-mono text-xs text-blue-300">
                cp .env.example .env.local
              </code>
            </li>
            <li>
              Preencha os valores com o console do Firebase em{' '}
              <strong className="text-white">Configurações do projeto → Seus apps → Config</strong>.
            </li>
            <li>Reinicie o servidor de desenvolvimento (o Next.js lê o .env.local só na partida).</li>
          </ol>

          <div className="bg-blue-900/20 border border-blue-800/60 rounded-lg p-4 mb-6">
            <p className="text-blue-200 text-xs leading-relaxed">
              <strong>Em produção (Vercel):</strong> as mesmas seis variáveis precisam
              estar cadastradas em <em>Settings → Environment Variables</em>. Sem isso,
              o site publicado mostra esta tela.
            </p>
          </div>

          <p className="text-gray-500 text-xs">
            Instruções completas no <span className="text-gray-400">README.md</span>, seção
            &ldquo;Configuração&rdquo;.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-gray-800 border border-red-900 rounded-2xl p-8 text-center">
        <div className="flex justify-center mb-4 text-red-400">
          <IconeAlerta tamanho={36} />
        </div>
        <h1 className="text-xl font-bold text-white mb-3">Algo deu errado</h1>
        <p className="text-gray-400 text-sm mb-6 break-words">
          {error?.message ?? 'Erro inesperado na aplicação.'}
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
          >
            Tentar de novo
          </button>
          <Link
            href="/"
            className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition text-center"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </main>
  );
}
