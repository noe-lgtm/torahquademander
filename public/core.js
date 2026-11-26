export class Invalid extends Error {}
export const blank = () => ({ sessions: [], ideas: [] });
const need = (ok, message) => { if (!ok) throw new Invalid(message); };
const value = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const required = (v, max, label) => {
  const str = value(v, max);
  need(str, label);
  return str;
};
const id = () => crypto.randomUUID();
const questionList = (data, limit = 25) => {
  need(Array.isArray(data) && data.length <= limit, 'Vérifie le nombre de questions.');
  return data.map(q => {
    const options = Array.isArray(q?.options) ? q.options.map(x => value(x, 240)) : [];
    need(options.length >= 2 && options.length <= 6 && options.every(Boolean), 'Chaque question doit avoir entre 2 et 6 choix.');
    need(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < options.length, 'Sélectionne une bonne réponse par question.');
    return { text: required(q.text, 350, 'Saisis le texte de la question.'), options, correct: q.correct };
  });
};

export function advance(db, now = Date.now()) {
  const s = db.sessions.find(x => !x.archived);
  if (!s || s.vote.state !== 'open' || now < s.vote.end) return false;
  // Use the actual closing time so a late visit cannot extend an election.
  for (let count = 0; count < 2 && s.vote.state === 'open' && now >= s.vote.end; count++) {
    const vote = s.vote;
    const totals = vote.eligible.map(theme => [theme, Object.values(vote.ballots).filter(x => x === theme).length]);
    const high = Math.max(...totals.map(x => x[1]));
    const tied = totals.filter(x => x[1] === high).map(x => x[0]);
    if (high > 0 && tied.length === 1) {
      vote.winner = tied[0];
      vote.state = 'done';
    } else if (vote.round === 1 && high > 0) {
      s.vote = { ...vote, eligible: tied, round: 2, end: vote.end + vote.runoffMs, firstBallots: vote.ballots, ballots: {} };
    } else {
      vote.eligible = tied;
      vote.state = 'decision';
    }
  }
  return true;
}

const threadsOpen = (s, now) => s.after.threads || (!s.archived && now < s.questionsEnd);

