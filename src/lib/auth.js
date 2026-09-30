"use client";

/**
 * ipevox — autenticação e papéis (modelo SEM SERVIDOR)
 * =============================================================================
 * Como os papéis são decididos neste modelo:
 *
 *   ADMINISTRADOR DO SISTEMA — pelo E-MAIL. A lista vive no arquivo
 *       `firestore.rules`, e é o próprio banco que a aplica. O app apenas lê o
 *       e-mail da sessão para decidir o que MOSTRAR; quem garante o acesso é a
 *       regra. Antes isso vinha de um documento em `/super_admins`, mas sem
 *       servidor esse documento seria escrito pelo cliente — qualquer pessoa
 *       poderia se promover gravando um documento.
 *
 *   SÍNDICO — por documento em `/admins/{uid}`, provisionado pelo administrador
 *       do sistema na tela de acessos.
 *
 *   MORADOR — sessão anônima, sem papel nenhum. Vota e sai.
 *
 * Consequência: mudar quem é administrador do sistema exige editar
 * `firestore.rules` e publicar de novo. É deliberado — o papel mais poderoso do
 * sistema não deve ser concedido por uma escrita no banco.
 */

import {
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { obterAuth, obterDb } from './firebase';
import { COLECOES } from './schema';

/**
 * E-mails com papel de administrador do sistema.
 *
 * PRECISA estar idêntico à lista `emailsAdminSistema()` de `firestore.rules`.
 * Esta cópia serve apenas para a interface; se divergir, a tela vai mostrar o
 * que o banco vai recusar — ou esconder o que ele permitiria. O comentário
 * existe porque essa duplicação é uma armadilha real de manutenção.
 */
const EMAILS_ADMIN_SISTEMA = [
  'alcirjr11@gmail.com',
  'alcir_jr13@hotmail.com',
];

export function ehEmailAdminSistema(email) {
  if (!email) return false;
  return EMAILS_ADMIN_SISTEMA.includes(String(email).trim().toLowerCase());
}

/**
 * Observa a sessão e resolve os papéis.
 *
 * @returns {{ usuario, carregando, erro, ehAdmin, ehSuperAdmin, ehOperador, nome }}
 */
export function useSessao() {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [ehAdmin, setEhAdmin] = useState(false);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    const cancelar = onAuthStateChanged(
      obterAuth(),
      async (user) => {
        setUsuario(user);
        setErro('');

        if (!user) {
          setEhAdmin(false);
          setNome('');
          setCarregando(false);
          return;
        }

        // O papel de administrador do sistema não depende do banco.
        if (ehEmailAdminSistema(user.email)) {
          setNome(user.displayName ?? '');
          setCarregando(false);
          return;
        }

        // Síndico: consulta o próprio documento. A regra permite que cada um leia
        // apenas o seu — não existe leitura da lista pelo cliente.
        try {
          const snap = await getDoc(doc(obterDb(), COLECOES.ADMINS, user.uid));
          setEhAdmin(snap.exists());
          setNome(snap.exists() ? (snap.data().nome ?? '') : (user.displayName ?? ''));
        } catch {
          // Falha ao consultar o papel não deve travar a tela: o padrão é negar.
          setEhAdmin(false);
          setErro('Não foi possível verificar suas permissões.');
        } finally {
          setCarregando(false);
        }
      },
      (e) => {
        setErro(e?.message ?? 'Falha na autenticação.');
        setCarregando(false);
      }
    );

    return cancelar;
  }, []);

  const ehSuperAdmin = ehEmailAdminSistema(usuario?.email);

  return {
    usuario,
    carregando,
    erro,
    ehAdmin,
    ehSuperAdmin,
    ehOperador: ehAdmin || ehSuperAdmin,
    nome,
  };
}

/**
 * Garante uma sessão para o morador, criando uma anônima se necessário.
 *
 * O morador não digita senha: o objetivo é ter um UID para as regras exigirem
 * usuário autenticado. Ativar em: Console → Authentication → Sign-in method →
 * Anônimo.
 */
export function useSessaoAnonima() {
  const [pronta, setPronta] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;

    const cancelar = onAuthStateChanged(obterAuth(), async (user) => {
      if (user) {
        if (ativo) {
          setPronta(true);
          setErro('');
        }
        return;
      }

      try {
        await signInAnonymously(obterAuth());
      } catch (e) {
        if (!ativo) return;

        // Em StrictMode o efeito roda duas vezes e o segundo login pode rejeitar
        // mesmo tendo funcionado. Sem esta guarda, apareceria erro falso em dev.
        if (obterAuth().currentUser) {
          setPronta(true);
          setErro('');
          return;
        }

        const codigo = e?.code ?? '';
        const provedorDesligado = codigo === 'auth/operation-not-allowed'
          || codigo === 'auth/configuration-not-found';

        setErro(
          provedorDesligado
            ? 'O acesso de morador está desativado neste projeto. Ative o provedor '
              + '"Anônimo" em Firebase Console → Authentication → Sign-in method. '
              + 'Sem ele, o check-in da assembleia não funciona.'
            : 'Não foi possível iniciar a sessão. Verifique sua conexão.'
        );
        setPronta(false);
      }
    });

    return () => {
      ativo = false;
      cancelar();
    };
  }, []);

  return { pronta, erro };
}

