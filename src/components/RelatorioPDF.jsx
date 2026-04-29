import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 12 },
  header: { marginBottom: 20, borderBottom: 2, borderColor: '#3B82F6', paddingBottom: 10 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1F2937' },
  subtitle: { fontSize: 14, color: '#6B7280', marginTop: 5 },
  section: { marginBottom: 20 },
  propostaTitle: { fontSize: 16, fontWeight: 'bold', marginTop: 15, marginBottom: 10, color: '#1F2937' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottom: 1, borderColor: '#E5E7EB' },
  label: { width: '40%' },
  value: { width: '30%', textAlign: 'right' },
  bar: { height: 8, backgroundColor: '#E5E7EB', marginTop: 5, borderRadius: 4 },
  barFill: { height: 8, backgroundColor: '#10B981', borderRadius: 4 },
  footer: { position: 'absolute', bottom: 30, left: 30, right: 30, textAlign: 'center', color: '#9CA3AF', fontSize: 10 }
});

const RelatorioPDF = ({ assembleia, votosAgrupados }) => {
  const gerarProposta = (prop, idx) => {
    const votosProp = votosAgrupados[prop.titulo] || {};
    const totalVotos = Object.values(votosProp).reduce((acc, curr) => acc + curr, 0);

    return (
      <View key={idx} style={styles.section}>
        <Text style={styles.propostaTitle}>{idx + 1}. {prop.titulo}</Text>
        {prop.descricao && <Text style={{ fontSize: 10, color: '#6B7280', marginBottom: 5 }}>{prop.descricao}</Text>}
        <Text style={{ fontSize: 10, marginBottom: 5 }}>Total de votos: {totalVotos}</Text>

        {prop.opcoes?.map((opcao, opIdx) => {
          const count = votosProp[opcao] || 0;
          const pct = totalVotos > 0 ? Math.round((count / totalVotos) * 100) : 0;

          return (
            <View key={opIdx}>
              <View style={styles.row}>
                <Text style={styles.label}>{opcao}</Text>
                <Text style={styles.value}>{count} ({pct}%)</Text>
              </View>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${pct}%` }]} />
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>🌳 ipevox - Relatório de Votação</Text>
          <Text style={styles.subtitle}>{assembleia.titulo}</Text>
          <Text style={{ fontSize: 10, color: '#6B7280' }}>
            Data: {new Date(assembleia.criadoEm?.seconds * 1000).toLocaleDateString('pt-BR')} |
            Status: {assembleia.status === 'ativa' ? 'Em andamento' : 'Encerrada'}
          </Text>
        </View>

        {assembleia.propostas?.map((prop, idx) => gerarProposta(prop, idx))}

        <View style={styles.footer}>
          <Text>Gerado em {new Date().toLocaleString('pt-BR')}</Text>
          <Text>ipevox - Sistema de Votação Condominial</Text>
        </View>
      </Page>
    </Document>
  );
};

export default RelatorioPDF;