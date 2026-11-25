import { action, advance, view, Invalid } from '../public/core.js';
import { admin, failure, getActor, guard, HttpError, json, login, logout, mutate, send } from '../lib/server.js';

export default async function handler(req, res) {
  try {
    const actor = getActor(req, res);
    let authorized = admin(req);
    let input;
    if (req.method === 'POST') {
      guard(req, 'POST');
      input = await json(req);
      if (input.kind === 'login') {
        login(res, input.data?.code);
        authorized = true;
        input = null;
      } else if (input.kind === 'logout') {
        logout(res);
        authorized = false;
        input = null;
      }
    } else {
      guard(req, 'GET');
    }
    const { body, result } = await mutate(db => {
      const now = Date.now();
      const changed = advance(db, now);
      return { write: !!input || changed, output: input ? action(db, input, actor, authorized, now) : undefined };
    });
    send(res, 200, { ...view(body, actor, authorized), result });
  } catch (error) {
    failure(res, error instanceof Invalid ? new HttpError(400, error.message) : error);
  }
}
