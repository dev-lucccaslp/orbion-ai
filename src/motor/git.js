// O git da vista Mudanças, no estilo do Controle de Código do VS Code: preparar e despreparar,
// descartar, commit, branches, pull, push, sincronizar, iniciar o repositório e publicar no GitHub.
// Os caminhos (rels) são relativos à pasta do projeto, que pode ser uma subpasta do repositório.

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const real = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };

function rodar(programa, args, cwd, timeout = 120000) {
  return new Promise((resolve) => {
    // Sem prompt no terminal: o login do GitHub, se faltar, abre na janela do Git Credential Manager.
    execFile(programa, args, {
      cwd, windowsHide: true, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8', timeout,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1' },
    }, (erro, stdout, stderr) => {
      resolve({ ok: !erro, saida: stdout || '', erro: `${stderr || ''}`.trim() || erro?.message || '' });
    });
  });
}

/** Roda e devolve a saída; se falhar, lança a mensagem do git (sem as linhas de dica dele). */
async function exigir(projeto, args, timeout) {
  const r = await rodar('git', args, real(projeto), timeout);
  if (!r.ok) {
    const linhas = r.erro.split('\n').map((l) => l.trim()).filter((l) => l && !/^hint:/i.test(l));
    throw new Error(linhas.join('\n') || `git ${args[0]} falhou`);
  }
  return r.saida;
}

