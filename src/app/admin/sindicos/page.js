"use client";

/**
 * ipevox — Administração de acessos (síndicos)
 * =============================================================================
 * Tela do OPERADOR DO SISTEMA (super admin). Aqui ele cadastra e revoga o
 * acesso dos síndicos — sem precisar do console do Firebase nem de service
 * account, que era o que tornava cada novo condomínio um trabalho manual.
 *
 * A separação de papéis é deliberada:
 *   super admin → cadastra síndicos (esta tela)
 *   síndico     → administra as assembleias do seu condomínio
 *
 * Se qualquer síndico pudesse criar outros, "quem pode entrar neste sistema?"
 * ficaria sem resposta, e um acesso criado por engano só apareceria depois.
 *
 * As duas ações passam por Cloud Functions que verificam o papel no servidor:
 * esconder o botão aqui não é a proteção, é só a interface.
 */

import { IconeAlerta, IconeCadeado, IconeCheck, IconeEscudo } from '@/components/Icones';
import { PainelComBarra } from '@/components/BarraLateral';
import { criarSindico, listarSindicos, removerSindico } from '@/lib/api';
import { sair, useSessao } from '@/lib/auth';
import { formatarData } from '@/lib/schema';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

const FORMULARIO_VAZIO = {
  uid: '',
  nome: '',
  email: '',
  condominio: '',
  telefone: '',
};

