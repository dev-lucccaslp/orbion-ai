// Contas dos CLIs que o Orbion usa (Claude Code e Codex como motor, GitHub CLI para o GitHub): se estão
// instalados e logados, e os comandos para entrar e sair (que rodam no terminal integrado, onde a pessoa
// completa o login).

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

function rodar(cmd, args, timeout = 20000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout, encoding: 'utf8' }, (erro, stdout, stderr) => {
      resolve({ ok: !erro, codigo: erro?.code ?? 0, texto: `${stdout || ''}${stderr || ''}`.trim(), naoAchou: erro?.code === 'ENOENT' });
    });
  });
}

async function claude(comando) {
  const versao = await rodar(comando, ['--version']);
  if (versao.naoAchou) return { id: 'claude', nome: 'Claude Code', instalado: false };
  const st = await rodar(comando, ['auth', 'status']);
  let info = {};
  try { info = JSON.parse(st.texto); } catch {}
  return {
    id: 'claude', nome: 'Claude Code', instalado: true, versao: versao.texto.split(/\s/)[0],
    logado: !!info.loggedIn, conta: info.loggedIn ? (info.authMethod === 'claude.ai' ? 'Conta claude.ai (plano)' : info.authMethod || 'conectado') : null,
    entrar: `${comando} auth login`, sair: `${comando} auth logout`,
  };
}

async function codex(comando) {
  const versao = await rodar(comando, ['--version']);
  if (versao.naoAchou) return { id: 'codex', nome: 'Codex', instalado: false };
  const st = await rodar(comando, ['login', 'status']);
  const logado = st.ok && /logged in/i.test(st.texto);
  return {
    id: 'codex', nome: 'Codex', instalado: true, versao: versao.texto.replace(/^codex-cli\s*/, ''),
    logado, conta: logado ? st.texto.replace(/^Logged in using\s*/i, 'Conta ') : null,
    entrar: `${comando} login`, sair: `${comando} logout`,
  };
}

/** O GitHub CLI recém-instalado só entra no PATH dos programas abertos depois. Põe a pasta dele no PATH
 *  deste processo, para o Orbion e os terminais novos acharem o gh sem reiniciar. */
function acharGh() {
  if (process.platform !== 'win32') return 'gh';
  const pasta = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'GitHub CLI');
  if (fs.existsSync(path.join(pasta, 'gh.exe'))) {
    const partes = (process.env.PATH || '').split(path.delimiter);
    if (!partes.some((p) => p.toLowerCase() === pasta.toLowerCase())) process.env.PATH = [...partes, pasta].join(path.delimiter);
  }
  return 'gh';
}

async function github() {
  const gh = acharGh();
  const [versao, nome, email] = await Promise.all([rodar(gh, ['--version']), rodar('git', ['config', '--global', 'user.name']), rodar('git', ['config', '--global', 'user.email'])]);
  const git = [nome.ok && nome.texto, email.ok && email.texto && `<${email.texto}>`].filter(Boolean).join(' ');
  const base = { id: 'github', nome: 'GitHub', git, terminalNovo: true };
  if (versao.naoAchou) return { ...base, instalado: false };
  // "Logged in to github.com account fulano (keyring)"; as versões antigas dizem "as fulano".
  const st = await rodar(gh, ['auth', 'status', '--hostname', 'github.com']);
  const conta = /Logged in to github\.com (?:account|as) ([^\s(]+)/i.exec(st.texto)?.[1] || null;
  return {
    ...base, instalado: true, versao: /gh version (\S+)/.exec(versao.texto)?.[1] || '',
    logado: st.ok && !!conta, conta: conta ? `@${conta}` : null,
    entrar: 'gh auth login --web --hostname github.com --git-protocol https', sair: 'gh auth logout --hostname github.com',
  };
}

async function situacao(comandos) {
  return Promise.all([claude(comandos.claude), codex(comandos.codex), github()]);
}

const INSTALAR = {
  claude: 'npm install -g @anthropic-ai/claude-code',
  codex: 'npm install -g @openai/codex',
  github: 'winget install --id GitHub.cli -e',
};

module.exports = { situacao, INSTALAR, acharGh };
