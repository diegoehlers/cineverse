// 1. Credenciais do Supabase
const SUPABASE_URL = 'https://colfrwkghcxvvqhxhoya.supabase.co';
const SUPABASE_KEY = 'sb_publishable_JRcKm_YfflN-9JtHut5EVA_Y9-O0z23';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Elementos do DOM
const form = document.getElementById('movie-form');
const listaFilmes = document.getElementById('lista-filmes');
const stremioInput = document.getElementById('stremio-search');
const stremioResultados = document.getElementById('stremio-resultados');
const btnAleatorio = document.getElementById('btn-aleatorio');
const btnCarregarMais = document.getElementById('btn-carregar-mais');
const filtrosGeneros = document.getElementById('filtros-generos');

// Variáveis de Estado da Vitrine
let filmesCache = [];
let timeoutBusca;
let estadoVitrine = { tipo: 'movie', genero: 'top', skip: 0, carregando: false, buscando: false };

// --- LÓGICA DO BANCO DE DADOS (SUPABASE) ---
async function carregarFilmes() {
    const { data, error } = await supabaseClient.from('filmes').select('*').order('criado_em', { ascending: false });
    if (error) { console.error(error); return; }

    filmesCache = data;
    listaFilmes.innerHTML = '';
    
    data.forEach(filme => {
        const capa = filme.capa_url ? filme.capa_url : 'https://via.placeholder.com/300x450/1f1f1f/ffffff?text=Sem+Capa';
        const estrela = filme.favorito ? '⭐' : '☆';
        const nota = filme.nota > 0 ? `<span class="nota-badge">★ ${filme.nota}/10</span>` : '';
        const comentario = filme.comentario ? `<p style="font-style: italic; font-size: 0.8em;">"${filme.comentario}"</p>` : '';

        const card = document.createElement('div');
        card.className = 'card-filme';
        card.innerHTML = `
            <button class="btn-favorito" onclick="toggleFavorito(${filme.id}, ${filme.favorito})">${estrela}</button>
            <img src="${capa}" alt="Capa de ${filme.titulo}">
            <div class="card-info">
                <div>
                    <h3>${filme.titulo}</h3>
                    <p>${filme.genero} • ${filme.ano} • ${filme.tipo}</p>
                    ${comentario}
                </div>
                <div>
                    ${nota}
                    <span class="badge">${filme.status}</span>
                    <button class="btn-excluir" onclick="excluirFilme(${filme.id})">Excluir</button>
                </div>
            </div>
        `;
        listaFilmes.appendChild(card);
    });
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titulo = document.getElementById('titulo').value;
    const genero = document.getElementById('genero').value;
    const ano = parseInt(document.getElementById('ano').value);
    const tipo = document.getElementById('tipo').value;
    const status = document.getElementById('status').value;
    const nota = parseInt(document.getElementById('nota').value) || 0;
    const comentario = document.getElementById('comentario').value;
    const capa_url = document.getElementById('capa_url').value;

    const { error } = await supabaseClient.from('filmes').insert([{ titulo, genero, ano, tipo, status, nota, comentario, capa_url }]);
    
    if (error) {
        alert('Erro ao adicionar: ' + error.message);
    } else {
        form.reset();
        document.getElementById('capa_url').value = '';
        carregarFilmes();
        document.getElementById('catalogo').scrollIntoView({ behavior: 'smooth' });
    }
});

async function excluirFilme(id) {
    if (!confirm('Tem certeza que deseja excluir este título?')) return;
    await supabaseClient.from('filmes').delete().eq('id', id);
    carregarFilmes();
}

async function toggleFavorito(id, statusAtual) {
    await supabaseClient.from('filmes').update({ favorito: !statusAtual }).eq('id', id);
    carregarFilmes();
}

btnAleatorio.addEventListener('click', () => {
    const paraAssistir = filmesCache.filter(f => f.status === 'Quero assistir');
    if (paraAssistir.length === 0) {
        alert('Você não tem nenhum título na lista "Quero assistir"!');
        return;
    }
    const sorteado = paraAssistir[Math.floor(Math.random() * paraAssistir.length)];
    alert(`🎬 O escolhido da vez foi:\n\n${sorteado.titulo} (${sorteado.ano})\nGênero: ${sorteado.genero}`);
});


// --- LÓGICA DA VITRINE (STREMIO/CINEMETA) ---

function renderizarCards(lista, append = false) {
    if (!append) stremioResultados.innerHTML = '';
    
    if (lista.length === 0 && !append) {
        stremioResultados.innerHTML = '<p style="color:#e50914">Nenhum resultado encontrado.</p>';
        return;
    }

    lista.forEach(item => {
        const tipoExibicao = item.type === 'movie' ? 'Filme' : 'Série';
        const div = document.createElement('div');
        div.className = 'stremio-item';
        div.innerHTML = `
            <img src="${item.poster}" alt="${item.name}" loading="lazy">
            <h3>${item.name}</h3>
            <p>${item.releaseInfo || 'N/A'} • ${tipoExibicao}</p>
        `;
        div.onclick = () => selecionarItemStremio(item);
        stremioResultados.appendChild(div);
    });
}