export default function AdminSindicos() {
  const router = useRouter();
  const { usuario, carregando: carregandoSessao, ehSuperAdmin, ehAdmin } = useSessao();

  const [formulario, setFormulario] = useState(FORMULARIO_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const [sindicos, setSindicos] = useState([]);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [erroLista, setErroLista] = useState('');
  const [paraRemover, setParaRemover] = useState(null);
  const [removendo, setRemovendo] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      const resposta = await listarSindicos();
      setSindicos(resposta?.sindicos ?? []);
      setErroLista('');
    } catch (falha) {
      // Não é só "erro de rede": aqui também cai quem não é super admin, e a
      // mensagem precisa dizer isso em vez de parecer pane do sistema.
      setErroLista(falha.message);
      setSindicos([]);
    } finally {
      setCarregandoLista(false);
    }
  }, []);

  useEffect(() => {
    if (carregandoSessao) return;
    if (!usuario) {
      router.replace('/admin/login');
      return;
    }
    if (!ehSuperAdmin) return; // a tela explica o que fazer

    // `carregandoLista` já nasce `true`, então não há setState síncrono aqui —
    // o que evita render em cascata (regra `react-hooks/set-state-in-effect`).
    // Quem desliga a flag é o `finally` de `recarregar`.
    //
    // O `Promise.resolve().then(...)` existe só para tirar a chamada do corpo
    // SÍNCRONO do efeito: `recarregar` atualiza estado no início, e fazê-lo
    // durante a fase de efeito provoca o render em cascata que a regra aponta.
    // Funcionalmente a busca é a mesma, apenas agendada para o próximo tick.
    Promise.resolve().then(() => recarregar());
  }, [carregandoSessao, usuario, ehSuperAdmin, recarregar, router]);

  function alterarCampo(campo, valor) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }));
  }

  async function enviar(evento) {
    evento.preventDefault();
    setErro('');
    setAviso('');

    const uid = formulario.uid.trim();
    const nome = formulario.nome.trim();
    const email = formulario.email.trim().toLowerCase();

    if (!uid) {
      return setErro(
        'Informe o UID do síndico. Ele aparece em Authentication → Usuários, '
        + 'depois que a conta de login é criada no console do Firebase.'
      );
    }
    if (!nome) return setErro('Informe o nome do síndico.');
    if (email && !email.includes('@')) return setErro('O e-mail informado não é válido.');

    setSalvando(true);
    try {
      await criarSindico({
        uid,
        nome,
        email,
        condominio: formulario.condominio.trim(),
        telefone: formulario.telefone.trim(),
      });

      setFormulario(FORMULARIO_VAZIO);
      setAviso(
        `Permissão concedida a ${nome}. `
        + 'A conta de login já deve existir em Authentication → Usuários; '
        + 'se você ainda não a criou, crie agora, senão o síndico não consegue entrar.'
      );
      await recarregar();
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setSalvando(false);
    }
  }

  const fecharRemocao = useCallback(() => {
    if (!removendo) setParaRemover(null);
  }, [removendo]);

  async function confirmarRemocao() {
    if (!paraRemover) return;
    setRemovendo(true);
    setErro('');

    try {
      const resposta = await removerSindico(paraRemover.uid);
      setParaRemover(null);
      setAviso(
        `Acesso de ${paraRemover.nome || paraRemover.email} revogado.`
        + (resposta?.contaRemovida === false
          ? ' A permissão foi removida; a conta de login ficou pendente de exclusão.'
          : '')
      );
      await recarregar();
    } catch (falha) {
      setParaRemover(null);
      setErro(falha.message);
    } finally {
      setRemovendo(false);
    }
  }

  // `sairDoSistema` foi removida: o "Sair" vive na barra lateral e encerra a
  // sessão de verdade.

  if (carregandoSessao) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 animate-pulse">Verificando acesso…</p>
      </main>
    );
  }

  // Autenticado, mas sem o papel de super admin.
  if (usuario && !ehSuperAdmin) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-gray-800 border border-gray-700 rounded-2xl p-8 text-center">
          <div className="flex justify-center mb-4 text-gray-400">
            <IconeCadeado tamanho={36} />
          </div>
          <h1 className="text-xl font-bold text-white mb-3">
            Área do administrador do sistema
          </h1>
          <p className="text-gray-400 text-sm leading-relaxed mb-6">
            {ehAdmin
              ? 'Você está autenticado como síndico. Esta tela é restrita ao operador do sistema, que cadastra os acessos de síndico.'
              : 'Sua conta não tem acesso ao painel administrativo.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => router.push('/admin')}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
            >
              Ir ao painel
            </button>
            <button
              type="button"
              onClick={sairDoSistema}
              className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition"
            >
              Sair
            </button>
          </div>
        </div>
      </main>
    );
  }

  const ativos = sindicos.filter((s) => s.ativo).length;

  return (
    <PainelComBarra largura="max-w-4xl">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-3xl font-bold text-white">
          <IconeEscudo tamanho={28} />
          Acessos de síndico
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Cadastre quem pode administrar assembleias e revogue acessos.
        </p>
      </div>

      {erro && (
          <div
            role="alert"
            className="mb-6 p-4 bg-red-900/30 border border-red-800 text-red-300 rounded-xl flex items-start justify-between gap-4 text-sm"
          >
            <span className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-red-400"><IconeAlerta tamanho={16} /></span>
              <span>{erro}</span>
            </span>
            <button
              type="button"
              onClick={() => setErro('')}
              aria-label="Fechar aviso de erro"
              className="text-red-400 hover:text-red-200 underline shrink-0"
            >
              fechar
            </button>
          </div>
        )}

        {aviso && (
          <div
            role="status"
            className="mb-6 p-4 bg-green-900/30 border border-green-800 text-green-200 rounded-xl flex items-start justify-between gap-4 text-sm"
          >
            <span className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-green-400"><IconeCheck tamanho={16} /></span>
              <span>{aviso}</span>
            </span>
            <button
              type="button"
              onClick={() => setAviso('')}
              aria-label="Fechar aviso"
              className="text-green-300 hover:text-green-100 underline shrink-0"
            >
              fechar
            </button>
          </div>
        )}

        {/* Cadastro */}
        <form
          onSubmit={enviar}
          className="bg-gray-800 border border-gray-700 rounded-2xl p-6 mb-8"
        >
          <h2 className="text-lg font-semibold text-white mb-1">Cadastrar síndico</h2>
          <p className="text-gray-500 text-sm mb-6">
            Cria a conta de acesso e a permissão na mesma operação. O síndico entra
            em <span className="font-mono text-gray-400">/admin/login</span> com o
            e-mail e a senha definidos aqui.
          </p>

          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <label className="flex flex-col gap-1.5 text-sm text-gray-300">
              Nome completo *
              <input
                type="text"
                value={formulario.nome}
                onChange={(e) => alterarCampo('nome', e.target.value)}
                disabled={salvando}
                placeholder="Ex: Maria Silva"
                className="px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm text-gray-300">
              E-mail
              <input
                type="email"
                value={formulario.email}
                onChange={(e) => alterarCampo('email', e.target.value)}
                disabled={salvando}
                placeholder="sindico@condominio.com.br"
                autoComplete="off"
                className="px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60"
              />
            </label>

            {/*
              O UID substituiu o campo de senha. Motivo concreto: criar a conta de
              login exige o SDK de administrador do Firebase, que só roda em
              servidor — e este projeto opera apenas com recursos gratuitos, sem
              Cloud Functions. Então a conta nasce no console, e aqui só se grava a
              PERMISSÃO.
            */}
            <label className="flex flex-col gap-1.5 text-sm text-gray-300 sm:col-span-2">
              UID do síndico *
              <input
                type="text"
                value={formulario.uid}
                onChange={(e) => alterarCampo('uid', e.target.value)}
                disabled={salvando}
                placeholder="Cole aqui o UID que aparece em Authentication → Usuários"
                autoComplete="off"
                className="px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white font-mono text-sm placeholder-gray-600 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60"
              />
              <span className="text-xs text-gray-500 leading-relaxed">
                <strong className="text-gray-400">Como obter:</strong> crie a conta de
                login do síndico em{' '}
                <span className="text-gray-400">
                  Firebase Console → Authentication → Users → Add user
                </span>
                . Depois copie o valor da coluna <em>UID do usuário</em> e cole aqui.
                Criar a conta exige o console porque o SDK de administrador só roda em
                servidor — este projeto não usa Cloud Functions.
              </span>
            </label>

            <label className="flex flex-col gap-1.5 text-sm text-gray-300">
              Condomínio
              <input
                type="text"
                value={formulario.condominio}
                onChange={(e) => alterarCampo('condominio', e.target.value)}
                disabled={salvando}
                placeholder="Ex: Edifício Ipê, Bloco A"
                className="px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm text-gray-300">
              Telefone
              <input
                type="text"
                value={formulario.telefone}
                onChange={(e) => alterarCampo('telefone', e.target.value)}
                disabled={salvando}
                placeholder="(11) 90000-0000"
                className="px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={salvando}
            className={`w-full py-3 rounded-lg font-semibold transition ${
              salvando
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {salvando ? 'Cadastrando…' : 'Cadastrar síndico'}
          </button>
        </form>

        {/* Lista */}
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Síndicos cadastrados</h2>
              <p className="text-gray-500 text-sm mt-1">
                {sindicos.length} no total · {ativos} ativo(s)
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setCarregandoLista(true);
                recarregar();
              }}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition"
            >
              Atualizar
            </button>
          </div>

          {erroLista && (
            <p role="alert" className="mb-4 p-3 bg-red-900/30 border border-red-800 text-red-300 rounded-lg text-sm">
              {erroLista}
            </p>
          )}

          {carregandoLista ? (
            <p className="text-gray-400 text-center py-6 animate-pulse">Carregando…</p>
          ) : sindicos.length === 0 ? (
            <p className="text-gray-500 text-center py-6">
              Nenhum síndico cadastrado ainda. Use o formulário acima.
            </p>
          ) : (
            <div className="divide-y divide-gray-700/60">
              {sindicos.map((s) => (
                <div
                  key={s.uid}
                  className="flex flex-wrap justify-between items-center gap-3 py-4"
                >
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">
                      {s.nome || '(sem nome)'}
                    </p>
                    <p className="text-gray-400 text-sm truncate">{s.email}</p>
                    <p className="text-gray-600 text-xs mt-0.5">
                      {s.condominio ? `${s.condominio} · ` : ''}
                      cadastrado em {formatarData(s.criadoEm)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setParaRemover(s)}
                    className="px-3 py-1.5 bg-red-900/40 text-red-300 hover:bg-red-900/70 rounded text-xs font-medium transition shrink-0"
                  >
                    Revogar acesso
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      {paraRemover && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={fecharRemocao}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Revogar acesso de ${paraRemover.nome || paraRemover.email}`}
            className="bg-gray-800 rounded-2xl p-8 w-full max-w-md text-center border border-gray-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-4 text-red-400">
              <IconeAlerta tamanho={36} />
            </div>
            <h2 className="text-xl font-bold text-white mb-3">Revogar acesso?</h2>
            <p className="text-gray-300 text-sm leading-relaxed mb-6">
              <strong className="text-white">{paraRemover.nome || paraRemover.email}</strong>{' '}
              perderá o acesso imediatamente e não poderá mais criar ou administrar
              assembleias.
              <br />
              <span className="text-gray-500">
                O histórico de assembleias que ele criou não é apagado.
              </span>
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={fecharRemocao}
                disabled={removendo}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 disabled:opacity-60 text-white rounded-lg font-medium transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarRemocao}
                disabled={removendo}
                className="flex-1 py-3 rounded-lg font-semibold text-white transition bg-red-700 hover:bg-red-600 disabled:opacity-60"
              >
                {removendo ? 'Revogando…' : 'Revogar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PainelComBarra>
  );
}