export function action(db, input, actor, isAdmin, now = Date.now()) {
  const { kind, data = {} } = input;
  if (kind === 'idea') {
    need(db.ideas.length < 1500, 'La boîte à idées est pleine.');
    need(db.ideas.filter(x => x.actor === actor).length < 20, 'Limite de propositions atteinte.');
    db.ideas.unshift({ id: id(), actor, text: required(data.text, 1500, 'Écris ton idée.'), name: value(data.name, 50), at: now, read: false });
    return;
  }
  if (kind === 'create') {
    need(isAdmin, 'Connecte-toi au back-office.');
    need(!db.sessions.some(x => !x.archived), 'Archive le cours en cours avant d’en créer un autre.');
    const end = Number(data.end);
    const questionsEnd = Number(data.questionsEnd);
    const hours = Number(data.runoff);
    need(end > now && end < now + 366 * 86400000, 'Choisis une date de clôture du vote à venir.');
    need(hours >= 0.25 && hours <= 168, 'Le second tour doit durer entre 15 minutes et 7 jours.');
    need(questionsEnd > end + hours * 3600000 && questionsEnd < now + 366 * 86400000, 'Prévois une clôture des questions après la fin possible du second tour.');
    const themes = Array.isArray(data.themes) ? data.themes.map(t => value(t, 80)).filter(Boolean) : [];
    need(themes.length >= 2 && themes.length <= 12 && new Set(themes.map(t => t.toLowerCase())).size === themes.length, 'Ajoute entre 2 et 12 thèmes distincts.');
    const courseAt = data.courseAt == null ? null : Number(data.courseAt);
    need(courseAt == null || Number.isFinite(courseAt) && courseAt > now, 'Choisis une date de cours à venir.');
    const title = required(data.title, 100, 'Donne un titre au cours.');
    db.sessions.unshift({
      id: id(), title, courseAt, hooks: Object.fromEntries(themes.map(t => [t, value(data.hooks?.[t], 220)])), description: value(data.description, 450), questionsEnd, themes,
      vote: { state: 'open', end, eligible: themes, round: 1, runoffMs: hours * 3600000, ballots: {} },
      threads: [], after: { threads: false, chat: false, messages: [] },
      quiz: { questions: [], stage: 'draft', index: -1, entries: {} },
      resources: { summary: '', review: [], published: false, transcript: '' }, audio: []
    });
    return;
  }
  if (kind === 'readIdea') {
    need(isAdmin, 'Connecte-toi au back-office.');
    const idea = db.ideas.find(x => x.id === data.id);
    need(idea, 'Proposition introuvable.');
    idea.read = !idea.read;
    return;
  }
  const s = db.sessions.find(x => x.id === input.session);
  need(s, 'Ce cours est introuvable.');
  const q = s.quiz;
  const vote = s.vote;
  const publicActions = ['vote','question','support','comment','chat','join','answer','review'];
  if (!publicActions.includes(kind)) need(isAdmin, 'Connecte-toi au back-office.');

  switch (kind) {
    case 'vote':
      need(!s.archived && vote.state === 'open' && vote.round === data.round && now < vote.end, 'Ce tour est terminé.');
      need(vote.eligible.includes(data.theme), 'Thème indisponible.');
      vote.ballots[actor] = data.theme;
      break;
    case 'courseVisual': {
      const image = value(data.image, 1000);
      need(!s.archived && (!image || URL.canParse(image) && new URL(image).protocol === 'https:'), 'Saisis une adresse HTTPS valide.');
      s.image = image;
      break;
    }
    case 'courseLive':
      need(!s.archived && vote.winner, 'Le cours doit avoir un sous-thème retenu.');
      s.live = data.live === true;
      break;
    case 'courseDate': {
      const courseAt = Number(data.courseAt);
      need(!s.archived && Number.isFinite(courseAt) && courseAt > now, 'Saisis une date de cours à venir.');
      s.courseAt = courseAt;
      break;
    }
    case 'pick':
      need(!s.archived && vote.state === 'decision' && vote.eligible.includes(data.theme), 'Choisis parmi les thèmes proposés au départage.');
      vote.state = 'done';
      vote.winner = data.theme;
      break;
    case 'question':
      need(threadsOpen(s, now), 'Les contributions sont fermées.');
      need(s.threads.length < 400 && s.threads.filter(t => t.actor === actor).length < 15, 'Limite de questions atteinte.');
      s.threads.unshift({ id: id(), actor, text: required(data.text, 1800, 'Écris ta question.'), name: value(data.name, 50), at: now, hidden: false, supporters: [], comments: [] });
      break;
    case 'support':
    case 'comment':
    case 'moderate': {
      const t = s.threads.find(x => x.id === data.id);
      need(t && (!t.hidden || isAdmin), 'Question introuvable.');
      if (kind === 'moderate') {
        const item = data.comment ? t.comments.find(x => x.id === data.comment) : t;
        need(item, 'Commentaire introuvable.');
        item.hidden = !item.hidden;
        break;
      }
      need(threadsOpen(s, now), 'Les contributions sont fermées.');
      if (kind === 'support') {
        t.supporters = t.supporters.includes(actor) ? t.supporters.filter(a => a !== actor) : [...t.supporters, actor];
      } else {
        need(isAdmin, 'Les réponses sont réservées à l’équipe.');
        need(t.comments.length < 150 && t.comments.filter(x => x.actor === actor).length < 15, 'Limite de commentaires atteinte.');
        t.comments.push({ id: id(), actor, text: required(data.text, 1000, 'Écris ton commentaire.'), name: value(data.name, 50), at: now, official: isAdmin, hidden: false });
      }
      break;
    }
    case 'chat':
      need(s.after.chat, 'Le chat est fermé.');
      need(s.after.messages.length < 1200, 'Le chat a atteint sa capacité.');
      need(!s.after.messages.slice(-30).some(m => m.actor === actor && now - m.at < 1500), 'Attends un instant avant d’envoyer un autre message.');
      s.after.messages.push({ id: id(), actor, text: required(data.text, 800, 'Écris ton message.'), name: value(data.name, 50), at: now, official: isAdmin, hidden: false });
      break;
    case 'moderateChat': {
      const item = s.after.messages.find(x => x.id === data.id);
      need(item, 'Message introuvable.');
      item.hidden = !item.hidden;
      break;
    }
    case 'after':
      need(vote.state === 'done', 'Choisis d’abord le thème du cours.');
      s.after.threads = data.threads === true;
      s.after.chat = data.chat === true;
      break;
    case 'deadline': {
      const end = Number(data.end);
      need(!s.archived && end > now && end < now + 366 * 86400000, 'Choisis une date à venir pour fermer les questions.');
      s.questionsEnd = end;
      break;
    }
    case 'saveQuiz':
      need(q.stage === 'draft', 'Le quiz a déjà été ouvert.');
      q.questions = questionList(data.questions);
      break;
    case 'quizStart':
      need(!s.archived && vote.winner && q.stage === 'draft' && q.questions.length > 0, 'Il faut un thème retenu et un quiz prêt.');
      q.stage = 'lobby';
      break;
    case 'quizNext':
      need(['lobby','locked'].includes(q.stage), 'Ferme les réponses avant de passer à la suite.');
      if (q.index + 1 === q.questions.length) {
        q.stage = 'results';
      } else {
        q.index++;
        q.stage = 'question';
      }
      break;
    case 'quizLock':
      need(q.stage === 'question', 'Aucune question ouverte.');
      q.stage = 'locked';
      break;
    case 'join': {
      need(['lobby','question','locked'].includes(q.stage), 'Le quiz n’accepte pas de participants pour l’instant.');
      const name = required(data.name, 30, 'Choisis un pseudo pour le classement.');
      need(!Object.entries(q.entries).some(([a, e]) => a !== actor && e.name.toLowerCase() === name.toLowerCase()), 'Ce pseudo est déjà pris pour ce quiz.');
      need(q.entries[actor] || Object.keys(q.entries).length < 1000, 'La salle de quiz est pleine.');
      q.entries[actor] ??= { name, answers: {} };
      break;
    }
    case 'answer':
      need(q.stage === 'question' && q.index === data.index && q.entries[actor], 'Cette question est fermée ou tu n’as pas rejoint le quiz.');
      need(Number.isInteger(data.choice) && data.choice >= 0 && data.choice < q.questions[q.index].options.length, 'Choix invalide.');
      need(q.entries[actor].answers[q.index] == null, 'Ta réponse est déjà enregistrée.');
      q.entries[actor].answers[q.index] = data.choice;
      break;
    case 'saveResources':
      s.resources.answers = value(data.answers, 20000);
      const audioUrl = value(data.audioUrl, 2000);
      need(!audioUrl || URL.canParse(audioUrl) && new URL(audioUrl).protocol === 'https:', 'Saisis un lien audio HTTPS valide.');
      s.resources.audioUrl = audioUrl;
      s.resources.summary = value(data.summary, 30000);
      s.resources.review = questionList(data.review ?? [], 15);
      if (typeof data.transcript === 'string') s.resources.transcript = value(data.transcript, 160000);
      delete s.resources.audioDraft;
      s.resources.published = data.published === true;
      need(!s.resources.published || s.resources.summary || s.resources.review.length || s.resources.answers || s.resources.audioUrl, 'Ajoute une fiche ou un quiz avant de publier.');
      if (s.resources.published && vote.state !== 'done') throw new Invalid('Le thème doit être choisi avant publication.');
      break;
    case 'review': {
      const r = s.resources;
      need(r.published && r.review.length > 0, 'Quiz de révision indisponible.');
      need(Array.isArray(data.answers) && data.answers.length === r.review.length &&
        data.answers.every((n, i) => Number.isInteger(n) && n >= 0 && n < r.review[i].options.length), 'Réponds à toutes les questions.');
      r.scores ??= {};
      const correct = r.review.map(q => q.correct);
      const score = correct.filter((x, i) => data.answers[i] === x).length;
      r.scores[actor] = { score, total: correct.length };
      return { score, total: correct.length, correct };
    }
    case 'archive':
      need(!s.archived && vote.state === 'done', 'Choisis le thème avant d’archiver ce cours.');
      need(!['lobby','question','locked'].includes(q.stage), 'Termine le quiz en salle avant d’archiver.');
      s.archived = true;
      s.after.chat = false;
      break;
    default:
      throw new Invalid('Action inconnue.');
  }
}

