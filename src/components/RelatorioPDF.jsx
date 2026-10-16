import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

const CORES = {
  texto: '#1F2937',
  secundario: '#6B7280',
  azul: '#3B82F6',
  verde: '#10B981',
  borda: '#E5E7EB',
};

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 12,
    color: CORES.texto,
    paddingBottom: 70,
  },
  header: {
    marginBottom: 18,
    borderBottomWidth: 2,
    borderBottomColor: CORES.azul,
    paddingBottom: 10,
  },
  headerLinha: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  marca: { fontSize: 24, fontWeight: 'bold', color: CORES.azul },
  marcaComplemento: { fontSize: 14, color: '#4B5563', marginLeft: 5 },
  titulo: { fontSize: 16, fontWeight: 'bold', color: CORES.texto },
  descricao: { fontSize: 10, color: CORES.secundario, marginTop: 4 },

  secao: { marginBottom: 16 },
  secaoTitulo: {
    fontSize: 12,
    fontWeight: 'bold',
    color: CORES.texto,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: CORES.borda,
  },
  infoLinha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: CORES.borda,
  },
  infoLabel: { fontSize: 10, color: CORES.secundario, width: '45%' },
  infoValor: { fontSize: 10, color: CORES.texto, width: '55%', textAlign: 'right' },

  aviso: {
    marginBottom: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderLeftWidth: 4,
    backgroundColor: '#FFFBEB',
  },
  avisoTitulo: { fontSize: 10, fontWeight: 'bold', color: '#B45309', marginBottom: 4 },
  avisoTexto: { fontSize: 9, color: '#78350F', lineHeight: 1.4 },

  proposta: { marginBottom: 18 },
  propostaTitulo: { fontSize: 13, fontWeight: 'bold', color: CORES.texto, marginBottom: 3 },
  propostaDescricao: { fontSize: 9, color: CORES.secundario, marginBottom: 5 },
  baseCalculo: { fontSize: 9, color: CORES.secundario, marginBottom: 8 },

  resultado: { fontSize: 10, fontWeight: 'bold', marginTop: 8, marginBottom: 4 },
  resultadoOk: { color: CORES.verde },
  resultadoEmpate: { color: '#B45309' },
  resultadoNeutro: { color: CORES.secundario },

  opcao: { marginBottom: 8 },
  opcaoLinha: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 3 },
  opcaoNome: {
    fontSize: 10,
    fontWeight: 'bold',
    color: CORES.texto,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
  },
  opcaoVotos: { fontSize: 10, color: CORES.texto, marginLeft: 8, flexShrink: 0 },
  opcaoDetalhe: {
    fontSize: 8,
    color: CORES.secundario,
    marginLeft: 8,
    textAlign: 'right',
    flexShrink: 0,
  },
  barra: {
    height: 8,
    backgroundColor: CORES.borda,
    borderRadius: 4,
    marginTop: 2,
  },
  barraPreenchida: {
    height: 8,
    backgroundColor: CORES.azul,
    borderRadius: 4,
  },
  barraPreenchidaLider: {
    height: 8,
    backgroundColor: CORES.verde,
    borderRadius: 4,
  },

  vazio: { fontSize: 11, color: CORES.secundario, marginTop: 10, textAlign: 'center' },

  rodape: {
    position: 'absolute',
    bottom: 20,
    left: 30,
    right: 30,
    borderTopWidth: 1,
    borderTopColor: CORES.borda,
    paddingTop: 6,
  },
  rodapeTexto: { fontSize: 8, color: '#9CA3AF', textAlign: 'center' },
});

const parametro = (valor) => {
  try {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : null;
  } catch {
    return null;
  }
};