async function buscarCinemeta(append = false) {
    if (estadoVitrine.carregando) return;
    estadoVitrine.carregando = true;
    btnCarregarMais.disabled = true;
    btnCarregarMais.innerText = 'Carregando...';

    if (!append) {
        stremioResultados.innerHTML = '<p style="color:white">Carregando catálogo...</p>';
        estadoVitrine.skip = 0;
    }

    const { tipo, genero, skip } = estadoVitrine;
    let url = `https://v3-cinemeta.strem.io/catalog/${tipo}/${genero}/skip=${skip}.json`;
    
    try {
        const resposta = await fetch(url);
        const dados = await resposta.json();
        
        let itens = dados.metas || [];
        itens = itens.filter(item => item.poster);

        if (itens.length === 0 && !append) {
            stremioResultados.innerHTML = '<p style="color:#e50914">Fim do catálogo ou nenhum item encontrado.</p>';
        } else {
            renderizarCards(itens, append);
            if (itens.length < 50) {
                btnCarregarMais.style.display = 'none';
            } else {
                btnCarregarMais.style.display = 'inline-block';
            }
        }
    } catch (erro) {
        console.error(erro);
        if (!append) stremioResultados.innerHTML = '<p style="color:#e50914">Erro ao carregar a vitrine.</p>';
    } finally {
        estadoVitrine.carregando = false;
        btnCarregarMais.disabled = false;
        btnCarregarMais.innerText = 'Carregar Mais';
    }
}

window.carregarPorGenero = function(tipo, genero, botaoClicado) {
    document.querySelectorAll('.btn-filtro').forEach(btn => btn.classList.remove('ativo'));
    botaoClicado.classList.add('ativo');

    stremioInput.value = '';
    estadoVitrine.buscando = false;

    estadoVitrine.tipo = tipo;
    estadoVitrine.genero = genero;
    estadoVitrine.skip = 0;
    
    filtrosGeneros.style.display = 'flex';
    btnCarregarMais.style.display = 'inline-block';
    
    buscarCinemeta(false);
};

window.carregarMais = function() {
    estadoVitrine.skip += 100;
    buscarCinemeta(true);
};

stremioInput.addEventListener('input', (e) => {
    clearTimeout(timeoutBusca);
    const query = e.target.value.trim();
    
    if (query.length === 0) {
        estadoVitrine.buscando = false;
        filtrosGeneros.style.display = 'flex';
        const botaoAtivo = document.querySelector('.btn-filtro.ativo') || document.querySelector('.btn-filtro');
        carregarPorGenero(estadoVitrine.tipo, estadoVitrine.genero, botaoAtivo);
        return;
    }
    
    if (query.length < 3) return;
    
    estadoVitrine.buscando = true;
    filtrosGeneros.style.display = 'none';
    btnCarregarMais.style.display = 'none';
    
    timeoutBusca = setTimeout(() => buscarPorTexto(query), 600);
});

async function buscarPorTexto(query) {
    stremioResultados.innerHTML = '<p style="color:white">Buscando...</p>';
    const queryEncoded = encodeURIComponent(query);
    
    const urlFilmes = `https://v3-cinemeta.strem.io/catalog/movie/top/search=${queryEncoded}.json`;
    const urlSeries = `https://v3-cinemeta.strem.io/catalog/series/top/search=${queryEncoded}.json`;

    try {
        const [resFilmes, resSeries] = await Promise.all([fetch(urlFilmes), fetch(urlSeries)]);
        const dadosFilmes = await resFilmes.json();
        const dadosSeries = await resSeries.json();

        const resultados = [...(dadosFilmes.metas || []), ...(dadosSeries.metas || [])];
        const comCapa = resultados.filter(r => r.poster).slice(0, 40);

        renderizarCards(comCapa, false);
    } catch (erro) {
        console.error(erro);
        stremioResultados.innerHTML = '<p style="color:#e50914">Erro na busca.</p>';
    }
}

async function selecionarItemStremio(item) {
    const urlMeta = `https://v3-cinemeta.strem.io/meta/${item.type}/${item.id}.json`;
    
    const textoOriginal = stremioResultados.innerHTML;
    stremioResultados.innerHTML = '<p style="color:white">Buscando detalhes...</p>';

    try {
        const resposta = await fetch(urlMeta);
        const dados = await resposta.json();
        const meta = dados.meta;

        document.getElementById('titulo').value = meta.name || item.name;
        document.getElementById('ano').value = meta.releaseInfo ? meta.releaseInfo.substring(0, 4) : '';
        document.getElementById('tipo').value = item.type === 'movie' ? 'Filme' : 'Série';
        document.getElementById('capa_url').value = meta.poster || item.poster;
        document.getElementById('genero').value = meta.genres ? meta.genres.join(', ') : '';
        
        stremioResultados.innerHTML = textoOriginal;
        
        document.getElementById('titulo').scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementById('status').focus();
    } catch (erro) {
        console.error(erro);
        alert('Erro ao buscar detalhes. Preencha manualmente.');
        stremioResultados.innerHTML = textoOriginal;
    }
}

// --- INICIALIZAÇÃO ---
carregarFilmes();
buscarCinemeta(false);
