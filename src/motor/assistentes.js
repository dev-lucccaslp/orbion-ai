// Tarefas avulsas que não precisam de time: sugerir melhorias do projeto e escrever uma
// skill nova. Rodam no motor que a pessoa escolher (Claude, Codex ou um modelo por API).

const fs = require('node:fs');
const path = require('node:path');
const { rodarAgente } = require('./executor');
const { lerSkill } = require('./skills');
const projetoCfg = require('./projeto');
const fluxosMod = require('./fluxos');
const { secaoProjetos } = require('./prompts');

const MELHORIAS = {
  type: 'object',
  additionalProperties: false,
  required: ['resumo', 'sugestoes'],
  properties: {
    resumo: { type: 'string', description: 'Como o projeto está, em duas ou três frases.' },
    sugestoes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titulo', 'descricao', 'area', 'impacto', 'esforco', 'arquivos', 'pedido'],
        properties: {
          titulo: { type: 'string' },
          descricao: { type: 'string', description: 'O problema, onde está e por que importa.' },
          area: { type: 'string', enum: ['bug', 'seguranca', 'testes', 'codigo', 'desempenho', 'experiencia', 'arquitetura', 'documentacao', 'infra'] },
          impacto: { type: 'string', enum: ['alto', 'medio', 'baixo'] },
          esforco: { type: 'string', enum: ['pequeno', 'medio', 'grande'] },
          arquivos: { type: 'array', items: { type: 'string' } },
          pedido: { type: 'string', description: 'Pedido pronto para mandar a um time de agentes, com o critério de pronto.' },
        },
      },
    },
  },
};

const SKILL = {
  type: 'object',
  additionalProperties: false,
  required: ['nome', 'descricao', 'instrucoes'],
  properties: {
    nome: { type: 'string', description: 'Minúsculas e hífen, ex.: revisar-pr' },
    descricao: { type: 'string', description: 'O que faz e quando usar, com as palavras que a pessoa usaria.' },
    instrucoes: { type: 'string', description: 'O corpo do SKILL.md, em Markdown.' },
  },
};

const pastaTrabalho = (projeto, tipo) => path.join(projeto, '.orbion', tipo, new Date().toISOString().replace(/[:.]/g, '-'));

async function sugerirMelhorias({ projeto, motor = 'claude', modelo = '', comandos, foco = '', sinal, aoEvento }) {
  const skill = lerSkill('sugerir-melhorias', projeto);
  const memoria = projetoCfg.lerMemoria(projeto);
  const prompt = [
    skill?.corpo || 'Aponte as melhorias que mais valem a pena neste projeto.',
    `# Projeto\nPasta: ${projeto}`,
    memoria ? `# Memória do projeto\n${memoria}` : '',
    foco ? `# Foco pedido pela pessoa\n${foco}` : '',
    '# Como responder\nEntregue no formato pedido: um resumo e as sugestões, da que mais vale para a que menos vale (no máximo 10). Escreva em português.',
  ].filter(Boolean).join('\n\n');
  const r = await rodarAgente({
    motor, modelo, comando: comandos[motor] || comandos.claude, cwd: projeto, prompt, esquema: MELHORIAS,
    pasta: pastaTrabalho(projeto, 'melhorias'), editaArquivos: false, rodaComandos: false, sinal, aoEvento,
  });
  if (r.erro) throw new Error(r.erro);
  const resultado = { ...r.saida, criadaEm: Date.now(), motor, modelo };
  fs.writeFileSync(path.join(projeto, '.orbion', 'melhorias.json'), JSON.stringify(resultado, null, 2));
  return resultado;
}

