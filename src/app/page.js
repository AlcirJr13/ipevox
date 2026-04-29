"use client";

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function LandingPage() {
  const router = useRouter();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Efeito de parallax suave com o mouse
  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePosition({
        x: (e.clientX / window.innerWidth - 0.5) * 20,
        y: (e.clientY / window.innerHeight - 0.5) * 20,
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Função para scroll suave ao topo
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white overflow-hidden">
      {/* Background animado */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"
          style={{ transform: `translate(${mousePosition.x}px, ${mousePosition.y}px)` }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-96 h-96 bg-green-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"
          style={{ transform: `translate(${-mousePosition.x}px, ${-mousePosition.y}px)` }}
        />
      </div>

      {/* Header FIXO no topo */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-gray-900/80 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          {/* Logo com scroll ao topo */}
          <div
            className="flex items-center gap-3 group cursor-pointer"
            onClick={scrollToTop}
          >
            <div className="text-3xl transition-transform group-hover:scale-110">🌳</div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-green-400 bg-clip-text text-transparent">
              ipevox
            </h1>
          </div>

          <nav className="hidden md:flex gap-8">
            <a href="#como-funciona" className="text-gray-300 hover:text-white transition-colors hover:underline underline-offset-4">
              Como Funciona
            </a>
            <a href="#beneficios" className="text-gray-300 hover:text-white transition-colors hover:underline underline-offset-4">
              Benefícios
            </a>
          </nav>

          <button
            onClick={() => router.push('/admin')}
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

          <p className="text-xl text-gray-400 mb-12 max-w-3xl mx-auto leading-relaxed">
            Votos secretos, resultados em tempo real e zero constrangimento.
            A forma moderna de decidir em condomínios.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            <button
              onClick={() => router.push('/admin')}
              className="group bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-all hover:scale-105 hover:shadow-2xl hover:shadow-orange-500/25 flex items-center gap-2"
            >
              Começar agora
              <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>

            <button className="group flex items-center gap-2 text-gray-300 hover:text-white px-8 py-4 rounded-xl font-semibold text-lg border border-gray-700 hover:border-gray-600 transition-all hover:bg-gray-800/50">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              Ver demonstração
            </button>
          </div>

          {/* Feature Cards */}
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <div className="group bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-8 hover:bg-gray-800/80 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/10 hover:border-blue-500/50">
              <div className="text-5xl mb-4 transition-transform group-hover:scale-110">📱</div>
              <h3 className="text-xl font-semibold mb-3 text-white">Escaneie o QR Code</h3>
              <p className="text-gray-400 leading-relaxed">
                Na assembleia, escaneie o QR Code exibido no telão e acesse instantaneamente
              </p>
            </div>

            <div className="group bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-8 hover:bg-gray-800/80 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-green-500/10 hover:border-green-500/50">
              <div className="text-5xl mb-4 transition-transform group-hover:scale-110"></div>
              <h3 className="text-xl font-semibold mb-3 text-white">Voto 100% secreto</h3>
              <p className="text-gray-400 leading-relaxed">
                Sua votação é anônima. Nem o administrador sabe em quem você votou
              </p>
            </div>

            <div className="group bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-8 hover:bg-gray-800/80 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-orange-500/10 hover:border-orange-500/50">
              <div className="text-5xl mb-4 transition-transform group-hover:scale-110">✅</div>
              <h3 className="text-xl font-semibold mb-3 text-white">Resultado instantâneo</h3>
              <p className="text-gray-400 leading-relaxed">
                Apuração automática em tempo real com gráficos e estatísticas
              </p>
            </div>
          </div>
        </section>

        {/* How it Works */}
        <section id="como-funciona" className="relative z-10 bg-gray-900/50 py-24">
          <div className="max-w-7xl mx-auto px-6">
            <h3 className="text-4xl font-bold text-center mb-16">
              Como funciona
            </h3>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Para Condomínios */}
              <div className="group bg-gradient-to-br from-blue-900/20 to-blue-800/10 border border-blue-500/20 rounded-2xl p-10 hover:border-blue-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/10">
                <div className="text-4xl mb-6">🏢</div>
                <h4 className="text-2xl font-semibold mb-6 text-blue-400">Para Condomínios</h4>
                <ul className="space-y-4">
                  {[
                    'Crie assembleias com múltiplas propostas',
                    'Votações rápidas para decisões urgentes',
                    'QR Code dinâmico para cada assembleia',
                    'Resultados em tempo real',
                    'Relatórios completos para atas'
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-gray-300 group-hover:text-white transition-colors">
                      <span className="text-blue-500 mt-1">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Para Moradores */}
              <div className="group bg-gradient-to-br from-green-900/20 to-green-800/10 border border-green-500/20 rounded-2xl p-10 hover:border-green-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-green-500/10">
                <div className="text-4xl mb-6">🏠</div>
                <h4 className="text-2xl font-semibold mb-6 text-green-400">Para Moradores</h4>
                <ul className="space-y-4">
                  {[
                    'Simples: digite seu número da unidade',
                    'Voto secreto garantido',
                    'Uma proposta por vez, sem confusão',
                    'Confirmação antes de enviar',
                    'Acesso rápido via QR Code'
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-gray-300 group-hover:text-white transition-colors">
                      <span className="text-green-500 mt-1">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
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
                onClick={() => router.push('/admin')}
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
              <span className="text-2xl">🌳</span>
              <span className="text-xl font-bold text-white">ipevox</span>
            </div>
            <p className="text-sm">
              © 2026 ipevox. Votação condominial simplificada e segura.
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}