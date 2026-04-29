"use client";

import { db } from '@/lib/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';

export default function Admin() {
  const router = useRouter();

  // ✅ Verificação de login
  const [isAdmin, setIsAdmin] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('is_admin') === 'true';
    }
    return false;
  });;

  const [modo, setModo] = useState('assembleia'); // 'assembleia' ou 'rapida'
  const propostasRef = useRef(null);
  const [propostas, setPropostas] = useState([{
    titulo: '',
    descricao: '',
    opcoes: ['Sim', 'Não', 'Abstenção']
  }]);
  const [criado, setCriado] = useState(false);
  const [linkAssembleia, setLinkAssembleia] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');

  // Redireciona se não estiver logado
  useEffect(() => {
    if (!isAdmin) {
      router.push('/admin/login');
    }
  }, [isAdmin, router]);

  // Mostra loading enquanto verifica
  if (!isAdmin) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 animate-pulse">Redirecionando...</p>
      </main>
    );
  }

  // Adiciona nova proposta
  function addProposta() {
    setPropostas([...propostas, {
      titulo: '',
      descricao: '',
      opcoes: ['Sim', 'Não', 'Abstenção']
    }]);

    // Aguarda o React renderizar o novo card e rola a tela
    setTimeout(() => {
      if (propostasRef.current) {
        propostasRef.current.lastElementChild?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }, 100);
  }

  // Atualiza campo de uma proposta
  function updateProposta(index, campo, valor) {
    const novas = [...propostas];
    novas[index][campo] = valor;
    setPropostas(novas);
  }

  // Adiciona opção de voto
  function addOpcao(index, novaOpcao) {
    if (!novaOpcao.trim()) return;
    const novas = [...propostas];
    if (!novas[index].opcoes.includes(novaOpcao.trim())) {
      novas[index].opcoes = [...novas[index].opcoes, novaOpcao.trim()];
      setPropostas(novas);
    }
  }

  // Remove opção de voto
  function removeOpcao(index, opcaoRemover) {
    const novas = [...propostas];
    novas[index].opcoes = novas[index].opcoes.filter(o => o !== opcaoRemover);
    setPropostas(novas);
  }

  // Salva no Firestore
  async function criarAssembleia(e) {
    e.preventDefault();
    setErro('');
    setCarregando(true);

    try {
      // Validações
      if (!titulo.trim()) throw new Error('Título é obrigatório');

      // Prepara propostas válidas
      let propostasValidas = propostas.filter(p => p.titulo.trim() !== '');

      // Validação específica por modo
      if (modo === 'assembleia') {
        if (propostasValidas.length === 0) throw new Error('Adicione pelo menos uma proposta');
      } else {
        // Modo rápida: usa o título da assembleia como título da proposta
        propostasValidas = [{
          titulo: titulo.trim(),
          descricao: descricao.trim(),
          opcoes: propostas[0].opcoes
        }];
      }

      // Valida opções
      propostasValidas.forEach((p) => {
        if (p.opcoes.length < 2) {
          throw new Error(`A proposta "${p.titulo}" precisa de pelo menos 2 opções`);
        }
      });

      // Gera ID único
      const idAssembleia = `asb_${Date.now().toString(36)}`;
      const link = `${window.location.origin}/checkin/${idAssembleia}`;

      // Prepara dados
      const docData = {
        id: idAssembleia,
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        tipo: modo,
        status: 'ativa',
        propostas: propostasValidas,
        criadoEm: serverTimestamp(),
      };

      // Salva no Firestore
      await addDoc(collection(db, 'assembleias'), docData);

      // Sucesso!
      setLinkAssembleia(link);
      setCriado(true);

    } catch (err) {
      console.error(err);
      setErro(err.message || 'Erro ao criar assembleia');
    } finally {
      setCarregando(false);
    }
  }

  function alternarModo(novoModo) {
    setModo(novoModo);
    // Reseta para 1 proposta padrão ao trocar de modo
    setPropostas([{ titulo: '', descricao: '', opcoes: ['Sim', 'Não', 'Abstenção'] }]);
  }

  // Se já foi criada, mostra o QR Code
  if (criado) {
    // Extrai o ID da assembleia a partir do link gerado
    const idAssembleia = linkAssembleia.split('/').pop();

    return (
      <main className="min-h-screen py-12 px-4 flex items-center justify-center">
        <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full text-center space-y-6 border border-gray-700">
          <div className="text-4xl">✅</div>
          <h2 className="text-2xl font-bold text-white">{titulo}</h2>
          <p className="text-gray-400">Exiba este QR Code no telão</p>

          <div className="bg-white p-4 rounded-xl inline-block">
            <QRCodeSVG value={linkAssembleia} size={200} />
          </div>

          <div className="bg-gray-900 p-3 rounded-lg break-all text-sm text-blue-400 font-mono">
            {linkAssembleia}
          </div>

          {/* Botões de ação */}
          <div className="flex flex-col gap-3">
            <button
              onClick={() => router.push(`/resultados/${idAssembleia}`)}
              className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition"
            >
              Acompanhar Resultados em Tempo Real
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setCriado(false); setLinkAssembleia(''); }}
                className="py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition"
              >
                Criar outra
              </button>
              <button
                onClick={() => router.push('/')}
                className="py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
              >
                Ir para Landing
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-white">⚙️ Painel do Síndico</h1>
          <button
            onClick={() => router.push('/admin/historico')}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition"
          >
            📊 Histórico
          </button>
          <button onClick={() => router.push('/')} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition">
            Sair
          </button>
        </div>

        {erro && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-800 text-red-300 rounded-xl">
            ⚠️ {erro}
          </div>
        )}

        {/* Seletor de Modo */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <button
            onClick={() => alternarModo('assembleia')}
            className={`p-4 rounded-xl border text-left transition ${modo === 'assembleia' ? 'bg-blue-900/30 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}
          >
            <div className="text-2xl mb-2">🏢</div>
            <div className="font-semibold">Assembleia Completa</div>
            <div className="text-sm mt-1">Múltiplas propostas</div>
          </button>
          <button
            onClick={() => alternarModo('rapida')}
            className={`p-4 rounded-xl border text-left transition ${modo === 'rapida' ? 'bg-green-900/30 border-green-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}
          >
            <div className="text-2xl mb-2"></div>
            <div className="font-semibold">Votação Rápida</div>
            <div className="text-sm mt-1">Uma proposta urgente</div>
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={criarAssembleia} className="bg-gray-800 border border-gray-700 rounded-2xl p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Título *</label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder={modo === 'assembleia' ? "Ex: Assembleia Ordinária" : "Ex: Aprovação de Reforma"}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Descrição (opcional)</label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
              placeholder="Contexto ou detalhes..."
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          {/* Propostas */}
          <div className="space-y-4" ref={propostasRef}>
            <label className="block text-sm font-medium text-gray-300">
              {modo === 'rapida' ? 'Proposta Única' : 'Propostas da Pauta'}
            </label>

            {propostas.map((p, idx) => (
              <div key={idx} className="bg-gray-900 p-4 rounded-xl border border-gray-700 space-y-3">
                {modo === 'assembleia' && (
                  <input
                    type="text"
                    placeholder={`Título da proposta ${idx + 1} *`}
                    value={p.titulo}
                    onChange={(e) => updateProposta(idx, 'titulo', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500"
                    required
                  />
                )}

                {modo === 'rapida' && (
                  <input type="hidden" value={titulo} readOnly />
                )}


                {/* Opções de Voto */}
                <div>
                  <label className="block text-xs text-gray-400 mb-2">Opções de voto (mínimo 2):</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {p.opcoes.map((opcao, opIdx) => (
                      <span key={opIdx} className="bg-blue-900/50 text-blue-200 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                        {opcao}
                        {p.opcoes.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeOpcao(idx, opcao)}
                            className="text-blue-400 hover:text-blue-200"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Adicionar opção"
                      className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addOpcao(idx, e.target.value);
                          e.target.value = '';
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        const input = e.target.previousSibling;
                        addOpcao(idx, input.value);
                        input.value = '';
                      }}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* Botão Adicionar Proposta - alinhado à direita, acima do botão principal */}
            {modo === 'assembleia' && (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={addProposta}
                  className="text-sm text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Adicionar proposta
                </button>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={carregando}
            className={`w-full py-4 rounded-xl font-semibold text-lg transition
              ${carregando ? 'bg-gray-700 cursor-not-allowed text-gray-400' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
          >
            {carregando ? '🔄 Criando...' : '📢 Gerar QR Code e Iniciar'}
          </button>
        </form>
      </div>
    </main>
  );
}