// Gerador de imagens: descreve a imagem, escolhe o estilo, o formato e o modelo, e gera. Cada resultado pode
// ir para o projeto (um .png na pasta que tu escolher) ou para o time, como anexo na caixa da Orquestra.
// Usa os provedores por API de Contas e modelos (o Claude Code e o Codex não geram imagens).

const ESTILOS_IMAGEM = [
  ['', 'Livre'],
  ['foto realista', 'Foto'],
  ['ilustração digital', 'Ilustração'],
  ['ícone simples, traço limpo, fundo liso', 'Ícone'],
  ['logotipo minimalista, vetorial', 'Logo'],
  ['render 3D suave', '3D'],
  ['aquarela', 'Aquarela'],
  ['pixel art', 'Pixel art'],
];
const FORMATOS_IMAGEM = [['1024x1024', 'Quadrado', 'square'], ['1536x1024', 'Paisagem', 'rectangle-horizontal'], ['1024x1536', 'Retrato', 'rectangle-vertical']];
const IMG = { modelos: null, gerando: false, galeria: [], erro: '' };

function abrirGeradorDeImagens() {
  abrirAba({ id: 'imagens', tipo: 'imagens', titulo: 'Gerar imagem', rascunho: { prompt: '', estilo: '', formato: '1024x1024', quantidade: 1, motor: '' } });
}

async function carregarModelosDeImagem(aba) {
  try {
    IMG.modelos = await chamar('imagens:modelos');
  } catch {
    IMG.modelos = [];
  }
  if (S.ativa === aba.id) redesenharPagina(aba);
}

const slugDaImagem = (texto) => [...String(texto).normalize('NFD')].filter((c) => c.charCodeAt(0) < 0x300 || c.charCodeAt(0) > 0x36f).join('')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 6).join('-') || 'imagem';

/** Onde a imagem vai, por padrão: a pasta de arquivos públicos do projeto, se ele tiver uma. */
function pastaPadraoDeImagens() {
  const raiz = (S.arvore?.filhos?.get('') || []).map((x) => x.nome || x.name || x);
  if (raiz.includes('public')) return 'public/imagens';
  if (raiz.includes('assets')) return 'assets/imagens';
  if (raiz.includes('src')) return 'src/assets/imagens';
  return 'imagens';
}

async function gerarImagens(aba) {
  const r = aba.rascunho;
  if (!r.prompt.trim()) { aviso('Descreva a imagem que tu quer.', 'info'); return aba.campoPrompt?.focus(); }
  const [provedor, ...resto] = r.motor.split('|');
  const modelo = resto.join('|');
  if (!provedor || !modelo) return aviso('Escolha o modelo de imagem.', 'info');
  const estilo = r.estilo ? `\n\nEstilo: ${r.estilo}.` : '';
  IMG.gerando = true;
  IMG.erro = '';
  redesenharPagina(aba);
  const pedido = { provedor, modelo, prompt: `${r.prompt.trim()}${estilo}`, tamanho: r.formato, quantidade: r.quantidade };
  try {
    const saida = await chamar('imagens:gerar', pedido);
    const quando = Date.now();
    IMG.galeria.unshift(...saida.map((s, i) => ({ id: `${quando}-${i}`, url: `data:${s.mime};base64,${s.base64}`, base64: s.base64, mime: s.mime, prompt: r.prompt.trim(), estilo: r.estilo, formato: r.formato, modelo, provedor, salvo: null })));
  } catch (e) {
    const msg = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
    IMG.erro = /abort/i.test(msg) ? '' : msg;
  }
  IMG.gerando = false;
  if (S.ativa === aba.id) redesenharPagina(aba);
}

function salvarImagemNoProjeto(img, aba) {
  if (!S.projeto) return aviso('Abra um projeto para salvar a imagem nele.', 'info');
  pedirTexto({
    placeholder: 'Onde salvar, dentro do projeto (ex.: public/imagens/banner.png)',
    valor: `${pastaPadraoDeImagens()}/${slugDaImagem(img.prompt)}.png`,
    aoConfirmar: async (v) => {
      try {
        img.salvo = await api('imagens:salvar', S.projeto.caminho, String(v).trim(), img.base64);
        aviso(`Imagem salva em ${img.salvo}.`, 'ok');
        if (S.ativa === aba.id) redesenharPagina(aba);
      } catch {}
    },
  });
}

/** A imagem vai como anexo para a caixa da Orquestra, pronta para um pedido ao time. */
function mandarImagemParaOTime(img) {
  const lista = ANEXOS.get('pedido') || [];
  if (lista.length >= 8) return aviso('No máximo 8 imagens por mensagem.', 'info');
  lista.push({ nome: `${slugDaImagem(img.prompt)}.png`, tipo: img.mime || 'image/png', url: img.url });
  ANEXOS.set('pedido', lista);
  abrirDireita('orquestra');
  requestAnimationFrame(() => { desenharAnexos('pedido'); document.querySelector('.chat-compositor textarea')?.focus(); });
  aviso('Imagem anexada na Orquestra. Escreva o pedido e mande.', 'ok');
}

async function copiarImagem(img) {
  try {
    const blob = await (await fetch(img.url)).blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    aviso('Imagem copiada.', 'ok');
  } catch {
    aviso('Não deu para copiar a imagem.');
  }
}

