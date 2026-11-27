# Plano – Plataforma de fluxos de processos da administração pública

Proposta discutida em 27/11/2026, para desenvolver numa próxima sessão. Os dados de Corumbá e as decisões em aberto estão no fim do documento.

## Objetivo

Criar, a partir da plataforma do Relatório de Gestão, um sistema de **fluxos de trabalho** na filosofia do FlowDocs (Fiorilli): processos que tramitam por etapas e setores, com prazos, documentos, despachos e histórico. Ele deve abranger **todos os processos da administração pública** (licitações, despesa, parcerias, contabilidade, pessoal, administrativo) e permitir anexar **PDFs de saída do SCPI** e de outros sistemas, sem depender de integração com eles.

## Ponto de partida: o que já existe (Relatório de Gestão, modo online)

- Login com perfis (contador = master; gerente de GAF), cadastro de UGs e usuários, senha provisória com troca obrigatória.
- Fluxo enviar → devolver com motivo → aprovar → reabrir; conclusão por seção; prazos e atrasos.
- Histórico imutável (revisões numeradas com diferenças campo a campo), versões restauráveis, log de auditoria.
- Painel de acompanhamento em tempo real, exportação CSV, presença e edição simultânea.
- Firebase (Auth + Firestore, plano gratuito Spark), regras de segurança testadas no emulador, site estático no GitHub Pages.
- Detalhes técnicos em `CLAUDE.md`; regras em `firestore.rules`; testes em `dev/firebase/`.

## Referência: o que o FlowDocs faz (pesquisado em 26/11/2026)

- Roteiros (fluxos) pré-definidos por assunto ou tipo de documento; tramitação pela estrutura administrativa; caixas de entrada; controle de prazos.
- Tipos de documento: memorando, circular, ofício, protocolo, ouvidoria, e-SIC; modelos visuais da própria entidade.
- Assinatura com certificado A1/A3 (ICP-Brasil); rastreio por número ou QR Code; registro de todos os acessos.
- Integrações com outros sistemas da Fiorilli e externos (SIOPE, SIOPS, SPED); a integração com o SCPI não é detalhada publicamente.
- Fontes: <https://fiorilli.com.br/sistemas/flowdocs> e <https://docs.fiorilli.com.br/flowdocs/sobre.html>.

## Desenho proposto

### 1. Motor de fluxos (vale para qualquer processo)

- **Estrutura administrativa:** setores (Compras, Licitação, Jurídico, Controle Interno, Contabilidade, Tesouraria, GAFs…) ligados às UGs; caixa de entrada por setor e por pessoa.
- **Editor de modelos de fluxo, sem programação:**
  - etapas, setor responsável e prazo de cada etapa;
  - lista de **documentos obrigatórios** com a base legal; o processo não avança sem eles;
  - campos próprios do processo (objeto, valor, modalidade, fornecedor…);
  - **ramificações**, por exemplo: "valor no limite de dispensa → rota de dispensa; senão → licitação".
- **Processos:** número/ano automático, tramitação, despachos, devolução com motivo, prazos e atrasos, anexos em PDF (inclusive do SCPI), histórico imutável e log, busca e painel por setor, etapa e responsável.
- **Documentos:** modelos de despacho, termo e parecer gerados em DOCX/PDF com o timbre, aproveitando os geradores existentes (`render-docx.js` e `render-pdf.js`).
- **Autenticidade:** consulta pública por código ou QR Code, com a "impressão digital" (hash SHA-256) do arquivo.

### 2. Biblioteca de modelos prontos (baseados na legislação; cada um adaptável)

