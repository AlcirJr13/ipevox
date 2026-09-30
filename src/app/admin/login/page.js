"use client";

/**
 * ipevox — Login de quem opera o sistema
 * =============================================================================
 * O que existe nesta tela, e por que:
 *
 *  - Não há PIN. O modelo antigo comparava um PIN vindo de variável
 *    `NEXT_PUBLIC_*`, ou seja, o PIN ia embutido no JavaScript entregue a
 *    qualquer visitante. Foi removido.
 *
 *  - Não há cadastro. O acesso é decidido pelo banco: o **administrador do
 *    sistema** é reconhecido pelo e-mail (lista no arquivo `firestore.rules`) e o
 *    **síndico** por documento em `/admins/{uid}`. Nenhum dos dois se promove por
 *    esta tela.
 *
 *  - Não há mais botão de "primeiro acesso". Com o papel definido por e-mail nas
 *    regras, não existe nada a promover: se o seu e-mail está na lista, você
 *    entra como administrador direto. Isso elimina o problema de bootstrap que a
 *    versão com servidor tinha (e que exigia uma Cloud Function).
 *
 *  - A conta de login continua sendo criada no console do Firebase, em
 *    Authentication → Users, porque criar usuário exige o SDK de administrador —
 *    que só roda em servidor.
 */

import { IconeCadeado, IconeEscudo } from '@/components/Icones';
import { entrarComoSindico, useSessao } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function AdminLogin() {
  const router = useRouter();
  const { usuario, ehAdmin, ehSuperAdmin, ehOperador, carregando } = useSessao();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState('');

  // Já autenticado com acesso: vai direto ao destino, por PAPEL.
  //
  //   administrador do sistema → /admin/sindicos (cadastro de acessos)
  //   síndico                  → /admin (painel de assembleias)
  //
  // O administrador do sistema cai no cadastro de acessos porque é essa a função
  // dele: ele provisiona síndicos. O painel de assembleias continua acessível por
  // um botão, e ele também pode criar assembleias se quiser.
  useEffect(() => {
    if (carregando || !usuario) return;
    if (!ehOperador) return; // a mensagem explica o que fazer

    router.replace(ehSuperAdmin ? '/admin/sindicos' : '/admin');
  }, [carregando, usuario, ehOperador, ehSuperAdmin, router]);

  async function enviar(evento) {
    evento.preventDefault();
    setErro('');
    setEntrando(true);

    try {
      await entrarComoSindico({ email, senha });
      // A navegação é feita pelo efeito acima, quando o papel estiver resolvido.
      // Navegar daqui poderia levar o administrador para uma tela restrita.
      setEntrando(false);
    } catch (falha) {
      setErro(falha.message);
      setEntrando(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
      <div className="bg-gray-800 p-8 rounded-2xl border border-gray-700 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3 text-blue-400">
            <IconeEscudo tamanho={36} />
          </div>
          <h1 className="text-2xl font-bold text-white">Acesso restrito</h1>
          <p className="text-gray-400 text-sm mt-2">
            Administração das assembleias e do sistema.
          </p>
        </div>

        {usuario && !ehOperador && !carregando && (
          <div
            role="alert"
            className="mb-5 p-3 bg-amber-900/20 border border-amber-800/60 text-amber-200 rounded-lg text-sm leading-relaxed"
          >
            Você está autenticado como <strong>{usuario.email}</strong>, mas esta
            conta não tem acesso ao painel.
            {ehAdmin === false && ehSuperAdmin === false && (
              <>
                {' '}Se você é o administrador do sistema, confirme que este e-mail
                está na lista <code className="text-amber-100">emailsAdminSistema()</code>{' '}
                de <code className="text-amber-100">firestore.rules</code> e que as
                regras foram publicadas.
              </>
            )}
          </div>
        )}

        <form onSubmit={enviar} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={entrando}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60"
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <label htmlFor="senha" className="block text-sm font-medium text-gray-300 mb-2">
              Senha
            </label>
            <input
              id="senha"
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              disabled={entrando}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60"
              placeholder="••••••••"
            />
          </div>

          {erro && (
            <p
              role="alert"
              className="text-red-300 bg-red-900/30 border border-red-800 rounded-lg p-3 text-sm leading-relaxed"
            >
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={entrando || !email || !senha}
            className={`w-full py-3 rounded-lg font-semibold transition ${
              entrando || !email || !senha
                ? 'bg-gray-700 cursor-not-allowed text-gray-400'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-gray-700/60">
          <p className="flex items-start gap-2 text-xs text-gray-500 leading-relaxed">
            <span className="mt-0.5 shrink-0 text-gray-600">
              <IconeCadeado tamanho={14} />
            </span>
            <span>
              Não há cadastro por esta tela. As contas de login são criadas no
              console do Firebase, em{' '}
              <code className="text-gray-400">Authentication → Users</code>. O
              acesso ao painel é definido pelo e-mail (administrador do sistema) ou
              por cadastro na tela de acessos (síndico).
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push('/')}
          className="w-full mt-5 text-gray-400 hover:text-white text-sm transition"
        >
          Voltar para a página inicial
        </button>
      </div>
    </main>
  );
}