PAGINAS.imagens = {
  icone: () => ic('file-media'),
  desenhar(aba, host) {
    if (!IMG.modelos) carregarModelosDeImagem(aba);
    const r = aba.rascunho;
    const opcoesMotor = (IMG.modelos || []).flatMap((p) => p.modelos.map((m) => [`${p.id}|${m}`, `${p.nome} · ${m}`]));
    if (!r.motor && opcoesMotor.length) r.motor = opcoesMotor[0][0];

    const campo = h('textarea', { rows: 5, valor: r.prompt, placeholder: 'Descreva a imagem. Ex.: banner de uma loja de café, xícara em primeiro plano, luz da manhã, tons quentes' });
    campo.addEventListener('input', () => { r.prompt = campo.value; });
    campo.addEventListener('keydown', (e) => teclaDeChat(e, () => gerarImagens(aba)));
    aba.campoPrompt = campo;
    const chips = (lista, atual, aoEscolher) => h('div', { class: 'img-chips' }, lista.map(([v, rotulo, icone]) => h('button', {
      type: 'button', class: `img-chip${atual === v ? ' ligado' : ''}`, onclick: () => { aoEscolher(v); redesenharPagina(aba); },
    }, icone ? ic(icone) : null, rotulo)));
    const motor = h('select', { disabled: !opcoesMotor.length }, opcoesMotor.length ? opcoesMotor.map(([v, rotulo]) => h('option', { value: v, selected: v === r.motor }, rotulo)) : h('option', {}, 'Nenhum modelo de imagem'));
    motor.addEventListener('change', () => { r.motor = motor.value; });

    const semModelo = IMG.modelos && !opcoesMotor.length;
    const cartao = (img) => h('figure', { class: 'img-cartao' },
      h('div', { class: 'img-quadro' }, h('img', { src: img.url, alt: img.prompt })),
      h('figcaption', {},
        h('p', { class: 'img-prompt', title: img.prompt }, img.prompt),
        h('div', { class: 'img-meta' }, h('span', { class: 'mono' }, img.modelo), img.salvo ? h('span', { class: 'img-salvo' }, ic('check'), img.salvo) : null),
        h('div', { class: 'img-acoes' },
          h('button', { class: 'bt bt-principal', onclick: () => salvarImagemNoProjeto(img, aba) }, ic('save'), img.salvo ? 'Salvar de novo' : 'Salvar no projeto'),
          h('button', { class: 'bt', onclick: () => mandarImagemParaOTime(img) }, ic('comment-discussion'), 'Mandar para o time'),
          h('button', { class: 'bt-icone', title: 'Copiar', onclick: () => copiarImagem(img) }, ic('copy')))));

    host.append(h('div', { class: 'pagina-imagens' },
      h('section', { class: 'img-form' },
        h('div', { class: 'img-titulo' }, h('span', { class: 'img-titulo-icone' }, ic('file-media')), h('div', {}, h('h1', {}, 'Gerar imagem'), h('p', { class: 'mudo pequeno' }, 'Ícones, banners, ilustrações e fotos para o projeto.'))),
        h('label', { class: 'img-rotulo' }, 'O que tu quer ver'),
        campo,
        h('label', { class: 'img-rotulo' }, 'Estilo'),
        chips(ESTILOS_IMAGEM, r.estilo, (v) => { r.estilo = v; }),
        h('label', { class: 'img-rotulo' }, 'Formato'),
        chips(FORMATOS_IMAGEM, r.formato, (v) => { r.formato = v; }),
        h('label', { class: 'img-rotulo' }, 'Quantas'),
        chips([1, 2, 3, 4].map((n) => [n, String(n)]), r.quantidade, (v) => { r.quantidade = v; }),
        h('label', { class: 'img-rotulo' }, 'Modelo'),
        motor,
        semModelo ? h('div', { class: 'img-aviso' },
          ic('info'),
          h('div', {},
            h('p', {}, 'O Claude Code e o Codex não geram imagens. Cadastre em Contas e modelos um provedor que gere: a OpenAI (gpt-image-1), o Google Gemini (Imagen, com cota grátis) ou o OpenRouter.'),
            h('button', { class: 'bt', onclick: abrirContas }, ic('account'), 'Abrir Contas e modelos'))) : null,
        IMG.erro ? h('p', { class: 'erro-texto img-erro' }, ic('error'), ` ${IMG.erro}`) : null,
        h('div', { class: 'img-gerar' },
          IMG.gerando
            ? h('button', { class: 'bt', onclick: () => chamar('imagens:parar').catch(() => {}) }, ic('debug-stop'), 'Parar')
            : null,
          h('button', { class: 'bt bt-principal', disabled: IMG.gerando || semModelo, onclick: () => gerarImagens(aba) },
            IMG.gerando ? ic('loading', 'codicon-modifier-spin') : ic('sparkle'), IMG.gerando ? 'Gerando…' : 'Gerar'))),
      h('section', { class: 'img-galeria' },
        IMG.gerando ? h('div', { class: 'img-grade' }, Array.from({ length: r.quantidade }, () => h('div', { class: 'img-cartao carregando' }, h('div', { class: 'img-quadro' }, ic('loading', 'codicon-modifier-spin'))))) : null,
        IMG.galeria.length
          ? h('div', { class: 'img-grade' }, IMG.galeria.map(cartao))
          : IMG.gerando ? null : h('div', { class: 'img-vazio' },
            ic('file-media'),
            h('h3', {}, 'As imagens aparecem aqui'),
            h('p', {}, 'Cada uma pode ir para o projeto como .png ou para o time, como anexo de um pedido na Orquestra.')))));
    requestAnimationFrame(() => { if (!r.prompt && document.activeElement === document.body) campo.focus(); });
  },
};
