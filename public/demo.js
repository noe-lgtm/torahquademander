import { action, advance, blank, view } from './core.js';

const key = 'moadon-demo-hanouka-v1';
const actor = 'demo-visiteur';
function start() {
  const now = Date.now();
  const state = blank();
  action(state, {kind:'create',data:{
    title:'Hanouka', courseAt:now + 120 * 3600000,
    description:'Un cours de Torah qui part de tes questions.',
    themes:['Hanouka aujourd’hui','Les Maccabées et leur combat','Les lumières à la fenêtre','La fiole et le miracle'],
    end:now + 36 * 3600000, questionsEnd:now + 96 * 3600000, runoff:8
  }}, 'demo-admin', true, now);
  const session = state.sessions[0].id;
  action(state,{kind:'saveQuiz',session,data:{questions:[
    {text:'Que signifie le mot « Hanouka » ?',options:['Inauguration','Lumière','Victoire'],correct:0},
    {text:'Combien de soirs dure Hanouka ?',options:['Sept','Huit','Neuf'],correct:1}
  ]}},'demo-admin',true,now);
  return { state, admin:false, offset:0 };
}

function getDemo() {
  try { return JSON.parse(localStorage.getItem(key)) || start(); }
  catch { return start(); }
}
let fallback;
function persist(data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { fallback = data; }
}
export function local(input) {
  let data = fallback || getDemo();
  let result;
  if (input?.kind === 'login') data.admin = true;
  else if (input?.kind === 'logout') data.admin = false;
  else if (input?.kind === 'demoReset') data = start();
  else if (input?.kind === 'demoClose' && data.admin) {
    const vote = data.state.sessions.find(s => !s.archived)?.vote;
    if (vote?.state === 'open') data.offset = Math.max(data.offset, vote.end - Date.now() + 1);
  } else if (input) {
    advance(data.state, Date.now() + data.offset);
    result = action(data.state, input, actor, data.admin, Date.now() + data.offset);
  }
  advance(data.state, Date.now() + data.offset);
  persist(data);
  return { ...view(data.state, actor, data.admin, Date.now() + data.offset), result };
}
