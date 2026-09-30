"use client";

/**
 * ipevox — barra lateral de navegação do painel
 * =============================================================================
 * Substitui a fileira de botões que ficava no TOPO de cada tela. Os problemas
 * daquela disposição, que motivaram esta troca:
 *
 *  1. Ficavam à direita, longe do ponto onde o olho começa a ler (à esquerda).
 *  2. Cada tela tinha a sua própria combinação de botões, então a barra MUDAVA
 *     de uma tela para outra — a pessoa tinha de reaprender a navegação.
 *  3. Faltava o caminho de volta para o cadastro de síndicos em quase todas.
 *
 * Aqui a navegação é uma só, definida em um lugar, e aparece igual em todas as
 * telas. É o mesmo princípio da decisão anterior de manter um único
 * `useSessao()`: ter uma fonte única evita que as telas divirjam.
 *
 * O item ATIVO é destacado comparando com o caminho atual. Sem isso, a pessoa
 * não sabe onde está — e numa barra com cinco destinos isso é essencial.
 */

import { sair, useSessao } from '@/lib/auth';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { IconeCadeado, IconeEscudo, IconeOlho } from './Icones';

/**
 * Itens da navegação.
 *
 * `somenteSuperAdmin` marca o que o síndico NÃO pode acessar. Esses itens
 * continuam visíveis para ele, porém bloqueados e com explicação — em vez de
 * simplesmente sumirem. Sumir é pior: a pessoa não descobre que o recurso
 * existe, e ainda acha que o sistema está incompleto.
 */
const ITENS = [
  {
    href: '/admin',
    rotulo: 'Painel',
    descricao: 'Criar e gerenciar assembleias',
    icone: 'escudo',
  },
  {
    href: '/admin/unidades',
    rotulo: 'Unidades',
    descricao: 'Cadastro, inadimplência e exclusão',
    icone: 'cadeado',
  },
  {
    href: '/admin/historico',
    rotulo: 'Histórico',
    descricao: 'Assembleias anteriores',
    icone: 'olho',
  },
  {
    href: '/admin/auditoria',
    rotulo: 'Auditoria',
    descricao: 'Votos individuais',
    icone: 'cadeado',
    somenteSuperAdmin: true,
  },
  {
    href: '/admin/sindicos',
    rotulo: 'Acessos de síndico',
    descricao: 'Cadastrar e revogar síndicos',
    icone: 'escudo',
    somenteSuperAdmin: true,
  },
];

const ICONES = {
  escudo: IconeEscudo,
  cadeado: IconeCadeado,
  olho: IconeOlho,
};

