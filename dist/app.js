import { PAIRS, TYPE_LABELS, pairStats, standings, winner, clone, scoreEntryIsCurrent } from './model.js?v=manual-score-1';
import { createStore, readableError } from './store.js?v=manual-score-1';

const $ = selector => document.querySelector(selector);
const publishedTitle = document.title.replace(/ · COURTSIDE$/, '');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icons = {
  triangle: '<path d="M12 3 22 21H2Z"/><path d="m12 10 6 11H6Z"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3" fill="currentColor"/><circle cx="16" cy="17" r="3" fill="currentColor"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  share: '<path d="M12 15V3m-4 4 4-4 4 4M5 12v8h14v-8"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  undo: '<path d="m8 5-5 5 5 5M3 10h10a7 7 0 0 1 7 7"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ''}</svg>`;
let view = 'overview', selectedPair = 'AB', selectedMatch = null, adminTab = 'score', focusedMatch = null;
const lineupDrafts = new Map(), scoreDrafts = new Map();
let toastTimer, store, adminFeedback = '', pendingFocusLabel = '';
store = createStore(() => { render(); refreshAdmin(); });
const statusLabel = () => store.error ? '資料讀取失敗' : !store.ready ? '連線中' : store.mode === 'demo' ? '本機示範' : store.pending ? '同步中…' : store.connected ? '即時連線' : navigator.onLine ? '等待雲端同步' : '連線中斷';
const time = timestamp => timestamp ? new Date(timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
const statusName = status => ({ pending: '未開始', live: '進行中', paused: '暫停', finished: '已結束' }[status]);
const players = (s, m, side) => (m.lineups[side] || []).map(id => s.teams[m.sides[side]].players.find(p => p.id === id)?.name || '未指定').join(' / ') || '尚未設定球員';
const isActive = m => ['live', 'paused'].includes(m.status);
function toast(message) { const inAdmin=$('#admin-dialog').open,target=inAdmin?$('#admin-feedback'):$('#toast');if(!target)return;if(inAdmin)adminFeedback=message;target.textContent=message;target.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>{adminFeedback='';document.querySelectorAll('#toast,#admin-feedback').forEach(el=>el.classList.remove('show'))},5000); }
function focusSection(selector) { const section=$(selector);if(!section)return;section.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});const heading=section.querySelector('h2');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true})} }
function render() {
  if (!store) return;
  const s = store.state;
  document.title = `${s?.title || publishedTitle} · COURTSIDE`;
  $('#app').innerHTML = `<div class="shell">
    <header class="topbar"><a href="#" class="brand" aria-label="COURTSIDE 首頁">${icon('triangle')} COURTSIDE <span>場邊速報</span></a>
      <nav class="nav" aria-label="主要導覽">${[['overview','戰況總覽'],['schedule','完整賽程'],['teams','參賽隊伍']].map(([id,name]) => `<button data-view="${id}" class="${view === id ? 'active' : ''}" ${view === id ? 'aria-current="page"' : ''}>${name}</button>`).join('')}</nav>
      <div class="tools"><button class="icon-button" data-action="screen" title="大螢幕模式" aria-label="大螢幕模式" aria-pressed="${document.body.classList.contains('screen-mode')}">${icon('expand')}</button><button class="button secondary" data-action="admin" aria-label="賽事管理">${icon('settings')}<span class="admin-label">賽事管理</span></button></div>
    </header>
    <div class="intro"><div><div class="eyebrow">TRI-TEAM TOURNAMENT / LIVE SCORE</div><h1>${escape(s?.title || publishedTitle)}</h1><div class="event-meta"><span>三隊・每隊 3 男 1 女</span><span class="separator">/</span><span>${s ? `每局 ${s.settings.target} 分・${s.settings.winBy === 1 ? '先到制' : '領先 2 分'}${s.settings.cap !== s.settings.target ? `・${s.settings.cap} 分封頂` : ''}` : '即時比分與文字播報'}</span></div></div><span class="connection" role="status"><i class="dot ${store.connected && store.mode === 'cloud' ? 'online' : 'offline'}"></i>${statusLabel()}</span></div>
    ${store.mode === 'demo' ? '<div class="demo-banner"><span>目前為示範賽事，比分與姓名均為範例；操作只在這台裝置的同一瀏覽器同步。</span><button data-action="admin">試用管理介面</button></div>' : !store.connected && store.ready ? '<div class="demo-banner"><span>等待雲端確認，顯示最後收到的比分。取得最新資料後會自動恢復計分。</span></div>' : ''}
    ${store.error ? `<div class="error">${escape(store.error)}</div>` : ''}
    ${s ? (view === 'overview' ? overview(s) : view === 'schedule' ? schedule(s) : rosters(s)) : `<section class="panel empty-state"><h2>${store.ready ? '賽事準備中' : '正在連接球場…'}</h2><p>${store.ready ? '管理者建立賽事後，比分會自動出現在這裡。' : '正在取得最新比分與賽程。'}</p><button class="button" data-action="admin">賽事管理</button></section>`}
    <footer class="footer"><b>COURTSIDE — EVERY POINT COUNTS.</b><span>${store.mode === 'demo' ? '示範資料' : '最後更新'} ${s?.updatedAt ? time(s.updatedAt) : '—'} · 觀眾無需重新整理</span></footer>
  </div>`;
  $('#app').querySelectorAll('[data-view]').forEach(b => b.onclick = () => { view = b.dataset.view; if(view==='overview')selectedMatch=null; render(); });
  $('#app').querySelectorAll('[data-pair]').forEach(b => b.onclick = () => { selectedPair = b.dataset.pair; selectedMatch = null; render(); focusSection('.pair-detail'); });
  $('#app').querySelectorAll('[data-match]').forEach(b => b.onclick = () => { selectedMatch = b.dataset.match; view = 'overview'; render(); $('.score-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  $('#app').querySelectorAll('[data-action="admin"]').forEach(b => b.onclick = openAdmin);
  $('[data-action="screen"]').onclick = () => { document.body.classList.toggle('screen-mode'); view = 'overview'; render(); };
  $('.brand').onclick = e => { e.preventDefault(); view = 'overview'; render(); };
}
function overview(s) {
  const active = s.matches.find(isActive);
  const m = s.matches.find(m => m.id === selectedMatch) || active || s.matches.find(m => m.status === 'pending') || s.matches.at(-1);
  const rows = standings(s);
  return `<main><div class="layout"><div class="left-column">${triangle(s)}<section class="panel standings-panel"><div class="panel-head"><h2>隊伍積分</h2><span class="tag">${{ rally:'累計得分',match:'勝場積分',tie:'對戰積分' }[s.settings.standingsMode]}</span></div>
    <table class="standings"><thead><tr><th scope="col">排名</th><th scope="col">隊伍</th><th scope="col">勝場</th><th scope="col">得／失分</th><th scope="col">積分</th></tr></thead><tbody>${rows.map(t => `<tr><td class="subtle">0${t.rank}</td><td><span class="team-chip" style="background:${t.color}">${t.id}</span><span class="team-name">${escape(t.name)}</span></td><td>${t.won}</td><td>${t.rally} / ${t.against}</td><td class="points">${t.points}</td></tr>`).join('')}</tbody></table><p class="ranking-note">${s.settings.standingsMode === 'rally' ? '含進行中比賽的每一分；同分並列。' : s.settings.standingsMode === 'match' ? `每贏一場 ${s.settings.matchWinPoints} 分；完賽後計入，同分並列。` : `整組對戰結束後：勝 ${s.settings.tieWinPoints} 分、平 ${s.settings.tieDrawPoints} 分；同分並列。`}</p></section></div>
    <div class="right-column">${scoreCard(s,m,active)}${feed(s)}</div></div>${pairDetail(s, selectedPair)}</main>`;
}
function triangle(s) {
  const nodes = [['A','top'],['B','left'],['C','right']];
  return `<section class="panel triangle-panel"><div class="panel-head"><h2>三隊對戰圖</h2><span class="subtle">點選對戰・查看明細</span></div><div class="triangle">
    <svg viewBox="0 0 600 354" preserveAspectRatio="none" aria-hidden="true"><path d="M300 53 90 280 510 280Z" fill="#eaf0df" opacity=".55"/>${[['AB','M300 53 90 280'],['BC','M90 280 510 280'],['CA','M510 280 300 53']].map(([id,d])=>`<path class="edge ${selectedPair===id?'selected':''}" d="${d}"/><path class="edge-hit" d="${d}" data-pair="${id}"/>`).join('')}</svg>
    ${nodes.map(([id,pos])=>`<div class="team-node ${pos}"><span class="team-circle" style="background:${s.teams[id].color}">${id}</span><b>${escape(s.teams[id].name)}</b><small>4 PLAYERS</small></div>`).join('')}
    <div class="triangle-center"><strong>循環賽</strong><span>ROUND ROBIN</span></div>
    ${PAIRS.map(sides=>{ const id=sides.join(''),stat=pairStats(s,id); return `<button class="pair-button ${id.toLowerCase()} ${selectedPair===id?'selected':''}" data-pair="${id}" aria-pressed="${selectedPair===id}" aria-label="${sides.join(' 對 ')}，累計 ${stat.scores.join(' 比 ')}，查看對戰"><span>${sides.join(' vs ')}${stat.live?' · LIVE':''}</span><strong>${stat.scores.join(' : ')}</strong><span>${stat.completed} / ${stat.total} 場完成</span></button>`; }).join('')}
    </div><div class="triangle-footer"><span>三邊數字為雙方累計得分</span><span>${s.matches.filter(m=>m.status==='finished').length} / ${s.matches.length} 場已完成</span></div></section>`;
}
function scoreCard(s,m,active) {
  const atEnd = winner(m,s.settings) !== null;
  return `<section class="panel score-panel" aria-label="比賽比分"><div class="court-lines"></div><div class="panel-head"><h2>${selectedMatch && m.id!==active?.id ? '比賽詳情' : '當前戰況'}</h2><span class="tag dark">${m.status==='live'?'● LIVE · ':''}${statusName(m.status)}</span></div><div class="score-top"><span>${escape(s.venue)}</span><span>第 ${m.index+1} 場 · ${escape(m.label)}</span></div>
    <div class="match-score">${[0,1].map(i=>`${i?'<span class="score-colon">:</span>':''}<div class="score-side"><div class="score-team">${m.sides[i]} <span class="separator">/</span> ${escape(s.teams[m.sides[i]].name)}</div><div class="score-number" data-score-side="${i}">${m.score[i]}</div><div class="player-name">${escape(players(s,m,i))}</div></div>`).join('')}</div><div class="score-bottom"><span>${m.status==='finished' ? '本場已結束' : m.status==='pending' ? '等待開賽' : atEnd ? '已達局末分數・待裁判確認' : m.status==='paused' ? '比賽暫停中' : `一局 ${s.settings.target} 分${s.settings.winBy===2?'・需領先 2 分':''}`}</span><strong>${m.sides.join(' vs ')}</strong></div>
    ${selectedMatch && m.id!==active?.id ? '<button class="button lime" style="margin:0 24px 18px" data-action="back-live">返回目前戰況</button>':''}</section>`;
}
function feed(s) {
  const items=(s.feed||[]).filter(x=>s.settings.broadcast==='feed'||x.kind==='manual');
  return `<section class="panel feed-panel"><div class="panel-head"><h2>場邊文字播報</h2><span class="subtle">${s.settings.broadcast==='manual'?'人工播報':'現場動態'}</span></div>${items.length?`<div class="feed">${items.slice(0,15).map((x,i)=>`<article class="feed-item"><time>${time(x.time)}</time><div class="feed-message">${i===0?'<span class="feed-label">最新消息</span>':''}${escape(x.text)}</div></article>`).join('')}</div>`:'<p class="empty">等待第一則場邊消息。</p>'}</section>`;
}
function pairDetail(s,pair,showTabs=true) {
  const stat=pairStats(s,pair);
  return `<section class="panel pair-detail"><div class="panel-head"><h2>${pair.split('').join(' ↔ ')} 對戰明細 <span class="subtle">· 勝場 ${stat.wins.join(' : ')}</span></h2>${showTabs?`<div class="pair-tabs" aria-label="選擇對戰">${PAIRS.map(ids=>`<button data-pair="${ids.join('')}" class="${pair===ids.join('')?'active':''}" aria-pressed="${pair===ids.join('')}">${ids.join(' vs ')}</button>`).join('')}</div>`:''}</div><div class="fixtures">${stat.matches.map(m=>fixture(s,m)).join('')}</div></section>`;
}
function fixture(s,m) {
  return `<button class="fixture ${isActive(m)?'current':''}" data-match="${m.id}"><div class="fixture-head"><strong>${escape(m.label)}</strong><span class="tag ${m.status==='live'?'live':''}">${statusName(m.status)}</span></div>${m.sides.map((id,i)=>`<div class="fixture-row"><span>${id}・${escape(s.teams[id].name)}</span><b>${m.status==='pending'?'—':m.score[i]}</b></div>`).join('')}<div class="lineup">${escape(players(s,m,0))}<br>vs ${escape(players(s,m,1))}</div></button>`;
}
function schedule(s) { return `<main><h2 class="page-title">完整賽程 <span class="subtle">${s.matches.length} 場比賽</span></h2>${PAIRS.map(ids=>pairDetail(s,ids.join(''),false)).join('')}</main>`; }
function rosters(s) { return `<main><h2 class="page-title">參賽隊伍 <span class="subtle">3 隊・12 位球員</span></h2><div class="teams-grid">${Object.values(s.teams).map(t=>`<section class="panel roster"><h2><span class="team-chip" style="background:${t.color}">${t.id}</span>${escape(t.name)}</h2>${t.players.map((p,i)=>`<div class="person"><div class="avatar">0${i+1}</div><span>${escape(p.name)}</span><small>${p.gender==='M'?'男':'女'}</small></div>`).join('')}</section>`).join('')}</div></main>`; }

function openAdmin() { adminFeedback='';pendingFocusLabel='';focusedMatch ||= store.state?.matches.find(isActive)?.id || store.state?.matches[0]?.id; renderAdmin(); if (!$('#admin-dialog').open) $('#admin-dialog').showModal(); }
function refreshAdmin() {
  if (!$('#admin-dialog').open) return;
  if (store.isAdmin !== !!$('#admin-dialog .admin-tabs')) return renderAdmin();
  if (!store.isAdmin || adminTab !== 'score') return;
  const form=$('#score-entry-form'),m=store.state?.matches.find(m=>m.id===focusedMatch);
  if(form&&m&&form.dataset.matchId===m.id&&isActive(m)) refreshScoreEntry();
  else renderAdmin();
}
function renderAdmin() {
  const focusedLabel=document.activeElement?.getAttribute('aria-label')||pendingFocusLabel;
  if(store.pending&&focusedLabel)pendingFocusLabel=focusedLabel;
  $('#admin-dialog').innerHTML = `<div class="admin-header"><div><h2 id="admin-title">賽事管理</h2><p>${store.mode==='demo'?'試操作・只儲存在此瀏覽器':escape(statusLabel())}</p></div><button class="close" data-close aria-label="關閉管理介面">×</button></div>${store.isAdmin?`<nav class="admin-tabs" aria-label="管理選單">${[['score','比分'],['broadcast','播報'],['roster','隊員'],['settings','賽制']].map(([id,label])=>`<button data-admin-tab="${id}" class="${adminTab===id?'active':''}">${label}</button>`).join('')}</nav>`:''}<div class="admin-body">${!store.isAdmin ? loginForm() : !store.state ? '<p class="notice">目前沒有賽事資料。建立後，觀眾將看到空白賽程；再填寫正式隊名與球員。</p><button class="button" data-initialize>建立正式賽事</button>' : adminContent()}</div>`;
  $('[data-close]').onclick = ()=>$('#admin-dialog').close();
  $('#admin-dialog').insertAdjacentHTML('beforeend',`<div id="admin-feedback" class="admin-feedback ${adminFeedback?'show':''}" role="status" aria-live="polite">${escape(adminFeedback)}</div>`);
  document.querySelectorAll('[data-admin-tab]').forEach(b=>b.onclick=()=>{adminTab=b.dataset.adminTab;renderAdmin()});
  bindAdmin();
  if(focusedLabel)$('#admin-dialog').querySelector(`[aria-label="${CSS.escape(focusedLabel)}"]`)?.focus({preventScroll:true});
  if(!store.pending)pendingFocusLabel='';
}
function loginForm() { return store.mode==='demo' ? '<p class="notice">你可以試用直接輸入比分、上場名單、文字播報與賽制設定。這裡的示範資料只在同一瀏覽器內保存。</p><button class="button" data-demo-login>進入示範控制台</button>' : '<form id="login-form" class="login-form"><p class="notice">觀眾不需登入；只有賽事管理者可以修改比分與播報。</p><label>電子郵件<input type="email" name="email" autocomplete="username" required></label><label>密碼<input type="password" name="password" autocomplete="current-password" required></label><button class="button" type="submit">登入管理介面</button><p class="error hidden" id="login-error" role="alert"></p></form>'; }
function adminContent() {
  if(adminTab==='score') return scoreAdmin();
  if(adminTab==='broadcast') return '<form id="broadcast-form" class="form-stack"><h3>現場文字播報</h3><label>播報內容<textarea name="message" maxlength="500" placeholder="例如：A 隊連得 3 分，雙方戰成 20：20！" required></textarea></label><div class="actions"><button class="button" type="submit">發布播報</button></div><p class="field-help">最多 500 字。最新消息會顯示在觀眾首頁。</p></form>';
  if(adminTab==='roster') return `<form id="roster-form" class="form-stack">${Object.values(store.state.teams).map(t=>`<section class="roster-editor"><label>${t.id} 隊隊名<input name="${t.id}-name" value="${escape(t.name)}" maxlength="30" required></label><div class="form-grid">${t.players.map((p,i)=>`<label>${p.gender==='M'?`男將 ${i+1}`:'女將'}<input name="${p.id}" value="${escape(p.name)}" maxlength="30" required></label>`).join('')}</div></section>`).join('')}<button class="button" type="submit">儲存隊員資料</button></form>`;
  return settingsAdmin();
}
function scoreAdmin() {
  const s=store.state, m=s.matches.find(m=>m.id===focusedMatch)||s.matches[0];focusedMatch=m.id;
  const currentLineups=lineupDrafts.get(m.id)?.lineups||m.lineups;
  const staleDraft=m.status==='pending'&&lineupDrafts.has(m.id)&&lineupDrafts.get(m.id).revision!==s.revision;
  const disable = store.pending || !store.connected;
  return `<div class="admin-match"><label>選擇比賽<select id="match-select">${s.matches.map(x=>`<option value="${x.id}" ${x.id===m.id?'selected':''}>${x.sides.join(' vs ')}・${x.label} — ${statusName(x.status)} ${x.score.join('：')}</option>`).join('')}</select></label>
    ${isActive(m)?scoreEntry(s,m):`<div class="admin-score">${m.sides.map((id,i)=>`<div class="admin-side"><span>${id}・${escape(s.teams[id].name)}</span><strong>${m.score[i]}</strong></div>`).join('')}</div>`}
    ${!isActive(m)&&scoreDrafts.has(m.id)?'<p class="notice">本場狀態已變更，未送出的比分不會套用。開賽或重新開啟後，請重新輸入。</p>':''}<div class="actions score-actions">${scoreActions(s,m)}</div>
    <p class="field-help">比分更新後，達到獲勝條件即可確認完賽。輸入錯誤時，可直接改分或復原上次更新。</p>
    ${m.status==='pending'?`<form id="lineup-form" class="lineup-edit"><h3>本場上場球員 · ${escape(m.label)}</h3>${staleDraft?'<div class="notice">賽事已有更新。請載入最新名單後重新選擇球員。<button class="button secondary" type="button" data-reload-lineup>載入最新名單</button></div>':''}<p class="field-help">選好球員後，按「確認名單並開賽」即可一併儲存。</p>${m.sides.map((id,i)=>`<fieldset style="border:0;padding:0;margin:0"><legend style="font-size:.875rem;margin-bottom:8px">${id}・${escape(s.teams[id].name)}</legend><div class="check-options">${s.teams[id].players.map(p=>`<label><input type="checkbox" name="side${i}" value="${p.id}" ${currentLineups[i].includes(p.id)?'checked':''}>${escape(p.name)}（${p.gender==='M'?'男':'女'}）</label>`).join('')}</div></fieldset>`).join('')}<button class="button secondary" type="submit" ${disable||staleDraft?'disabled':''}>只儲存名單，稍後開賽</button></form>`:`<p class="notice">${escape(players(s,m,0))}<br>vs ${escape(players(s,m,1))}</p>`}</div>`;
}
function scoreEntry(s,m) {
  const draft=scoreDrafts.get(m.id),values=draft?.values||m.score.map(String);
  return `<form id="score-entry-form" data-match-id="${m.id}" class="score-entry"><div class="admin-score">${m.sides.map((id,i)=>`<label class="admin-side"><span data-score-label="${i}">${id}・${escape(s.teams[id].name)}</span><input name="score${i}" class="score-input" type="text" inputmode="numeric" pattern="[0-9]+" maxlength="3" autocomplete="off" enterkeyhint="${i===0?'next':'done'}" aria-label="${id} 隊比分" value="${escape(values[i])}" required></label>`).join('')}</div><p class="score-saved">已同步比分：<strong data-saved-score>${m.score.join('：')}</strong></p><div class="score-conflict notice hidden"><span>本場已有新的比分，請先載入再輸入。</span><button type="button" class="button secondary" data-reload-score>載入最新比分</button></div><button class="button score-submit" type="submit">更新比分</button><p class="field-help" data-score-help>可一次輸入多分，也可直接修正比分；輸入後按更新或 Enter。</p></form>`;
}
function scoreActions(s,m) {
  const draft=scoreDrafts.get(m.id),dirty=isActive(m)&&!!draft&&draft.values.some((v,i)=>v!==String(m.score[i]));
  const disable=store.pending||!store.connected||dirty;
  const staleLineup=m.status==='pending'&&lineupDrafts.has(m.id)&&lineupDrafts.get(m.id).revision!==s.revision;
  return `${m.status==='pending'||m.status==='paused'?`<button class="button" data-command="start" ${disable||staleLineup?'disabled':''}>${m.status==='paused'?'恢復比賽':'確認名單並開賽'}</button>`:''}${m.status==='live'?`<button class="button secondary" data-command="pause" ${disable?'disabled':''}>暫停</button>`:''}${isActive(m)?`<button class="button secondary" data-command="undo" ${disable||!m.history?.length?'disabled':''}>${icon('undo')}復原上次更新</button><button class="button" data-command="finish" ${disable||winner(m,s.settings)===null?'disabled':''}>確認完賽</button>`:''}${m.status==='finished'?`<button class="button secondary" data-command="reopen" ${disable?'disabled':''}>重新開啟，修正比分</button>`:''}`;
}
function refreshScoreEntry() {
  const form=$('#score-entry-form');if(!form)return;
  const s=store.state,m=s.matches.find(m=>m.id===form.dataset.matchId);if(!m)return;
  const draft=scoreDrafts.get(m.id);
  const stale=!!draft&&!scoreEntryIsCurrent(s,{matchId:m.id,expectedScore:draft.expectedScore,expectedStatus:draft.expectedStatus});
  const dirty=!!draft&&draft.values.some((v,i)=>v!==String(m.score[i]));
  if(!draft){form.baseScore=[...m.score];form.baseStatus=m.status;for(let i=0;i<2;i++){const input=form.elements[`score${i}`];if(input.value!==String(m.score[i]))input.value=String(m.score[i]);}}
  form.querySelector('[data-saved-score]').textContent=m.score.join('：');
  form.querySelector('.score-conflict').classList.toggle('hidden',!stale||store.pending);
  const button=form.querySelector('[type=submit]');button.disabled=store.pending||!store.connected||!dirty||stale;
  button.textContent=store.pending?'更新中…':'更新比分';
  form.querySelector('[data-score-help]').textContent=store.pending?'正在同步；你可以先輸入下一筆比分。':!store.connected?'連線中斷，輸入內容已保留；連線恢復後可再更新。':dirty?'輸入後按「更新比分」或 Enter；更新後再確認完賽。':'可一次輸入多分，也可直接修正比分；輸入後按更新或 Enter。';
  m.sides.forEach((id,i)=>{form.querySelector(`[data-score-label="${i}"]`).textContent=`${id}・${s.teams[id].name}`;});
  $('.score-actions').innerHTML=scoreActions(s,m);bindCommands(store.state.revision);
  $('#admin-dialog .admin-header p').textContent=store.mode==='demo'?'試操作・只儲存在此瀏覽器':statusLabel();
  for(const option of $('#match-select').options){const match=s.matches.find(m=>m.id===option.value);if(match)option.textContent=`${match.sides.join(' vs ')}・${match.label} — ${statusName(match.status)} ${match.score.join('：')}`;}
}
function bindScoreEntry() {
  const form=$('#score-entry-form');if(!form)return;
  const id=form.dataset.matchId,m=store.state.matches.find(m=>m.id===id);
  form.baseScore=[...m.score];form.baseStatus=m.status;
  form.querySelectorAll('.score-input').forEach((input,i)=>{input.onfocus=()=>input.select();if(i===0)input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();form.elements.score1.focus();}};});
  form.oninput=()=>{const previous=scoreDrafts.get(id);scoreDrafts.set(id,{values:[form.elements.score0.value,form.elements.score1.value],expectedScore:previous?.expectedScore||[...form.baseScore],expectedStatus:previous?.expectedStatus||form.baseStatus,version:(previous?.version||0)+1});refreshScoreEntry();};
  form.querySelector('[data-reload-score]').onclick=()=>{scoreDrafts.delete(id);refreshScoreEntry();toast('已載入最新比分，請重新輸入。');};
  form.onsubmit=async e=>{
    e.preventDefault();if(store.pending)return;
    const draft=scoreDrafts.get(id);if(!draft)return;
    if(!draft.values.every(v=>/^\d+$/.test(v))){toast('請填寫雙方的整數比分。');return;}
    const values=draft.values.map(Number),version=draft.version;
    try{
      await store.dispatch({type:'set-score',matchId:id,score:values,expectedScore:[...draft.expectedScore],expectedStatus:draft.expectedStatus});
      const remaining=scoreDrafts.get(id);
      if(remaining?.version===version)scoreDrafts.delete(id);
      else if(remaining){remaining.expectedScore=values;remaining.expectedStatus=draft.expectedStatus;}
      refreshAdmin();toast(`比分已更新：${values.join('：')}`);
    }catch(error){refreshAdmin();toast(error.message);}
  };
  refreshScoreEntry();
}
function bindCommands(formRevision) {
  document.querySelectorAll('[data-command]').forEach(b=>b.onclick=async()=>{const action={type:b.dataset.command,matchId:focusedMatch,baseRevision:formRevision};const form=$('#lineup-form');if(action.type==='start'&&form){const data=new FormData(form);action.lineups=[data.getAll('side0'),data.getAll('side1')];action.baseRevision=lineupDrafts.get(focusedMatch)?.revision??formRevision}if(await dispatch(action)){lineupDrafts.delete(action.matchId);scoreDrafts.delete(action.matchId);renderAdmin()}});
}
function settingsAdmin() {
  const s=store.state,config=s.settings,locked=s.matches.some(m=>m.status!=='pending'||m.score.some(n=>n!==0));
  return `<form id="settings-form" class="form-stack"><div class="form-grid"><label>賽事名稱<input name="title" value="${escape(s.title)}" maxlength="80" required></label><label>場地<input name="venue" value="${escape(s.venue)}" maxlength="50"></label></div><div class="form-grid"><label>每局目標分<input type="number" name="target" value="${config.target}" min="1" max="199" required ${locked?'disabled':''}></label><label>封頂分數<input type="number" name="cap" value="${config.cap}" min="1" max="199" required ${locked?'disabled':''}></label><label>獲勝條件<select name="winBy" ${locked?'disabled':''}><option value="1" ${config.winBy===1?'selected':''}>先到目標分</option><option value="2" ${config.winBy===2?'selected':''}>需領先 2 分，封頂除外</option></select></label><label>積分計算<select name="standingsMode">${[['rally','每場得分累加'],['match','勝場積分'],['tie','整組對戰積分']].map(([v,l])=>`<option value="${v}" ${config.standingsMode===v?'selected':''}>${l}</option>`).join('')}</select></label></div><div class="form-grid"><label data-points-mode="match" class="${config.standingsMode==='match'?'':'hidden'}">每勝一場積分<input type="number" name="matchWinPoints" min="0" max="199" value="${config.matchWinPoints}" required></label><label data-points-mode="tie" class="${config.standingsMode==='tie'?'':'hidden'}">整組對戰勝利積分<input type="number" name="tieWinPoints" min="0" max="199" value="${config.tieWinPoints}" required></label><label data-points-mode="tie" class="${config.standingsMode==='tie'?'':'hidden'}">整組對戰平手積分<input type="number" name="tieDrawPoints" min="0" max="199" value="${config.tieDrawPoints}" required></label><label>首頁播報<select name="broadcast"><option value="feed" ${config.broadcast==='feed'?'selected':''}>人工播報＋賽事動態</option><option value="manual" ${config.broadcast==='manual'?'selected':''}>只顯示人工播報</option></select></label></div>
    <label>每組對戰項目（依出賽順序，以頓號分隔）<input name="types" value="${config.types.map(t=>TYPE_LABELS[t]).join('、')}" ${locked?'disabled':''}></label><p class="field-help">可用項目：男雙、女單、混雙、男單、自由配對。每組 1–8 場；上場組合會在開賽前檢查。${locked?'已有比賽紀錄，局分與項目已鎖定；清空比分後才能修改。':''}</p><button class="button" type="submit">儲存賽制與顯示設定</button></form><hr class="divider"><div class="actions"><button class="button secondary" data-export>匯出賽事備份</button><button class="button danger" data-reset>清空全部比分</button><button class="button secondary" data-logout>登出管理介面</button></div><p class="field-help">清空會移除所有比分與播報，保留隊員及賽制。正式賽事的更動會同步至所有觀眾。</p>`;
}
async function dispatch(action, message='已儲存') {
  try { await store.dispatch(action); toast(message); return true; } catch(error) { toast(error.message); return false; }
}
function bindAdmin() {
  const formRevision = store.state?.revision;
  const demo=$('[data-demo-login]');if(demo)demo.onclick=async()=>{await store.login();renderAdmin()};
  const login=$('#login-form');if(login)login.onsubmit=async e=>{e.preventDefault();const form=new FormData(login);try{await store.login(form.get('email'),form.get('password'));renderAdmin()}catch(error){$('#login-error').textContent=readableError(error);$('#login-error').classList.remove('hidden')}};
  const init=$('[data-initialize]');if(init)init.onclick=async()=>{try{await store.initialize();renderAdmin();toast('賽事已建立')}catch(error){toast(readableError(error))}};
  const select=$('#match-select');if(select)select.onchange=()=>{focusedMatch=select.value;renderAdmin()};
  bindCommands(formRevision);
  bindScoreEntry();
  const lineup=$('#lineup-form');if(lineup){lineup.onchange=()=>{const data=new FormData(lineup);lineupDrafts.set(focusedMatch,{revision:lineupDrafts.get(focusedMatch)?.revision??formRevision,lineups:[data.getAll('side0'),data.getAll('side1')]})};lineup.onsubmit=async e=>{e.preventDefault();const form=new FormData(lineup),id=focusedMatch;if(await dispatch({type:'lineup',matchId:id,lineups:[form.getAll('side0'),form.getAll('side1')],baseRevision:lineupDrafts.get(id)?.revision??formRevision},'上場名單已儲存')){lineupDrafts.delete(id);renderAdmin()}}};
  const reloadLineup=$('[data-reload-lineup]');if(reloadLineup)reloadLineup.onclick=()=>{lineupDrafts.delete(focusedMatch);renderAdmin();toast('已載入最新名單，請重新選擇上場球員。')};
  const broadcast=$('#broadcast-form');if(broadcast)broadcast.onsubmit=async e=>{e.preventDefault();const textarea=broadcast.elements.message,button=broadcast.querySelector('button');button.disabled=true;const success=await dispatch({type:'commentary',text:textarea.value},'播報已發布');if(success)textarea.value='';button.disabled=false};
  const roster=$('#roster-form');if(roster)roster.onsubmit=async e=>{e.preventDefault();const form=new FormData(roster),teams=clone(store.state.teams);Object.values(teams).forEach(t=>{t.name=form.get(`${t.id}-name`);t.players.forEach(p=>p.name=form.get(p.id))});if(await dispatch({type:'teams',teams,baseRevision:formRevision},'隊名與球員已更新'))renderAdmin()};
  const settings=$('#settings-form');if(settings)settings.onsubmit=async e=>{e.preventDefault();const form=new FormData(settings),config=clone(store.state.settings);for(const key of ['target','cap','winBy','matchWinPoints','tieWinPoints','tieDrawPoints'])if(form.has(key))config[key]=Number(form.get(key));for(const key of ['standingsMode','broadcast'])config[key]=form.get(key);if(form.has('types'))config.types=String(form.get('types')).split(/[,，、]/).map(t=>{const v=t.trim();return Object.keys(TYPE_LABELS).find(k=>TYPE_LABELS[k]===v)||v.toUpperCase()}).filter(Boolean);if(await dispatch({type:'settings',settings:config,title:form.get('title'),venue:form.get('venue'),baseRevision:formRevision},'設定已更新'))renderAdmin()};
  const pointsMode=$('[name=standingsMode]');if(pointsMode)pointsMode.onchange=()=>{document.querySelectorAll('[data-points-mode]').forEach(el=>el.classList.toggle('hidden',el.dataset.pointsMode!==pointsMode.value))};
  const exp=$('[data-export]');if(exp)exp.onclick=()=>{const blob=new Blob([JSON.stringify(store.state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`courtside-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('備份已下載')};
  const reset=$('[data-reset]');if(reset)reset.onclick=async()=>{if(prompt('這會清空所有比分與播報。請先匯出備份，再輸入「清空」確認。')==='清空'){if(await dispatch({type:'reset'},'比分與播報已清空')){lineupDrafts.clear();scoreDrafts.clear();focusedMatch=null;renderAdmin()}}};
  const logout=$('[data-logout]');if(logout)logout.onclick=async()=>{await store.logout();renderAdmin()};
}
document.addEventListener('click',e=>{if(e.target.closest('[data-action="back-live"]')){selectedMatch=null;render()}});
$('#admin-dialog').addEventListener('click',e=>{if(e.target===$('#admin-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close()}});
render();

// Optional agent interface: the same public read and navigation actions as the screen.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const tools = [
    { name: 'read_badminton_scores', description: 'Read current tournament, live match, pair totals and standings.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: () => store.state ? { mode: store.mode, connected: store.connected, title: store.state.title, live: store.state.matches.find(isActive) || null, standings: standings(store.state), pairs: PAIRS.map(ids=>({ pair:ids.join(''), ...pairStats(store.state,ids.join('')) })) } : { ready: store.ready, error: store.error } },
    { name: 'show_badminton_pair', description: 'Select an A/B/C matchup and show its match details on the overview.', inputSchema: { type:'object', properties:{ pair:{ type:'string', enum:['AB','BC','CA'] } }, required:['pair'], additionalProperties:false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: input => { if(!input || !['AB','BC','CA'].includes(input.pair))throw new Error('Invalid pair'); selectedPair=input.pair;view='overview';render();return { selectedPair }; } }
  ];
  for (const tool of tools) { try { Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{}); } catch {} }
  addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