| Área | Modelos |
|---|---|
| **Contratações (Lei 14.133/2021)** | Licitação, com as 7 fases do art. 17: a fase preparatória (art. 18: DFD, ETP, mapa de riscos, TR, pesquisa de preços, parecer jurídico) e depois edital, propostas, julgamento, habilitação, recursos e homologação. Contratação direta: dispensa e inexigibilidade (art. 72, 74, 75). Registro de preços e adesão à ata (art. 82–86). Credenciamento (art. 79). Contrato, com publicação no PNCP e designação de gestor e fiscal (art. 94 e 117). Aditivos e apostilamentos (art. 124–136). Sanção a fornecedor (art. 155–163). |
| **Execução da despesa (Lei 4.320/1964)** | Empenho → liquidação (atesto, nota fiscal, certidões; art. 63) → pagamento em ordem cronológica (art. 141 da Lei 14.133). Suprimento de fundos (art. 68–69). Diárias. Cancelamento de restos a pagar. |
| **Transferências e parcerias** | Convênios. Parcerias com OSC (Lei 13.019/2014): chamamento, celebração, monitoramento e prestação de contas. Subvenções. |
| **Contabilidade e controle** | Conciliação bancária mensal, fechamento mensal e remessas ao e-Sfinge, Prestação de Contas Anual (o Relatório de Gestão entra aqui), notas explicativas, inventário patrimonial, recomendações do controle interno. |
| **Pessoal** | Admissão, férias e licenças, conferência da folha, exoneração e rescisão. |
| **Administrativo** | Memorando, ofício, solicitação entre setores. |

### 3. Entregas em etapas (cada uma testada com emulador e Playwright, como no Relatório de Gestão)

1. **Etapa 1:** motor, setores, processos, anexos em PDF, caixas de entrada, painel e três modelos completos: licitação (pregão), contratação direta e despesa (empenho → liquidação → pagamento).
2. **Etapa 2:** o restante da biblioteca e os modelos de documentos.
3. **Etapa 3:** autenticidade por QR Code e assinatura com token integrada.

## Restrições já pesquisadas

- **Armazenamento de arquivos:** o Cloud Storage for Firebase **exige o plano pago (Blaze) desde 03/02/2026**, mesmo com uso pequeno. No Blaze, a cota gratuita dos buckets novos vale só para regiões dos EUA (us-central1, us-east1, us-west1), e não para São Paulo. Fonte: <https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024>.

  | Opção | Custo | Limite |
  |---|---|---|
  | PDFs no próprio Firestore, em partes (tipo Bytes, até ~1 MB por documento) | Zero | 1 GB no total no plano Spark, da ordem de 2 a 3 mil PDFs de 300 KB |
  | Blaze, bucket em São Paulo | Centavos por GB/mês | Exige cartão ou conta de faturamento da prefeitura |
  | Blaze, bucket nos EUA | Zero até 5 GB | Dados fora do Brasil (atenção à LGPD) |

  Recomendação: começar sem custo, com os PDFs no Firestore e um limite por arquivo (por exemplo, 2 MB); migrar para o Blaze em São Paulo se o volume crescer.
- **Repositório público:** nunca guardar documentos no GitHub, só no banco, protegidos pelas regras.
- **Assinatura com token A3, sem custo:** assinar fora (Assinador SERPRO), anexar o PDF assinado e registrar o hash no histórico. O Web PKI (Lacuna) não cobra por assinatura, mas exige licença por domínio para uso fora de localhost (preço sob consulta); montar o PDF assinado (PAdES) costuma exigir componente de servidor (Rest PKI ou PKI SDK).
- **Posicionamento:** usar como ferramenta **interna** (contabilidade, GAFs e setores), e não como protocolo oficial ao cidadão. O FlowDocs é o sistema contratado pela prefeitura para isso, e um processo eletrônico oficial costuma exigir regulamentação municipal (Lei 14.129/2021 e Lei 14.063/2020).

## Decisões em aberto (perguntar ao usuário antes de começar)

1. **Onde fica:** ampliar a plataforma atual, com o mesmo login, usuários e UGs (recomendado), ou criar um sistema separado? Se ampliar, aproveitar para trocar o endereço e o nome, por exemplo para um subdomínio da prefeitura, que é gratuito e depende só de a TI criar o registro de DNS.
2. **PDFs:** começar sem custo, no Firestore (até ~1 GB), ou já usar o plano Blaze?
3. **Regulamentação local:** Corumbá tem decreto municipal regulamentando a Lei 14.133 (agente de contratação, comissões, alçadas de autorização)? Pedir o texto para os modelos seguirem o rito do município.

## Como retomar numa nova sessão

Peça ao Claude: "Leia `docs/PLANO-PLATAFORMA-FLUXOS.md` e o `CLAUDE.md` e vamos começar a Etapa 1". Em seguida, responda às três decisões em aberto.
