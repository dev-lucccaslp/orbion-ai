// Skills: as que vêm com o Orbion.ai, as que a pessoa criou e as que ela já tem
// instaladas (Claude Code, Codex e plugins), todas pelo nome.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { separarCabecalho } = require('./agentes');

const EMBUTIDAS = path.join(__dirname, '..', 'skills');
const pastaDoUsuario = () => path.join(os.homedir(), '.orbion', 'skills');
const pastaDoProjeto = (projeto) => path.join(projeto, '.claude', 'skills');

/** Pastas onde procurar, da que manda mais para a que manda menos (mesmo nome: a primeira ganha). */
function pastasDeSkills(projeto) {
  const casa = os.homedir();
  const pastas = [
    projeto && [pastaDoProjeto(projeto), 'projeto'],
    [pastaDoUsuario(), 'orbion-usuario'],
    [path.join(casa, '.claude', 'skills'), 'claude'],
    [path.join(casa, '.codex', 'skills'), 'codex'],
    [path.join(casa, '.agents', 'skills'), 'agents'],
  ].filter(Boolean);
  // Skills que vêm em plugins do Claude Code: marketplaces/<m>/plugins/<p>/skills
  const marketplaces = path.join(casa, '.claude', 'plugins', 'marketplaces');
  for (const m of listar(marketplaces)) {
    for (const p of listar(path.join(marketplaces, m, 'plugins'))) pastas.push([path.join(marketplaces, m, 'plugins', p, 'skills'), 'plugin']);
  }
  pastas.push([EMBUTIDAS, 'orbion']);
  return pastas;
}

function listar(pasta) {
  try {
    return fs.readdirSync(pasta, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
}

/** Todas as skills encontradas, sem repetir nome. */
function listarSkills(projeto) {
  const vistas = new Map();
  for (const [base, origem] of pastasDeSkills(projeto)) {
    for (const nome of listar(base)) {
      const arquivo = path.join(base, nome, 'SKILL.md');
      if (vistas.has(nome) || !fs.existsSync(arquivo)) continue;
      const { campos } = separarCabecalho(fs.readFileSync(arquivo, 'utf8'));
      vistas.set(nome, { nome, descricao: campos.description || '', pasta: path.join(base, nome), arquivo, origem });
    }
  }
  return [...vistas.values()].sort((a, b) => (a.origem === 'orbion') - (b.origem === 'orbion') || a.nome.localeCompare(b.nome));
}

function acharSkills(nomes, projeto) {
  if (!nomes.length) return { achadas: [], faltando: [] };
  const todas = new Map(listarSkills(projeto).map((s) => [s.nome, s]));
  return {
    achadas: nomes.filter((n) => todas.has(n)).map((n) => todas.get(n)),
    faltando: nomes.filter((n) => !todas.has(n)),
  };
}

/** O texto da skill, sem o cabeçalho e sem comentários. */
function lerSkill(nome, projeto) {
  const s = listarSkills(projeto).find((x) => x.nome === nome);
  if (!s) return null;
  const { corpo } = separarCabecalho(fs.readFileSync(s.arquivo, 'utf8'));
  return { ...s, corpo: corpo.replace(/<!--[\s\S]*?-->/g, '').trim() };
}

const nomeValido = (n) => /^[a-z0-9][a-z0-9-]{0,48}$/.test(n);

/** Cria (ou atualiza) uma skill: no projeto (.claude/skills, também vale no Claude Code) ou para todos os projetos. */
function salvarSkill({ projeto, onde, nome, descricao, instrucoes }) {
  if (!nomeValido(nome)) throw new Error('Use só letras minúsculas, números e hífen no nome da skill.');
  const base = onde === 'projeto' ? pastaDoProjeto(projeto) : pastaDoUsuario();
  const pasta = path.join(base, nome);
  fs.mkdirSync(pasta, { recursive: true });
  const desc = String(descricao || '').replace(/\s*\r?\n\s*/g, ' ').trim();
  fs.writeFileSync(path.join(pasta, 'SKILL.md'), `---\nname: ${nome}\ndescription: ${desc}\n---\n\n${String(instrucoes || '').trim()}\n`);
  return path.join(pasta, 'SKILL.md');
}

module.exports = { listarSkills, acharSkills, lerSkill, salvarSkill, pastaDoUsuario, EMBUTIDAS };
