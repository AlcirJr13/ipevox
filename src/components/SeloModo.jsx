"use client";

/**
 * ipevox — selo do modo de votação
 * =============================================================================
 * O modo é a informação que decide se um voto pode ser lido depois. Ele não pode
 * ficar escondido em um canto da tela: aparece no check-in (antes de votar), na
 * votação, no histórico e nos resultados.
 *
 * Existe como componente porque estava sendo reescrito em cada tela com textos
 * ligeiramente diferentes — e divergência de texto sobre sigilo é exatamente o
 * que um questionamento judicial explora.
 */

import { MODOS, ROTULOS_MODO } from '@/lib/schema';
import { IconeCadeado, IconeOlho } from './Icones';

const ESTILO = {
  [MODOS.FECHADA]: {
    caixa: 'bg-indigo-900/30 border-indigo-700 text-indigo-200',
    Icone: IconeCadeado,
    resumo:
      'Votos não são exibidos nas telas. Leitura do voto individual restrita ao '
      + 'administrador do sistema.',
  },
  [MODOS.ABERTA]: {
    caixa: 'bg-blue-900/30 border-blue-700 text-blue-200',
    Icone: IconeOlho,
    resumo: 'Voto atribuível à unidade. Qualquer participante pode conferir.',
  },
};

export default function SeloModo({ modo, compacto = false, className = '' }) {
  const estilo = ESTILO[modo];
  if (!estilo) return null;

  const { Icone } = estilo;

  if (compacto) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${estilo.caixa} ${className}`}
      >
        <Icone tamanho={13} />
        {ROTULOS_MODO[modo]}
      </span>
    );
  }

  return (
    <div className={`rounded-xl p-3 border text-sm ${estilo.caixa} ${className}`}>
      <div className="flex items-center gap-2 font-semibold mb-1">
        <Icone tamanho={16} />
        {ROTULOS_MODO[modo]}
      </div>
      <p className="leading-relaxed text-xs opacity-90">{estilo.resumo}</p>
    </div>
  );
}