/** Um item está ativo quando o caminho atual é ele ou algo abaixo dele. */
function estaAtivo(pathname, href) {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function BarraLateral() {
  const router = useRouter();
  const pathname = usePathname();
  const { usuario, ehSuperAdmin, ehAdmin, nome } = useSessao();
  const [abertaNoCelular, setAbertaNoCelular] = useState(false);

  async function sairAgora() {
    await sair();
    router.replace('/admin/login');
  }

  function irPara(href) {
    setAbertaNoCelular(false);
    router.push(href);
  }

  const identificacao = nome || usuario?.email || '';
  // No celular a barra é recolhida: numa tela pequena, uma coluna fixa de 260px
  // comeria metade da largura útil.
  const visivel = abertaNoCelular ? 'translate-x-0' : '-translate-x-full lg:translate-x-0';

  return (
    <>
      {/* Botão de abrir, só no celular */}
      <button
        type="button"
        onClick={() => setAbertaNoCelular(true)}
        aria-label="Abrir menu"
        className="lg:hidden fixed top-4 left-4 z-40 p-2.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white transition"
      >
        <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Fundo escurecido no celular, para fechar ao tocar fora */}
      {abertaNoCelular && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setAbertaNoCelular(false)}
          className="lg:hidden fixed inset-0 z-40 bg-black/60"
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-gray-800 border-r border-gray-700 flex flex-col transition-transform duration-200 ${visivel}`}
      >
        {/* Identificação: deixa explícito QUEM está logado e com qual papel.
            Sem isso, com a sessão persistida, a pessoa entra sem digitar senha e
            pode achar que o login foi burlado. */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <span aria-hidden="true" className="text-xl">🌳</span>
            <span className="font-bold text-white">ipevox</span>
          </div>
          <p className="text-xs text-gray-400 break-all leading-relaxed">{identificacao}</p>
          <p className="text-xs mt-1">
            {ehSuperAdmin ? (
              <span className="text-indigo-300">administrador do sistema</span>
            ) : (
              <span className="text-blue-300">síndico</span>
            )}
          </p>
        </div>

        {/*
          `flex-none` no lugar de `flex-1`. Com `flex-1`, esta lista esticava e
          empurrava o rodapé até o FUNDO da tela — criando um vão vazio enorme
          entre "Acessos de síndico" e "Sair". A lista agora ocupa só a altura do
          próprio conteúdo, e o espaço livre fica abaixo do botão.
        */}
        <nav className="flex-none overflow-y-auto p-3 space-y-1">
          {ITENS.map((item) => {
            const Icone = ICONES[item.icone];
            const ativo = estaAtivo(pathname, item.href);
            const bloqueado = item.somenteSuperAdmin && !ehSuperAdmin;

            return (
              <button
                key={item.href}
                type="button"
                onClick={() => irPara(item.href)}
                aria-current={ativo ? 'page' : undefined}
                title={bloqueado
                  ? `${item.rotulo} — exclusivo do administrador do sistema`
                  : item.descricao}
                className={`group w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 cursor-pointer ${
                  ativo
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white hover:translate-x-0.5'
                }`}
              >
                <span
                  className={`mt-0.5 shrink-0 transition-colors duration-150 ${
                    ativo ? 'text-white' : 'text-gray-400 group-hover:text-blue-300'
                  }`}
                >
                  <Icone tamanho={17} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-tight">
                    {item.rotulo}
                  </span>
                  <span
                    className={`block text-xs mt-0.5 transition-colors duration-150 ${
                      ativo
                        ? 'text-blue-100'
                        : bloqueado
                          ? 'text-gray-600 group-hover:text-gray-400'
                          : 'text-gray-500 group-hover:text-gray-300'
                    }`}
                  >
                    {/* "sem acesso" substitui a descrição quando o item é
                        restrito — mantendo a mesma linha, para a barra não
                        mudar de altura conforme o papel de quem entrou. */}
                    {bloqueado ? 'sem acesso' : item.descricao}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        {/*
          "Sair" no FUNDO da barra e alinhado à DIREITA.
          
          `mt-auto` é o que empurra o rodapé até o fim: a barra é uma coluna
          flex, então a margem automática no topo deste bloco consome todo o
          espaço livre acima dele. É o mesmo efeito que o `flex-1` produzia na
          lista, mas sem deformar a lista — e é a forma correta, porque a
          intenção é "prender isto no fundo", não "esticar aquilo".
          
          O texto vai à direita pelo `text-right` no container: como o botão
          ocupa a largura toda para o texto poder encostar na borda, a área
          clicável continua sendo apenas onde há conteúdo.
        */}
        <div className="mt-auto p-4 border-t border-gray-700 text-right">
          <button
            type="button"
            onClick={sairAgora}
            className="px-3 py-2 rounded-lg text-sm font-medium text-red-300 hover:text-red-200 hover:bg-red-900/50 transition-colors duration-150 cursor-pointer"
          >
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}

/**
 * Envolve o conteúdo de uma tela do painel, aplicando o recuo da barra lateral.
 *
 * Existe para as telas não precisarem repetir `lg:pl-64` nem o componente — e
 * para que uma tela nova já nasça com a navegação, em vez de depender de alguém
 * lembrar de adicioná-la.
 */
export function PainelComBarra({ children, largura = 'max-w-4xl' }) {
  return (
    <div className="min-h-screen bg-gray-900">
      <BarraLateral />
      <main className="lg:pl-64">
        <div className={`${largura} mx-auto px-4 py-12 pt-16 lg:pt-12`}>{children}</div>
      </main>
    </div>
  );
}
