const { test } = require('node:test');
const assert = require('node:assert/strict');
const { subtotal, quantidadeDeItens, total, removerItem, limparCarrinho, FRETE_PADRAO } = require('../src/carrinho');

test('limparCarrinho: devolve um array vazio', () => {
  assert.deepStrictEqual(limparCarrinho(), []);
});

test('limparCarrinho: cada chamada devolve um array novo', () => {
  const a = limparCarrinho();
  const b = limparCarrinho();
  assert.notStrictEqual(a, b);
  a.push({ nome: 'A' });
  assert.deepStrictEqual(b, []);
  const c = limparCarrinho();
  assert.deepStrictEqual(c, []);
  assert.notStrictEqual(c, a);
  assert.notStrictEqual(c, b);
  b.push({ nome: 'B' });
  assert.deepStrictEqual(a, [{ nome: 'A' }]);
  assert.deepStrictEqual(c, []);
});

const casosRemocao = [
  ['remove pelo nome e preserva a ordem dos demais',
    [{ nome: 'A', preco: 10, quantidade: 1 }, { nome: 'B', preco: 20, quantidade: 2 }, { nome: 'C', preco: 30, quantidade: 3 }],
    'B', [0, 2]],
  ['remove todas as ocorrencias de um nome',
    [{ nome: 'A', preco: 10 }, { nome: 'B', preco: 20 }, { nome: 'A', preco: 30 }],
    'A', [1]],
  ['nome inexistente devolve lista equivalente',
    [{ nome: 'A' }, { nome: 'B' }], 'C', [0, 1]],
  ['lista vazia devolve outro array vazio', [], 'A', []],
  ['remove o unico item', [{ nome: 'A' }], 'A', []],
  ['remove todos os itens quando todos tem o nome',
    [{ nome: 'A' }, { nome: 'A' }], 'A', []],
  ['compara nomes exatamente, incluindo caixa e espacos',
    [{ nome: 'A' }, { nome: 'a' }, { nome: ' A ' }], 'A', [1, 2]],
  ['aceita nome vazio sem remover outros nomes',
    [{ nome: '' }, { nome: 'A' }], '', [1]],
];

for (const [descricao, entrada, nome, indicesMantidos] of casosRemocao) {
  test(`removerItem: ${descricao}; preserva original e retorna novo array`, () => {
    const itens = entrada.map(item => ({ ...item }));
    const antes = entrada.map(item => ({ ...item }));
    const referencias = [...itens];
    const esperado = indicesMantidos.map(indice => antes[indice]);

    const resultado = removerItem(itens, nome);

    assert.ok(Array.isArray(resultado));
    assert.notStrictEqual(resultado, itens);
    assert.deepStrictEqual(resultado, esperado);
    assert.equal(itens.length, antes.length);
    assert.deepStrictEqual(itens, antes);
    itens.forEach((item, indice) => assert.strictEqual(item, referencias[indice]));
    indicesMantidos.forEach((indice, posicao) => {
      assert.strictEqual(resultado[posicao], referencias[indice]);
    });
  });
}

test('removerItem: nomes de tipos diferentes nao coincidem com nomes textuais', () => {
  for (const nome of [null, undefined, 0, false]) {
    const itens = [{ nome: 'null' }, { nome: 'undefined' }, { nome: '0' }, { nome: 'false' }];
    const antes = itens.map(item => ({ ...item }));
    const resultado = removerItem(itens, nome);
    assert.deepStrictEqual(resultado, antes);
    assert.deepStrictEqual(itens, antes);
    assert.notStrictEqual(resultado, itens);
  }
});

test('quantidadeDeItens: carrinho vazio retorna 0', () => {
  assert.equal(quantidadeDeItens([]), 0);
});

test('quantidadeDeItens: um item retorna sua quantidade', () => {
  assert.equal(quantidadeDeItens([{ preco: 10, quantidade: 4 }]), 4);
});

test('quantidadeDeItens: soma quantidades diferentes de varios itens', () => {
  assert.equal(quantidadeDeItens([
    { preco: 10, quantidade: 2 },
    { preco: 50, quantidade: 5 },
    { preco: 3, quantidade: 1 },
  ]), 8);
});

test('quantidadeDeItens: aceita quantidade zero e itens sem preco', () => {
  assert.equal(quantidadeDeItens([{ quantidade: 0 }]), 0);
  assert.equal(quantidadeDeItens([{ quantidade: 0 }, { quantidade: 3 }]), 3);
});

test('quantidadeDeItens: soma no limite de inteiros seguros', () => {
  assert.equal(quantidadeDeItens([
    { quantidade: Number.MAX_SAFE_INTEGER - 1 },
    { quantidade: 1 },
  ]), Number.MAX_SAFE_INTEGER);
});

const A = [{ preco: 50, quantidade: 2 }, { preco: 30, quantidade: 1 }];

test('CA18: exports existentes e subtotal permanecem compatíveis', () => {
  assert.equal(typeof subtotal, 'function');
  assert.equal(typeof total, 'function');
  assert.equal(FRETE_PADRAO, 15);
  assert.equal(subtotal(A), 130);
  assert.equal(subtotal([]), 0);
});

