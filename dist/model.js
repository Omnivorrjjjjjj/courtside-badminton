export const PAIRS = [['A', 'B'], ['B', 'C'], ['C', 'A']];
export const TYPE_LABELS = { MD: '男雙', WS: '女單', XD: '混雙', MS: '男單', WD: '女雙', OPEN: '自由配對' };
export const clone = value => structuredClone(value);
const requireThat = (value, message) => { if (!value) throw new Error(message); };
const clean = (value, max = 80) => String(value ?? '').trim().slice(0, max);

export function createState(demo = true) {
  const teams = Object.fromEntries(['A', 'B', 'C'].map((id, i) => [id, {
    id, name: ['青峰隊', '赤焰隊', '藍浪隊'][i], color: ['#95c940', '#ed9277', '#78afd9'][i],
    players: [1, 2, 3, 4].map((n) => ({ id: `${id}${n}`, name: `${id} 隊${n === 4 ? '女' : '男'}將 ${n === 4 ? '' : n}`.trim(), gender: n === 4 ? 'F' : 'M' }))
  }]));
  const settings = { target: 31, winBy: 1, cap: 31, standingsMode: 'rally', matchWinPoints: 1, tieWinPoints: 3, tieDrawPoints: 1, broadcast: 'feed', types: ['MD', 'WS', 'MD', 'XD'] };
  const state = { schemaVersion: 1, revision: 0, title: '三隊羽球對抗賽', venue: 'COURT 01', teams, settings, matches: buildMatches(settings.types, teams), feed: [], updatedAt: 0 };
  if (demo) {
    state.matches[0].score = [31, 26]; state.matches[0].status = 'finished';
    state.matches[1].score = [18, 21]; state.matches[1].status = 'live';
    state.feed = [
      { id: 'demo-2', time: Date.now() - 60_000, text: '女單進行中，B 隊連得 3 分，暫時取得領先。', kind: 'manual' },
      { id: 'demo-1', time: Date.now() - 300_000, text: '第一場男雙結束，A 隊以 31：26 拿下勝利。', kind: 'system' }
    ];
  }
  return state;
}