function formatarDataHora(valor) {
  try {
    if (valor === null || valor === undefined || valor === '') return '—';

    let data = null;

    if (valor instanceof Date) {
      data = valor;
    } else if (typeof valor === 'object') {
      const segundos = parametro(valor.seconds ?? valor._seconds);
      if (segundos !== null) {
        data = new Date(segundos * 1000);
      } else if (typeof valor.toDate === 'function') {
        data = valor.toDate();
      }
    } else if (typeof valor === 'number') {
      // Segundos (padrão Firestore) ou milissegundos, o que for plausível.
      data = new Date(valor < 1e11 ? valor * 1000 : valor);
    } else if (typeof valor === 'string') {
      const texto = valor.trim();
      if (!texto) return '—';
      data = new Date(texto);
    }

    if (!data || Number.isNaN(data.getTime())) return '—';

    return data.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

const formatarNumero = (valor, padrao = 0) => {
  const numero = parametro(valor);
  return numero === null ? padrao : numero;
};

const formatarPercentual = (valor) => {
  const numero = parametro(valor);
  return numero === null ? 0 : Math.round(numero);
};

const limitarPercentual = (valor) => Math.min(100, Math.max(0, formatarPercentual(valor)));

const ordenarPropostas = (propostas) => {
  if (!Array.isArray(propostas)) return [];
  return propostas
    .filter((proposta) => proposta && typeof proposta === 'object')
    .slice()
    .sort((a, b) => formatarNumero(a?.ordem, 0) - formatarNumero(b?.ordem, 0));
};

const opcoesDaProposta = (proposta) => {
  const lista = proposta?.opcoes;
  if (!Array.isArray(lista)) return [];

  return lista
    .filter((opcao) => opcao && typeof opcao === 'object')
    .map((opcao, indice) => {
      const votos = formatarNumero(opcao.votos, 0);
      const totalVotos = formatarNumero(proposta?.totalVotos, 0);
      const unidadesAptas = formatarNumero(proposta?.unidadesAptas, 0);

      return {
        chave: opcao.opcao || `opcao-${indice}`,
        rotulo: opcao.opcao || `Opção ${indice + 1}`,
        votos,
        percentual:
          opcao.percentual !== undefined && opcao.percentual !== null
            ? formatarPercentual(opcao.percentual)
            : totalVotos > 0
              ? Math.round((votos / totalVotos) * 100)
              : 0,
        percentualAptas:
          opcao.percentualAptas !== undefined && opcao.percentualAptas !== null
            ? formatarPercentual(opcao.percentualAptas)
            : unidadesAptas > 0
              ? Math.round((votos / unidadesAptas) * 100)
              : 0,
      };
    });
};

const rotuloModo = (modo) => {
  if (modo === 'fechada') return 'Votação restrita';
  if (modo === 'aberta') return 'Votação aberta (voto atribuível)';
  return 'Não informado';
};

const RelatorioPDF = ({ snapshot }) => {
  const dados = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const apuracao = dados.apuracao && typeof dados.apuracao === 'object' ? dados.apuracao : {};

  const unidadesAptas = formatarNumero(
    dados.unidadesAptas ?? apuracao.unidadesAptas,
    0,
  );
  const unidadesQueVotaram = formatarNumero(
    dados.unidadesQueVotaram ?? apuracao.totalParticipacoes,
    0,
  );
  const quorumParticipacao =
    unidadesAptas > 0 ? Math.round((unidadesQueVotaram / unidadesAptas) * 100) : 0;

  const propostas = ordenarPropostas(apuracao.propostas);

  const votosRegistrados = formatarNumero(dados.totalVotos, 0);

  const renderizarOpcao = (opcao, lider) => (
    <View key={opcao.chave} style={styles.opcao} wrap={false}>
      <View style={styles.opcaoLinha}>
        <Text style={styles.opcaoNome}>{opcao.rotulo}</Text>
        <Text style={styles.opcaoVotos}>{opcao.votos} votos</Text>
        <Text style={styles.opcaoDetalhe}>
          {opcao.percentual}% dos votos · {opcao.percentualAptas}% das unidades
        </Text>
      </View>
      <View style={styles.barra}>
        <View
          style={[
            lider ? styles.barraPreenchidaLider : styles.barraPreenchida,
            { width: `${limitarPercentual(opcao.percentualAptas)}%` },
          ]}
        />
      </View>
    </View>
  );

  const renderizarProposta = (proposta, indice) => {
    const chave = proposta.propostaId || `proposta-${indice}`;
    const titulo = proposta.titulo || `Proposta ${indice + 1}`;
    const opcoes = opcoesDaProposta(proposta);

    const totalVotos =
      proposta.totalVotos !== undefined && proposta.totalVotos !== null
        ? formatarNumero(proposta.totalVotos, 0)
        : opcoes.reduce((soma, opcao) => soma + opcao.votos, 0);

    const aptasProposta = formatarNumero(proposta.unidadesAptas, unidadesAptas);

    const quorumProposta =
      proposta.quorumPercentual !== undefined && proposta.quorumPercentual !== null
        ? formatarPercentual(proposta.quorumPercentual)
        : proposta.quorumAtingido !== undefined && proposta.quorumAtingido !== null
          ? Math.round(formatarNumero(proposta.quorumAtingido, 0) * 100)
          : aptasProposta > 0
            ? Math.round((totalVotos / aptasProposta) * 100)
            : 0;

    const empate = proposta.empate === true;
    const maisVotada = proposta.maisVotada && typeof proposta.maisVotada === 'object'
      ? proposta.maisVotada
      : null;

    let empatadas = Array.isArray(proposta.empatadas)
      ? proposta.empatadas.filter((item) => item !== null && item !== undefined && item !== '')
      : [];

    if (empate && empatadas.length === 0 && opcoes.length > 0) {
      const maior = Math.max(...opcoes.map((opcao) => opcao.votos));
      if (maior > 0) {
        empatadas = opcoes.filter((opcao) => opcao.votos === maior).map((opcao) => opcao.rotulo);
      }
    }

    const liderNome = maisVotada?.opcao || null;

    return (
      <View key={chave} style={styles.proposta}>
        <Text style={styles.propostaTitulo}>
          {indice + 1}. {titulo}
        </Text>
        {proposta.descricao ? (
          <Text style={styles.propostaDescricao}>{proposta.descricao}</Text>
        ) : null}

        <Text style={styles.baseCalculo}>
          Votos: {totalVotos} · Unidades aptas: {aptasProposta} · Quórum: {quorumProposta}%
        </Text>

        {totalVotos === 0 ? (
          <Text style={[styles.resultado, styles.resultadoNeutro]}>
            Sem votos registrados nesta proposta
          </Text>
        ) : null}

        {empate ? (
          <Text style={[styles.resultado, styles.resultadoEmpate]}>
            EMPATE entre:{' '}
            {empatadas.length > 0
              ? empatadas.join(', ')
              : 'opções com o mesmo número de votos'}
          </Text>
        ) : maisVotada ? (
          <Text style={[styles.resultado, styles.resultadoOk]}>
            Mais votada: {liderNome || '—'} ({formatarNumero(maisVotada.votos, 0)} votos)
          </Text>
        ) : null}

        {opcoes.map((opcao) => renderizarOpcao(opcao, !empate && liderNome === opcao.rotulo))}

        {dados.modo === 'aberta' && proposta.votosPorUnidade?.length > 0 ? (
          <View style={{ marginTop: 8, padding: 6, backgroundColor: '#F3F4F6', borderRadius: 4 }} wrap={false}>
            <Text style={{ fontSize: 8, fontWeight: 'bold', color: CORES.texto, marginBottom: 3 }}>
              Votação aberta — Votos registrados por unidade:
            </Text>
            <Text style={{ fontSize: 8, color: '#374151', lineHeight: 1.3 }}>
              {proposta.votosPorUnidade
                .map((v) => `Casa ${v.numero}: ${v.opcao}${v.inadimplente ? ' (inadimplente)' : ''}`)
                .join('  ·  ')}
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <View style={styles.headerLinha}>
            <Text style={styles.marca}>IPEVOX</Text>
            <Text style={styles.marcaComplemento}>| Relatório de Votação</Text>
          </View>
          <Text style={styles.titulo}>{dados.titulo || 'Assembleia'}</Text>
          {dados.descricao ? <Text style={styles.descricao}>{dados.descricao}</Text> : null}
        </View>

        <View style={styles.secao}>
          <Text style={styles.secaoTitulo}>Identificação da sessão</Text>

          <View style={styles.infoLinha}>
            <Text style={styles.infoLabel}>Assembleia</Text>
            <Text style={styles.infoValor}>{dados.assembleiaId || '—'}</Text>
          </View>
          <View style={styles.infoLinha}>
            <Text style={styles.infoLabel}>Abertura da votação</Text>
            <Text style={styles.infoValor}>{formatarDataHora(dados.criadoEm)}</Text>
          </View>
          <View style={styles.infoLinha}>
            <Text style={styles.infoLabel}>Encerramento da votação</Text>
            <Text style={styles.infoValor}>{formatarDataHora(dados.encerradoEm)}</Text>
          </View>
          <View style={styles.infoLinha}>
            <Text style={styles.infoLabel}>Modalidade</Text>
            <Text style={styles.infoValor}>{rotuloModo(dados.modo)}</Text>
          </View>
          <View style={styles.infoLinha}>
            <Text style={styles.infoLabel}>Unidades aptas</Text>
            <Text style={styles.infoValor}>{unidadesAptas}</Text>
          </View>
          <View style={styles.infoLinha}>
            <Text style={styles.infoLabel}>Unidades que votaram</Text>
            <Text style={styles.infoValor}>{unidadesQueVotaram}</Text>
          </View>
          <View style={styles.infoLinha}>
            <Text style={styles.infoLabel}>Quórum de participação</Text>
            <Text style={styles.infoValor}>
              {quorumParticipacao}% ({unidadesQueVotaram} de {unidadesAptas} unidades)
            </Text>
          </View>
          <View style={styles.infoLinha}>
            <Text style={styles.infoLabel}>Registros de voto</Text>
            <Text style={styles.infoValor}>{votosRegistrados} votos</Text>
          </View>
        </View>

        {dados.modo === 'restrita' || dados.modo === 'fechada' ? (
          <View style={styles.aviso} wrap={false}>
            <Text style={styles.avisoTitulo}>Votação restrita — sigilo declarado</Text>
            <Text style={styles.avisoTexto}>
              Os votos desta assembleia não são exibidos nas telas do sistema, nem
              ao síndico nem aos moradores. A contagem por opção foi publicada uma
              única vez, no encerramento, e não pode ser alterada depois. A leitura
              do voto individual, com unidade e autor, é restrita ao administrador
              do sistema, que responde por esse acesso. Este documento registra o
              resultado; a conferência voto a voto é feita fora dele.
            </Text>
          </View>
        ) : null}

        {propostas.length === 0 ? (
          <Text style={styles.vazio}>Nenhuma proposta registrada</Text>
        ) : (
          propostas.map((proposta, indice) => renderizarProposta(proposta, indice))
        )}

        <View style={styles.rodape} fixed>
          <Text style={styles.rodapeTexto}>Gerado em {formatarDataHora(new Date())}</Text>
          <Text style={styles.rodapeTexto}>
            Documento gerado a partir do snapshot de apuração registrado no encerramento — ipevox
          </Text>
        </View>
      </Page>
    </Document>
  );
};

export default RelatorioPDF;
