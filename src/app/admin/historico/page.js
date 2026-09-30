"use client";

import { PainelComBarra } from '@/components/BarraLateral';
import { useExigirAdmin } from '@/lib/auth';
import { encerrarAssembleia } from '@/lib/api';
import { escutarAssembleias } from '@/lib/data';
import { MODOS, ROTULOS_MODO, formatarData } from '@/lib/schema';
import { Modal } from '@/components/Modais';
import { IconeCadeado, IconeQrCode } from '@/components/Icones';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useState } from 'react';

const FILTROS = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'ativas', rotulo: 'Ativas' },
  { valor: 'encerradas', rotulo: 'Encerradas' },
];

/**
 * Modal genérico com o mínimo de acessibilidade que faltava na versão anterior:
 * `role="dialog"`, `aria-modal`, fechamento com Escape e foco inicial.
 *
 * Optamos por modal próprio em vez de `window.confirm`/`alert` porque o diálogo
 * nativo do navegador ignora o tema escuro, não é estilizável e no iOS aparece
 * de forma inconsistente dentro de WebViews — em um fluxo irreversível como
 * encerrar a assembleia, a confirmação precisa ser legível e explícita.
 */
export default function HistoricoAssembleias() {
  const router = useRouter();
  const { autorizado } = useExigirAdmin(router);

  const [assembleias, setAssembleias] = useState([]);
  const [filtro, setFiltro] = useState('todas');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [qrCodeAssembleia, setQrCodeAssembleia] = useState(null);
  const [assembleiaParaEncerrar, setAssembleiaParaEncerrar] = useState(null);
  const [encerrando, setEncerrando] = useState(false);
  const [resultadoEncerramento, setResultadoEncerramento] = useState(null);

  const origem = typeof window === 'undefined' ? '' : window.location.origin;

  // Listener em tempo real das assembleias. A falha do `onSnapshot` agora vai
  // para a tela: antes era apenas um `console.error`, e o síndico ficava olhando
  // para uma lista vazia sem saber se não havia assembleia ou se algo quebrou.
  useEffect(() => {
    if (!autorizado) return undefined;

    // `carregando` já nasce `true`; repetir o setState aqui seria um render em
    // cascata sem efeito prático (regra `react-hooks/set-state-in-effect`). Quem
    // desliga a flag são os callbacks do listener, abaixo.
    const cancelar = escutarAssembleias(
      filtro,
      (lista) => {
        setAssembleias(lista);
        setErro('');
        setCarregando(false);
      },
      () => {
        setAssembleias([]);
        setErro(
          'Não foi possível carregar as assembleias. Verifique sua conexão '
          + 'e se a sua conta ainda tem permissão de síndico.'
        );
        setCarregando(false);
      }
    );

    return cancelar;
  }, [filtro, autorizado]);

  async function confirmarEncerramento() {
    if (!assembleiaParaEncerrar) return;

    setEncerrando(true);
    setErro('');

    try {
      // O encerramento é decidido e executado pelo servidor: ele reconta os
      // votos do zero, grava o snapshot da ata e só então marca a assembleia
      // como encerrada. O cliente não escreve nada.
      const resposta = await encerrarAssembleia(assembleiaParaEncerrar.id);
      setResultadoEncerramento(resposta);
      setAssembleiaParaEncerrar(null);
    } catch (falha) {
      setAssembleiaParaEncerrar(null);
      setErro(falha.message);
    } finally {
      setEncerrando(false);
    }
  }

  // Handlers estáveis: sem `useCallback`, cada render criaria uma função nova e
  // o efeito do modal rodaria de novo, devolvendo o foco ao painel no meio da
  // interação (o botão de confirmar perdia o foco a cada mudança de estado).
  const fecharQrCode = useCallback(() => setQrCodeAssembleia(null), []);
  const fecharConfirmacao = useCallback(() => {
    // Durante o encerramento o modal permanece aberto: fechar no meio deixaria
    // a operação acontecendo sem nenhum retorno visual.
    if (!encerrando) setAssembleiaParaEncerrar(null);
  }, [encerrando]);

  // `sairDoSistema` foi removida: o botão "Sair" vive na barra lateral, ao
  // alcance de todas as telas, e encerra a sessão de verdade.

  if (!autorizado) {
    return <p className="text-gray-400 text-center py-12">Verificando acesso…</p>;
  }

  return (
    <PainelComBarra largura="max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Histórico de Assembleias</h1>
        <p className="text-gray-500 text-sm mt-1">
          Todas as assembleias criadas, com filtro por situação.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-6">
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              onClick={() => setFiltro(f.valor)}
              className={`px-4 py-2 rounded-lg font-medium transition ${filtro === f.valor
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
            >
              {f.rotulo}
            </button>
          ))}
        </div>

        {erro && (
          <div
            role="alert"
            className="mb-6 p-4 bg-red-900/30 border border-red-800 text-red-300 rounded-xl flex items-start justify-between gap-4"
          >
            <span>⚠️ {erro}</span>
            <button
              onClick={() => setErro('')}
              aria-label="Fechar aviso de erro"
              className="text-red-400 hover:text-red-200 underline shrink-0"
            >
              fechar
            </button>
          </div>
        )}

        {resultadoEncerramento && (
          <div
            role="status"
            className="mb-6 p-4 bg-green-900/30 border border-green-800 text-green-200 rounded-xl flex items-start justify-between gap-4"
          >
            <span>
              ✅ Assembleia encerrada: <strong>{resultadoEncerramento.totalVotos}</strong> votos
              de <strong>{resultadoEncerramento.unidadesAptas}</strong> unidades aptas.
            </span>
            <button
              onClick={() => setResultadoEncerramento(null)}
              aria-label="Fechar resumo do encerramento"
              className="text-green-300 hover:text-green-100 underline shrink-0"
            >
              fechar
            </button>
          </div>
        )}

        {carregando ? (
          <p className="text-gray-400 text-center py-8 animate-pulse">Carregando assembleias…</p>
        ) : assembleias.length === 0 ? (
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 text-center">
            <p className="text-gray-400">Nenhuma assembleia encontrada neste filtro.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {assembleias.map((asb) => {
              const selada = asb.modo === MODOS.FECHADA;
              const ativa = asb.status === 'ativa';

              return (
                <div
                  key={asb.docId}
                  className="bg-gray-800 border border-gray-700 rounded-xl p-6 hover:border-gray-600 transition"
                >
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                    <div>
                      <h3 className="text-xl font-semibold text-white mb-1">{asb.titulo}</h3>
                      <p className="text-gray-400 text-sm">
                        {formatarData(asb.criadoEm)} • {asb.totalPropostas ?? 0} proposta(s)
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/*
                        O modo fica em destaque porque é ele que decide se o voto
                        poderá ser lido depois: em votação fechada o conteúdo é
                        cifrado e só uma abertura registrada em auditoria o revela.
                        Era informação fácil de passar despercebida e caro de
                        descobrir tarde.
                      */}
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-semibold border flex items-center gap-2 ${selada
                          ? 'bg-indigo-900/50 text-indigo-200 border-indigo-700'
                          : 'bg-blue-900/50 text-blue-200 border-blue-700'
                          }`}
                      >
                        <span aria-hidden="true">{selada ? '🔒' : '👁️'}</span>
                        {selada ? 'Votação fechada' : 'Votação aberta'}
                      </span>

                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium border ${ativa
                          ? 'bg-green-900/50 text-green-300 border-green-800'
                          : 'bg-gray-700 text-gray-300 border-gray-600'
                          }`}
                      >
                        {ativa ? '🟢 Ativa' : '🔴 Encerrada'}
                      </span>
                    </div>
                  </div>

                  <p className="text-gray-500 text-xs mb-4">
                    Modo registrado: {ROTULOS_MODO[asb.modo] ?? asb.modo ?? '—'}
                  </p>

                  <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-700/50">
                    <button
                      onClick={() => router.push(`/resultados/${asb.id}`)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition"
                    >
                      Ver Resultados
                    </button>

                    {ativa && (
                      <button
                        onClick={() => setQrCodeAssembleia(asb)}
                        aria-label={`Exibir QR Code de check-in da assembleia ${asb.titulo}`}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm transition"
                      >
                        📱 QR Code
                      </button>
                    )}

                    {ativa && (
                      <button
                        onClick={() => setAssembleiaParaEncerrar(asb)}
                        className="px-4 py-2 bg-red-900/40 hover:bg-red-900/70 text-red-300 border border-red-900 rounded-lg text-sm transition"
                      >
                        🔒 Encerrar Agora
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {qrCodeAssembleia && (
        <Modal
          aoFechar={fecharQrCode}
          rotulo={`QR Code de check-in de ${qrCodeAssembleia.titulo}`}
        >
          <div className="flex justify-center mb-4 text-purple-300">
            <IconeQrCode tamanho={36} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">{qrCodeAssembleia.titulo}</h2>
          <p className="text-gray-400 mb-6">Exiba este QR Code para os participantes</p>

          <div className="bg-white p-4 rounded-xl inline-block mb-6">
            <QRCodeSVG value={`${origem}/checkin/${qrCodeAssembleia.id}`} size={250} />
          </div>

          <div className="bg-gray-900 p-3 rounded-lg break-all text-sm text-blue-400 font-mono mb-6">
            {`${origem}/checkin/${qrCodeAssembleia.id}`}
          </div>

          <button
            onClick={fecharQrCode}
            aria-label="Fechar janela do QR Code"
            className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition"
          >
            Fechar
          </button>
        </Modal>
      )}

      {assembleiaParaEncerrar && (
        <Modal
          aoFechar={fecharConfirmacao}
          rotulo={`Confirmar encerramento de ${assembleiaParaEncerrar.titulo}`}
        >
          <div className="flex justify-center mb-4 text-red-400">
            <IconeCadeado tamanho={36} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Encerrar assembleia?</h2>
          <p className="text-gray-300 mb-4">{assembleiaParaEncerrar.titulo}</p>

          <div className="bg-red-900/20 border border-red-900 text-red-200 rounded-xl p-4 text-sm text-left mb-6">
            <p className="font-semibold mb-2">Esta ação é irreversível.</p>
            <p>
              Os votos serão congelados e a assembleia não poderá voltar a receber
              votos. O servidor vai recontar os votos do zero e gravar o resultado
              definitivo, que passa a ser a base da ata.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setAssembleiaParaEncerrar(null)}
              disabled={encerrando}
              className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={confirmarEncerramento}
              disabled={encerrando}
              className={`flex-1 py-3 rounded-lg font-semibold transition ${encerrando
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
            >
              {encerrando ? 'Encerrando…' : 'Encerrar agora'}
            </button>
          </div>
        </Modal>
      )}
    </PainelComBarra>
  );
}