test('CA1–CA3 / R1 e R4: ausência de cupom preserva subtotal + frete', () => {
  assert.equal(total(A), 145);
  assert.equal(total(A, 20), 150);
  for (const cupom of [undefined, null, '', '   ', '\t\n']) {
    assert.equal(total(A, undefined, cupom), 145);
    assert.equal(total(A, 20, cupom), 150);
    assert.equal(total(A, 0, cupom), 130);
    const itens = [{ preco: 1.234, quantidade: 1 }];
    assert.equal(total(itens, 0, cupom), 1.234);
  }
});

test('CA4–CA6: DEZ desconta apenas o subtotal e normaliza caixa e pontas', () => {
  for (const cupom of ['DEZ', 'dez', '  Dez  ']) {
    assert.equal(total(A, undefined, cupom), 132);
    assert.equal(total(A, 20, cupom), 137);
    assert.equal(total(A, 0, cupom), 117);
  }
});

test('CA7–CA9: FRETEGRATIS ignora o frete e normaliza caixa e pontas', () => {
  for (const cupom of ['FRETEGRATIS', 'fretegratis', ' FreteGratis ']) {
    assert.equal(total(A, undefined, cupom), 130);
    assert.equal(total(A, 20, cupom), 130);
    assert.equal(total(A, 0, cupom), 130);
  }
  // R6: o subtotal não recebe arredondamento adicional.
  assert.equal(total([{ preco: 1.234, quantidade: 1 }], 20, 'FRETEGRATIS'), 1.234);
});

for (const [preco, esperado] of [
  [19.99, 32.99], // CA10: desconto de 2,00.
  [33.33, 45], // CA11: desconto de 3,33.
  [0.04, 15.04], // Abaixo de meio centavo de desconto.
  [0.05, 15.04], // Meio centavo arredonda o desconto para cima.
  [0.06, 15.05], // Acima de meio centavo de desconto.
  [0, 15],
]) {
  test(`R5 / CA10–CA11: DEZ com subtotal ${preco} resulta em ${esperado}`, () => {
    assert.equal(total([{ preco, quantidade: 1 }], undefined, 'DEZ'), esperado);
  });
}

test('R5: arredonda o desconto sobre a soma e arredonda também o total', () => {
  const itens = [{ preco: 0.05, quantidade: 1 }, { preco: 0.05, quantidade: 1 }];
  assert.equal(total(itens, 0, 'DEZ'), 0.09);
  assert.equal(total([{ preco: 1, quantidade: 1 }], 0.006, 'DEZ'), 0.91);
});

test('CA12: carrinho vazio e itens de quantidade zero', () => {
  for (const itens of [[], [{ preco: 50, quantidade: 0 }]]) {
    assert.equal(total(itens), 15);
    assert.equal(total(itens, undefined, 'DEZ'), 15);
    assert.equal(total(itens, undefined, 'FRETEGRATIS'), 0);
    assert.equal(total(itens, 20, 'DEZ'), 20);
    assert.equal(total(itens, 20, 'FRETEGRATIS'), 0);
  }
});

const invalidos = [
  ['XYZ', 'XYZ'], // CA13.
  ['  xyz ', 'xyz'], // CA14: mantém a caixa original.
  ['DEZ FRETEGRATIS', 'DEZ FRETEGRATIS'], // CA15.
  [['DEZ', 'FRETEGRATIS'], 'DEZ,FRETEGRATIS'],
  ['DEZ,FRETEGRATIS', 'DEZ,FRETEGRATIS'],
  [10, '10'], // CA16.
  ['DEZ10', 'DEZ10'], // CA17.
  ['FRETE GRATIS', 'FRETE GRATIS'],
  ['D EZ', 'D EZ'],
  [0, '0'],
  [false, 'false'],
  [true, 'true'],
  [NaN, 'NaN'],
  [Infinity, 'Infinity'],
  [[], ''],
  [['DEZ'], 'DEZ'],
  [{}, '[object Object]'],
];

for (const [indice, [cupom, texto]] of invalidos.entries()) {
  test(`CA13–CA17 / R7–R8: inválido ${indice + 1} lança Error com mensagem exata`, () => {
    for (const itens of [A, []]) {
      assert.throws(() => total(itens, undefined, cupom), (erro) => {
        assert.ok(erro instanceof Error);
        assert.equal(erro.message, `Cupom inválido: ${texto}`);
        return true;
      });
    }
  });
}

test('R2: aplicar cupons não altera os itens nem o subtotal', () => {
  const itens = Object.freeze(A.map(item => Object.freeze({ ...item })));
  assert.equal(total(itens, undefined, 'DEZ'), 132);
  assert.equal(subtotal(itens), 130);
  assert.equal(total(itens, undefined, 'FRETEGRATIS'), 130);
  assert.equal(subtotal(itens), 130);
  assert.equal(total(itens), 145);
});
