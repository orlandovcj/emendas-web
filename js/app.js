// Variáveis globais para guardar os dados na memória
let dadosEmendas = [];
let dadosMunicipios = [];
let dadosEmpenhos = [];
let dadosLicitacoes = [];
let dadosPagamentos = [];

let municipioSelecionadoNorm = null; // Guarda o nome normalizado do município clicado

// --- FUNÇÕES DE LIMPEZA (Traduzidas do Python) ---
function normalizeName(name) {
    if (!name) return "";
    // Remove acentos
    let text = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    text = text.toUpperCase().replace(/'/g, " ").replace(/-/g, " ");
    return text.replace(/\s+/g, ' ').trim();
}

function cleanMuniName(name) {
    if (!name) return "";
    let upper = name.toUpperCase();
    const prefixes = ["MUNICIPIO DE ", "MUNICIPIO DA ", "MUNICIPIO DO ", "MUNICIPIO "];
    for (let p of prefixes) {
        if (upper.startsWith(p)) {
            return name.substring(p.length).trim();
        }
    }
    return name.trim();
}

function formatCurrency(value) {
    if (value === null || isNaN(value)) return "R$ 0,00";
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCnpj(cnpj) {
    cnpj = String(cnpj).replace(/\D/g, '').padStart(14, '0');
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

function formatTimestampToDate(ts) {
    if (!ts || ts === "-") return "N/A";
    try {
        // O JSON do Excel veio em milissegundos
        return new Date(ts).toLocaleDateString('pt-BR');
    } catch (e) {
        return "Data inválida";
    }
}

// --- CARREGAMENTO DE DADOS ---
async function carregarDados() {
    try {
        // Busca todos os JSONs ao mesmo tempo
        const [emendas, munis, empenhos, lic, pags] = await Promise.all([
            fetch('dados/emendas_sc.json').then(r => r.json()),
            fetch('dados/municipios_sc.json').then(r => r.json()),
            fetch('dados/empenhos_tce.json').then(r => r.json()),
            fetch('dados/licitacoes_tce.json').then(r => r.json()),
            fetch('dados/pagamentos_pj.json').then(r => r.json())
        ]);

        // Processando Emendas (limpeza de campos)
        dadosEmendas = emendas.map(e => ({
            codigo_emenda_num: parseInt(String(e.codigo_emenda).substring(0, 12)),
            autor: `${e.codigo_parlamentar} - ${e.nome_parlamentar.toUpperCase()}`,
            valor_emenda: e.valor_emenda,
            municipio_orig: cleanMuniName(e.nome_municipio),
            municipio_norm: normalizeName(cleanMuniName(e.nome_municipio)),
            cnpj_beneficiario: String(e.cnpj_municipio).padStart(14, '0'),
            banco: e.banco || "N/A",
            codigo_banco: e.codigo_banco || "", // ADICIONADO
            agencia: e.agencia || "N/A",
            agencia_sem_dv: e.agencia_sem_dv || "", // ADICIONADO
            conta_corrente: e.conta_corrente || "N/A",
            conta_corrente_sem_dv: e.conta_corrente_sem_dv || "" // ADICIONADO
        }));

        // Processando Municípios
        dadosMunicipios = munis;

        // Processando Empenhos
        dadosEmpenhos = empenhos.map(emp => ({
            ...emp,
            municipio_norm: normalizeName(emp.Ente),
            data_empenho_fmt: formatTimestampToDate(emp["Data Empenho"])
        }));

        // Processando Licitações
        dadosLicitacoes = lic.map(l => ({
            ...l,
            municipio_norm: normalizeName(l.Ente)
        }));

        // Processando Pagamentos
        dadosPagamentos = pags.map(p => ({
            ...p,
            municipio_norm: normalizeName(cleanMuniName(p["Nome do Município"])),
            cnpj_fmt: formatCnpj(p["CNPJ do beneficiário do pagamento"])
        }));

        // Extrai última data de empenho para a sidebar
        let maxDate = Math.max(...dadosEmpenhos.map(e => e["Data Empenho"]).filter(d => d && d !== "-"));
        document.getElementById('data-atualizacao').innerText = `Empenhos atualizados até: ${formatTimestampToDate(maxDate)}`;

        // Popular filtros dinâmicos
        popularFiltroAnos();
        popularFiltroAutores();
        popularFiltroEmpresas();
        
        // Popular lista de municípios
        popularMunicipios();
        
        // --- AQUI É A CORREÇÃO ---
        // Ao invés de chamar renderizarMapa() e atualizarMetricasGlobais() separadamente,
        // chamamos a função mestre que faz tudo isso já aplicando os filtros (que começam vazios = "Todos")
        aplicarFiltros();

    } catch (error) {
        console.error("Erro ao carregar dados:", error);
        alert("Erro ao carregar arquivos JSON. Verifique o console (F12).");
    }
}

// --- POPULAR DROPDOWN DE MUNICIPIOS ---
function popularMunicipios() {
    const select = document.getElementById('select-municipio');
    // Usamos os municípios do arquivo de coordenadas para a lista
    dadosMunicipios.forEach(muni => {
        let option = document.createElement('option');
        option.value = muni.nome_normalizado;
        option.textContent = muni.nome;
        select.appendChild(option);
    });
}

// --- ATUALIZAR MÉTRICAS GLOBAIS (SIDEBAR) ---
function atualizarMetricasGlobais() {
    let totalEmendas = dadosEmendas.reduce((sum, e) => sum + e.valor_emenda, 0);
    let totalPago = dadosEmpenhos.reduce((sum, e) => sum + e["Valor Pagamento"], 0);
    
    let execGeral = totalEmendas > 0 ? (totalPago / totalEmendas * 100).toFixed(1) : 0;

    document.getElementById('metricas-globais').innerHTML = `
        <h3>Resumo do Estado</h3>
        <p><strong>Total Emendas PIX:</strong> ${formatCurrency(totalEmendas)}</p>
        <p><strong>Total Pago:</strong> ${formatCurrency(totalPago)}</p>
        <p><strong>Taxa Execução:</strong> ${execGeral}%</p>
    `;
}

// --- RENDERIZAR MAPA COM PLOTLY ---
function renderizarMapa() {
    // Agrupar emendas por município
    let dadosMapa = dadosMunicipios.map(muni => {
        let emendasDoMuni = dadosEmendas.filter(e => e.municipio_norm === muni.nome_normalizado);
        let totalEmendas = emendasDoMuni.reduce((sum, e) => sum + e.valor_emenda, 0);
        
        return {
            lat: muni.latitude,
            lon: muni.longitude,
            nome: muni.nome,
            total: totalEmendas,
            qtd: emendasDoMuni.length
        };
    });

    let trace = [{
        type: 'scattermapbox',
        mode: 'markers',
        lat: dadosMapa.map(d => d.lat),
        lon: dadosMapa.map(d => d.lon),
        text: dadosMapa.map(d => `<b>${d.nome}</b><br>Recebido: ${formatCurrency(d.total)}<br>Qtd Emendas: ${d.qtd}`),
        hoverinfo: 'text',
        marker: {
            size: dadosMapa.map(d => d.total > 0 ? Math.max(10, d.total / 500000) : 8), // Bolha maior para mais dinheiro
            color: dadosMapa.map(d => d.total > 0 ? '#2563eb' : '#cbd5e1'),
            opacity: 0.7
        }
    }];

    let layout = {
        mapbox: { style: 'open-street-map', center: {lat: -27.25, lon: -50.25}, zoom: 6.2 },
        margin: { t: 0, b: 0, l: 0, r: 0 }
    };

    Plotly.newPlot('mapa-sc', trace, layout);

    // Evento de clique no mapa
    document.getElementById('mapa-sc').on('plotly_click', function(data) {
        let pointIndex = data.points[0].pointNumber;
        let muniNorm = dadosMunicipios[pointIndex].nome_normalizado;
        
        // Atualiza o selectbox e mostra os detalhes
        document.getElementById('select-municipio').value = muniNorm;
        mostrarDetalhesMunicipio(muniNorm);
    });
}

// --- SISTEMA DE ABAS ---
function openTab(evt, tabId) {
    document.querySelectorAll('.tab-content').forEach(div => div.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabId).style.display = 'block';
    evt.currentTarget.classList.add('active');
}

// --- MOSTRAR DETALHES DO MUNICIPIO SELECIONADO ---
function municipioAlterado() {
    let muniNorm = document.getElementById('select-municipio').value;
    if (muniNorm) {
        mostrarDetalhesMunicipio(muniNorm);
    } else {
        voltarParaMapa();
    }
}

function mostrarDetalhesMunicipio(muniNorm) {
    aplicarFiltros(); // Redireciona para a nova lógica
}

async function mostrarDetalhesMunicipioFiltrado(muniNorm, emendasMuni, empenhosMuni, pagamentosMuni) {
    municipioSelecionadoNorm = muniNorm;
    let muniData = dadosMunicipios.find(m => m.nome_normalizado === muniNorm);
    if (!muniData) return;
    
    document.getElementById('mapa-sc').style.display = 'none';
    document.getElementById('detalhes-municipio').style.display = 'block';
    document.getElementById('titulo-municipio').innerText = `📍 Painel: ${muniData.nome}`;
    
    // Popular Aba 1 (Emendas)
    let tbodyEmendas = document.getElementById('tabela-emendas-body');
    tbodyEmendas.innerHTML = "";
    emendasMuni.forEach(e => {
        tbodyEmendas.innerHTML += `
            <tr style="cursor: pointer;" onclick="buscarExtratoEmenda('${e.codigo_emenda_num}', '${e.cnpj_beneficiario}', '${e.codigo_banco}', '${e.agencia_sem_dv}', '${e.conta_corrente_sem_dv}')">
                <td>${e.codigo_emenda_num}</td>
                <td>${e.autor.split(' - ')[1] || e.autor}</td>
                <td>${e.banco} (Ag: ${e.agencia}, C/C: ${e.conta_corrente})</td>
                <td><strong>${formatCurrency(e.valor_emenda)}</strong></td>
            </tr>
        `;
    });
    if (emendasMuni.length === 0) tbodyEmendas.innerHTML = `<tr><td colspan="4">Nenhuma emenda encontrada para os filtros aplicados.</td></tr>`;

    // Popular Aba 2 (Obras)
    window.empenhosMuniAtual = empenhosMuni;
    filtrarEmpenhos();

    // Popular Aba 3 (Empresas)
    let tbodyEmpresas = document.getElementById('tabela-empresas-body');
    tbodyEmpresas.innerHTML = "";
    let empresasAgrupadas = {};
    pagamentosMuni.forEach(p => {
        let cnpj = p.cnpj_fmt;
        if (!empresasAgrupadas[cnpj]) empresasAgrupadas[cnpj] = { razao: p["Razão Social"], total: 0, qtd: 0 };
        empresasAgrupadas[cnpj].total += p["Valor Total Pago"];
        empresasAgrupadas[cnpj].qtd += 1;
    });
    let arrayEmpresas = Object.keys(empresasAgrupadas).map(cnpj => ({ cnpj, razao: empresasAgrupadas[cnpj].razao, total: empresasAgrupadas[cnpj].total, qtd: empresasAgrupadas[cnpj].qtd })).sort((a, b) => b.total - a.total);
    arrayEmpresas.forEach(emp => {
        tbodyEmpresas.innerHTML += `<tr><td>${emp.cnpj}</td><td>${emp.razao}</td><td>${emp.qtd}</td><td><strong>${formatCurrency(emp.total)}</strong></td></tr>`;
    });
    if (arrayEmpresas.length === 0) tbodyEmpresas.innerHTML = `<tr><td colspan="4">Nenhuma empresa encontrada para os filtros aplicados.</td></tr>`;
    desenharGraficoTopEmpresas(arrayEmpresas.slice(0, 5));
    processarCredoresTCE(empenhosMuni);

    // Popular Aba 4 (Histórico)
    window.empenhosMuniHistorico = empenhosMuni;
    document.getElementById('input-busca-historico').value = "";
    filtrarHistorico();
}

function voltarParaMapa() {
    // Limpa a seleção de município no dropdown
    document.getElementById('select-municipio').value = "";
    municipioSelecionadoNorm = null;
    
    // Dispara a função mestre para recalcular o mapa com os filtros atuais
    aplicarFiltros();
}

// --- FUNÇÕES DE INTEGRAÇÃO COM API DO TRANSFEREGOV ---

let emendaSelecionada = null;

async function buscarExtratoEmenda(codigoEmenda, cnpj, bancoCod, agencia, conta) {
    
    if (emendaSelecionada === codigoEmenda) {
        document.getElementById('detalhe-api-emenda').style.display = 'none';
        emendaSelecionada = null;
        return;
    }
    emendaSelecionada = codigoEmenda;
    // Garante que a tabela e o gráfico iniciem ocultos
    document.getElementById('tabela-extrato-completa').style.display = 'none';
    document.getElementById('titulo-extrato').style.display = 'none';
    document.getElementById('titulo-grafico-pj').style.display = 'none';
    document.getElementById('grafico-pj').style.display = 'none';         

    const divDetalhe = document.getElementById('detalhe-api-emenda');
    const divResumo = document.getElementById('resumo-financeiro');
    
    divDetalhe.style.display = 'block';
    document.getElementById('titulo-api-emenda').innerText = `Carregando dados da Emenda ${codigoEmenda}...`;
    divResumo.innerHTML = "<p>Buscando plano de ação...</p>";

    // 1. Busca o Objeto e Conta Corrente
    ultimoObjetoAPI = await buscarDadosPlanoAcao(codigoEmenda, cnpj);
    
    // 2. Dispara a verificação de similaridade usando o objeto obtido
    verificarSimilaridade(codigoEmenda, ultimoObjetoAPI);
    // -------------------------

    const divGrafico = document.getElementById('grafico-pj');
    document.getElementById('titulo-api-emenda').innerText = `Extrato Bancário da Emenda ${codigoEmenda}`;
    divResumo.innerHTML = "<p>Buscando lançamentos financeiros...</p>";
    divGrafico.innerHTML = "";

    // Limpeza garantindo apenas números
    const cnpjClean = String(cnpj).replace(/\D/g, '');
    const bancoClean = String(bancoCod).replace(/\D/g, '');
    const agenciaClean = String(agencia).replace(/\D/g, '');
    const contaClean = String(conta).replace(/\D/g, '');

    // Verificação rápida se os dados vieram
    if (!cnpjClean || !bancoClean || !agenciaClean || !contaClean) {
        divResumo.innerHTML = "<p style='color:orange;'>Dados bancários incompletos no arquivo local para buscar o extrato.</p>";
        return;
    }

    const urlApi = `https://api-publica.transferegov.gestao.gov.br/especiais/gestao_financeira_lancamentos_especiais?cnpj_ente_solicitante_gestao_financeira=${cnpjClean}&codigo_banco_gestao_financeira=${bancoClean}&codigo_agencia_gestao_financeira=${agenciaClean}&codigo_conta_gestao_financeira=${contaClean}&pagina=1&tamanho_da_pagina=200`;
    
    // Usando proxy para contornar bloqueio de CORS do navegador
    //const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(urlApi);
    // Usando nosso proxy Python local
    const proxyUrl = 'http://localhost:8080/proxy?url=' + encodeURIComponent(urlApi);

    try {
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error("Erro HTTP: " + response.status);
        
        const res = await response.json();
        
        if (res.data && res.data.length > 0) {
            ultimoObjetoAPI = null; 
            verificarSimilaridade(codigoEmenda, ultimoObjetoAPI);

            const lancamentos = res.data;
            
            let totalCreditos = 0;
            let totalDebitos = 0;
            let debitosPJ = {};

            lancamentos.forEach(tx => {
                const valor = tx.valor_gestao_financeira || 0;
                const tipoOp = tx.tipo_operacao_gestao_financeira;
                const tipoFav = String(tx.tipo_favorecido_gestao_financeira);
                const nomeFav = tx.nome_favorecido_gestao_financeira;

                if (tipoOp === 'C') {
                    totalCreditos += valor;
                } else if (tipoOp === 'D') {
                    totalDebitos += valor;
                    
                    // Se for Pessoa Jurídica (tipo 2)
                    if (tipoFav === '2' || tipoFav === '2.0') {
                        if (nomeFav && nomeFav.trim() !== "") {
                            if (!debitosPJ[nomeFav]) {
                                debitosPJ[nomeFav] = 0;
                            }
                            debitosPJ[nomeFav] += valor;
                        }
                    }
                }
            });

            let saldo = totalCreditos - totalDebitos;

            document.getElementById('titulo-api-emenda').innerText = `Extrato Bancário da Emenda ${codigoEmenda}`;
            divResumo.innerHTML = `
                <div style="flex:1; padding:15px; background:#f0fdf4; border-radius:8px; border:1px solid #bbf7d0; text-align:center;">
                    <div style="font-size:0.8rem; color:#15803d; font-weight:bold;">RECEBIDO (CRÉDITOS)</div>
                    <div style="font-size:1.2rem; color:#166534;">${formatCurrency(totalCreditos)}</div>
                </div>
                <div style="flex:1; padding:15px; background:#fef2f2; border-radius:8px; border:1px solid #fecaca; text-align:center;">
                    <div style="font-size:0.8rem; color:#b91c1c; font-weight:bold;">PAGO (DÉBITOS)</div>
                    <div style="font-size:1.2rem; color:#991b1b;">${formatCurrency(totalDebitos)}</div>
                </div>
                <div style="flex:1; padding:15px; background:${saldo >= 0 ? '#f0fdfa' : '#fff7ed'}; border-radius:8px; border:1px solid ${saldo >= 0 ? '#99f6e4' : '#ffedd5'}; text-align:center;">
                    <div style="font-size:0.8rem; color:${saldo >= 0 ? '#115e59' : '#9a3412'}; font-weight:bold;">SALDO FINAL</div>
                    <div style="font-size:1.2rem; color:${saldo >= 0 ? '#115e59' : '#9a3412'};">${formatCurrency(saldo)}</div>
                </div>
            `;

            let arrayPJs = Object.keys(debitosPJ).map(nome => ({
                empresa: nome,
                valor: debitosPJ[nome]
            })).sort((a, b) => b.valor - a.valor).slice(0, 15);

            if (arrayPJs.length > 0) {
                let trace = [{
                    type: 'bar',
                    x: arrayPJs.map(d => d.valor),
                    y: arrayPJs.map(d => d.empresa),
                    orientation: 'h',
                    marker: { color: '#ef4444' }
                }];

                let layout = {
                    margin: { l: 200, r: 20, t: 10, b: 40 },
                    height: 400,
                    yaxis: { automargin: true, autorange: 'reversed' },
                    xaxis: { title: 'Valor Pago (R$)' }
                };

                Plotly.newPlot('grafico-pj', trace, layout);
            } else {
                document.getElementById('grafico-pj').innerHTML = "<p>Nenhum pagamento a Pessoa Jurídica (PJ) identificado neste extrato.</p>";
            }

            // 4. Popular a Tabela de Lançamentos Financeiros
            let tbodyExtrato = document.getElementById('tabela-extrato-body');
            tbodyExtrato.innerHTML = ""; // Limpa a tabela
            
            // Mapear e formatar os dados para a tabela
            let dadosTabela = lancamentos.map(tx => {
                let data = new Date(tx.data_lancamento_gestao_financeira).toLocaleDateString('pt-BR');
                let operacao = tx.tipo_operacao_gestao_financeira === 'C' ? "🟢 Crédito" : "🔴 Débito";
                let descricao = tx.descricao_gestao_financeira || "Lançamento";
                
                let agent = "", doc = "";
                if (tx.tipo_operacao_gestao_financeira === 'C') {
                    agent = tx.nome_depositante_gestao_financeira || "Não Identificado";
                    doc = tx.doc_depositante_gestao_financeira;
                } else {
                    agent = tx.nome_favorecido_gestao_financeira || "Não Identificado";
                    doc = tx.doc_favorecido_gestao_financeira;
                }
                
                // Formatar CNPJ/CPF
                let docStr = "";
                if (doc) {
                    let digits = String(doc).split('.')[0].replace(/\D/g, '');
                    if (digits.length > 11) {
                        digits = digits.padStart(14, '0');
                        docStr = `${digits.substring(0,2)}.${digits.substring(2,5)}.${digits.substring(5,8)}/${digits.substring(8,12)}-${digits.substring(12,14)}`;
                    } else if (digits.length > 0) {
                        digits = digits.padStart(11, '0');
                        docStr = `${digits.substring(0,3)}.${digits.substring(3,6)}.${digits.substring(6,9)}-${digits.substring(9,11)}`;
                    }
                }

                let valor = formatCurrency(tx.valor_gestao_financeira);
                let corValor = tx.tipo_operacao_gestao_financeira === 'C' ? '#166534' : '#991b1b';

                return `
                    <tr>
                        <td>${data}</td>
                        <td><strong>${operacao}</strong></td>
                        <td style="max-width: 300px;">${descricao}</td>
                        <td>${agent}</td>
                        <td style="font-family: monospace; font-size: 0.8rem;">${docStr}</td>
                        <td style="text-align: right; font-weight: 700; color: ${corValor};">${valor}</td>
                    </tr>
                `;
            }).join("");

            tbodyExtrato.innerHTML = dadosTabela;
            // Exibe a tabela e os títulos, já que temos dados!
            document.getElementById('tabela-extrato-completa').style.display = 'table';
            document.getElementById('titulo-extrato').style.display = 'block';
            document.getElementById('titulo-grafico-pj').style.display = 'block'; 
            document.getElementById('grafico-pj').style.display = 'block'; 

        } else {
            // Se entrar no else (sem dados na API):
            document.getElementById('titulo-api-emenda').innerText = `Emenda ${codigoEmenda}`;
            divResumo.innerHTML = "<p>Nenhum lançamento encontrado na conta bancária oficial do governo para esta emenda.</p>";
            
            // Garante que fiquem ocultos se não houver lançamentos
            document.getElementById('tabela-extrato-completa').style.display = 'none';
            document.getElementById('titulo-extrato').style.display = 'none';
            document.getElementById('titulo-grafico-pj').style.display = 'none'; 
            document.getElementById('grafico-pj').style.display = 'none'; 

        }

    } catch (error) {
        console.error("Detalhes do erro ao buscar API:", error);
        document.getElementById('titulo-api-emenda').innerText = "Erro ao buscar dados";
        divResumo.innerHTML = "<p style='color:red;'>Não foi possível acessar a API do Transferegov. Verifique o console (F12) para mais detalhes.</p>";
    }
}

// --- FUNÇÃO DE SIMILARIDADE DE LICITAÇÕES ---

async function verificarSimilaridade(codigoEmenda, objetoAPI) {
    const tbodySim = document.getElementById('tabela-similaridade-body');
    tbodySim.innerHTML = "<tr><td colspan='5'>Calculando similaridade...</td></tr>";

    // 1. Pegar licitações do município selecionado
    let licitacoesMuni = dadosLicitacoes.filter(l => l.municipio_norm === municipioSelecionadoNorm);
    
    if (licitacoesMuni.length === 0) {
        tbodySim.innerHTML = "<tr><td colspan='5'>Nenhuma licitação cadastrada no TCE para este município.</td></tr>";
        return;
    }

    // 2. Pegar históricos de empenhos vinculados a esta emenda (via Regex do código de 12 dígitos)
    // O código da emenda tem 12 dígitos e começa com 202 (ex: 202141850007)
    const padraoEmenda = new RegExp(`\\b(${codigoEmenda})\\b`);
    
    let empenhosVinculados = dadosEmpenhos.filter(e => {
        let texto = String(e["Descrição Histórico Empenho"] || "") + " " + String(e["Nr. Licitação / Contrato / Convênio"] || "");
        return padraoEmenda.test(texto); // Se o código da emenda estiver no texto do empenho
    });

    // 3. Se não tiver objeto da API e não tiver empenhos, não há o que comparar
    if (!objetoAPI && empenhosVinculados.length === 0) {
        tbodySim.innerHTML = "<tr><td colspan='5'>Sem dados de objeto ou empenhos vinculados para calcular similaridade.</td></tr>";
        return;
    }

    // 4. Rodar o algoritmo de Jaccard para cada licitação
    let resultados = [];
    
    licitacoesMuni.forEach(lic => {
        let bestScore = 0.0;
        let bestSrc = "Nenhum";
        
        // Comparar com objeto da API (se existir)
        if (objetoAPI && objetoAPI !== "Objeto não informado no cadastro offline.") {
            let scoreAPI = calculateSimilarityJaccard(objetoAPI, lic["Objeto Licitação"]);
            if (scoreAPI > bestScore) {
                bestScore = scoreAPI;
                bestSrc = "Objeto Pactuado (API)";
            }
        }
        
        // Comparar com cada empenho vinculado
        empenhosVinculados.forEach(emp => {
            let scoreEmp = calculateSimilarityJaccard(emp["Descrição Histórico Empenho"], lic["Objeto Licitação"]);
            if (scoreEmp > bestScore) {
                bestScore = scoreEmp;
                bestSrc = `Empenho Nº ${emp["Num Empenho"]}/${emp["Ano Emp."]}`;
            }
        });

        // Guardar resultado se a similaridade for maior que zero
        if (bestScore > 0) {
            resultados.push({
                edital: lic["Número do Edital"],
                modalidade: lic["Modalidade"],
                objeto: lic["Objeto Licitação"],
                score: bestScore,
                origem: bestSrc
            });
        }
    });

    // 5. Filtrar pelo slider e desenhar tabela
    let threshold = document.getElementById('slider-similaridade').value / 100;
    let resultadosFiltrados = resultados.filter(r => r.score >= threshold).sort((a, b) => b.score - a.score);

    tbodySim.innerHTML = "";
    if (resultadosFiltrados.length === 0) {
        tbodySim.innerHTML = `<tr><td colspan='5'>Nenhuma licitação com similaridade >= ${document.getElementById('slider-similaridade').value}%.</td></tr>`;
        return;
    }

    resultadosFiltrados.forEach(r => {
        let corBadge = r.score > 0.5 ? '#10b981' : (r.score > 0.3 ? '#f59e0b' : '#94a3b8');
        tbodySim.innerHTML += `
            <tr>
                <td>${r.edital}</td>
                <td>${r.modalidade}</td>
                <td style="max-width: 400px; font-size: 0.85rem;">${r.objeto}</td>
                <td style="font-size: 0.85rem; color: #475569;">${r.origem}</td>
                <td>
                    <span style="background: ${corBadge}; color: white; padding: 4px 10px; border-radius: 9999px; font-weight: bold; font-size: 0.8rem;">
                        ${(r.score * 100).toFixed(1)}%
                    </span>
                </td>
            </tr>
        `;
    });
}

// Evento para quando o usuário mexer no slider, recalcular
document.getElementById('slider-similaridade').addEventListener('change', function() {
    if (emendaSelecionada) {
        // Rebusca o objeto da API guardado na memória (se houver)
        verificarSimilaridade(emendaSelecionada, ultimoObjetoAPI);
    }
});

// Busca o Plano de Ação e Executor no Transferegov
async function buscarDadosPlanoAcao(codigo, cnpj) {
    const divObjeto = document.getElementById('texto-objeto');
    const divExtra = document.getElementById('detalhes-plano-extra');
    const divConta = document.getElementById('dados-conta');
    const badgeConta = document.getElementById('badge-conta');

    // Limpa campos
    divObjeto.innerText = "Buscando na API do Transferegov...";
    divExtra.innerHTML = "";
    divConta.innerHTML = "";

    const cnpjClean = String(cnpj).replace(/\D/g, '');

    // URL do Plano de Ação
    const urlPlano = `https://api.transferegov.gestao.gov.br/transferenciasespeciais/plano_acao_especial?cnpj_beneficiario_plano_acao=eq.${cnpjClean}&numero_emenda_parlamentar_plano_acao=eq.${codigo}`;
    const proxyPlano = 'http://localhost:8080/proxy?url=' + encodeURIComponent(urlPlano);

    try {
        const respPlano = await fetch(proxyPlano);
        const dataPlano = await respPlano.json();
        
        if (dataPlano && dataPlano.length > 0) {
            const plano = dataPlano[0];
            const idPlano = plano.id_plano_acao;
            
            // URL do Executor (usando o id_plano_acao obtido acima)
            const urlExec = `https://api.transferegov.gestao.gov.br/transferenciasespeciais/executor_especial?id_plano_acao=eq.${idPlano}`;
            const proxyExec = 'http://localhost:8080/proxy?url=' + encodeURIComponent(urlExec);
            
            const respExec = await fetch(proxyExec);
            const dataExec = await respExec.json();
            
            if (dataExec && dataExec.length > 0) {
                const exec = dataExec[0];
                
                // Preenche o card do Objeto
                divObjeto.innerText = exec.objeto_executor || "Objeto não informado na API.";
                divExtra.innerHTML = `
                    <strong>Área de Política Pública:</strong> ${plano.codigo_descricao_areas_politicas_publicas_plano_acao || 'N/A'}<br>
                    <strong>Programa Orçamentário:</strong> ${plano.descricao_programacao_orcamentaria_plano_acao || 'N/A'}<br>
                    <strong>Situação do Plano:</strong> ${plano.situacao_plano_acao || 'N/A'}
                `;

                // Preenche o card da Conta
                let especifica = exec.ind_recursos_gerenciados_conta_especifica_executor;
                if (especifica === "Sim") {
                    badgeConta.innerText = "CONTA ESPECÍFICA";
                    badgeConta.style.background = "#d1fae5";
                    badgeConta.style.color = "#065f46";
                } else if (especifica === "Não") {
                    badgeConta.innerText = "CONTA COMUM";
                    badgeConta.style.background = "#ffedd5";
                    badgeConta.style.color = "#9a3412";
                }

                divConta.innerHTML = `
                    <div style="margin-bottom: 8px;"><strong style="color:#94a3b8;">Banco:</strong> ${exec.codigo_banco_executor || ''} - ${exec.nome_banco_executor || 'N/A'}</div>
                    <div style="margin-bottom: 8px;"><strong style="color:#94a3b8;">Agência:</strong> ${exec.numero_agencia_executor || 'N/A'}-${exec.dv_agencia_executor || ''} (${exec.nome_agencia_executor || 'N/A'})</div>
                    <div style="font-size: 1.15rem; font-weight: 700; margin-top: 12px; font-family: monospace; color: #60a5fa;">C/C: ${exec.numero_conta_executor || 'N/A'}-${exec.dv_conta_executor || ''}</div>
                `;

                // Retorna o objeto para alimentar a Similaridade
                return exec.objeto_executor;
            } else {
                divObjeto.innerText = "Plano encontrado, mas sem dados de executor bancário.";
                return null;
            }
        } else {
            divObjeto.innerText = "Nenhum plano de ação encontrado para esta emenda na API online.";
            return null;
        }
    } catch (error) {
        console.error("Erro ao buscar Plano/Ação:", error);
        divObjeto.innerText = "Erro ao buscar objeto. Verifique o console.";
        return null;
    }
};

let ultimoObjetoAPI = null; // Variável temporária para guardar o objeto

// Inicializa a aplicação quando a página carrega
window.onload = carregarDados;

// --- FUNÇÕES DA ABA 2 E 3 ---

// Filtra a tabela de empenhos (Todos, Vinculados, Gerais)
function filtrarEmpenhos() {
    let tbodyObras = document.getElementById('tabela-obras-body');
    tbodyObras.innerHTML = "";
    
    let filtro = document.querySelector('input[name="filtro_emp"]:checked').value;
    let empenhosMuni = window.empenhosMuniAtual || [];
    
    let listaFiltrada = empenhosMuni.filter(e => {
        let texto = String(e["Descrição Histórico Empenho"] || "") + " " + String(e["Nr. Licitação / Contrato / Convênio"] || "");
        // Regex para achar código de emenda (12 dígitos começando com 202)
        let temCodigoEmenda = /\b(202\d{9})\b/.test(texto);
        
        if (filtro === "vinculados") return temCodigoEmenda;
        if (filtro === "gerais") return !temCodigoEmenda;
        return true; // "todos"
    });

    if (listaFiltrada.length === 0) {
        tbodyObras.innerHTML = `<tr><td colspan="9">Nenhum empenho para o filtro selecionado.</td></tr>`;
        return;
    }

    listaFiltrada.forEach(e => {
        // Separar Licitação e Contrato (ex: "TP18/2023 / 68/2023")
        let parts = String(e["Nr. Licitação / Contrato / Convênio"] || "").split('/');
        let licitacao = parts[0] ? parts[0].trim() : "Sem Info";
        let contrato = parts[1] ? parts[1].trim() : "Sem Info";
        
        let texto = String(e["Descrição Histórico Empenho"] || "") + " " + String(e["Nr. Licitação / Contrato / Convênio"] || "");
        let temCodigo = /\b(202\d{9})\b/.test(texto);

        tbodyObras.innerHTML += `
            <tr>
                <td>${e["Num Empenho"]}</td>
                <td>${e["Ano Emp."]}</td>
                <td>${e.data_empenho_fmt}</td>
                <td>${e["Nome Credor (RFB)"]}</td>
                <td>${licitacao} / ${contrato}</td>
                <td style="max-width: 250px; font-size: 0.8rem; color: #475569;">${e["Descrição Histórico Empenho"] || ""}</td>
                <td><strong>${formatCurrency(e["Valor Empenho"])}</strong></td>
                <td><strong style="color: #047857;">${formatCurrency(e["Valor Pagamento"])}</strong></td>
                <td>${temCodigo ? "🔗 Vinculado" : "Geral"}</td>
            </tr>
        `;
    });
}

// Desenha o gráfico de Top 5 Empresas
function desenharGraficoTopEmpresas(arrayEmpresas) {
    const divGrafico = document.getElementById('grafico-top5-empresas');
    if (!divGrafico) return;

    if (arrayEmpresas.length === 0) {
        divGrafico.innerHTML = "<p style='color: #64748b;'>Sem dados de pagamentos para gerar gráfico.</p>";
        return;
    }

    let trace = [{
        type: 'bar',
        x: arrayEmpresas.map(d => d.total),
        y: arrayEmpresas.map(d => d.razao.substring(0, 25) + "..."), // Limita tamanho do nome no gráfico
        orientation: 'h',
        marker: { color: '#2563eb' }
    }];

    let layout = {
        margin: { l: 150, r: 20, t: 10, b: 40 },
        height: 400,
        yaxis: { automargin: true, autorange: 'reversed' }, // Maior no topo
        xaxis: { title: 'Valor Pago (R$)' }
    };

    Plotly.newPlot('grafico-top5-empresas', trace, layout);
}

// --- FUNÇÃO DA ABA 4: HISTÓRICO E BUSCA TEXTUAL ---

// --- FUNÇÃO DA ABA 4: HISTÓRICO E BUSCA TEXTUAL ---

function filtrarHistorico() {
    const divCards = document.getElementById('cards-historico');
    if (!divCards) return;
    
    let termoBusca = document.getElementById('input-busca-historico').value.toLowerCase().trim();
    
    let empenhos = window.empenhosMuniHistorico || [];
    
    // Se não digitou nada, mostra os 15 primeiros empenhos
    let listaFiltrada = empenhos;
    if (termoBusca !== "") {
        listaFiltrada = empenhos.filter(e => {
            // Garantindo que os campos sejam string e protegendo contra nulos
            let hist = String(e["Descrição Histórico Empenho"] || "").toLowerCase();
            let credor = String(e["Nome Credor (RFB)"] || "").toLowerCase();
            return hist.includes(termoBusca) || credor.includes(termoBusca);
        });
    }

    // Limita a exibição em 15 cartões
    listaFiltrada = listaFiltrada.slice(0, 15);

    divCards.innerHTML = "";

    if (listaFiltrada.length === 0) {
        divCards.innerHTML = "<p style='color: #64748b; padding: 15px; background: white; border-radius: 8px;'>Nenhum registro encontrado com esta palavra-chave.</p>";
        return;
    }

    listaFiltrada.forEach(row => {
        // Garante que o texto e valores não quebrem a aplicação
        let texto = String(row["Descrição Histórico Empenho"] || "Sem descrição");
        let numEmpenho = row["Num Empenho"] || "N/A";
        let anoEmpenho = row["Ano Emp."] || "N/A";
        let dataEmpenho = row.data_empenho_fmt || "N/A";
        let credor = row["Nome Credor (RFB)"] || "Não identificado";
        
        // Pega o CNPJ independentemente de ter ou não a barra invertida no nome da chave
        let cnpj = row["CPF/CNPJ"] || row["CPF\\/CNPJ"] || "Sem CNPJ";
        
        let valorEmpenho = row["Valor Empenho"] || 0;
        let valorPagamento = row["Valor Pagamento"] || 0;

        // Regex para achar URLs
        let urlsEncontradas = texto.match(/https?:\/\/[^\s,;()]+/g) || [];
        
        // Criar a URL de busca do Google
        let query = `empenho ${numEmpenho} ${anoEmpenho} ${municipioSelecionadoNorm} Santa Catarina obras`;
        let googleUrl = "https://www.google.com/search?q=" + encodeURIComponent(query);
        
        divCards.innerHTML += `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; box-shadow: 0 2px 4px rgba(0,0,0,0.01);">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; margin-bottom: 10px; flex-wrap: wrap; gap: 10px;">
                    <span style="font-weight: 700; color: #1e3a8a;">Empenho Nº ${numEmpenho} / ${anoEmpenho} (${dataEmpenho})</span>
                    <span style="font-weight: 600; color: #475569; font-size: 0.9rem;">
                        Empenhado: <span style="color:#b45309;">${formatCurrency(valorEmpenho)}</span> | Pago: <span style="color:#047857;">${formatCurrency(valorPagamento)}</span>
                    </span>
                </div>
                <div style="margin-bottom: 10px; font-size: 0.95rem; color: #334155;">
                    <strong>Empresa:</strong> ${credor} (${cnpj})
                </div>
                <div style="margin-bottom: 12px; font-style: italic; color: #334155; line-height: 1.5; font-size: 0.95rem; background: white; padding: 10px; border-radius: 6px; border: 1px solid #f1f5f9;">
                    "${texto}"
                </div>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <a href="${googleUrl}" target="_blank" style="text-decoration: none;">
                        <button style="cursor:pointer; background-color:#2563eb; color:white; border:none; padding:8px 15px; border-radius:6px; font-weight:600; font-size:0.85rem;">🔍 Buscar no Google</button>
                    </a>
                    ${urlsEncontradas.map(url => `
                        <a href="${url}" target="_blank" style="text-decoration: none;">
                            <button style="cursor:pointer; background-color:#10b981; color:white; border:none; padding:8px 15px; border-radius:6px; font-weight:600; font-size:0.85rem;">🔗 Acessar Link Externo</button>
                        </a>
                    `).join('')}
                </div>
            </div>
        `;
    });
}

// --- FUNÇÃO DA ABA 3: CREDORES DO TCE ---

function processarCredoresTCE(empenhosMuni) {
    let tbodyCredores = document.getElementById('tabela-credores-tce-body');
    let divGraficoTCE = document.getElementById('grafico-top5-credores-tce');
    
    if (!tbodyCredores || !divGraficoTCE) return;

    tbodyCredores.innerHTML = "";
    divGraficoTCE.innerHTML = "";

    if (!empenhosMuni || empenhosMuni.length === 0) {
        tbodyCredores.innerHTML = `<tr><td colspan="5">Nenhuma empresa contratada encontrada na base do TCE.</td></tr>`;
        divGraficoTCE.innerHTML = "<p style='color: #64748b;'>Sem dados de empenhos para gerar gráfico.</p>";
        return;
    }

    // Agrupar empenhos por CNPJ/CPF
    let credoresAgrupados = {};
    empenhosMuni.forEach(emp => {
        let doc = String(emp["CPF/CNPJ"] || emp["CPF\\/CNPJ"] || "Sem CNPJ").trim();
        let nome = String(emp["Nome Credor (RFB)"] || "Não Identificado").trim();
        
        if (!credoresAgrupados[doc]) {
            credoresAgrupados[doc] = { 
                nome: nome, 
                total_empenhado: 0, 
                total_pago: 0, 
                qtd_empenhos: 0 
            };
        }
        
        // Somar valores protegendo contra nulos
        let valEmp = emp["Valor Empenho"] || 0;
        let valPag = emp["Valor Pagamento"] || 0;
        
        credoresAgrupados[doc].total_empenhado += valEmp;
        credoresAgrupados[doc].total_pago += valPag;
        credoresAgrupados[doc].qtd_empenhos += 1;
    });

    // Converter para array e ordenar pelo maior valor empenhado
    let arrayCredores = Object.keys(credoresAgrupados).map(doc => ({
        doc: doc,
        nome: credoresAgrupados[doc].nome,
        total_empenhado: credoresAgrupados[doc].total_empenhado,
        total_pago: credoresAgrupados[doc].total_pago,
        qtd_empenhos: credoresAgrupados[doc].qtd_empenhos
    })).sort((a, b) => b.total_empenhado - a.total_empenhado);

    // Preencher a Tabela
    arrayCredores.forEach(cred => {
        tbodyCredores.innerHTML += `
            <tr>
                <td>${cred.doc}</td>
                <td>${cred.nome}</td>
                <td>${cred.qtd_empenhos}</td>
                <td><strong style="color:#b45309;">${formatCurrency(cred.total_empenhado)}</strong></td>
                <td><strong style="color:#047857;">${formatCurrency(cred.total_pago)}</strong></td>
            </tr>
        `;
    });

    // Desenhar Gráfico Top 5 Credores TCE
    let top5Credores = arrayCredores.slice(0, 5);

    let trace = [{
        type: 'bar',
        x: top5Credores.map(d => d.total_empenhado),
        y: top5Credores.map(d => d.nome.substring(0, 25) + "..."), // Limita tamanho do nome
        orientation: 'h',
        marker: { color: '#f59e0b' } // Cor laranja/amarelo para diferenciar do gráfico de pagamentos
    }];

    let layout = {
        margin: { l: 150, r: 20, t: 10, b: 40 },
        height: 400,
        yaxis: { automargin: true, autorange: 'reversed' },
        xaxis: { title: 'Total Empenhado (R$)' }
    };

    Plotly.newPlot('grafico-top5-credores-tce', trace, layout);
}

// --- POPULAR FILTROS DINÂMICOS ---

function popularFiltroAnos() {
    const select = document.getElementById('select-ano');
    let anos = new Set();
    
    dadosEmendas.forEach(e => {
        let ano = String(e.codigo_emenda_num).substring(0, 4);
        if(ano !== "NaN") anos.add(ano);
    });

    dadosEmpenhos.forEach(e => {
        if(e["Ano Emp."]) anos.add(String(e["Ano Emp."]));
    });

    let anosOrdenados = Array.from(anos).sort((a, b) => b - a); // Decrescente
    
    // Não adicionamos a opção "Todos" aqui, pois num select multiple,
    // se nada for selecionado, significa que o filtro é "Todos"
    anosOrdenados.forEach(ano => {
        let option = document.createElement('option');
        option.value = ano;
        option.textContent = ano;
        select.appendChild(option);
    });
}

function popularFiltroAutores() {
    const select = document.getElementById('select-autor');
    let autores = new Set();
    
    dadosEmendas.forEach(e => {
        if (e.autor) autores.add(e.autor);
    });

    let arrayAutores = Array.from(autores).sort();
    arrayAutores.forEach(autor => {
        let option = document.createElement('option');
        option.value = autor;
        option.textContent = autor.split(' - ')[1] || autor; // Mostra só o nome
        select.appendChild(option);
    });
}

function popularFiltroEmpresas() {
    const select = document.getElementById('select-empresa');
    let empresas = new Set();
    
    // Pega empresas dos empenhos
    dadosEmpenhos.forEach(e => {
        let nome = e["Nome Credor (RFB)"];
        if (nome && nome !== "Não Identificado") empresas.add(nome);
    });

    // Pega empresas dos pagamentos
    dadosPagamentos.forEach(p => {
        let nome = p["Razão Social"];
        if (nome) empresas.add(nome);
    });

    let arrayEmpresas = Array.from(empresas).sort((a, b) => a.localeCompare(b));
    arrayEmpresas.forEach(emp => {
        let option = document.createElement('option');
        option.value = emp;
        option.textContent = emp.length > 30 ? emp.substring(0, 30) + "..." : emp;
        select.appendChild(option);
    });
}


// --- FUNÇÃO MESTRE DE APLICAÇÃO DE FILTROS ---

function aplicarFiltros() {
    let muniNorm = document.getElementById('select-municipio').value;
    
    // Pega os anos selecionados no formato de Array.
    let selectAno = document.getElementById('select-ano');
    let anosSelecionados = Array.from(selectAno.selectedOptions).map(opt => opt.value);
    let temFiltroAno = anosSelecionados.length > 0;
    
    let autor = document.getElementById('select-autor').value;
    let empresa = document.getElementById('select-empresa').value;

    // 1. Filtrar Emendas (Aplicando todos os filtros cumulativos)
    let emendasFiltradas = dadosEmendas.filter(e => {
        let matchMuni = !muniNorm || e.municipio_norm === muniNorm;
        let anoEmenda = String(e.codigo_emenda_num).substring(0, 4);
        let matchAno = !temFiltroAno || anosSelecionados.includes(anoEmenda);
        let matchAutor = !autor || e.autor === autor;
        return matchMuni && matchAno && matchAutor;
    });

    // 2. Filtrar Empenhos
    let empenhosFiltrados = dadosEmpenhos.filter(e => {
        let matchMuni = !muniNorm || e.municipio_norm === muniNorm;
        let matchAno = !temFiltroAno || anosSelecionados.includes(String(e["Ano Emp."]));
        let matchEmpresa = !empresa || e["Nome Credor (RFB)"] === empresa;
        return matchMuni && matchAno && matchEmpresa;
    });

    // 3. Filtrar Pagamentos
    let pagamentosFiltrados = dadosPagamentos.filter(p => {
        let matchMuni = !muniNorm || p.municipio_norm === muniNorm;
        let anoPagamento = String(p["Código da Emenda"]).substring(0, 4);
        let matchAno = !temFiltroAno || anosSelecionados.includes(anoPagamento);
        let matchEmpresa = !empresa || p["Razão Social"] === empresa;
        return matchMuni && matchAno && matchEmpresa;
    });

    // 4. Atualizar Métricas Globais (Sidebar)
    let totalEmendas = emendasFiltradas.reduce((sum, e) => sum + e.valor_emenda, 0);
    let totalPago = empenhosFiltrados.reduce((sum, e) => sum + (e["Valor Pagamento"] || 0), 0);
    let execGeral = totalEmendas > 0 ? (totalPago / totalEmendas * 100).toFixed(1) : 0;

    document.getElementById('metricas-globais').innerHTML = `
        <h3>Resumo Filtrado</h3>
        <p><strong>Total Emendas:</strong> ${formatCurrency(totalEmendas)}</p>
        <p><strong>Total Pago (TCE):</strong> ${formatCurrency(totalPago)}</p>
        <p><strong>Taxa Execução:</strong> ${execGeral}%</p>
    `;

    // 5. Atualizar Mapa e Tabelas
    if (!muniNorm) {
        // Mostra o container inteiro (mapa + legenda)
        document.getElementById('container-mapa-legenda').style.display = 'block';
        document.getElementById('detalhes-municipio').style.display = 'none';
        
        // LÓGICA DE FILTROS CUMULATIVOS NO MAPA
        if (autor || empresa) {
            renderizarMapaFiltradoEspecial(emendasFiltradas, empenhosFiltrados, autor, empresa);
        } else {
            renderizarMapaFiltrado(emendasFiltradas, empenhosFiltrados);
        }
    } else {
        // Esconde o container inteiro (mapa + legenda)
        document.getElementById('container-mapa-legenda').style.display = 'none';
        mostrarDetalhesMunicipioFiltrado(muniNorm, emendasFiltradas, empenhosFiltrados, pagamentosFiltrados);
    }
}

// Renderiza o mapa com as bolhas coloridas conforme o filtro
function renderizarMapaFiltrado(emendasFiltradas, empenhosFiltrados) {
    let dadosMapa = dadosMunicipios.map(muni => {
        let emendasDoMuni = emendasFiltradas.filter(e => e.municipio_norm === muni.nome_normalizado);
        let empenhosDoMuni = empenhosFiltrados.filter(e => e.municipio_norm === muni.nome_normalizado);
        
        let totalEmendas = emendasDoMuni.reduce((sum, e) => sum + e.valor_emenda, 0);
        let totalPago = empenhosDoMuni.reduce((sum, e) => sum + (e["Valor Pagamento"] || 0), 0);
        let exec = totalEmendas > 0 ? Math.min(100, (totalPago / totalEmendas * 100)) : 0;
        
        return {
            lat: muni.latitude,
            lon: muni.longitude,
            nome: muni.nome,
            total: totalEmendas,
            qtd: emendasDoMuni.length,
            exec: exec
        };
    });

    let trace = [{
        type: 'scattermapbox',
        mode: 'markers',
        lat: dadosMapa.map(d => d.lat),
        lon: dadosMapa.map(d => d.lon),
        text: dadosMapa.map(d => `<b>${d.nome}</b><br>Recebido: ${formatCurrency(d.total)}<br>Qtd Emendas: ${d.qtd}<br>Execução: ${d.exec.toFixed(1)}%`),
        hoverinfo: 'text',
        marker: {
            size: dadosMapa.map(d => d.total > 0 ? Math.max(10, d.total / 500000) : 8),
            color: dadosMapa.map(d => d.exec), // Cor baseada na execução!
            colorscale: 'Viridis',
            showscale: true, // HABILITA A BARRA DE CORES
            cmin: 0,
            cmax: 100,
            opacity: 0.85,
            colorbar: {
                title: 'Execução (%)',
                thickness: 10,
                len: 0.6,
                x: 0.02,
                xanchor: 'left'
            }
        }
    }];

    let layout = {
        mapbox: { style: 'open-street-map', center: {lat: -27.25, lon: -50.25}, zoom: 6.2 },
        margin: { t: 0, b: 0, l: 0, r: 0 }
    };

    Plotly.newPlot('mapa-sc', trace, layout);

    // Reaplica evento de clique
    document.getElementById('mapa-sc').on('plotly_click', function(data) {
        let pointIndex = data.points[0].pointNumber;
        let muniNorm = dadosMunicipios[pointIndex].nome_normalizado;
        document.getElementById('select-municipio').value = muniNorm;
        aplicarFiltros(); // Chama a função mestre para carregar dados do município clicado
    });
}

// --- RENDERIZAR MAPA ESPECÍFICO PARA EMPRESA SELECIONADA (BASE TCE) ---

function renderizarMapaEmpresa(empenhosFiltrados, nomeEmpresa) {
    // Agrupa os pagamentos (do TCE) por município
    let pagamentosPorMuni = {};
    empenhosFiltrados.forEach(emp => {
        let muniNorm = emp.municipio_norm;
        let valorPag = emp["Valor Pagamento"] || 0;
        
        if (!pagamentosPorMuni[muniNorm]) {
            pagamentosPorMuni[muniNorm] = 0;
        }
        pagamentosPorMuni[muniNorm] += valorPag;
    });

    // Filtra apenas municípios que efetivamente pagaram algo para a empresa selecionada
    let dadosMapa = dadosMunicipios.filter(muni => pagamentosPorMuni[muni.nome_normalizado] > 0)
    .map(muni => {
        let totalPago = pagamentosPorMuni[muni.nome_normalizado];
        return {
            lat: muni.latitude,
            lon: muni.longitude,
            nome: muni.nome,
            total: totalPago
        };
    });

    let trace = [{
        type: 'scattermapbox',
        mode: 'markers',
        lat: dadosMapa.map(d => d.lat),
        lon: dadosMapa.map(d => d.lon),
        text: dadosMapa.map(d => `<b>${d.nome}</b><br>Empresa: ${nomeEmpresa.substring(0,30)}...<br>Total Pago (TCE): ${formatCurrency(d.total)}`),
        hoverinfo: 'text',
        marker: {
            // Tamanho base fixo para todas as bolhas, ajustado proporcionalmente ao valor
            size: dadosMapa.map(d => d.total), 
            sizemode: 'area', // Calcula área, não diâmetro
            sizeref: 2000000, // Fator de compressão: a cada 2 milhões, a bolha cresce 1 unidade de área
            sizemin: 8,       // Tamanho mínimo visível
            cmin: 0,
            cmax: 100,
            color: '#dc2626',
            opacity: 0.75
        }
    }];

    let layout = {
        mapbox: { style: 'open-street-map', center: {lat: -27.25, lon: -50.25}, zoom: 6.2 },
        margin: { t: 0, b: 0, l: 0, r: 0 },
        // Adiciona um texto no canto inferior do mapa
        annotations: [{
            text: '🔴 Bolhas Vermelhas: Tamanho = Total Pago à Empresa (Base TCE-SC)',
            showarrow: false,
            x: 0.5,
            y: -0.05,
            yref: 'paper',
            font: { size: 12, color: '#dc2626' }
        }]
    };

    Plotly.newPlot('mapa-sc', trace, layout);

    // Reaplica evento de clique no mapa
    document.getElementById('mapa-sc').on('plotly_click', function(data) {
        let pointIndex = data.points[0].pointNumber;
        let muniClicado = dadosMapa[pointIndex];
        
        // Encontra o nome normalizado do município clicado
        let muniData = dadosMunicipios.find(m => m.nome === muniClicado.nome);
        if (muniData) {
            let muniNorm = muniData.nome_normalizado;
            document.getElementById('select-municipio').value = muniNorm;
            aplicarFiltros(); // Chama a função mestre passando os filtros (Empresa, Ano, etc.)
        }
    });
}

// --- RENDERIZAR MAPA FILTRADO POR AUTOR OU EMPRESA ---

function renderizarMapaFiltradoEspecial(emendasFiltradas, empenhosFiltrados, nomeAutor, nomeEmpresa) {
    // Agrupa os valores por município
    let dadosPorMuni = {};
    
    // Soma as emendas (para definir o tamanho da bolha)
    emendasFiltradas.forEach(e => {
        if (!dadosPorMuni[e.municipio_norm]) dadosPorMuni[e.municipio_norm] = { emendas: 0, pago: 0 };
        dadosPorMuni[e.municipio_norm].emendas += e.valor_emenda;
    });

    // Soma os pagamentos do TCE (para calcular a cor da bolha = execução)
    empenhosFiltrados.forEach(e => {
        if (!dadosPorMuni[e.municipio_norm]) dadosPorMuni[e.municipio_norm] = { emendas: 0, pago: 0 };
        dadosPorMuni[e.municipio_norm].pago += (e["Valor Pagamento"] || 0);
    });

    // Filtra apenas municípios que apareceram nos filtros acima
    let dadosMapa = dadosMunicipios.filter(muni => dadosPorMuni[muni.nome_normalizado])
    .map(muni => {
        let dados = dadosPorMuni[muni.nome_normalizado];
        let exec = dados.emendas > 0 ? Math.min(100, (dados.pago / dados.emendas * 100)) : 0;
        
        // Define a cor: Vermelho se for filtro de empresa, Viridis se for filtro de Autor
        let cor;
        if (nomeEmpresa) {
            cor = '#dc2626'; // Vermelho
        } else {
            cor = exec; // Gradiente do Plotly
        }

        return {
            lat: muni.latitude,
            lon: muni.longitude,
            nome: muni.nome,
            total: dados.emendas > 0 ? dados.emendas : dados.pago, // Usa emendas ou pago se a empresa não tiver emenda vinculada
            pago: dados.pago,
            exec: exec,
            cor: cor
        };
    });

    let trace = [{
        type: 'scattermapbox',
        mode: 'markers',
        lat: dadosMapa.map(d => d.lat),
        lon: dadosMapa.map(d => d.lon),
        text: dadosMapa.map(d => {
            let label = `<b>${d.nome}</b>`;
            if (nomeAutor) label += `<br>Autor: ${nomeAutor.split(' - ')[1] || nomeAutor}`;
            if (nomeEmpresa) label += `<br>Empresa: ${nomeEmpresa.substring(0,30)}...`;
            label += `<br>Total emendas: ${formatCurrency(d.total)}<br>Pago (TCE): ${formatCurrency(d.pago)}<br>Execução: ${d.exec.toFixed(1)}%`;
            return label;
        }),
        hoverinfo: 'text',
        marker: {
            size: dadosMapa.map(d => Math.max(12, d.total / 500000)),
            color: dadosMapa.map(d => d.cor),
            colorscale: 'Viridis',
            showscale: !nomeEmpresa, // Só mostra a barra de cores se não for filtro de empresa
            cmin: 0,
            cmax: 100,
            opacity: 0.85
        }
    }];

    let layout = {
        mapbox: { style: 'open-street-map', center: {lat: -27.25, lon: -50.25}, zoom: 6.2 },
        margin: { t: 0, b: 0, l: 0, r: 0 }
    };

    Plotly.newPlot('mapa-sc', trace, layout);

    // Reaplica evento de clique
    document.getElementById('mapa-sc').on('plotly_click', function(data) {
        let pointIndex = data.points[0].pointNumber;
        let muniClicado = dadosMapa[pointIndex];
        
        let muniData = dadosMunicipios.find(m => m.nome === muniClicado.nome);
        if (muniData) {
            let muniNorm = muniData.nome_normalizado;
            document.getElementById('select-municipio').value = muniNorm;
            aplicarFiltros();
        }
    });
}