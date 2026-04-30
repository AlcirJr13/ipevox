// Script de seed para cadastrar as 59 unidades no Firestore
// Uso: npx next script seed-unidades.js --env-file .env.local

import { initializeApp } from 'firebase/app';
import { addDoc, collection, getDocs, getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function seedUnidades() {
  const unidadesRef = collection(db, 'catalogo_unidades');

  // Verifica se já existem unidades cadastradas
  const snapshot = await getDocs(unidadesRef);
  if (!snapshot.empty) {
    console.log(`⚠️  Já existem ${snapshot.size} unidade(s) cadastrada(s).`);
    console.log('   Se deseja recadastrar, delete manualmente no Firebase Console.');
    return;
  }

  console.log('🌱 Cadastrando 59 unidades no Firestore (catalogo_unidades)...');

  let cadastradas = 0;
  let erros = 0;

  for (let i = 1; i <= 59; i++) {
    try {
      await addDoc(unidadesRef, {
        numero: String(i),
        ativo: true,
        criadoEm: new Date().toISOString(),
      });
      cadastradas++;
      console.log(`  ✅ Unidade ${i} cadastrada`);
    } catch (error) {
      erros++;
      console.error(`  ❌ Erro ao cadastrar unidade ${i}:`, error.message);
    }
  }

  console.log(`\n📊 Resumo: ${cadastradas} cadastradas, ${erros} erros.`);
  console.log('✅ Seed finalizado com sucesso!');

  process.exit(0);
}

seedUnidades().catch((error) => {
  console.error('❌ Erro no seed:', error);
  process.exit(1);
});
