// js/similaridade.js

// Dicionário de stopwords e localizações (mesmo do seu Python)
const STOPWORDS = new Set(["de", "da", "do", "para", "com", "em", "a", "o", "e", "os", "as", "um", "uma", "no", "na", "nos", "nas"]);
const LOCATION_PREFIXES = new Set(["rua", "avenida", "rodovia", "estrada", "bairro", "linha", "travessa", "beco", "sc", "br", "av", "tv", "loteamento", "praca", "praça", "distrito"]);

// Limpa o texto para comparação
function cleanTextForSimilarity(text) {
    if (!text) return "";
    let textClean = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    textClean = textClean.replace(/[^a-z0-9\s]/g, " ");
    return textClean.replace(/\s+/g, ' ').trim();
}

// Extrai os pesos das palavras
function getWordWeights(text) {
    let words = cleanTextForSimilarity(text).split(' ');
    let weights = {};
    
    words.forEach((w, i) => {
        if (LOCATION_PREFIXES.has(w)) {
            weights[w] = Math.max(weights[w] || 0, 1.5);
            for(let j = i + 1; j < Math.min(i + 4, words.length); j++) {
                if(!STOPWORDS.has(words[j]) && !LOCATION_PREFIXES.has(words[j])) {
                    weights[words[j]] = Math.max(weights[words[j]] || 0, 4.0);
                }
            }
        } else if (STOPWORDS.has(w)) {
            weights[w] = Math.max(weights[w] || 0, 0.1);
        } else {
            weights[w] = Math.max(weights[w] || 0, 1.0);
        }
    });
    return weights;
}

// Calcula Similaridade de Jaccard Ponderada
function calculateSimilarityJaccard(text1, text2) {
    let w1 = getWordWeights(text1);
    let w2 = getWordWeights(text2);
    let allWords = new Set([...Object.keys(w1), ...Object.keys(w2)]);
    
    if (allWords.size === 0) return 0.0;
    
    let num = 0.0;
    let den = 0.0;
    
    allWords.forEach(w => {
        let weight1 = w1[w] || 0.0;
        let weight2 = w2[w] || 0.0;
        num += Math.min(weight1, weight2);
        den += Math.max(weight1, weight2);
    });
    
    return den > 0 ? num / den : 0.0;
}