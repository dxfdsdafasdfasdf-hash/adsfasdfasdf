import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const E = process.env, LEAGUE = E.LEAGUE_ID || '1211488374', d = new Date();
const SEASON = E.SEASON || (d.getMonth() < 2 ? d.getFullYear() - 1 : d.getFullYear());
const S2 = E.ESPN_S2 || '', SWID = E.SWID || '', PW = E.APP_PASSWORD || '', TTL = (+E.CACHE_SEC || 300) * 1000;
const BASE = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}`;
const POS = {1:'QB',2:'RB',3:'WR',4:'TE',5:'K',16:'DST'}, SLOT = {0:'QB',2:'RB',4:'WR',6:'TE',23:'FLEX',16:'DST',17:'K'};
const TEAM = {1:'ATL',2:'BUF',3:'CHI',4:'CIN',5:'CLE',6:'DAL',7:'DEN',8:'DET',9:'GB',10:'TEN',11:'IND',12:'KC',13:'LV',14:'LAR',15:'MIA',16:'MIN',17:'NE',18:'NO',19:'NYG',20:'NYJ',21:'PHI',22:'ARI',23:'PIT',24:'LAC',25:'SF',26:'SEA',27:'TB',28:'WSH',29:'CAR',30:'JAX',33:'BAL',34:'HOU'};
const INJ = {ACTIVE:'ok',QUESTIONABLE:'Q',DOUBTFUL:'D',OUT:'OUT',INJURY_RESERVE:'IR',SUSPENSION:'OUT'};

async function espn(url, views, filter) {
  const headers = {accept:'application/json', 'user-agent':'Mozilla/5.0'};
  if (S2 && SWID) headers.cookie = `espn_s2=${S2}; SWID=${SWID}`;
  if (filter) headers['x-fantasy-filter'] = JSON.stringify(filter);
  const r = await fetch(`${url}?${views.map(v => 'view=' + v).join('&')}`, {headers});
  if (!r.ok) {
    const e = new Error(`ESPN returned ${r.status}` + (r.status == 401 || r.status == 403 ? ': league is private, set ESPN_S2 and SWID' : ''));
    e.status = 502; throw e;
  }
  return r.json();
}

// ESPN's projections are already computed with this league's scoring (PPR etc.)
function norm(entry, tid, week, bye) {
  const p = entry.player || entry, s = p.stats || [];
  const w = s.find(x => x.statSourceId == 1 && x.statSplitTypeId == 1 && x.scoringPeriodId == week);
  const a = s.find(x => x.statSourceId == 0 && x.statSplitTypeId == 0);
  const pr = w ? w.appliedTotal : 0, avg = a && a.appliedAverage;
  return {id:p.id, n:p.fullName, p:POS[p.defaultPositionId] || '?', t:TEAM[p.proTeamId] || 'FA',
    pr:+pr.toFixed(1), ros:+(avg ? (.6 * pr + .4 * avg) : pr).toFixed(1), m:5, b:bye[p.proTeamId] || 0,
    st:INJ[p.injuryStatus] || 'ok', tid};
}

async function build() {
  const lg = `${BASE}/segments/0/leagues/${LEAGUE}`;
  const L = await espn(lg, ['mTeam', 'mRoster', 'mMatchup', 'mSettings', 'mStandings']);
  let bye = {};
  try { for (const t of (await espn(BASE, ['proTeamSchedules_wl'])).settings.proTeams) bye[t.id] = t.byeWeek; } catch { bye = {}; }
  const week = L.scoringPeriodId;
  const FA = await espn(lg, ['kona_player_info'], {players:{filterStatus:{value:['FREEAGENT', 'WAIVERS']},
    filterSlotIds:{value:[0, 2, 4, 6, 23, 16, 17]}, limit:120, sortPercOwned:{sortPriority:1, sortAsc:false}}});
  const players = [];
  for (const t of L.teams) for (const e of t.roster.entries) players.push(norm(e.playerPoolEntry, t.id, week, bye));
  for (const e of FA.players || []) players.push(norm(e, 0, week, bye));
  const teams = L.teams.map(t => ({id:t.id, name:t.name || `${t.location} ${t.nickname}`,
    w:t.record.overall.wins, l:t.record.overall.losses, t:t.record.overall.ties,
    pf:t.record.overall.pointsFor, pa:t.record.overall.pointsAgainst}));
  const mine = E.MY_TEAM_ID ? +E.MY_TEAM_ID : (L.teams.find(t => SWID && (t.owners || []).includes(SWID)) || {}).id || null;
  const lsc = L.settings.rosterSettings.lineupSlotCounts, slots = [];
  for (const k of [0, 2, 4, 6, 23, 16, 17]) for (let i = 0; i < (lsc[k] || 0); i++) slots.push(SLOT[k]);
  const mp = L.status.currentMatchupPeriod;
  const matchups = L.schedule.filter(s => s.matchupPeriodId == mp && s.away).map(s => ({h:s.home.teamId, a:s.away.teamId}));
  return {league:L.settings.name, season:SEASON, week, slots, teams, matchups, players, myTeamId:mine, updated:Date.now()};
}

let cache = null;
async function league(force) {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.data;
  try { const data = await build(); cache = {at:Date.now(), data}; return data; }
  catch (e) { if (cache) return {...cache.data, stale:true}; throw e; }
}

http.createServer(async (req, res) => {
  const send = (c, b, t = 'application/json') => {
    res.writeHead(c, {'content-type':t, 'cache-control':'no-store'});
    res.end(typeof b == 'string' ? b : JSON.stringify(b));
  };
  try {
    if (req.url.startsWith('/api/health')) return send(200, {ok:true});
    if (PW) {
      const a = Buffer.from((req.headers.authorization || '').split(' ')[1] || '', 'base64').toString();
      if (a.split(':').slice(1).join(':') !== PW) { res.writeHead(401, {'www-authenticate':'Basic realm="Gridiron GM"'}); return res.end('Auth required'); }
    }
    if (req.url.startsWith('/api/league')) return send(200, await league(req.url.includes('refresh')));
    send(200, fs.readFileSync(path.join(dir, 'public', 'index.html'), 'utf8'), 'text/html; charset=utf-8');
  } catch (e) { send(e.status || 500, {error:e.message}); }
}).listen(+E.PORT || 3000, () => console.log('Gridiron GM up'));
