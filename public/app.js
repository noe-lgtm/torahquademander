import { local } from './demo.js';

const main = document.querySelector('#content');
const toast = document.querySelector('#toast');
const demo = location.protocol === 'file:' || new URLSearchParams(location.search).has('demo') || !!globalThis.MOADON_DEMO;
document.querySelector('#demo-note').hidden = !demo;
let store;
let selected = '';
let selectedRound = '';
let panel = 'gestion';
let staffSession = '';
let reviewGrade;
let modalTimer;
let busy = false;
let pendingRead = false;
let errorState;
let record;
let recordingTime;
let generateStatus = '';
let generatedDraft;
let painted = '';
const signature = state => JSON.stringify([state.sessions,state.ideas,state.admin]);
let mutationEpoch = 0;

const h = value => String(value ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[x]);
const path = () => location.hash.replace(/^#/,'').split('/');
const active = () => store?.sessions.find(s => !s.archived);
const pageSession = () => store?.sessions.find(s => s.id === path()[1]) || active();
const managed = () => store?.sessions.find(s => s.id === staffSession) || active() || store?.sessions[0];
const outlook = (times, now) => {
  const ms = Math.max(0,times-now);
  const hours = Math.floor(ms/3600000);
  const minutes = Math.floor(ms%3600000/60000);
  return hours > 24 ? `${Math.floor(hours/24)} j ${hours%24} h` : hours ? `${hours} h ${minutes} min` : `${minutes} min ${Math.floor(ms%60000/1000)} s`;
};
const date = ms => new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Paris'}).format(ms);
const parisInput = ms => new Intl.DateTimeFormat('sv-SE',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Paris'}).format(ms).replace(' ','T');
function fromParis(input) {
  const asUtc = Date.parse(input + ':00Z');
  return [-1,-2].map(n => asUtc + n * 3600000).find(ms => parisInput(ms) === input) ?? NaN;
}
const btn = (label, kind, klass = '', attrs = '') => `<button type="button" class="btn ${klass}" data-do="${kind}" ${attrs}>${label}</button>`;
const link = (label, href, klass = '') => `<a class="btn ${klass}" href="#${href}">${label}</a>`;
const section = (title, description) => `<div class="section-head"><h1 class="page-title">${title}</h1>${description ? `<p>${description}</p>` : ''}</div>`;
const panelWrap = (body, klass = '') => `<section class="panel ${klass}">${body}</section>`;
const field = (label, name, props = '') => `<label>${label}<input name="${name}" ${props}></label>`;
const area = (label, name, contents='', props='') => `<label>${label}<textarea name="${name}" ${props}>${h(contents)}</textarea></label>`;
const submit = (text,klass='') => `<button class="btn ${klass}" type="submit">${text}</button>`;
const orbit = Array.from({length:7},(_,i) => `<span class="orbit" style="--inset:${i*22}px;--point:${9+i*8}%;--offset:${76-i*11}%"></span>`).join('');

function notify(string, isError = false) {
  toast.classList.toggle('error', isError);
  toast.textContent = string;
  toast.hidden = false;
  clearTimeout(modalTimer);
  modalTimer = setTimeout(() => { toast.hidden = true; }, 5200);
}
async function request(input, endpoint = 'site') {
  if (demo && endpoint === 'site') return local(input);
  const response = await fetch('/api/' + endpoint, input ? {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(input), cache:'no-store'
  } : {cache:'no-store'});
  let body;
  try { body = await response.json(); } catch { throw new Error('La connexion au site a échoué.'); }
  if (!response.ok) throw new Error(body.error || 'Une erreur est survenue.');
  return body;
}
async function refresh(force = false) {
  if (busy || pendingRead) return;
  pendingRead = true;
  try {
    const epoch = mutationEpoch;
    const next = await request();
    if (busy || epoch !== mutationEpoch) return;
    store = next;
    lastFetch = Date.now();
    errorState = '';
    const focused = document.activeElement;
    const changed = signature(next) !== painted;
    if (force || (changed && !main.querySelector('form[data-dirty]'))) {
      const inField = focused?.matches('input, textarea, select, summary');
      const current = pageSession()?.quiz;
      const quizShift = path()[0] === 'quiz' && main.dataset.quiz !== current?.stage + ':' + current?.index;
      if (force || !inField || quizShift) render();
    }
    tick();
  } catch (error) {
    if (!store || force) { errorState = error.message; render(); }
  } finally { pendingRead = false; }
}
async function change(kind, data = {}, session = pageSession()?.id, message) {
  if (busy) return false;
  busy = true;
  mutationEpoch++;
  const initiating = document.activeElement;
  if (initiating instanceof HTMLButtonElement) initiating.disabled = true;
  try {
    store = await request({ kind, data, session });
    lastFetch = Date.now();
    if (kind === 'review') reviewGrade = { session, ...store.result, answers:data.answers };
    render();
    if (message) notify(message);
    return true;
  } catch (error) { notify(error.message,true); return false; }
  finally {
    busy = false;
    if (initiating instanceof HTMLButtonElement && initiating.isConnected) initiating.disabled = false;
  }
}
function timing(value) {
  return `<div class="timing">Clôture le <strong>${date(value)}</strong> · <span data-countdown="${value}">${outlook(value, store.now)}</span></div>`;
}
function tick() {
  for (const item of document.querySelectorAll('[data-countdown]')) item.textContent = outlook(Number(item.dataset.countdown), Date.now() + (demo ? (store?.now ?? Date.now()) - lastFetch : 0));
  if (recordingTime) {
    const timer = document.querySelector('#recordTimer');
    if (timer) {
      const secs = Math.floor((Date.now()-recordingTime)/1000);
      timer.textContent = `${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`;
    }
  }
}
let lastFetch = Date.now();
function votePanel(s) {
  const v = s.vote;
  if (selectedRound !== s.id + ':' + v.round) {
    selectedRound = s.id + ':' + v.round;
    selected = '';
  }
  if (v.state === 'decision') return panelWrap('<h2>Le thème sera annoncé ici</h2><p class="muted">L’équipe va départager les thèmes arrivés en tête.</p>');
  if (v.state !== 'open') return '';
  return panelWrap(`<div class="panel-head"><div><h2>Choisis le thème du cours</h2><p class="muted">Sélectionne le sujet que tu aimerais aborder.</p></div><span class="tag">${v.round === 2 ? 'Second tour' : 'Vote ouvert'}</span></div>
    ${timing(v.end)}<div class="choices" aria-label="Thèmes proposés">${v.eligible.map((t,i) => `<button type="button" class="choice" data-do="select" data-index="${i}" aria-pressed="${t === (v.voted || selected)}" ${v.voted?'disabled':''}><span>${String.fromCharCode(65+i)}</span>${h(t)}</button>`).join('')}</div>
    ${v.voted ? `<div class="notice" role="status">Ton vote pour <strong>${h(v.voted)}</strong> a été enregistré.</div>` : btn('Valider mon vote','vote','lime',selected ? '' : 'disabled')}`);
}
function threadsPanel(s, isAdmin = false) {
  if (!s.vote.winner) return '';
  const threads = s.threads.filter(t => isAdmin || !t.hidden).slice().sort((a,b) => b.support - a.support || b.at - a.at);
  const canPost = s.threadsOpen;
  return panelWrap(`<div class="panel-head"><div><h2>Questions sur ${h(s.vote.winner)}</h2><p class="muted">${canPost?'Pose ta question ou soutiens celles que tu aimerais voir abordées.':'Les contributions sont fermées. Tu peux consulter les échanges.'}</p></div><span class="tag ${canPost?'green':''}">${canPost?'Ouvert':'Fermé'}</span></div>
    ${canPost && !s.after.threads ? timing(s.questionsEnd) : ''}
    ${canPost ? `<form data-form="question" data-session="${s.id}">${area('Ta question','text','','required maxlength="1800"')}${field('Prénom ou pseudo (facultatif)','name','maxlength="50"')}${submit('Publier ma question','lime')}</form>`:''}
    ${threads.length ? threads.map(t => `<article class="thread">
      <span class="meta">${h(t.name || 'Anonyme')} · ${date(t.at)}${t.hidden?' · Masquée':''}</span><p>${h(t.text)}</p>
      <div class="inline">${canPost ? btn(`♥ ${t.support} · ${t.supported?'Retirer mon soutien':'Je me pose aussi la question'}`,'support',t.supported?'light small':'outline small',`data-session="${s.id}" data-id="${t.id}" aria-pressed="${t.supported}"`) : `<span class="meta">${t.support} soutien${t.support===1?'':'s'}</span>`}
      ${isAdmin ? btn(t.hidden?'Rétablir':'Masquer','moderate','danger small',`data-session="${s.id}" data-id="${t.id}"`) : ''}</div>
      ${t.comments.length || canPost ? `<details data-key="${t.id}"><summary>${t.comments.length ? `${t.comments.length} commentaire${t.comments.length===1?'':'s'}`:'Commenter'}</summary>
        ${t.comments.filter(c=>isAdmin||!c.hidden).map(c => `<div class="comment"><span class="meta">${c.official?'Équipe Moadon':h(c.name || 'Anonyme')}${c.hidden?' · Masqué':''}</span><p>${h(c.text)}</p>${isAdmin ? btn(c.hidden?'Rétablir':'Masquer','moderate','danger small',`data-session="${s.id}" data-id="${t.id}" data-comment="${c.id}"`) : ''}</div>`).join('')}
        ${canPost ? `<form data-form="comment" data-session="${s.id}" data-id="${t.id}">${field('Ton commentaire','text','required maxlength="1000"')}${field('Prénom ou pseudo (facultatif)','name','maxlength="50"')}${submit('Envoyer','light')}</form>` : ''}</details>` : ''}
    </article>`).join('') : '<p class="muted empty">Les questions s’afficheront ici.</p>'}`);
}
function chatPanel(s, isAdmin = false) {
  if (!s.after.chat && !s.after.messages.length && !isAdmin) return '';
  return panelWrap(`<div class="panel-head"><h2>Chat avec l’intervenant</h2><span class="tag ${s.after.chat?'green':''}">${s.after.chat?'En direct':'Fermé'}</span></div>
    ${s.after.messages.filter(m=>isAdmin||!m.hidden).map(m => `<div class="log-item"><span class="meta">${m.official?'Équipe Moadon':h(m.name||'Anonyme')} · ${date(m.at)}${m.hidden?' · Masqué':''}</span><p>${h(m.text)}</p>
    ${isAdmin ? btn(m.hidden?'Rétablir':'Masquer','moderateChat','danger small',`data-id="${m.id}" data-session="${s.id}"`) : ''}</div>`).join('')}
    ${s.after.chat ? `<form data-form="chat" data-session="${s.id}">${field('Ton message','text','required maxlength="800"')}${field('Prénom ou pseudo (facultatif)','name','maxlength="50"')}${submit('Envoyer','lime')}</form>` : ''}`);
}
function archiveLinks() {
  const archived = store.sessions.filter(s => s.archived);
  return archived.length ? panelWrap(`<h2>Anciens cours</h2>${archived.map(s=>`<div class="rank-row"><a href="#archive/${s.id}">${h(s.vote.winner || s.title)}</a>${s.resources.published?'<span class="tag green">Ressources</span>':''}</div>`).join('')}`) : '';
}
function course() {
  const s = active();
  const index = s?.quiz.stage === 'draft' ? s?.vote.winner ? 1 : 0 : s ? 2 : 0;
  const stages = ['Vote pour le thème','Pose tes questions','Joue au quiz'];
  return `<section class="hero"><div class="hero-copy"><span class="kicker">Cours de Torah participatif</span><h1>Le prochain cours,<br>c’est toi qui le choisis.</h1><p>${h(s?.description || 'Vote pour le thème, pose tes questions et rejoins le quiz du cours.')}</p></div>
    <div class="hero-art" aria-hidden="true">${orbit}<span class="art-book"></span></div></section>
    <ol class="steps" aria-label="Étapes du cours">${stages.map((x,i)=>`<li class="${i===index?'active':i<index?'done':''}" ${i===index?'aria-current="step"':''}><span class="step-mark">${i<index?'✓':i+1}</span>${x}</li>`).join('')}</ol>
    <div class="layout"><div class="stack">
    ${s ? votePanel(s)+threadsPanel(s)+chatPanel(s) : panelWrap('<h2>Le prochain vote est à venir</h2><p class="muted">Les thèmes proposés par l’équipe apparaîtront ici à l’ouverture du vote.</p>')}
    ${archiveLinks()}
    </div><aside class="stack side">
    ${panelWrap(`<div class="sidebar-icon lime" aria-hidden="true">✦</div><h3>Le quiz en salle</h3>
      <p class="muted">${s && s.quiz.stage!=='draft'?'Retrouve le quiz du cours sur ton téléphone.':'Rejoins le quiz depuis ton téléphone dès que l’animateur l’ouvre.'}</p>
      ${s && s.quiz.stage!=='draft'? link(s.quiz.stage==='results'?'Voir mes résultats':'Rejoindre le quiz','quiz/'+s.id,'light'): '<span class="tag">En attente</span>'}`)}
    ${panelWrap(`<div class="sidebar-icon" aria-hidden="true">✎</div><h3>Une idée pour la suite ?</h3><p class="muted">Suggère un thème ou partage un retour à l’équipe Moadon.</p>${link('Proposer une idée','idees','outline')}`)}
    ${s?.resources.published ? panelWrap(`<h3>À retrouver après le cours</h3>${link('Fiche et quiz de révision','ressources/'+s.id,'light')}`) : ''}
    </aside></div>`;
}
function ideas() {
  return section('Boîte à idées','Envoie une idée de thème ou un retour sur le cours à l’équipe Moadon.') +
    panelWrap(`<form data-form="idea">${area('Ton idée ou ton retour','text','','required maxlength="1500"')}${field('Prénom ou pseudo (facultatif)','name','maxlength="50"')}${submit('Envoyer à l’équipe','lime')}</form>`);
}
function personal() {
  const history = store.sessions.map(s => {
    const items = [
      ...s.vote.history.map((theme,i)=>theme ? `Vote (tour ${i+1}) · ${theme}` : ''),
      s.quiz.score != null ? `Quiz en salle · ${s.quiz.score} / ${s.quiz.count}` : '',
      s.resources.score ? `Quiz de révision · ${s.resources.score.score} / ${s.resources.score.total}` : '',
      ...s.threads.flatMap(t => [t.own ? 'Question · ' + t.text : '', ...t.comments.filter(c=>c.own).map(c=>'Commentaire · ' + c.text)])
    ].filter(Boolean);
    return items.length ? panelWrap(`<h2>${h(s.vote.winner || s.title)}</h2><ul>${items.map(i=>`<li>${h(i)}</li>`).join('')}</ul>`) : '';
  }).filter(Boolean);
  const ownIdeas = store.ideas.filter(i=>i.own).map(i=>`<li>${h(i.text)}</li>`).join('');
  return section('Mon espace','Retrouve ici tes contributions et tes scores sur ce navigateur.') +
    '<div class="stack">' + (history.join('') || (!ownIdeas ? panelWrap('<p class="muted">Tes contributions et tes scores apparaîtront ici après ta participation.</p>') : '')) +
    (ownIdeas ? panelWrap(`<h2>Mes idées envoyées</h2><ul>${ownIdeas}</ul>`) : '') + '</div>';
}
function ranking(q) {
  return `<h3>Classement</h3>${q.ranking.length ? q.ranking.map((e,i)=>`<div class="rank-row"><span>${i+1}. ${h(e.name)}</span><strong>${e.score} / ${q.count}</strong></div>`).join(''):'<p class="muted">Aucun participant.</p>'}`;
}
function distributions(q) {
  return q.results.map((item,i)=>`<div class="thread"><h3>${i+1}. ${h(item.text)}</h3>${item.options.map((o,j)=>`<div class="bar-label"><span class="${j===item.correct?'result-line':''}">${j===item.correct?'✓ ':''}${h(o)}</span><strong>${item.totals[j]}</strong></div><progress value="${item.totals[j]}" max="${Math.max(1,q.participants)}" aria-label="${h(o)}"></progress>`).join('')}</div>`).join('');
}
function quiz(s, projector = false) {
  if (!s) return section('Quiz en salle','Le quiz sera accessible pendant le cours.');
  const q = s.quiz;
  let body;
  if (q.stage === 'draft') body = panelWrap('<h2>En attente de l’animateur</h2><p class="muted">Le quiz s’ouvrira ici à la fin du cours.</p>');
  else if (q.stage === 'results') body = `<div class="layout"><div class="stack">${panelWrap(`<h2>Les réponses de la salle</h2>${!projector && q.score!=null?`<p class="score-card">Ton score · ${q.score} / ${q.count}</p>`:''}${distributions(q)}`)}</div>${panelWrap(ranking(q))}</div>`;
  else if (!q.joined && !projector) body = panelWrap(`<h2>Rejoins le quiz</h2><p class="muted">Le pseudo sera affiché dans le classement final.</p><form data-form="join" data-session="${s.id}">${field('Ton pseudo','name','required maxlength="30" autocomplete="off"')}${submit('Entrer dans le quiz','lime')}</form>`);
  else if (q.stage === 'lobby') body = panelWrap(`<h2>En attente du départ</h2><p>${q.participants} participant${q.participants===1?'':'s'}</p>${!projector?`<p class="muted">Tu joues sous le pseudo ${h(q.joined)}.</p>`:''}`);
  else body = panelWrap(`<span class="tag">Question ${q.index+1} sur ${q.count}</span><h2>${h(q.question)}</h2>
    <div class="choices">${q.options.map((o,i)=>projector?`<div class="choice"><span>${String.fromCharCode(65+i)}</span>${h(o)}</div>` :
      `<button class="choice" type="button" data-do="answer" data-session="${s.id}" data-index="${i}" aria-pressed="${q.choice===i}" ${q.choice!=null||q.stage==='locked'?'disabled':''}><span>${String.fromCharCode(65+i)}</span>${h(o)}</button>`).join('')}</div>
    <div class="notice">${projector ? `${q.responses} réponse${q.responses===1?'':'s'} reçue${q.responses===1?'':'s'}` : q.choice!=null?'Ta réponse a été enregistrée.':q.stage==='locked'?'Les réponses à cette question sont closes.':'Choisis une réponse.'}</div>`);
  return `<div class="${projector?'projector':''}">${section('Quiz en salle',h(s.vote.winner||s.title))}${body}</div>`;
}
function resources(s) {
  if (!s?.resources.published) return panelWrap('<h2>Les ressources seront disponibles après publication par l’équipe.</h2>');
  const r = s.resources;
  const grade = reviewGrade?.session === s.id ? reviewGrade : null;
  return section('Après le cours',h(s.vote.winner||s.title)) + `<div class="stack">
    ${r.summary ? panelWrap(`<div class="panel-head"><h2>Fiche récapitulative</h2>${btn('Imprimer','print','outline small noprint')}</div><div class="recap">${h(r.summary)}</div>`):''}
    ${r.review.length ? panelWrap(`<h2>Quiz de révision</h2>
      ${grade ? `<p class="score-card" role="status">Ton score · ${grade.score} / ${grade.total}</p>`:r.score?`<p class="muted">Dernier score · ${r.score.score} / ${r.score.total}</p>`:''}
      <form data-form="review" data-session="${s.id}">${r.review.map((q,i)=>`<fieldset><legend>${i+1}. ${h(q.text)}</legend>${q.options.map((o,j)=>`<label class="${grade?.correct[i]===j?'result-line':''}"><input type="radio" name="review-${i}" value="${j}" required ${grade?.answers[i]===j?'checked':''}> ${h(o)}${grade?.correct[i]===j?' ✓':''}</label>`).join('')}</fieldset>`).join('')}${submit(grade?'Vérifier à nouveau':'Vérifier mes réponses','lime')}</form>`,'noprint'):''}
    </div>`;
}
function questionEditor(items) {
  return `<div data-editor>${items.map((q,i)=>editorRow(q,i+1)).join('')}</div><p>${btn('Ajouter une question','addQuestion','outline small')}</p>`;
}
function editorRow(q = {text:'',options:['','',''],correct:0}, number = '') {
  const options = [...q.options];
  while (options.length < 4) options.push('');
  return `<fieldset data-row><legend>Question ${number}</legend>
    ${field('Énoncé','questionText',`required maxlength="350" value="${h(q.text)}"`)}
    <div class="form-grid">${options.map((o,i)=>field('Choix '+(i+1)+(i>1?' (facultatif)':''),'option',`maxlength="240" value="${h(o)}" ${i<2?'required':''}`)).join('')}</div>
    <label>Bonne réponse<select name="correct">${options.map((_,i)=>`<option value="${i}" ${i===q.correct?'selected':''}>Choix ${i+1}</option>`).join('')}</select></label>
    ${btn('Retirer cette question','removeQuestion','danger small')}
  </fieldset>`;
}
function editQuestions(form) {
  return [...form.querySelectorAll('[data-row]')].map(row=>{
    const options = [...row.querySelectorAll('[name=option]')].map(x=>x.value.trim());
    const correct = Number(row.querySelector('[name=correct]').value);
    if (!options[correct]) throw new Error('La bonne réponse doit correspondre à un choix renseigné.');
    return {text:row.querySelector('[name=questionText]').value, options:options.filter(Boolean), correct:options.slice(0,correct).filter(Boolean).length};
  });
}
function management(s) {
  let body = '';
  if (!active()) {
    body += panelWrap(`<h2>Ouvrir un nouveau vote</h2><form data-form="setup">
      ${field('Titre de la séance','title','required maxlength="100" placeholder="Le prochain cours de Torah"')}
      ${area('Présentation (facultative)','description','','maxlength="450"')}
      ${area('Thèmes proposés, un par ligne','themes','','required placeholder="Chabbat\nPrière\nCacherout"')}
      <div class="form-grid">${field('Clôture du vote · heure de Paris','end',`type="datetime-local" required value="${parisInput(store.now+86400000)}"`)}
      ${field('Durée du second tour (heures)','runoff','type="number" min="0.25" max="168" step="0.25" required value="8"')}
      ${field('Clôture des questions · heure de Paris','questionsEnd',`type="datetime-local" required value="${parisInput(store.now+3*86400000)}"`)}</div>
      ${submit('Publier le vote','lime')}</form>`);
  }
  if (!s) return body;
  const v = s.vote;
  const quizActive = ['lobby','question','locked'].includes(s.quiz.stage);
  body += panelWrap(`<div class="panel-head"><div><h2>${h(s.title)}</h2><p class="muted">${s.archived?'Cours archivé':v.winner?'Thème retenu · '+h(v.winner):v.state==='open'?'Vote en cours · tour '+v.round:'Vote clôturé'}</p></div></div>
    ${v.totals ? Object.entries(v.totals).map(([t,n])=>`<div class="rank-row"><span>${h(t)}</span><strong>${n} vote${n===1?'':'s'}</strong></div>`).join('') : ''}
    ${v.state==='decision' && !s.archived ? `<h3>Départager les thèmes</h3><div class="inline">${v.eligible.map((t,i)=>btn(h(t),'pick','outline',`data-index="${i}" data-session="${s.id}"`)).join('')}</div>` : ''}
    ${v.state === 'open' && demo ? btn('Simuler la clôture du vote','demoClose','light small') : ''}
    ${!s.archived && v.state === 'done' && !quizActive ? '<p>'+btn('Archiver ce cours','archive','outline small',`data-session="${s.id}"`)+'</p>' : ''}`);
  if (v.winner) {
    body += panelWrap(`<h2>Gérer les échanges</h2>
      ${!s.archived?`<form data-form="deadline" data-session="${s.id}">${field('Clôture des contributions · heure de Paris','end',`type="datetime-local" required value="${parisInput(s.questionsEnd)}"`)}${submit('Modifier la clôture','outline small')}</form>`:''}
      <form data-form="after" data-session="${s.id}"><label><input type="checkbox" name="threads" ${s.after.threads?'checked':''}> Rouvrir les fils de questions</label>
      <label><input type="checkbox" name="chat" ${s.after.chat?'checked':''}> Ouvrir le chat avec l’intervenant</label>${submit('Enregistrer les réglages','light')}</form>`);
    body += threadsPanel(s,true) + chatPanel(s,true);
  }
  return body;
}
function quizAdmin(s) {
  const q = s.quiz;
  const attr = `data-session="${s.id}"`;
  const status = {draft:'Brouillon',lobby:'Salle ouverte',question:'Réponses ouvertes',locked:'Réponses fermées',results:'Résultats disponibles'}[q.stage];
  return panelWrap(`<div class="panel-head"><h2>Quiz en salle</h2><span class="tag">${status}</span></div>
    ${q.stage === 'draft' ? `<form data-form="quizEditor" data-session="${s.id}">${questionEditor(q.questions)}${submit('Enregistrer le quiz','lime')}</form>` :
      `<p>${q.participants} participant${q.participants===1?'':'s'}${q.index>=0?` · Question ${q.index+1} sur ${q.count} · ${q.responses} réponse${q.responses===1?'':'s'}`:''}</p>`}
    <div class="inline">
      ${q.stage==='draft' && q.questions.length && s.vote.winner && !s.archived ? btn('Ouvrir la salle','quizStart','',attr):''}
      ${q.stage==='lobby' ? btn('Lancer la première question','quizNext','lime',attr):''}
      ${q.stage==='question' ? btn('Fermer les réponses','quizLock','lime',attr):''}
      ${q.stage==='locked' ? btn(q.index+1===q.count?'Afficher les résultats':'Lancer la question suivante','quizNext','lime',attr):''}
      ${q.stage==='question' || q.stage==='locked'?btn('Rafraîchir le compteur','refresh','outline small'):''}
      <a class="btn outline" href="#projection/${s.id}" target="_blank" rel="noopener">Ouvrir l’écran de projection</a>
      ${q.stage!=='draft'?link('Vue participant','quiz/'+s.id,'outline'):''}
    </div>`);
}
function audioPanel(s) {
  const recordings = new Map();
  for (const a of s.audio || []) {
    if (!recordings.has(a.recording)) recordings.set(a.recording,[]);
    recordings.get(a.recording).push(a);
  }
  const data = generatedDraft?.session === s.id ? generatedDraft : s.resources;
  return panelWrap(`<h2>Enregistrement audio</h2><p class="muted">Utilise le micro de cet appareil. Informe les personnes enregistrées avant de démarrer et garde cette page ouverte pendant le cours.</p>
    ${record ? '<p class="recording">Enregistrement en cours · <span id="recordTimer">0:00</span></p>'+btn('Arrêter l’enregistrement','stopRecord','danger') :
      btn('Démarrer l’enregistrement','record','lime',`data-session="${s.id}" ${s.vote.winner?'':'disabled'}`)}
    ${!demo && !record ? btn('Reprendre les transferts audio','resumeAudio','outline small',`data-session="${s.id}"`) : ''}
    ${demo ? '<p class="meta">Dans cet aperçu, l’enregistrement reste sur cet appareil. La transcription et la génération utilisent les services configurés en production.</p>' : ''}
    <p id="generationStatus" class="meta" role="status">${h(generateStatus)}</p>
    ${[...recordings].reverse().map(([key,parts])=>`<div class="rank-row"><span>Enregistrement · ${parts.length} segment${parts.length===1?'':'s'} · ${parts.filter(a=>a.transcript!=null).length} transcrit(s)</span>${btn('Générer un brouillon','generate','light small',`data-session="${s.id}" data-id="${key}"`)}</div>`).join('')}
    <div id="localAudio"></div>`) + panelWrap(`<div class="panel-head"><h2>Fiche et quiz de révision</h2><span class="tag ${s.resources.published?'green':''}">${s.resources.published?'Publié':'Brouillon'}</span></div>
    <form data-form="resources" data-session="${s.id}">${area('Fiche récapitulative','summary',data.summary,'maxlength="30000" rows="9"')}
    <details><summary>Transcription (interne)</summary>${area('Texte à relire','transcript',data.transcript,'maxlength="160000" rows="6"')}</details>
    <h3>Quiz de révision</h3>${questionEditor(data.review||[])}
    <label><input type="checkbox" name="published" ${s.resources.published && !generatedDraft?'checked':''}> Publier la fiche et le quiz sur le site</label>
    ${submit('Enregistrer les ressources','lime')}</form>`);
}
function adminPage() {
  if (!store.admin) return section('Espace équipe','Gère les votes, les échanges et les quiz du cours.') + panelWrap(demo ?
    btn('Entrer dans le back-office de démonstration','demoLogin','lime') :
    `<form data-form="login">${field('Code administrateur','code','type="password" required maxlength="256" autocomplete="current-password"')}${submit('Se connecter','lime')}</form>`);
  const s = managed();
  const tabs = [['gestion','Cours et échanges'],['quiz','Quiz en salle'],['audio','Audio et ressources'],['idees','Propositions']];
  return section('Back-office','Gère les séances du cours de Torah Moadon.') +
    `<div class="inline noprint">${s ? `<label>Choisir une séance<select id="staffSession">${store.sessions.map(item=>`<option value="${item.id}" ${item.id===s.id?'selected':''}>${h(item.vote.winner || item.title)}${item.archived?' · Archivé':''}</option>`).join('')}</select></label>` : ''}${btn('Se déconnecter','logout','outline small')}${demo?btn('Réinitialiser la démo','demoReset','outline small'):''}</div>
    <div class="section-tabs">${tabs.map(([key,title])=>btn(title,'tab','outline small',`data-id="${key}" aria-pressed="${panel===key}"`)).join('')}</div>
    <div class="stack">${panel==='gestion'?management(s):panel==='quiz'&&s?quizAdmin(s):panel==='audio'&&s?audioPanel(s):panel==='idees'?
      panelWrap(`<h2>Propositions reçues</h2>${store.ideas.length?store.ideas.map(i=>`<div class="log-item"><span class="meta">${h(i.name || 'Anonyme')} · ${date(i.at)} · ${i.read?'Lue':'À lire'}</span><p>${h(i.text)}</p>${btn(i.read?'Marquer comme non lue':'Marquer comme lue','readIdea','outline small',`data-id="${i.id}"`)}</div>`).join(''):'<p class="muted">Les propositions arriveront ici.</p>'}`) :
      panelWrap('<p class="muted">Crée d’abord une séance dans « Cours et échanges ».</p>')}</div>`;
}
function render() {
  const [page] = path();
  const current = page || 'cours';
  const s = pageSession();
  const details = [...main.querySelectorAll('details[data-key][open]')].map(x=>x.dataset.key);
  for (const nav of document.querySelectorAll('[data-link]')) {
    if (nav.dataset.link === current) nav.setAttribute('aria-current','page');
    else nav.removeAttribute('aria-current');
  }
  main.setAttribute('aria-busy','false');
  main.dataset.quiz = s?.quiz.stage + ':' + s?.quiz.index;
  if (errorState) { main.innerHTML = panelWrap(`<h2>Le cours est momentanément inaccessible</h2><p>${h(errorState)}</p>${btn('Réessayer','refresh','lime')} ${link('Ouvrir la démonstration','demo-help','outline')}`); return; }
  if (!store) return;
  painted = signature(store);
  switch (current) {
    case 'idees': main.innerHTML = ideas(); break;
    case 'perso': main.innerHTML = personal(); break;
    case 'quiz':
    case 'projection': main.innerHTML = quiz(s,current==='projection'); break;
    case 'ressources': main.innerHTML = resources(s); break;
    case 'archive':
      main.innerHTML = s ? section(h(s.vote.winner||s.title),'Cours passé') + `<div class="stack">${threadsPanel(s)}${chatPanel(s)}${s.quiz.stage==='results'?link('Résultats du quiz','quiz/'+s.id,'outline'):''}${s.resources.published?link('Fiche et quiz de révision','ressources/'+s.id,'light'):''}</div>` : course();
      break;
    case 'admin': main.innerHTML = adminPage(); break;
    default: main.innerHTML = course();
  }
  for (const item of main.querySelectorAll('details[data-key]')) item.open = details.includes(item.dataset.key);
  if (demo && current === 'admin' && panel === 'audio') attachLocalAudio();
}
main.addEventListener('input',event=>{
  const form = event.target.closest('form');
  if (form) form.dataset.dirty = 'true';
});
main.addEventListener('change',event=>{
  if (event.target.id === 'staffSession') {
    if (main.querySelector('form[data-dirty]') && !confirm('Changer de séance sans enregistrer les modifications ?')) {
      event.target.value = managed()?.id || '';
      return;
    }
    staffSession = event.target.value;
    render();
  }
});
main.addEventListener('submit',async event=>{
  const form = event.target;
  const kind = form.dataset.form;
  if (!kind) return;
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(form));
  const session = form.dataset.session;
  const messages = { question:'Ta question a été publiée.',comment:'Commentaire publié.',chat:'Message envoyé.',idea:'Ton idée a été envoyée à l’équipe.',after:'Réglages enregistrés.' };
  try {
    if (kind === 'create' || kind === 'setup') {
      if (await change('create',{...fields,end:fromParis(fields.end),questionsEnd:fromParis(fields.questionsEnd),themes:fields.themes.split(/\n/)},undefined,'Le vote est ouvert.')) {
        staffSession = active()?.id || '';
        render();
      }
    } else if (kind === 'deadline') await change(kind,{end:fromParis(fields.end)},session,'Clôture mise à jour.');
    else if (kind === 'after') await change(kind,{threads:!!fields.threads,chat:!!fields.chat},session,messages.after);
    else if (kind === 'quizEditor') await change('saveQuiz',{questions:editQuestions(form)},session,'Quiz enregistré.');
    else if (kind === 'resources') {
      if (await change('saveResources',{...fields,review:editQuestions(form),published:!!fields.published},session,fields.published?'Ressources publiées.':'Brouillon enregistré.')) {
        generatedDraft = undefined;
        render();
      }
    } else if (kind === 'review') await change(kind,{answers:pageSession().resources.review.map((_,i)=>Number(fields['review-'+i]))},session);
    else await change(kind,{...fields,id:form.dataset.id},session,messages[kind]);
  } catch (error) { notify(error.message,true); }
});
main.addEventListener('click',async event=>{
  const target = event.target.closest('[data-do]');
  if (!target || target.disabled) return;
  const { do:kind,index,id,session,comment } = target.dataset;
  const s = pageSession();
  if (kind === 'select') {
    selected = s.vote.eligible[Number(index)];
    for (const choice of main.querySelectorAll('[data-do=select]')) choice.setAttribute('aria-pressed',String(choice === target));
    main.querySelector('[data-do=vote]').disabled = false;
  } else if (kind === 'vote') await change('vote',{theme:selected,round:s.vote.round},s.id,'Vote enregistré.');
  else if (kind === 'pick') await change(kind,{theme:managed().vote.eligible[Number(index)]},session,'Thème annoncé.');
  else if (kind === 'answer') await change(kind,{choice:Number(index),index:s.quiz.index},session);
  else if (kind === 'tab') {
    if (main.querySelector('form[data-dirty]') && !confirm('Changer d’onglet sans enregistrer les modifications ?')) return;
    panel = id;
    render();
  } else if (kind === 'addQuestion' || kind === 'removeQuestion') {
    const form = target.closest('form');
    const editor = form.querySelector('[data-editor]');
    if (kind === 'removeQuestion') target.closest('[data-row]').remove();
    else editor.insertAdjacentHTML('beforeend',editorRow());
    [...editor.querySelectorAll('legend')].forEach((e,i)=>{e.textContent='Question '+(i+1);});
    form.dataset.dirty = 'true';
    if (kind === 'addQuestion') editor.lastElementChild.querySelector('input').focus();
  } else if (kind === 'print') window.print();
  else if (kind === 'demoLogin') await change('login');
  else if (kind === 'archive') {
    if (confirm('Archiver ce cours et libérer la place pour le prochain vote ?')) await change(kind,{},session,'Cours archivé.');
  } else if (kind === 'demoReset') {
    if (confirm('Effacer les interactions de cette démonstration ?')) {staffSession=''; await change(kind);}
  } else if (kind === 'record') await startRecording(session);
  else if (kind === 'stopRecord') stopRecording();
  else if (kind === 'resumeAudio') await uploadPending(session);
  else if (kind === 'generate') await generate(session,id);
  else if (kind === 'refresh') await refresh(true);
  else await change(kind,{id,comment},session);
});
window.addEventListener('hashchange',()=>{
  if (path()[0] === 'demo-help') { location.href = '?demo=1#cours'; return; }
  render();
  window.scrollTo(0,0);
});

const audioDbName = demo ? 'moadon-demo-audio-v1' : 'moadon-course-audio-v1';
let transfers = false;
let mediaUrls = [];
let audioDb;
function connectAudioDb() {
  audioDb ??= new Promise((resolve,reject)=>{
    const opening = indexedDB.open(audioDbName,1);
    opening.onupgradeneeded = () => opening.result.createObjectStore('segments',{keyPath:'key'});
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error);
  });
  return audioDb;
}
async function audioOperation(mode, action) {
  const db = await connectAudioDb();
  return new Promise((resolve,reject)=>{
    const transaction = db.transaction('segments',mode);
    const request = action(transaction.objectStore('segments'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
const allSegments = () => audioOperation('readonly',items=>items.getAll());
const putSegment = segment => audioOperation('readwrite',items=>items.put(segment));
const deleteSegment = key => audioOperation('readwrite',items=>items.delete(key));
const audioSettings = {'audio/webm':'webm','audio/mp4':'m4a','audio/ogg':'ogg'};
async function attachLocalAudio() {
  const container = document.querySelector('#localAudio');
  if (!container) return;
  try {
    const saved = (await allSegments()).filter(a => a.session === managed()?.id);
    if (!container.isConnected) return;
    for (const url of mediaUrls) URL.revokeObjectURL(url);
    mediaUrls = [];
    container.innerHTML = saved.map(a=>{
      const url = URL.createObjectURL(a.blob);
      mediaUrls.push(url);
      return `<div class="rank-row"><audio controls preload="none" src="${url}"></audio><a class="btn outline small" href="${url}" download="cours-${a.index+1}.${audioSettings[a.mime]}">Télécharger</a></div>`;
    }).join('');
  } catch { /* Recording reports access failures when used. */ }
}
function statusAudio(message) {
  generateStatus = message;
  const status = document.querySelector('#generationStatus');
  if (status) status.textContent = message;
}
async function startRecording(session) {
  if (record || transfers) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    notify('L’enregistrement nécessite un navigateur compatible et une page sécurisée.',true);
    return;
  }
  if (!confirm('Le micro enregistrera l’intervenant et les voix audibles dans la salle. Les personnes concernées ont été informées ?')) return;
  let stream;
  try {
    await connectAudioDb();
    stream = await navigator.mediaDevices.getUserMedia({audio:true});
    const mimeType = ['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
    if (!mimeType) throw new Error('Aucun format audio compatible sur cet appareil.');
    record = {session,stream,mimeType,recording:crypto.randomUUID(),index:0,stopping:false};
    recordingTime = Date.now();
    statusAudio('');
    recordSegment(record);
    render();
  } catch (error) {
    stream?.getTracks().forEach(track=>track.stop());
    record = undefined;
    recordingTime = undefined;
    notify(error.name==='NotAllowedError'?'Autorise le micro pour enregistrer.':error.message,true);
  }
}
function recordSegment(context) {
  const parts = [];
  const rec = new MediaRecorder(context.stream,{mimeType:context.mimeType,audioBitsPerSecond:48000});
  context.rec = rec;
  rec.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
  rec.addEventListener('error',()=>{
    context.stopping = true;
    clearTimeout(context.timer);
    if (rec.state !== 'inactive') rec.stop();
    else finishRecording(context);
    notify('Le micro a interrompu l’enregistrement. Les segments déjà conservés restent accessibles.',true);
  });
  rec.onstop = async () => {
    const index = context.index++;
    const mime = rec.mimeType.split(';')[0];
    const blob = new Blob(parts,{type:mime});
    const save = blob.size >= 64 ? putSegment({key:context.recording+':'+index,session:context.session,recording:context.recording,index,mime,blob}) : Promise.resolve();
    try {
      if (!context.stopping && context.index < 240) recordSegment(context);
      else context.stopping = true;
      await save;
      if (context.stopping && context.rec === rec) await finishRecording(context);
    } catch (error) {
      if (context.rec !== rec && context.rec.state !== 'inactive') stopRecording();
      else await finishRecording(context);
      notify('Enregistrement interrompu : '+error.message,true);
    }
  };
  rec.start();
  context.timer = setTimeout(()=>{if (rec.state === 'recording') rec.stop();},30000);
}
function stopRecording() {
  if (!record) return;
  record.stopping = true;
  clearTimeout(record.timer);
  if (record.rec.state === 'recording') record.rec.stop();
}
async function finishRecording(context) {
  if (record !== context) return;
  record = undefined;
  recordingTime = undefined;
  context.stream.getTracks().forEach(track=>track.stop());
  statusAudio('Enregistrement terminé.');
  render();
  if (!demo) await uploadPending(context.session);
}
function readBase64(blob) {
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
async function uploadPending(session) {
  if (transfers || record || demo) return;
  transfers = true;
  try {
    const items = (await allSegments()).filter(a=>a.session === session);
    for (let i=0;i<items.length;i++) {
      const {recording,index,mime,blob,key} = items[i];
      statusAudio(`Envoi de l’audio · ${i+1} / ${items.length}`);
      await request({kind:'upload',session,recording,index,mime,base64:await readBase64(blob)},'audio');
      await deleteSegment(key);
    }
    statusAudio(items.length ? 'L’enregistrement est disponible pour la transcription.' : 'Aucun segment en attente sur cet appareil.');
    await refresh(true);
  } catch (error) {
    statusAudio('Transfert interrompu. Les segments non envoyés restent sur cet appareil.');
    notify(error.message,true);
  } finally { transfers = false; }
}
async function generate(session, recording) {
  if (transfers || record) return;
  if (main.querySelector('form[data-dirty]') && !confirm('Remplacer les modifications en cours par le brouillon généré ?')) return;
  if (generatedDraft?.session === session && !confirm('Remplacer le brouillon actuellement affiché ?')) return;
  const target = store.sessions.find(s=>s.id===session);
  const segments = target.audio.filter(a=>a.recording===recording).sort((a,b)=>a.index-b.index);
  transfers = true;
  try {
    for (let i=0;i<segments.length;i++) {
      statusAudio(`Transcription de l’audio · ${i+1} / ${segments.length}`);
      if (segments[i].transcript == null) await request({kind:'transcribe',session,path:segments[i].path},'audio');
    }
    statusAudio('Préparation de la fiche et du quiz de révision…');
    const draft = await request({kind:'generate',session,recording},'audio');
    generatedDraft = {...draft,session};
    statusAudio('Brouillon prêt. Vérifie le contenu, les références et les bonnes réponses avant de publier.');
    await refresh(true);
  } catch (error) {
    statusAudio('Génération interrompue. Tu peux la relancer.');
    notify(error.message,true);
  } finally { transfers = false; }
}
window.addEventListener('beforeunload',event=>{
  if (!record && !transfers && !main.querySelector('form[data-dirty]')) return;
  event.preventDefault();
});
refresh(true);
setInterval(()=>{
  if (!document.hidden) refresh();
}, 2400);
setInterval(tick,1000);