export function view(db, actor, admin, now = Date.now()) {
  return {
    admin, now,
    ideas: db.ideas.filter(i => admin || i.actor === actor).map(({actor:owner, ...i}) => ({...i, own:owner===actor})),
    sessions: db.sessions.map(s => {
      const v = s.vote;
      const q = s.quiz;
      const r = s.resources;
      const reveal = q.stage === 'results';
      const clean = ({actor: author, hidden, ...item}) => ({ ...item, own: author === actor, hidden: admin ? hidden : undefined });
      const threads = s.threads.filter(t => admin || !t.hidden).map(t => {
        const { supporters, comments, ...item } = clean(t);
        return { ...item, support: supporters.length, supported: supporters.includes(actor), comments: comments.filter(c => admin || !c.hidden).map(clean) };
      });
      const own = q.entries[actor];
      const scoreVisible = reveal || q.stage === 'locked';
      const scoredCount = reveal ? q.questions.length : q.index + 1;
      const score = entry => q.questions.slice(0, scoredCount).reduce((total, question, i) => total + Number(entry.answers[i] === question.correct), 0);
      return {
        id: s.id, title: s.title, description: s.description, courseAt: s.courseAt, live: !s.archived && s.live === true, image: s.image, hooks: s.hooks, archived: !!s.archived,
        questionsEnd: s.questionsEnd, threadsOpen: threadsOpen(s, now), threads,
        vote: {
          state: v.state, end: v.end, eligible: v.eligible, round: v.round,
          winner: v.winner, voted: v.ballots[actor],
          history: v.round === 2 ? [v.firstBallots?.[actor], v.ballots[actor]] : [v.ballots[actor]],
          totals: admin || v.state !== 'open' || v.ballots[actor] ? Object.fromEntries((v.round === 1 ? s.themes : s.themes.filter(t => v.eligible.includes(t) || Object.values(v.ballots).includes(t))).map(t => [t, Object.values(v.ballots).filter(x => x === t).length])) : null
        },
        after: { threads: s.after.threads, chat: s.after.chat, messages: s.after.messages.filter(m => admin || !m.hidden).map(clean) },
        quiz: {
          stage: q.stage, index: q.index, count: q.questions.length,
          question: ['question','locked'].includes(q.stage) ? q.questions[q.index]?.text : null,
          options: ['question','locked'].includes(q.stage) ? q.questions[q.index]?.options : null,
          participants: Object.keys(q.entries).length,
          responses: Object.values(q.entries).filter(e => e.answers[q.index] != null).length,
          joined: own?.name, choice: own?.answers[q.index],
          scoredCount,
          score: scoreVisible && own ? score(own) : undefined,
          results: reveal ? q.questions.map((question, i) => ({ ...question, totals: question.options.map((_, index) => Object.values(q.entries).filter(e => e.answers[i] === index).length) })) : null,
          ranking: scoreVisible ? Object.values(q.entries).map(e => ({ name:e.name, score: score(e) })).sort((a,b) => b.score - a.score || a.name.localeCompare(b.name,'fr')) : null,
          questions: admin ? q.questions : undefined
        },
        resources: {
          published: r.published,
          audioDraft: admin ? r.audioDraft : undefined,
          answers: admin || r.published ? r.answers : '',
          audioUrl: admin || r.published ? r.audioUrl : '',
          summary: admin || r.published ? r.summary : '',
          review: admin ? r.review : r.published ? r.review.map(({text,options}) => ({text,options})) : [],
          transcript: admin ? r.transcript : undefined,
          score: r.scores?.[actor]
        },
        audio: admin ? s.audio : undefined
      };
    })
  };
}
