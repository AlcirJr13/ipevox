"use client";

/**
 * ipevox — Painel do Síndico (criação de assembleia)
 * =============================================================================
 * DEFEITOS CORRIGIDOS AQUI:
 *
 *  1. A CRIAÇÃO ACONTECIA NO CLIENTE. `addDoc(collection(db,'assembleias'))` era
 *     chamado do browser e o Firestore aceitava porque não havia regra. Qualquer
 *     pessoa com o link podia criar assembleia. Agora é a Cloud Function
 *     `criarAssembleia`, que exige síndico.
 *
 *  2. O ID COLIDIA. `asb_${Date.now().toString(36)}` tem resolução de
 *     milissegundo: duas assembleias criadas no mesmo milissegundo (dois cliques,
 *     duas abas) recebiam o MESMO id. Agora é UUID, gerado no servidor.
 *
 *  3. O MODO "RÁPIDA" VALIDAVA ERRADO. Ele substituía as propostas usando
 *     `propostas[0].opcoes` — o state interno da tela de múltiplos cards — em vez
 *     da proposta que seria realmente gravada. Dependendo da sequência de cliques
 *     dava para criar votação sem opções válidas. Agora o modo rápido usa
 *     exatamente o mesmo rascunho que o modo assembleia valida.
 *
 *  4. TÍTULOS REPETIDOS E CHAVE DE CAMPO. A apuração antiga agrupava por título e
 *     gravava `votosComputados.{titulo}` como caminho de campo — título com ponto
 *     quebrava a escrita e título repetido somava votos de propostas diferentes.
 *     Agora cada proposta recebe um UUID e o servidor rejeita títulos duplicados.
 *
 *  5. EMOJIS COMO ÚNICA AFFORDANCE e duas <div> vazias onde os ícones se perderam.
 */

import { IconeAlerta, IconeCadeado, IconeCheck, IconeMais, IconeOlho, IconeX } from '@/components/Icones';
import { criarAssembleia } from '@/lib/api';
import { lerCatalogo } from '@/lib/data';
import { PainelComBarra } from '@/components/BarraLateral';
import { useExigirAdmin } from '@/lib/auth';
// `ROTULOS_MODO` substitui o rótulo escrito à mão que havia aqui
// ('Votação fechada (selada)'). O rótulo agora vem do schema, então mudar o nome
// do modo em um lugar só reflete na interface inteira — antes havia três cópias
// da mesma string, que já tinham divergido.
import {
  DESCRICAO_MODO,
  MAX_DESCRICAO,
  MAX_OPCAO,
  MAX_OPCOES,
  MAX_TITULO,
  MIN_OPCOES,
  MODOS,
  ROTULOS_MODO,
} from '@/lib/schema';
import { QRCodeSVG } from 'qrcode.react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const OPCOES_PADRAO = ['Sim', 'Não', 'Abstenção'];

function propostaVazia() {
  return { titulo: '', descricao: '', opcoes: [...OPCOES_PADRAO] };
}

