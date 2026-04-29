"use client";

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function AdminLogin() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (sessionStorage.getItem('is_admin') === 'true') {
      router.push('/admin');
    }
  }, []);

  function handleLogin(e) {
    e.preventDefault();
    if (pin === process.env.NEXT_PUBLIC_ADMIN_PIN) {
      sessionStorage.setItem('is_admin', 'true');
      router.push('/admin');
    } else {
      setErro('PIN incorreto');
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
      <div className="bg-gray-800 p-8 rounded-2xl border border-gray-700 w-full max-w-md">
        <h1 className="text-2xl font-bold text-white mb-6 text-center">🔐 Acesso Restrito</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="password"
            placeholder="Digite o PIN do síndico"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-center text-lg"
            autoFocus
          />
          {erro && <p className="text-red-400 text-center text-sm">{erro}</p>}
          <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition">
            Entrar
          </button>
        </form>
        <button onClick={() => router.push('/')} className="w-full mt-4 text-gray-400 hover:text-white text-sm">
          ← Voltar para a página inicial
        </button>
      </div>
    </main>
  );
}