export function buildMatches(types, teams) {
  return PAIRS.flatMap((sides) => types.map((category, index) => ({
    id: `${sides.join('')}-${index}`, pair: sides.join(''), sides, category, index,
    label: `${TYPE_LABELS[category]}${types.filter(t => t === category).length > 1 ? ` ${types.slice(0, index + 1).filter(t => t === category).length}` : ''}`,
    status: 'pending', score: [0, 0], history: [],
    lineups: sides.map(id => defaultLineup(teams[id], category))
  })));
}
function defaultLineup(team, category) {
  const men = team.players.filter(p => p.gender === 'M').map(p => p.id);
  const women = team.players.filter(p => p.gender === 'F').map(p => p.id);
  return ({ MD: men.slice(0, 2), WS: women.slice(0, 1), XD: [...men.slice(0, 1), ...women.slice(0, 1)], MS: men.slice(0, 1), WD: women.slice(0, 2), OPEN: team.players.slice(0, 2).map(p => p.id) })[category];
}
export function validateLineup(team, ids, category) {
  const players = ids.map(id => team.players.find(p => p.id === id));
  requireThat(players.every(Boolean) && new Set(ids).size === ids.length, '上場球員不能重複或不存在。');
  const men = players.filter(p => p.gender === 'M').length, women = players.filter(p => p.gender === 'F').length;
  const valid = { MD: men === 2 && women === 0, WS: women === 1 && men === 0, XD: men === 1 && women === 1, MS: men === 1 && women === 0, WD: women === 2 && men === 0, OPEN: ids.length >= 1 && ids.length <= 2 };
  requireThat(valid[category], `${TYPE_LABELS[category]}的上場人數或男女組合不符合賽制。`);
}
export function winner(match, settings) {
  const [a, b] = match.score;
  if (a === b) return null;
  const high = Math.max(a, b), low = Math.min(a, b);
  return (high >= settings.target && (high - low >= settings.winBy || high >= settings.cap)) ? (a > b ? 0 : 1) : null;
}
export function scoreEntryIsCurrent(state, action) {
  const match = state.matches.find(m => m.id === action.matchId);
  return !!match && Array.isArray(action.expectedScore) && action.expectedScore.length === 2
    && match.status === action.expectedStatus && match.score.every((n, i) => n === action.expectedScore[i]);
}
export function pairStats(state, pair) {
  const matches = state.matches.filter(m => m.pair === pair);
  const scores = [0, 0], wins = [0, 0];
  matches.forEach(m => {
    m.score.forEach((s, i) => scores[i] += s);
    if (m.status === 'finished') { const w = winner(m, state.settings); if (w !== null) wins[w]++; }
  });
  return { matches, scores, wins, completed: matches.filter(m => m.status === 'finished').length, total: matches.length, live: matches.some(m => m.status === 'live'), paused: matches.some(m => m.status === 'paused') };
}
export function standings(state) {
  const rows = Object.values(state.teams).map(t => ({ ...t, rally: 0, against: 0, won: 0, played: 0, tiePoints: 0 }));
  state.matches.forEach(m => m.sides.forEach((id, i) => {
    const row = rows.find(r => r.id === id);
    row.rally += m.score[i]; row.against += m.score[1 - i];
    if (m.status === 'finished') { row.played++; if (winner(m, state.settings) === i) row.won++; }
  }));
  PAIRS.forEach(sides => {
    const stat = pairStats(state, sides.join(''));
    if (stat.completed !== stat.total) return;
    sides.forEach((id, i) => { rows.find(r => r.id === id).tiePoints += stat.wins[i] > stat.wins[1-i] ? state.settings.tieWinPoints : stat.wins[i] === stat.wins[1-i] ? state.settings.tieDrawPoints : 0; });
  });
  rows.forEach(r => { r.points = state.settings.standingsMode === 'rally' ? r.rally : state.settings.standingsMode === 'match' ? r.won * state.settings.matchWinPoints : r.tiePoints; });
  rows.sort((a, b) => b.points - a.points || a.id.localeCompare(b.id));
  rows.forEach((r, i) => r.rank = i > 0 && r.points === rows[i - 1].points ? rows[i - 1].rank : i + 1);
  return rows;
}
export function reduce(state, action) {
  const s = clone(state), now = action.time || Date.now();
  const match = s.matches.find(m => m.id === action.matchId);
  const note = text => { s.feed.unshift({ id: `${now}-${s.revision + 1}`, time: now, text, kind: 'system' }); };
  if (['start', 'pause', 'score', 'set-score', 'undo', 'finish', 'reopen', 'lineup'].includes(action.type)) requireThat(match, '找不到這場比賽。');
  switch (action.type) {
    case 'set-score': {
      requireThat(['live', 'paused'].includes(match.status), '請先開始比賽；已完賽的場次需先重新開啟。');
      requireThat(scoreEntryIsCurrent(s, action), '本場比分已被更新，請載入最新比分後再輸入。');
      requireThat(Array.isArray(action.score) && action.score.length === 2 && action.score.every(n => Number.isInteger(n) && n >= 0 && n <= s.settings.cap), `請輸入 0 到 ${s.settings.cap} 的整數比分。`);
      requireThat(!action.score.every(n => n === s.settings.cap), '封頂時雙方比分不能相同，請確認比分。');
      requireThat(action.score.some((n, i) => n !== match.score[i]), '比分尚未變更。');
      match.history = [...(match.history || []), match.score].slice(-500);
      match.score = [...action.score];
      break;
    }
    case 'score': {
      requireThat(match.status === 'live', '請先開始或恢復比賽。');
      requireThat([0, 1].includes(action.side) && [-1, 1].includes(action.delta), '比分操作無效。');
      const scores = [...match.score]; scores[action.side] += action.delta;
      requireThat(scores[action.side] >= 0, '比分不能小於 0。');
      requireThat(action.delta < 0 || winner(match, s.settings) === null, '已到局末分數，請結束比賽或修正比分。');
      requireThat(scores[action.side] <= s.settings.cap, '比分已到上限。');
      match.history = [...(match.history || []), match.score].slice(-500); match.score = scores;
      break;
    }
    case 'undo':
      requireThat(['live', 'paused'].includes(match.status), '請先重新開啟這場比賽。');
      requireThat(match.history?.length, '目前沒有可復原的比分。');
      match.score = match.history.pop(); break;
    case 'start':
      requireThat(['pending', 'paused'].includes(match.status), '這場比賽無法開始。');
      requireThat(!s.matches.some(m => m.id !== match.id && ['live', 'paused'].includes(m.status)), '請先結束目前比賽，再開始下一場。');
      if (match.status === 'pending' && action.lineups) match.lineups = clone(action.lineups);
      match.sides.forEach((id, i) => validateLineup(s.teams[id], match.lineups[i], match.category));
      match.status = 'live'; note(`${match.sides.join(' vs ')}・${match.label}，比賽開始。`); break;
    case 'pause': requireThat(match.status === 'live', '比賽目前未進行。'); match.status = 'paused'; note(`${match.label}暫停計分。`); break;
    case 'finish':
      requireThat(['live', 'paused'].includes(match.status), '比賽尚未開始或已結束。');
      requireThat(winner(match, s.settings) !== null, '比分尚未達到本局獲勝條件。');
      match.status = 'finished'; note(`${match.sides.join(' vs ')}・${match.label}結束，比分 ${match.score.join('：')}。`); break;
    case 'reopen':
      requireThat(match.status === 'finished', '只能重新開啟已結束的比賽。');
      requireThat(!s.matches.some(m => ['live', 'paused'].includes(m.status)), '請先結束目前比賽。');
      match.status = 'live'; note(`${match.label}重新開啟，進行比分修正。`); break;
    case 'lineup':
      requireThat(match.status === 'pending', '開賽後無法修改上場名單。');
      match.sides.forEach((id, i) => validateLineup(s.teams[id], action.lineups[i], match.category));
      match.lineups = action.lineups; break;
    case 'commentary':
      requireThat(clean(action.text, 500), '請輸入播報內容。');
      s.feed.unshift({ id: `${now}-${s.revision + 1}`, time: now, text: clean(action.text, 500), kind: 'manual' }); break;
    case 'teams':
      requireThat(['A','B','C'].every(id => action.teams[id]?.players?.length === 4), '每隊需有四位隊員。');
      Object.keys(s.teams).forEach(id => {
        const t = action.teams[id]; requireThat(clean(t.name, 30), '請填寫隊名。');
        s.teams[id].name = clean(t.name, 30);
        s.teams[id].players = s.teams[id].players.map((p, i) => { requireThat(clean(t.players[i].name, 30), '請填寫每位隊員姓名。'); return { ...p, name: clean(t.players[i].name, 30) }; });
      }); break;
    case 'settings': {
      const incoming = action.settings;
      requireThat(clean(action.title), '請填寫賽事名稱。');
      for (const key of ['target', 'cap', 'winBy', 'matchWinPoints', 'tieWinPoints', 'tieDrawPoints']) requireThat(Number.isInteger(incoming[key]) && incoming[key] >= (key.endsWith('Points') ? 0 : 1) && incoming[key] <= 199, '請輸入有效的整數設定。');
      requireThat(incoming.cap >= incoming.target && [1, 2].includes(incoming.winBy), '封頂分不得低於目標分；需領先 1 或 2 分。');
      requireThat(['rally', 'match', 'tie'].includes(incoming.standingsMode) && ['feed', 'manual'].includes(incoming.broadcast), '計分或播報方式無效。');
      requireThat(Array.isArray(incoming.types) && incoming.types.length >= 1 && incoming.types.length <= 8 && incoming.types.every(t => TYPE_LABELS[t]), '每組對戰需有 1–8 個有效項目。');
      incoming.types.forEach(category => Object.values(s.teams).forEach(team => validateLineup(team, defaultLineup(team, category), category)));
      const typesChanged = JSON.stringify(incoming.types) !== JSON.stringify(s.settings.types);
      const scoringChanged = ['target', 'cap', 'winBy'].some(k => incoming[k] !== s.settings[k]) || typesChanged;
      requireThat(!scoringChanged || s.matches.every(m => m.status === 'pending' && m.score.every(n => n === 0)), '已有比賽紀錄。請先匯出備份並清空比分，才能變更局分與項目。');
      if (typesChanged) s.matches = buildMatches(incoming.types, s.teams);
      s.title = clean(action.title); s.venue = clean(action.venue, 50); s.settings = clone(incoming); break;
    }
    case 'reset': s.matches = buildMatches(s.settings.types, s.teams); s.feed = []; break;
    default: throw new Error('不支援的操作。');
  }
  s.feed = (s.feed || []).slice(0, 120); s.revision++; s.updatedAt = now;
  return s;
}