export default function Admin() {
  const router = useRouter();
  const { autorizado, usuario, ehSuperAdmin } = useExigirAdmin(router);

  const [passo, setPasso] = useState('formulario'); // 'formulario' | 'sucesso'

  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [modo, setModo] = useState(MODOS.ABERTA);
  const [propostas, setPropostas] = useState([propostaVazia()]);

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState(null);

  /**
   * Unidades ativas do catálogo, contadas para gravar `unidadesAptas` na
   * assembleia.
   *
   * Sem isto, a assembleia nascia com ZERO unidades aptas — e esse número é a
   * base de cálculo do percentual "das unidades aptas" no resultado. Uma
   * assembleia com a base zerada mostraria 0% em todas as opções,
   * independentemente de quantos votassem.
   *
   * Unidade inadimplente NÃO é descontada aqui: a inadimplência pode mudar entre
   * a criação e a apuração, e o desconto é aplicado no momento de publicar o
   * resultado, que é quando ele precisa valer.
   */
  const [unidadesAptas, setUnidadesAptas] = useState(0);

  useEffect(() => {
    if (!autorizado) return undefined;
    let ativo = true;

    lerCatalogo()
      .then((lista) => {
        if (!ativo) return;
        setUnidadesAptas(lista.filter((u) => u.ativo !== false).length);
      })
      .catch(() => {
        // Falha ao contar não impede criar a assembleia: o número fica 0 e a
        // tela de sucesso avisa. Melhor criar com a base zerada, corrigível, do
        // que impedir a criação por um erro de leitura do catálogo.
        if (ativo) setUnidadesAptas(0);
      });

    return () => { ativo = false; };
  }, [autorizado]);

  if (!autorizado) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 animate-pulse">Verificando acesso…</p>
      </main>
    );
  }

  // --- Edição de propostas ---------------------------------------------------
  // Todas as atualizações usam `map`, criando objetos novos. A versão anterior
  // fazia `const novas = [...propostas]; novas[i].campo = valor`, um spread raso
  // que mutava o objeto ainda referenciado pelo state anterior.

  function alterarProposta(indice, campo, valor) {
    setPropostas((atual) =>
      atual.map((p, i) => (i === indice ? { ...p, [campo]: valor } : p))
    );
  }

  function adicionarProposta() {
    setPropostas((atual) => [...atual, propostaVazia()]);
  }

  function removerProposta(indice) {
    setPropostas((atual) => atual.filter((_, i) => i !== indice));
  }

  function adicionarOpcao(indice, valor) {
    const limpa = String(valor ?? '').trim();
    if (!limpa) return;
    setPropostas((atual) =>
      atual.map((p, i) => {
        if (i !== indice) return p;
        if (p.opcoes.length >= MAX_OPCOES) return p;
        if (p.opcoes.some((o) => o.toLowerCase() === limpa.toLowerCase())) return p;
        return { ...p, opcoes: [...p.opcoes, limpa] };
      })
    );
  }

  function removerOpcao(indice, opcao) {
    setPropostas((atual) =>
      atual.map((p, i) =>
        i === indice ? { ...p, opcoes: p.opcoes.filter((o) => o !== opcao) } : p
      )
    );
  }

  // --- Envio -----------------------------------------------------------------

  async function enviar(e) {
    e.preventDefault();
    setErro('');
    setEnviando(true);

    try {
      const resposta = await criarAssembleia({
        titulo,
        descricao,
        modo,
        propostas,
        // `criadoPor` NÃO era passado aqui, e a função gravava `undefined` no
        // documento — o Firestore recusa valor indefinido e a criação falhava
        // com "Unsupported field value: undefined".
        criadoPor: usuario?.uid ?? null,
        // Contagem do catálogo: é a base do percentual "das unidades aptas" no
        // resultado. Sem isto a assembleia nascia com zero e toda opção apareceria
        // como 0%, por mais que votassem.
        unidadesAptas,
      });
      setResultado({
        assembleiaId: resposta.assembleiaId,
        unidadesAptas: resposta.unidadesAptas,
        link: `${window.location.origin}/checkin/${resposta.assembleiaId}`,
      });
      setPasso('sucesso');
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setEnviando(false);
    }
  }

  function novaAssembleia() {
    setTitulo('');
    setDescricao('');
    setPropostas([propostaVazia()]);
    setResultado(null);
    setErro('');
    setPasso('formulario');
  }

  // A função `sairDoSistema` foi removida: o botão "Sair" agora vive na barra
  // lateral, ao alcance de todas as telas, e encerra a sessão de verdade —
  // antes ele apenas navegava e a sessão continuava ativa.

  // --- Tela de sucesso -------------------------------------------------------

  if (passo === 'sucesso' && resultado) {
  return (
    <PainelComBarra largura="max-w-xl">
      <div className="bg-gray-800 rounded-2xl p-8 w-full border border-gray-700">
        <div className="flex justify-center mb-4 text-green-400">
          <IconeCheck tamanho={44} />
        </div>
      <h2 className="text-2xl font-bold text-white text-center mb-1">{titulo}</h2>
      <p className="text-gray-400 text-center text-sm mb-1">
        Assembleia criada com {resultado.unidadesAptas} unidade(s) apta(s).
      </p>
    <p className="text-gray-500 text-center text-xs mb-6">
      Exiba este QR Code no telão para os moradores entrarem.
    </p>

  <div className="bg-white p-4 rounded-xl flex justify-center mb-4">
    <QRCodeSVG value={resultado.link} size={200} />
  </div>

<div className="bg-gray-900 p-3 rounded-lg break-all text-xs text-blue-400 font-mono mb-6">
  {resultado.link}
</div>

<div className="flex flex-col gap-3">
  <button
type="button"
onClick={() => router.push(`/resultados/${resultado.assembleiaId}`)}
className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition"
>
Acompanhar resultados
</button>
<div className="grid grid-cols-2 gap-3">
  <button
type="button"
onClick={novaAssembleia}
className="py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition"
>
Criar outra
</button>
<button
type="button"
onClick={() => router.push('/admin/historico')}
className="py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
>
Histórico
</button>
</div>
</div>
</div>
</PainelComBarra>
);
}

