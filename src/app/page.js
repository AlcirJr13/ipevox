"use client";

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

export default function LandingPage() {
  const router = useRouter();

  // Parallax sem re-render: os elementos de fundo são movidos direto no DOM
  // (element.style.transform) dentro de um requestAnimationFrame. Antes isso
  // era feito com setState a cada mousemove, o que re-renderizava toda a
  // landing page a cada pixel percorrido pelo mouse.
  const orbeAzulRef = useRef(null);
  const orbeVerdeRef = useRef(null);
  const posicaoRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef(null);

  useEffect(() => {
    const aplicarParallax = () => {
      frameRef.current = null;
      const { x, y } = posicaoRef.current;

      if (orbeAzulRef.current) {
        orbeAzulRef.current.style.transform = `translate(${x}px, ${y}px)`;
      }
      if (orbeVerdeRef.current) {
        orbeVerdeRef.current.style.transform = `translate(${-x}px, ${-y}px)`;
      }
    };

    const handleMouseMove = (e) => {
      posicaoRef.current = {
        x: (e.clientX / window.innerWidth - 0.5) * 20,
        y: (e.clientY / window.innerHeight - 0.5) * 20,
      };

      // Agrupa vários mousemove em um único frame de animação
      if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(aplicarParallax);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, []);

  // Logo é um botão de verdade: recebe foco e funciona pelo teclado
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Botão "Ver como funciona": rola suavemente até a seção, em vez de ficar morto
  const scrollParaComoFunciona = () => {
    document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth' });
  };

  const itensCondominio = [
    'Crie a assembleia e escolha o modo de votação: aberta ou restrita',
    'Gere um QR Code exclusivo para cada assembleia',
    'Uma proposta por vez, sem confusão na hora de decidir',
    'Apuração com quórum e percentual sobre as unidades aptas',
    'Relatório em PDF pronto para anexar à ata'
  ];

  const itensMorador = [
    'Simples: digite seu número da unidade',
    'A regra de sigilo da assembleia é informada antes de você votar',
    'Uma proposta por vez, sem confusão',
    'Confirmação antes de enviar',
    'Acesso rápido via QR Code, sem instalar nada'
  ];

  const itensVotacaoAberta = [
    'O voto fica registrado junto ao número da unidade',
    'Qualquer participante pode conferir quem votou o quê',
    'Formato previsto no art. 1.335 do Código Civil',
    'O mais simples de defender em uma impugnação'
  ];

  // O que o modo restrito REALMENTE garante — sem prometer criptografia, que este
  // modelo não tem. A versão anterior desta lista dizia "o voto é cifrado com
  // AES-256-GCM" e "toda abertura fica registrada em trilha de auditoria". As
  // duas afirmações deixaram de ser verdade quando o projeto passou a operar só
  // com recursos gratuitos, e foram reescritas para descrever o que existe.
  const itensVotacaoRestrita = [
    'O voto NÃO é exibido ao síndico nem aos outros moradores em nenhum momento',
    'Durante a votação não há placar: ninguém vê a contagem parcial',
    'A contagem por opção é publicada uma única vez, no encerramento, e não pode ser alterada depois',
    'Só o administrador do sistema consegue ver os votos individualmente'
  ];

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white overflow-hidden">
      {/* Background animado */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          ref={orbeAzulRef}
          className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"
        />
        <div
          ref={orbeVerdeRef}
          className="absolute bottom-0 right-1/4 w-96 h-96 bg-green-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"
        />
      </div>

      {/* Header FIXO no topo */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-gray-900/80 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          {/* Logo com scroll ao topo (button para ser acessível por teclado) */}
          <button
            type="button"
            onClick={scrollToTop}
            aria-label="Voltar ao topo"
            className="flex items-center gap-3 group cursor-pointer"
          >
            <span aria-hidden="true" className="text-3xl transition-transform group-hover:scale-110">🌳</span>
            <span className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-green-400 bg-clip-text text-transparent">
              ipevox
            </span>
          </button>

          <nav className="hidden md:flex gap-8">
            <a href="#como-funciona" className="text-gray-300 hover:text-white transition-colors hover:underline underline-offset-4">
              Como funciona
            </a>
            <a href="#sigilo" className="text-gray-300 hover:text-white transition-colors hover:underline underline-offset-4">
              Sigilo
            </a>
          </nav>

          <button
            type="button"
            onClick={() => router.push('/admin/login')}
            className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white px-6 py-2 rounded-lg font-semibold transition-all hover:scale-105 hover:shadow-lg hover:shadow-orange-500/25"
          >
            Área do Síndico
          </button>
        </div>
      </header>

      {/* Conteúdo principal - com padding-top para compensar o header fixo */}
      <div className="pt-24">
        {/* Hero Section */}
        <section className="relative z-10 max-w-7xl mx-auto px-6 py-24 text-center">
          <div className="inline-block mb-6 px-4 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-sm font-medium animate-fade-in">
            Votação Condominial Inteligente
          </div>

          <h2 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            Assembleias mais{' '}
            <span className="bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
              ágeis e seguras
            </span>
          </h2>

          {/* Subtítulo honesto sobre o que o sigilo é neste sistema.
              A promessa antiga de anonimato absoluto ("nem o administrador sabe
              em quem você votou") foi REMOVIDA porque é falsa. Depois, quando o
              projeto passou a operar só com recursos gratuitos, a criptografia
              também saiu — então a descrição mudou de novo, para não afirmar
              cifragem que não existe. Manter qualquer uma das duas frases
              enganaria o morador e daria munição a uma impugnação. */}
          <p className="text-xl text-gray-400 mb-12 max-w-3xl mx-auto leading-relaxed">
            Votação por QR Code, apuração no encerramento e sigilo declarado com
            transparência — em dois modos: aberto ou restrito.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            <button
              type="button"
              onClick={() => router.push('/admin/login')}
              className="group bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-all hover:scale-105 hover:shadow-2xl hover:shadow-orange-500/25 flex items-center gap-2"
            >
              Começar agora
              <svg aria-hidden="true" className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>

            <button
              type="button"
              onClick={scrollParaComoFunciona}
              className="group flex items-center gap-2 text-gray-300 hover:text-white px-8 py-4 rounded-xl font-semibold text-lg border border-gray-700 hover:border-gray-600 transition-all hover:bg-gray-800/50"
            >
              <svg aria-hidden="true" className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              Ver como funciona
            </button>
          </div>

          {/* Feature Cards */}
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <div className="group bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-8 hover:bg-gray-800/80 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/10 hover:border-blue-500/50">
              <div aria-hidden="true" className="text-5xl mb-4 transition-transform group-hover:scale-110">📱</div>
              <h3 className="text-xl font-semibold mb-3 text-white">Escaneie o QR Code</h3>
              <p className="text-gray-400 leading-relaxed">
                Na assembleia, escaneie o QR Code exibido no telão e acesse instantaneamente
              </p>
            </div>

            {/* Card do meio: antes dizia "Voto 100% secreto" (promessa falsa) e o
                emoji havia se perdido, deixando a div vazia. Agora explica o
                sigilo real e traz o ícone de volta. */}
            <div className="group bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-8 hover:bg-gray-800/80 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-green-500/10 hover:border-green-500/50">
              <div aria-hidden="true" className="text-5xl mb-4 transition-transform group-hover:scale-110">🔐</div>
              <h3 className="text-xl font-semibold mb-3 text-white">Sigilo sob controle</h3>
              <p className="text-gray-400 leading-relaxed">
                A assembleia escolhe entre voto aberto e voto selado, e o morador sabe qual regra vale antes de votar
              </p>
            </div>

            <div className="group bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-8 hover:bg-gray-800/80 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-orange-500/10 hover:border-orange-500/50">
              <div aria-hidden="true" className="text-5xl mb-4 transition-transform group-hover:scale-110">✅</div>
              <h3 className="text-xl font-semibold mb-3 text-white">Resultado instantâneo</h3>
              <p className="text-gray-400 leading-relaxed">
                Apuração automática em tempo real com gráficos e estatísticas
              </p>
            </div>
          </div>
        </section>

        {/* Como funciona */}
        <section id="como-funciona" className="relative z-10 bg-gray-900/50 py-24">
          <div className="max-w-7xl mx-auto px-6">
            <h3 className="text-4xl font-bold text-center mb-16">
              Como funciona
            </h3>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Para Condomínios */}
              <div className="group bg-gradient-to-br from-blue-900/20 to-blue-800/10 border border-blue-500/20 rounded-2xl p-10 hover:border-blue-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/10">
                <div aria-hidden="true" className="text-4xl mb-6">🏢</div>
                <h4 className="text-2xl font-semibold mb-6 text-blue-400">Para Condomínios</h4>
                <ul className="space-y-4">
                  {itensCondominio.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-gray-300 group-hover:text-white transition-colors">
                      <span aria-hidden="true" className="text-blue-500 mt-1">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Para Moradores */}
              <div className="group bg-gradient-to-br from-green-900/20 to-green-800/10 border border-green-500/20 rounded-2xl p-10 hover:border-green-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-green-500/10">
                <div aria-hidden="true" className="text-4xl mb-6">🏠</div>
                <h4 className="text-2xl font-semibold mb-6 text-green-400">Para Moradores</h4>
                <ul className="space-y-4">
                  {itensMorador.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-gray-300 group-hover:text-white transition-colors">
                      <span aria-hidden="true" className="text-green-500 mt-1">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Sigilo e transparência — seção central da página */}
        <section id="sigilo" className="relative z-10 py-24">
          <div className="max-w-7xl mx-auto px-6">
            <h3 className="text-4xl font-bold text-center mb-6">
              Sigilo e transparência
            </h3>

            <p className="text-lg text-gray-400 text-center max-w-3xl mx-auto mb-16 leading-relaxed">
              O ipevox tem dois modos de votação. Nenhum deles promete sigilo
              absoluto: o que existe é uma regra clara, escolhida antes da
              assembleia e registrada no sistema.
            </p>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Votação aberta */}
              <div className="group bg-gradient-to-br from-blue-900/20 to-blue-800/10 border border-blue-500/20 rounded-2xl p-10 hover:border-blue-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/10">
                <div aria-hidden="true" className="text-4xl mb-6">👁️</div>
                <h4 className="text-2xl font-semibold mb-6 text-blue-400">Votação aberta</h4>
                <ul className="space-y-4">
                  {itensVotacaoAberta.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-gray-300 group-hover:text-white transition-colors">
                      <span aria-hidden="true" className="text-blue-500 mt-1">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Votação fechada — o nome mudou de "selada" para "restrita"
                  quando a criptografia saiu: chamar de "selado" um voto que fica
                  em texto claro no banco seria promessa falsa. */}
              <div className="group bg-gradient-to-br from-green-900/20 to-green-800/10 border border-green-500/20 rounded-2xl p-10 hover:border-green-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-green-500/10">
                <div aria-hidden="true" className="text-4xl mb-6">🔐</div>
                <h4 className="text-2xl font-semibold mb-6 text-green-400">Votação fechada</h4>
                <ul className="space-y-4">
                  {itensVotacaoRestrita.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-gray-300 group-hover:text-white transition-colors">
                      <span aria-hidden="true" className="text-green-500 mt-1">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Nota em destaque: é o que dá validade ao processo */}
            <div className="mt-10 max-w-4xl mx-auto bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6 text-center">
              <p className="text-amber-200 leading-relaxed mb-3">
                <strong className="font-semibold">O modo é escolhido ao criar a assembleia e fica registrado.</strong>{' '}
                O morador sabe, antes de votar, qual regra está valendo naquela votação.
              </p>
              <p className="text-amber-200/70 text-sm leading-relaxed">
                Transparência total sobre o limite: no modo restrito, o voto fica
                guardado no banco de dados e a leitura é bloqueada para o síndico e
                para os moradores. O administrador do sistema tem acesso, e é ele
                quem responde por esse acesso.
              </p>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="relative z-10 py-24">
          <div className="max-w-4xl mx-auto px-6 text-center">
            <div className="bg-gradient-to-r from-orange-600 to-orange-700 rounded-3xl p-12 shadow-2xl shadow-orange-500/20">
              <h3 className="text-3xl font-bold mb-4">Pronto para transformar suas assembleias?</h3>
              <p className="text-orange-100 mb-8 text-lg">
                Comece a usar o ipevox hoje mesmo
              </p>
              <button
                type="button"
                onClick={() => router.push('/admin/login')}
                className="bg-white text-orange-600 px-8 py-4 rounded-xl font-bold text-lg hover:bg-gray-100 transition-all hover:scale-105 hover:shadow-xl"
              >
                Criar minha primeira assembleia
              </button>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="relative z-10 bg-gray-900 border-t border-gray-800 py-12">
          <div className="max-w-7xl mx-auto px-6 text-center text-gray-400">
            <div className="flex items-center justify-center gap-2 mb-4">
              <span aria-hidden="true" className="text-2xl">🌳</span>
              <span className="text-xl font-bold text-white">ipevox</span>
            </div>
            <p className="text-sm mb-3">
              Cada assembleia é criada no modo aberto ou selado —{' '}
              <a href="#sigilo" className="text-gray-300 hover:text-white underline underline-offset-4">
                veja as regras de sigilo
              </a>.
            </p>
            <p className="text-sm">
              © {new Date().getFullYear()} ipevox. Votação condominial simplificada e segura.
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}