// Normalize local/demo backups before rendering or applying operations.
export function normalizeState(raw) {
  requireThat(raw?.schemaVersion === 1 && Number.isInteger(raw.revision), '賽事資料格式不相容。');
  requireThat(raw.teams && ['A','B','C'].every(k => raw.teams[k]?.players?.length === 4), '隊員資料不完整。');
  requireThat(Array.isArray(raw.matches) && raw.matches.length > 0 && raw.settings?.types, '賽程資料不完整。');
  const s = clone(raw); s.feed ||= [];
  s.matches.forEach(m => { m.history ||= []; m.lineups ||= [[], []]; for(let i=0;i<2;i++) m.lineups[i] ||= []; });
  return s;
}

// Firestore rejects directly nested arrays. Wrap lineups and history in maps.
export function encodeFirestore(state) {
  const record = clone(state);
  record.matches = record.matches.map(m => ({ ...m, lineups: m.lineups.map(players => ({ players })), history: (m.history || []).map(score => ({ score })) }));
  return record;
}
export function decodeFirestore(record) {
  const raw = { ...record, updatedAt: typeof record.updatedAt?.toMillis === 'function' ? record.updatedAt.toMillis() : record.updatedAt || 0 };
  raw.matches = record.matches.map(m => ({ ...m, lineups: m.lineups.map(entry => entry.players), history: (m.history || []).map(entry => entry.score) }));
  return normalizeState(raw);
}
