# Painel Interativo de Emendas Parlamentares (Versão Web Frontend)

Este é um painel interativo e analítico, desenvolvido originalmente em Python com a biblioteca **Streamlit**, e agora **convertido para uma aplicação web pura (HTML5, CSS3 e Vanilla JavaScript)**.

O objetivo do painel é monitorar e ajudar na fiscalização da destinação e execução física/financeira de recursos públicos federais provenientes de **Transferências Especiais da União (RP6 / Emendas PIX)** destinadas aos municípios do estado de Santa Catarina.

A aplicação cruza dados de repasses orçamentários, históricos de empenhos municipais para obras e materiais permanentes (TCE-SC), licitações municipais, e consultas em tempo real com apuração de extratos e contas correntes na base oficial de dados do governo federal (Transferegov).

---

## 🎯 Utilidade e Objetivo

O painel visa aprimorar a transparência pública, permitindo que cidadãos, gestores municipais e órgãos de controle fiscalizem:

- A distribuição espacial dos recursos de emendas federais por meio de mapas interativos.
- A eficiência de conversão financeira (relação entre o que foi empenhado/pago nas prefeituras e os recursos disponibilizados).
- O destino exato de cada pagamento feito por meio das contas específicas do governo federal.
- Indícios de casamentos de licitações suspeitas através de algoritmos de similaridade textual de objetos.

---

## ⚡ Principais Funcionalidades

1. **Mapa de Distribuição Geográfica**:Apresentação espacial de Santa Catarina com pontos georreferenciados. O tamanho das bolhas indica o volume financeiro e a cor representa a eficiência de pagamento (% de execução).
2. **Filtros Dinâmicos Cumulativos**:
   - Seleção por Município.
   - Seleção múltipla de Anos (Segure CTRL para selecionar mais de um).
   - Filtro por Autor da Emenda (Parlamentar). Ao selecionar, o mapa exibe apenas as cidades onde o parlamentar destinou recursos.
   - Filtro por Empresa Credora. Ao selecionar, o mapa apaga as bolhas azuis e gera **bolhas vermelhas** apenas nas cidades onde a empresa recebeu pagamentos (baseado nos dados do TCE-SC).
3. **Busca e Consulta em Tempo Real (Transferegov API)**:
   - Ao clicar numa emenda, o sistema busca em tempo real o Plano de Ação e os dados do Executor (Objeto, Banco, Agência, Conta Corrente).
   - Consulta paginada ao extrato financeiro da conta corrente oficial, acumulando todas as transações e gerando um gráfico analítico de pagamentos a Pessoas Jurídicas (PJs).
   - Tabela detalhada de todas as movimentações da conta (créditos e débitos).
4. **Mecanismo de Similaridade (Jaccard Ponderado)**:
   - Algoritmo roda 100% no navegador, comparando o objeto da emenda e o histórico de empenhos com as licitações municipais cadastradas no TCE-SC.
   - **Location Weight Boosting**: Palavras indicativas de vias públicas (ruas, avenidas, bairros) recebem peso extra (4.0) para evitar correspondências genéricas.
5. **Sistema de Busca Textual**:
   - Busca instantânea (em tempo real) por palavras-chave nos históricos de empenhos (ex: asfalto, creche), com extração de links externos via Regex e botão de busca direta no Google.
6. **Visão Dupla de Empresas (TCE vs Federal)**:
   - A aba de empresas exibe lado a lado os pagamentos feitos via extrato federal (Transferegov) e os empenhos registrados localmente pelo TCE-SC, permitindo cruzamento de dados.

---

## 🛠️ Estrutura do Projeto

```text
painel-emendas-web/
├── dados/
│   ├── emendas_sc.json               # Cadastro de emendas RP6 recebidas com dados bancários
│   ├── empenhos_tce.json             # Empenhos de obras e materiais permanentes do TCE-SC
│   ├── licitacoes_tce.json           # Cadastro de licitações de obras do TCE-SC
│   ├── municipios_sc.json            # Coordenadas geográficas dos municípios (IBGE)
│   └── pagamentos_pj.json            # Cadastro de pagamentos efetuados a PJs (extratos federais)
├── css/
│   └── style.css                     # Estilos visuais, layout responsivo e cards
├── js/
│   ├── app.js                        # Lógica principal, manipulação do DOM e tabelas
│   └── similaridade.js               # Algoritmo de Jaccard Ponderado para casamento de textos
├── proxy.py                          # Servidor proxy intermediário (Python) para driblar CORS da API
├── index.html                        # Estrutura principal da aplicação web
└── README.md                         # Este arquivo
```

---

## ⚙️ Requisitos e Instalação

Como a aplicação roda em HTML/JS puro no frontend, mas precisa buscar dados em tempo real da API do governo federal (que bloqueia requisições diretas de navegadores por questões de CORS), utilizamos um pequeno servidor Proxy local em Python.

### Passo 1: Preparar os dados

Certifique-se de que a pasta `dados/` contém os 5 arquivos `.json` mencionados na estrutura acima.

### Passo 2: Rodar o Servidor Proxy (Python)

O proxy é necessário para que o JavaScript consiga buscar o extrato bancário na API do Transferegov sem ser bloqueado pelo navegador.

No seu terminal, navegue até a pasta do projeto e execute:

```bash
python proxy.py
```

*(Deixe esta janela do terminal aberta enquanto estiver usando o painel).*

### Passo 3: Iniciar o Servidor Frontend

Como o navegador bloqueia a leitura de arquivos `.json` locais pelo protocolo `file:///`, você precisa rodar um servidor HTTP simples na pasta do projeto.

Abra uma **nova janela do terminal** (deixando a do proxy aberta), navegue até a pasta do projeto e execute:

```bash
python -m http.server 8000
```

### Passo 4: Acessar o Painel

Abra seu navegador de preferência e acesse o endereço: [http://localhost:8000](http://localhost:8000/)

---

## 📊 Fontes de Dados

- **Emendas Parlamentares RP6 & Extratos de Pagamentos (PJ)**: Portal de Dados Abertos do Transferegov (Ministério da Gestão e da Inovação).
- **Empenhos de Obras e Licitações Municipais**: Portal de Contas Públicas do Tribunal de Contas do Estado de Santa Catarina (TCE-SC).
- **Coordenadas de Municípios**: Diretoria de Geociências do Instituto Brasileiro de Geografia e Estatística (IBGE).

---

## ✍️ Autoria e Contato

- Desenvolvido originalmente em Python/Streamlit por Orlando Castro.
- Parceria de programação assistida por Inteligências Artificias.
- Reescrito e otimizado para HTML5/CSS/JS Vanilla com auxílio de Inteligência Artificial.
- Licenciado sob a Licença MIT.