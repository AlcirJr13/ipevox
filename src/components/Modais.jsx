"use client";

/**
 * ipevox — modais
 * =============================================================================
 * Substituem `window.confirm` e `alert`, usados antes em todos os fluxos
 * destrutivos. O diálogo nativo ignora o tema escuro do sistema, não é
 * estilizável e no iOS se comporta de forma inconsistente dentro de WebViews.
 * Em ações irreversíveis — encerrar uma assembleia, remover uma unidade — a
 * confirmação precisa ser legível e dizer exatamente o que vai acontecer.
 *
 * Acessibilidade: `role="dialog"`, `aria-modal`, fechamento com `Escape`, clique
 * no fundo e foco inicial no painel. Sem o foco, a tecla Escape não chega ao
 * diálogo e o leitor de tela continua lendo a página de fundo.
 *
 * Havia três cópias quase idênticas deste componente, criadas em paralelo
 * enquanto as telas eram migradas. Consolidadas aqui para que uma correção de
 * acessibilidade valha para todas as telas de uma vez.
 */

import { useEffect, useRef, useState } from 'react';
import { IconeAlerta } from './Icones';

export function Modal({ aoFechar, children, rotulo, larguraMaxima = 'max-w-md' }) {
  const painelRef = useRef(null);

  useEffect(() => {
    function aoTeclar(evento) {
      if (evento.key === 'Escape') aoFechar();
    }
    document.addEventListener('keydown', aoTeclar);

    // Foco inicial no primeiro elemento acionável do diálogo. Se não houver
    // nenhum, o foco vai para o painel — que precisa estar focado para a tecla
    // Escape chegar aqui e para o leitor de tela anunciar o contexto certo.
    const acionavel = painelRef.current?.querySelector(
      'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    (acionavel ?? painelRef.current)?.focus();

    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={aoFechar}
      role="presentation"
    >
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-label={rotulo}
        tabIndex={-1}
        className={`bg-gray-800 rounded-2xl p-8 w-full ${larguraMaxima} text-center border border-gray-700 shadow-2xl outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Modal de confirmação de ação irreversível.
 *
 * O texto de consequência não é opcional: uma confirmação que apenas pergunta
 * "tem certeza?" não informa nada. `consequencia` existe para dizer o que
 * acontece depois do clique — que os votos serão congelados, que a unidade será
 * removida do catálogo, que o voto não será registrado.
 */
export function ModalConfirmacao({
  titulo,
  consequencia,
  rotuloConfirmar = 'Confirmar',
  rotuloCancelar = 'Cancelar',
  destrutivo = false,
  processando = false,
  aoConfirmar,
  aoFechar,
}) {
  return (
    <Modal aoFechar={processando ? () => {} : aoFechar} rotulo={titulo}>
      <div
        className={`flex justify-center mb-4 ${destrutivo ? 'text-red-400' : 'text-amber-400'}`}
      >
        <IconeAlerta tamanho={36} />
      </div>

      <h2 className="text-xl font-bold text-white mb-3">{titulo}</h2>

      {consequencia && (
        <p className="text-gray-300 text-sm leading-relaxed mb-6 whitespace-pre-line">
          {consequencia}
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={aoFechar}
          disabled={processando}
          className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 disabled:opacity-60 text-white rounded-lg font-medium transition"
        >
          {rotuloCancelar}
        </button>
        <button
          type="button"
          onClick={aoConfirmar}
          disabled={processando}
          className={`flex-1 py-3 rounded-lg font-semibold text-white transition disabled:opacity-60 ${
            destrutivo
              ? 'bg-red-700 hover:bg-red-600'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {processando ? 'Processando…' : rotuloConfirmar}
        </button>
      </div>
    </Modal>
  );
}

/**
 * Confirmação por palavra digitada, para destruição em massa.
 *
 * Por que não basta um botão "Sim": apagar o catálogo inteiro de unidades é a
 * ação mais destrutiva do sistema, e um duplo clique acidental não pode
 * executá-la. O servidor exige a MESMA palavra, então a trava não é apenas
 * cosmética — chamar a função direto, sem ela, também falha.
 *
 * O botão de confirmar só habilita quando o texto bate.
 */
export function ModalConfirmacaoTexto({
  titulo,
  consequencia,
  palavra,
  rotuloConfirmar = 'Excluir tudo',
  processando = false,
  aoConfirmar,
  aoFechar,
}) {
  const [digitado, setDigitado] = useState('');
  const confere = digitado.trim().toUpperCase() === palavra.toUpperCase();

  return (
    <Modal aoFechar={processando ? () => {} : aoFechar} rotulo={titulo}>
      <div className="flex justify-center mb-4 text-red-400">
        <IconeAlerta tamanho={36} />
      </div>

      <h2 className="text-xl font-bold text-white mb-3">{titulo}</h2>

      <p className="text-gray-300 text-sm leading-relaxed mb-5 whitespace-pre-line">
        {consequencia}
      </p>

      <label
        htmlFor="confirmacao-texto"
        className="block text-left text-xs text-gray-400 mb-2"
      >
        Para confirmar, digite <strong className="text-red-300 font-mono">{palavra}</strong>:
      </label>
      <input
        id="confirmacao-texto"
        type="text"
        value={digitado}
        onChange={(e) => setDigitado(e.target.value)}
        disabled={processando}
        autoComplete="off"
        placeholder={palavra}
        className="w-full px-3 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-center font-mono tracking-widest placeholder-gray-600 focus:ring-2 focus:ring-red-600 outline-none disabled:opacity-60 mb-6"
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={aoFechar}
          disabled={processando}
          className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 disabled:opacity-60 text-white rounded-lg font-medium transition"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={aoConfirmar}
          disabled={processando || !confere}
          className="flex-1 py-3 rounded-lg font-semibold text-white transition bg-red-700 hover:bg-red-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
        >
          {processando ? 'Excluindo…' : rotuloConfirmar}
        </button>
      </div>
    </Modal>
  );
}
