async function buscarDadosTransferegov(codigoEmenda, cnpjMuni) {
    const url = `https://api.transferegov.gestao.gov.br/transferenciasespeciais/plano_acao_especial?cnpj_beneficiario_plano_acao=eq.${cnpjMuni}&numero_emenda_parlamentar_plano_acao=eq.${codigoEmenda}`;
    
    try {
        // OBS: Adiciona um prefixo de proxy se der erro de CORS
        const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(url);
        
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error("Erro na API");
        
        const data = await response.json();
        if (data && data.length > 0) {
            // Processa os dados igual ao Python
            return data[0];
        }
        return null;
    } catch (error) {
        console.error("Falha ao buscar Transferegov:", error);
        return null;
    }
}