/**
 * Login de quem opera o sistema.
 *
 * Não há cadastro por esta tela. O acesso é decidido pelo e-mail (administrador
 * do sistema) ou pelo documento em `/admins` (síndico), ambos verificados no
 * banco na primeira operação.
 */
export async function entrarComoSindico({ email, senha }) {
  const emailLimpo = String(email ?? '').trim().toLowerCase();
  if (!emailLimpo || !senha) {
    throw new Error('Informe e-mail e senha.');
  }

  let credencial;
  try {
    credencial = await signInWithEmailAndPassword(obterAuth(), emailLimpo, senha);
  } catch (e) {
    throw new Error(traduzirErroAuth(e));
  }

  const usuario = credencial.user;

  // Administrador do sistema entra sem consultar o banco.
  if (ehEmailAdminSistema(emailLimpo)) return usuario;

  // Síndico precisa do documento de permissão.
  const registro = await getDoc(doc(obterDb(), COLECOES.ADMINS, usuario.uid));
  if (!registro.exists()) {
    await signOut(obterAuth());
    throw new Error(
      'Esta conta não tem acesso ao painel. Peça ao administrador do sistema '
      + 'para cadastrar o seu acesso.'
    );
  }

  return usuario;
}

function traduzirErroAuth(erro) {
  switch (erro?.code) {
    case 'auth/invalid-email':
      return 'E-mail inválido.';
    case 'auth/weak-password':
      return 'Senha muito fraca. Use ao menos 6 caracteres.';
    case 'auth/email-already-in-use':
      return 'Já existe uma conta com este e-mail. Verifique a senha.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'E-mail ou senha incorretos. Se a conta ainda não existe, crie-a em '
        + 'Firebase Console → Authentication → Users.';
    case 'auth/user-not-found':
      return 'Não existe conta com este e-mail. Crie-a em Firebase Console → '
        + 'Authentication → Users.';
    case 'auth/user-disabled':
      return 'Esta conta está desativada.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas. Aguarde alguns minutos.';
    case 'auth/network-request-failed':
      return 'Sem conexão. Verifique a internet.';
    case 'auth/operation-not-allowed':
    case 'auth/configuration-not-found':
      return 'O login por e-mail e senha não está ativado neste projeto. '
        + 'Ative em Firebase Console → Authentication → Sign-in method → '
        + 'E-mail/senha.';
    case 'auth/api-key-not-valid':
    case 'auth/invalid-api-key':
      return 'A chave do Firebase (NEXT_PUBLIC_FIREBASE_API_KEY) não é aceita pelo '
        + 'Google. Copie novamente o bloco firebaseConfig em Configurações do '
        + 'projeto → Seus apps → Config e atualize o .env.local. Reinicie o '
        + 'servidor depois.';
    case 'auth/unauthorized-domain':
      return 'Este endereço não está autorizado no Firebase. Adicione-o em '
        + 'Authentication → Settings → Authorized domains.';
    default:
      return erro?.message ?? 'Não foi possível entrar.';
  }
}

export async function sair() {
  await signOut(obterAuth());
}

/**
 * Hook para páginas administrativas: só quem opera o sistema vê o conteúdo.
 *
 * O redirecionamento aqui é conveniência de navegação. A proteção real está nas
 * regras do Firestore: mesmo que alguém chegue à tela, as leituras e escritas
 * são negadas pelo banco.
 */
export function useExigirAdmin(router) {
  const sessao = useSessao();

  useEffect(() => {
    if (sessao.carregando) return;
    if (!sessao.usuario || !sessao.ehOperador) {
      router.replace('/admin/login');
    }
  }, [sessao.carregando, sessao.usuario, sessao.ehOperador, router]);

  const autorizado = Boolean(sessao.usuario) && sessao.ehOperador && !sessao.carregando;
  return { ...sessao, autorizado };
}

/** Identifica a chave pública usada para o check-in (HMAC da unidade). */
export function identificadorDaUnidade(numero) {
  // Neste modelo não há servidor para calcular o HMAC. O identificador passa a
  // ser derivado do número de forma determinística e estável — é o que garante
  // uma sessão por unidade, e é o mesmo critério usado nos IDs determinísticos.
  return String(numero ?? '').trim().toUpperCase().replace(/^0+(?=\d)/, '');
}
