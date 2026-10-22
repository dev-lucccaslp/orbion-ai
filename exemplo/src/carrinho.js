// Carrinho de compras simples: itens com preço e quantidade, mais o frete.

const FRETE_PADRAO = 15;

// Cupons aceitos (um por compra).
const CUPONS_VALIDOS = ['DEZ', 'FRETEGRATIS'];

function subtotal(itens) {
  return itens.reduce((soma, item) => soma + item.preco * item.quantidade, 0);
}

function quantidadeDeItens(itens) {
  return itens.reduce((soma, item) => soma + item.quantidade, 0);
}

// Arredonda para centavos, meio para cima.
function arredondar(valor) {
  return Math.round(valor * 100) / 100;
}

// Devolve o código do cupom em maiúsculas, ou null se não houver cupom.
// Lança erro se o cupom não for reconhecido.
function normalizarCupom(cupom) {
  if (cupom === undefined || cupom === null) return null;
  if (typeof cupom !== 'string') throw new Error(`Cupom inválido: ${String(cupom)}`);
  const limpo = cupom.trim();
  if (limpo === '') return null;
  const codigo = limpo.toUpperCase();
  if (!CUPONS_VALIDOS.includes(codigo)) throw new Error(`Cupom inválido: ${limpo}`);
  return codigo;
}

function total(itens, frete = FRETE_PADRAO, cupom) {
  const codigo = normalizarCupom(cupom);
  const valorItens = subtotal(itens);
  if (codigo === 'DEZ') {
    // 10% só sobre os itens; o frete fica de fora.
    const desconto = Math.round(valorItens * 10) / 100;
    return arredondar(valorItens - desconto + frete);
  }
  if (codigo === 'FRETEGRATIS') return valorItens;
  return valorItens + frete;
}

// Devolve uma lista nova sem os itens com esse nome; a lista original não muda.
function removerItem(itens, nome) {
  return itens.filter((item) => item.nome !== nome);
}

// Devolve uma lista vazia nova a cada chamada.
function limparCarrinho() {
  return [];
}

// No Node exporta via CommonJS; no navegador (script clássico) expõe em window.Carrinho.
const api = { subtotal, quantidadeDeItens, total, removerItem, limparCarrinho, FRETE_PADRAO, CUPONS_VALIDOS };
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else if (typeof window !== 'undefined') {
  window.Carrinho = api;
}