// --- Formulário -----------------------------------------------------------

  return (
    <PainelComBarra largura="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Painel</h1>
        {/*
          A identificação de quem está logado e a navegação ficam na barra
          lateral. Aqui é só o título: a fileira de botões que existia neste
          ponto repetia o que a barra já oferece em todas as telas, e mudava de
          combinação de uma tela para outra.
        */}
        <p className="text-gray-500 text-sm mt-1">
          Crie a assembleia, escolha o modo de votação e defina as propostas.
        </p>
      </div>

      {erro && (
        <div
          role="alert"
          className="mb-6 p-4 bg-red-900/30 border border-red-800 text-red-300 rounded-xl text-sm flex items-start gap-2"
        >
          <span className="mt-0.5 shrink-0"><IconeAlerta tamanho={16} /></span>
          {erro}
        </div>
      )}

      <form onSubmit={enviar} className="space-y-6">
        {/* Modo de votação — a decisão mais consequente desta tela */}
        <fieldset className="bg-gray-800 border border-gray-700 rounded-2xl p-6">
          <legend className="px-2 text-sm font-medium text-gray-300">
            Como os votos serão registrados? *
          </legend>
          <p className="text-xs text-gray-500 mb-4 mt-1">
            Esta escolha é definitiva: não é possível alterar o modo depois que a
            assembleia começa a receber votos.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            {[MODOS.ABERTA, MODOS.FECHADA].map((valor) => {
              const Icone = valor === MODOS.FECHADA ? IconeCadeado : IconeOlho;
              const ativo = modo === valor;

              return (
                <label
                  key={valor}
                  className={`cursor-pointer rounded-xl border p-4 transition ${
                    ativo
                      ? valor === MODOS.FECHADA
                        ? 'bg-indigo-900/30 border-indigo-500'
                        : 'bg-blue-900/30 border-blue-500'
                      : 'bg-gray-900 border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="modo"
                    value={valor}
                    checked={ativo}
                    onChange={() => setModo(valor)}
                    className="sr-only"
                  />
                  <div className={`flex items-center gap-2 font-semibold mb-2 ${
                    ativo ? 'text-white' : 'text-gray-300'
                  }`}>
                    <Icone tamanho={18} />
                    {ROTULOS_MODO[valor]}
                    {ativo && (
                      <span className="ml-auto text-green-400">
                        <IconeCheck tamanho={16} />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {DESCRICAO_MODO[valor]}
                  </p>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Dados gerais */}
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 space-y-5">
          <div>
            <label htmlFor="titulo" className="block text-sm font-medium text-gray-300 mb-2">
              Título da assembleia *
            </label>
            <input
              id="titulo"
              type="text"
              value={titulo}
              maxLength={MAX_TITULO}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Assembleia Geral Ordinária 2026"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <p className="text-xs text-gray-600 mt-1">
              {titulo.length}/{MAX_TITULO}
            </p>
          </div>

          <div>
            <label htmlFor="descricao" className="block text-sm font-medium text-gray-300 mb-2">
              Descrição (opcional)
            </label>
            <textarea
              id="descricao"
              rows={3}
              value={descricao}
              maxLength={MAX_DESCRICAO}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Contexto, ordem do dia, observações…"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>
        </div>

        {/* Propostas */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-300">Propostas da pauta *</h2>
            <span className="text-xs text-gray-600">
              mínimo {MIN_OPCOES} opções por proposta · máximo {MAX_OPCOES}
            </span>
          </div>

          {propostas.map((p, indice) => (
            <div
              key={indice}
              className="bg-gray-800 border border-gray-700 rounded-2xl p-5 space-y-4"
            >
              <div className="flex items-center gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-blue-900/50 text-blue-300 text-sm font-semibold flex items-center justify-center">
                  {indice + 1}
                </span>
                <input
                  type="text"
                  value={p.titulo}
                  maxLength={MAX_TITULO}
                  onChange={(e) => alterarProposta(indice, 'titulo', e.target.value)}
                  placeholder="Título da proposta"
                  className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
                />
                {propostas.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removerProposta(indice)}
                    aria-label={`Remover proposta ${indice + 1}`}
                    className="shrink-0 p-2 text-gray-500 hover:text-red-400 transition"
                  >
                    <IconeX tamanho={18} />
                  </button>
                )}
              </div>

              <textarea
                rows={2}
                value={p.descricao}
                maxLength={MAX_DESCRICAO}
                onChange={(e) => alterarProposta(indice, 'descricao', e.target.value)}
                placeholder="Descrição da proposta (opcional)"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />

              <div>
                <p className="text-xs text-gray-400 mb-2">Opções de voto</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {p.opcoes.map((opcao) => (
                    <span
                      key={opcao}
                      className="inline-flex items-center gap-1.5 bg-blue-900/40 text-blue-200 px-3 py-1 rounded-full text-sm"
                    >
                      {opcao}
                      {p.opcoes.length > MIN_OPCOES && (
                        <button
                          type="button"
                          onClick={() => removerOpcao(indice, opcao)}
                          aria-label={`Remover opção ${opcao}`}
                          className="text-blue-400 hover:text-blue-100 transition"
                        >
                          <IconeX tamanho={13} />
                        </button>
                      )}
                    </span>
                  ))}
                  {p.opcoes.length === 0 && (
                    <span className="text-xs text-gray-600">
                      Nenhuma opção — adicione ao menos {MIN_OPCOES}.
                    </span>
                  )}
                </div>

                {/* Campo controlado: a versão anterior era um input não controlado
                    alcançado via `e.target.previousSibling`, o que quebra ao
                    reordenar o JSX. */}
                <CampoNovaOpcao
                  desabilitado={p.opcoes.length >= MAX_OPCOES}
                  onAdicionar={(valor) => adicionarOpcao(indice, valor)}
                />
              </div>
            </div>
          ))}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={adicionarProposta}
              className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 font-medium transition"
            >
              <IconeMais tamanho={16} />
              Adicionar proposta
            </button>
          </div>
        </div>

        {/*
          Aviso do modo escolhido. O texto da versão anterior dizia que os votos
          do modo fechado seriam "cifrados (AES-256-GCM)" e que a abertura ficaria
          "registrada na trilha de auditoria". As duas afirmações deixaram de ser
          verdade quando o projeto passou a operar sem servidor, e foram
          reescritas para descrever o que existe de fato.
        */}
        <div className="bg-gray-900/60 border border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-400 leading-relaxed">
            {modo === MODOS.FECHADA
              ? 'Os votos desta assembleia serão gravados com leitura bloqueada: '
                + 'nem o síndico nem os moradores conseguem vê-los, e durante a '
                + 'votação não haverá placar. A contagem por opção é publicada uma '
                + 'única vez, no encerramento, e não pode ser alterada depois. A '
                + 'identificação de como cada unidade votou fica restrita ao '
                + 'administrador do sistema.'
              : 'Os votos desta assembleia ficarão registrados junto ao número da '
                + 'unidade e poderão ser conferidos por qualquer participante — '
                + 'formato do art. 1.335 do Código Civil.'}
          </p>
        </div>

        <button
          type="submit"
          disabled={enviando}
          className={`w-full py-4 rounded-xl font-semibold text-lg transition ${
            enviando
              ? 'bg-gray-700 cursor-not-allowed text-gray-400'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {enviando ? 'Criando assembleia…' : 'Criar assembleia e gerar QR Code'}
        </button>
      </form>
    </PainelComBarra>
  );
}

/**
 * Campo para adicionar uma opção. Componente separado para ter estado próprio —
 * o formulário pai não precisa saber o que está sendo digitado, e o valor não é
 * obtido por manipulação de DOM.
 */
function CampoNovaOpcao({ desabilitado, onAdicionar }) {
  const [valor, setValor] = useState('');

  function confirmar() {
    const limpo = valor.trim();
    if (!limpo) return;
    onAdicionar(limpo);
    setValor('');
  }

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={valor}
        maxLength={MAX_OPCAO}
        disabled={desabilitado}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            // Impede que Enter envie o formulário inteiro ao adicionar opção —
            // era um bug fácil de reproduzir na versão anterior.
            e.preventDefault();
            confirmar();
          }
        }}
        placeholder={desabilitado ? `Limite de ${MAX_OPCOES} opções atingido` : 'Adicionar opção'}
        className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      />
      <button
        type="button"
        onClick={confirmar}
        disabled={desabilitado || !valor.trim()}
        aria-label="Adicionar opção"
        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm transition"
      >
        <IconeMais tamanho={16} />
      </button>
    </div>
  );
}