const temCommits = async (projeto) => (await rodar('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], real(projeto))).ok;
const caminhos = (rels) => (rels?.length ? rels : ['.']);

async function preparar(projeto, rels) {
  await exigir(projeto, ['add', '-A', '--', ...caminhos(rels)]);
}

async function despreparar(projeto, rels) {
  if (await temCommits(projeto)) await exigir(projeto, ['restore', '--staged', '--', ...caminhos(rels)]);
  else await exigir(projeto, ['rm', '-r', '--cached', '--quiet', '--', ...caminhos(rels)]); // repositório sem nenhum commit ainda
}

/** Volta os arquivos rastreados para o que está preparado (ou no último commit). Os novos, fora do git,
 *  vão para a lixeira pelo `paraLixeira` que o processo principal passa. */
async function descartar(projeto, rels, { novos = [], paraLixeira }) {
  const rastreados = rels.filter((r) => !novos.includes(r));
  if (rastreados.length) await exigir(projeto, ['restore', '--worktree', '--', ...rastreados]);
  for (const rel of novos) await paraLixeira(path.join(projeto, rel));
}

/** Faz o commit e devolve o hash curto. Sem nada preparado e com `tudo`, prepara tudo antes (como o VS Code). */
async function commit(projeto, mensagem, { tudo = false } = {}) {
  if (!String(mensagem || '').trim()) throw new Error('Escreva a mensagem do commit.');
  if (tudo) await preparar(projeto, []);
  await exigir(projeto, ['commit', '-m', mensagem.trim()]);
  return (await exigir(projeto, ['rev-parse', '--short', 'HEAD'])).trim();
}

async function ramos(projeto) {
  const locais = (await exigir(projeto, ['branch', '--format=%(refname:short)%09%(HEAD)%09%(upstream:short)'])).split('\n').filter(Boolean).map((l) => {
    const [nome, atual, upstream] = l.split('\t');
    return { nome, atual: atual === '*', upstream: upstream || null };
  });
  const remotos = (await exigir(projeto, ['branch', '-r', '--format=%(refname:short)'])).split('\n').filter((n) => n && !/\/HEAD$/.test(n) && n.includes('/'));
  return { locais, remotos };
}

async function trocarRamo(projeto, nome) {
  const { locais } = await ramos(projeto);
  if (locais.some((r) => r.nome === nome)) return exigir(projeto, ['switch', nome]);
  // Branch só do servidor (origin/x): cria a local acompanhando a remota.
  const local = nome.replace(/^[^/]+\//, '');
  return exigir(projeto, ['switch', '-c', local, '--track', nome]);
}

async function criarRamo(projeto, nome) {
  const limpo = String(nome || '').trim().replace(/\s+/g, '-');
  if (!limpo) throw new Error('Dê um nome para a branch.');
  await exigir(projeto, ['check-ref-format', '--branch', limpo]);
  await exigir(projeto, ['switch', '-c', limpo]);
  return limpo;
}

const temUpstream = async (projeto) => (await rodar('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], real(projeto))).ok;

async function puxar(projeto) {
  if (!(await temUpstream(projeto))) throw new Error('Esta branch ainda não está no servidor. Publique a branch primeiro.');
  await exigir(projeto, ['pull'], 300000);
}

/** Envia os commits. Branch nova (sem upstream) é publicada no origin, como o "Publicar Branch" do VS Code. */
async function enviar(projeto) {
  if (await temUpstream(projeto)) return exigir(projeto, ['push'], 300000);
  const remotos = (await exigir(projeto, ['remote'])).split('\n').filter(Boolean);
  if (!remotos.length) throw new Error('Este repositório não tem servidor (remote). Use "Publicar no GitHub".');
  return exigir(projeto, ['push', '-u', remotos.includes('origin') ? 'origin' : remotos[0], 'HEAD'], 300000);
}

async function sincronizar(projeto) {
  if (await temUpstream(projeto)) await exigir(projeto, ['pull'], 300000);
  await enviar(projeto);
}

const buscar = (projeto) => exigir(projeto, ['fetch', '--all', '--prune'], 300000);

async function iniciar(projeto) {
  await exigir(projeto, ['init', '-b', 'main']);
}

/** Cria o repositório no GitHub com o GitHub CLI, liga como origin e envia. Devolve o endereço dele. */
async function publicarNoGitHub(projeto, { nome, privado = true, gh = 'gh' }) {
  if (!(await temCommits(projeto))) throw new Error('Faça o primeiro commit antes de publicar.');
  const limpo = String(nome || '').trim().replace(/\s+/g, '-');
  if (!limpo) throw new Error('Dê um nome para o repositório.');
  const r = await rodar(gh, ['repo', 'create', limpo, privado ? '--private' : '--public', '--source', '.', '--remote', 'origin', '--push'], real(projeto), 300000);
  if (!r.ok) {
    if (/auth login|not logged/i.test(r.erro)) throw new Error('Conecte a conta do GitHub em Contas e modelos primeiro.');
    throw new Error(r.erro || 'O GitHub CLI não conseguiu criar o repositório.');
  }
  return (/https:\/\/github\.com\/\S+/.exec(`${r.saida}\n${r.erro}`) || [''])[0].replace(/\.git$/, '');
}

/** O conteúdo preparado (no índice) de um arquivo; vazio se ele não estiver lá. */
async function noIndice(projeto, rel) {
  const r = await rodar('git', ['show', `:./${rel}`], real(projeto));
  return r.ok ? r.saida : '';
}

/** O que está preparado, para a IA escrever a mensagem do commit (ou tudo, se nada estiver preparado). */
async function diffParaMensagem(projeto, limite = 40000) {
  let diff = await exigir(projeto, ['diff', '--cached', '--stat', '--patch', '--no-color']);
  let soPreparado = true;
  if (!diff.trim()) {
    diff = await exigir(projeto, ['diff', '--stat', '--patch', '--no-color']);
    const novos = (await exigir(projeto, ['ls-files', '--others', '--exclude-standard'])).trim();
    if (novos) diff += `\nArquivos novos:\n${novos}`;
    soPreparado = false;
  }
  return { diff: diff.length > limite ? `${diff.slice(0, limite)}\n… (cortado)` : diff, soPreparado };
}

module.exports = {
  preparar, despreparar, descartar, commit, ramos, trocarRamo, criarRamo, puxar, enviar, sincronizar, buscar, iniciar,
  publicarNoGitHub, noIndice, diffParaMensagem, temCommits,
};