function ultimasMelhorias(projeto) {
  try {
    return JSON.parse(fs.readFileSync(path.join(projeto, '.orbion', 'melhorias.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function escreverSkill({ projeto, descricao, motor = 'claude', modelo = '', comandos, sinal, aoEvento }) {
  const guia = lerSkill('criar-skill', projeto);
  const prompt = [
    guia?.corpo || 'Escreva uma skill.',
    `# O que a pessoa quer que a skill faça\n${descricao}`,
    projeto ? `# Projeto (para contexto)\nPasta: ${projeto}. Leia o que for útil para a skill combinar com este projeto, mas não altere nada.` : '',
    '# Como responder\nEntregue o nome, a descrição e as instruções no formato pedido. Escreva em português.',
  ].filter(Boolean).join('\n\n');
  const r = await rodarAgente({
    motor, modelo, comando: comandos[motor] || comandos.claude, cwd: projeto, prompt, esquema: SKILL,
    pasta: pastaTrabalho(projeto, 'skills-geradas'), editaArquivos: false, rodaComandos: false, sinal, aoEvento,
  });
  if (r.erro) throw new Error(r.erro);
  return r.saida;
}

const MENSAGEM_COMMIT = {
  type: 'object',
  additionalProperties: false,
  required: ['mensagem'],
  properties: {
    mensagem: { type: 'string', description: 'A mensagem do commit: uma linha de resumo (até 72 caracteres), e, se precisar, uma linha em branco e um corpo curto.' },
  },
};

/** Escreve a mensagem do commit a partir do diff (como o botão de estrelinha do VS Code). */
async function mensagemDeCommit({ projeto, diff, motor = 'claude', modelo = '', comandos, sinal, aoEvento }) {
  const prompt = [
    'Escreva a mensagem de commit para as mudanças abaixo.',
    '- Primeira linha: o que mudou, no imperativo, até 72 caracteres (ex.: "Valida a quantidade no adicionarItem").',
    '- Se a mudança tiver mais de um ponto importante, uma linha em branco e um corpo curto com o porquê.',
    '- Siga o padrão das mensagens anteriores do repositório se der para perceber pelo diff; senão, escreva em português.',
    '- Não invente nada que não esteja no diff.',
    `# Mudanças\n\`\`\`diff\n${diff}\n\`\`\``,
  ].join('\n');
  const r = await rodarAgente({
    motor, modelo, comando: comandos[motor] || comandos.claude, cwd: projeto, prompt, esquema: MENSAGEM_COMMIT,
    pasta: pastaTrabalho(projeto, 'commits'), editaArquivos: false, rodaComandos: false, sinal, aoEvento,
  });
  if (r.erro) throw new Error(r.erro);
  return String(r.saida?.mensagem || '').trim();
}

/** Monta os fluxos principais do projeto (o mapa no estilo do n8n), lendo só o que precisa. */
async function mapearFluxos({ projeto, motor = 'claude', modelo = '', comandos, sinal, aoEvento }) {
  const memoria = projetoCfg.lerMemoria(projeto);
  const prompt = [
    'Desenhe os fluxos principais deste projeto, como num editor de fluxos do n8n.',
    'Para cada funcionalidade importante (login, cadastro, pedido, relatório, integração, rotina agendada, atendimento da IA...), diga por onde ela passa de ponta a ponta: tela → rota → tratamento dos dados → banco → resposta → tela, com os nomes reais (rota, tabela, função) e os arquivos onde cada bloco está.',
    '# Regras',
    '- Gaste pouco: use Glob e Grep para achar rotas, telas, tabelas, filas e integrações, e leia só os trechos que precisar. Não leia arquivos grandes inteiros.',
    '- No máximo 10 fluxos, com até 14 blocos cada. Comece pelos que mais importam para quem usa o sistema.',
    '- Ids curtos e estáveis (ex.: tela-login, post-api-login, tabela-usuarios). Os arquivos são relativos à pasta do projeto.',
    '- Não altere nada.',
    `# Projeto\nPasta: ${projeto}`,
    secaoProjetos(projeto),
    memoria ? `# Memória do projeto\n${memoria}` : '',
    '# Como responder\nEntregue no formato pedido: um resumo de como o projeto está organizado e os fluxos. Escreva em português.',
  ].filter(Boolean).join('\n\n');
  const r = await rodarAgente({
    motor, modelo, comando: comandos[motor] || comandos.claude, cwd: projeto, prompt, esquema: fluxosMod.MAPA,
    pasta: pastaTrabalho(projeto, 'fluxos'), editaArquivos: false, rodaComandos: false, sinal, aoEvento,
  });
  if (r.erro) throw new Error(r.erro);
  return fluxosMod.gravarMapa(projeto, r.saida || {});
}

module.exports = { sugerirMelhorias, ultimasMelhorias, escreverSkill, mensagemDeCommit, mapearFluxos };
