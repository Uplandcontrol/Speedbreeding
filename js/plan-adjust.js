/* plan-adjust.js — [분기별 계획] 수요조사 요청 반영: 겹침 확인, 원본 보존, 요청 옮기기·되돌리기, 복사·붙여넣기, 개체수 나누기 */

// ── 수요조사 ↔ 분기별 계획 연계 ─────────────────────────────────────────
// 수요조사 응답이 이미 계획(bed_plans)에 들어갔는지는 DB에 따로 적어 두지 않고, 같은 방 · 작물 · 담당자 · 세대로 들어간 계획이 있는지 비교해서 알아낸다.
// (DB를 바꿀 필요가 없고, 예전에 직접 제출한 계획도 그대로 '반영됨'으로 잡힌다)
//   1순위: 같은 자리 + 같은 기간 / 2순위: 같은 방의 다른 자리 + 같은 기간(자리를 옮겨 반영) / 3순위: 같은 자리, 기간만 조정
// 응답은 '같은 제출을 같은 자리에 넣은 것'끼리(세대별로 여러 행) 한 덩어리(group)로 다룬다. 한 덩어리 = 반영 버튼 한 번.
function demandNorm(v){ return v==null ? '' : String(v).trim(); }

function demandSpot(room, bedNo, floor){ return `${demandNorm(room)}|${Number(bedNo)}|${demandNorm(floor)}`; }

function demandOverlap(a, b){ return a.start <= b.end && b.start <= a.end; }   // 'YYYY-MM-DD' 문자열끼리 비교 (끝나는 날과 시작하는 날이 같아도 겹침)

function pushTo(map, key, val){ const a = map.get(key); if(a) a.push(val); else map.set(key, [val]); }

function demandSpotLabel(g){ return `${roomLabel(g.room)} ${spotText(g.bedNo, g.floor)}`; }

function demandConflictText(c){ return `${c.label} (${c.start} ~ ${c.end})`; }

function demandShortDate(ymd){
  if(!ymd) return '?';
  const [y, m, d] = ymd.split('-');
  return y===todayKST().slice(0,4) ? `${Number(m)}/${Number(d)}` : `${y.slice(2)}.${Number(m)}.${Number(d)}`;
}

function demandPeriodText(items){
  return items.map(it=> `${it.gen ? it.gen+' ' : ''}${demandShortDate(it.start)}~${demandShortDate(it.end)}`).join(' · ');
}

// 아직 계획에 없는 기간만 계획 행으로 바꾼다. 그대로 반영할 수 없는 사정이 있으면 { error }
function buildDemandAdoption(g){
  // 저장 전에 옮겨 둔 요청이면 옮긴 날짜로 계산한다 (저장하면 행에 같은 값이 들어간다)
  const rows = g.todo.filter(it=> it.start).map(it=> g.drafted ? { ...it.row, desired_start: it.start, desired_end: it.end } : it.row);
  if(!rows.length) return { error: '희망 기간이 없어요' };
  const entry = surveyGroupToEntry({ key: g.groupKey, rows });
  if(!entry.crop) return { error: '작물이 선택되지 않았어요' };
  return buildPlanRowsFromEntry(entry, { room:{ id:null }, roomName: g.room, bedNo: g.bedNo, floor: g.floor });
}

function computeDemandState(){
  const plans = bedPlans.filter(p=> p.planned_start).map(p=>({
    p, used:false, room: demandNorm(p.room_name), spot: demandSpot(p.room_name, p.structure_no, p.floor),
    who: demandNorm(p.submitted_by), crop: demandNorm(p.crop_name), gen: demandNorm(p.generation),
    start: p.planned_start, end: p.planned_end || p.planned_start
  }));

  // 1) 응답을 (자리 + 같은 제출) 단위로 묶는다
  const groups = [], byKey = new Map();
  demandEffRows().sort((a,b)=> (a.created_at||'').localeCompare(b.created_at||'')).forEach(s=>{   // 저장된 조율이 있으면 조율한 자리 · 날짜 기준 (원본 행은 s._src로 이어진다)
    const room = demandNorm(s.room_name), floor = demandNorm(s.floor);
    if(!room || !floor || s.bed_no==null || !roomBedConfig(room)) return;   // 자리를 알 수 없거나 계획을 세울 수 없는 방
    const spot = demandSpot(room, s.bed_no, floor), groupKey = surveyRowGroupKey(s), key = spot + '#' + groupKey;
    let g = byKey.get(key);
    if(!g){
      g = { key, groupKey, spot, room, bedNo: Number(s.bed_no), floor, rows:[], who: demandNorm(s.respondent_name), crop: demandNorm((s.crops||[])[0]) };
      byKey.set(key, g); groups.push(g);
    }
    g.rows.push(s);
  });
  groups.forEach(g=>{
    g.rows.sort((a,b)=> (a.desired_start||'9999-12-31').localeCompare(b.desired_start||'9999-12-31'));
    g.gid = g.rows.map(r=> String(r.id)).sort()[0];   // 응답이 바뀌지 않는 한 같은 값 (화면의 버튼이 가리키는 표식)
    // 복사본이면 어느 요청에서 복사했는지(copy_of = 원본 묶음의 gid). 원본과 그 복사본들은 family가 같고, 이 묶음 안에서 개체수를 나눈다
    g.copyOf = demandNorm(g.rows[0].copy_of);
    g.isCopy = !!g.copyOf;
    g.family = g.copyOf || g.gid;
    g.items = g.rows.map(s=>{
      const start = s.desired_start || s.desired_end || '', end = s.desired_end || s.desired_start || '';
      return { row: s, gen: demandNorm(s.generation), start, end, state: start ? 'pending' : 'nodate', plan:null, how:'', conflicts:[] };
    });
  });

  // 2) 이미 계획에 들어간 기간 찾기 (계획 하나는 응답 한 건에만 짝지어진다)
  const match = (how, test)=> groups.forEach(g=> g.items.forEach(it=>{
    if(it.state!=='pending') return;
    const pl = plans.find(x=> !x.used && x.crop===g.crop && x.who===g.who && x.gen===it.gen && test(x, g, it));
    if(pl){ pl.used = true; it.state = 'done'; it.plan = pl; it.how = how; }
  }));
  match('exact', (x, g, it)=> x.spot===g.spot && x.start===it.start && x.end===it.end);
  match('moved', (x, g, it)=> x.room===g.room && x.start===it.start && x.end===it.end);
  match('adjusted', (x, g)=> x.spot===g.spot);

  groups.forEach(g=>{
    const dated = g.items.filter(it=> it.start), doneN = dated.filter(it=> it.state==='done').length;
    g.status = !dated.length ? 'nodate' : doneN===dated.length ? 'done' : doneN ? 'partial' : 'pending';
    g.actionable = g.status!=='done';
    g.todo = g.items.filter(it=> it.state!=='done');     // 아직 계획에 없는 기간들
    g.todoRows = g.todo.map(it=> it.row);
    g.movedRows = g.actionable ? g.todoRows.filter(r=> demandOrigOf(r)) : [];   // 관리자가 조율을 저장해 둔 행들 (신청한 그대로의 원본은 응답 칸에 남아 있다)
    g.moved = g.movedRows.length > 0;
  });

  // 저장 전 조율(planDraft): DB에 저장된 값은 그대로 두고, 화면과 겹침 계산에만 옮긴 자리 · 날짜를 적용한다. 원래 자리는 g.saved, 원래 날짜는 it.savedStart/End에 남긴다
  groups.forEach(g=>{
    g.saved = { room: g.room, bedNo: g.bedNo, floor: g.floor, spot: g.spot };
    g.drafted = false;
    const dr = g.actionable ? planDraft.get(g.gid) : null;
    if(!dr) return;
    g.drafted = true;
    g.room = dr.room; g.bedNo = dr.bedNo; g.floor = dr.floor; g.spot = demandSpot(dr.room, dr.bedNo, dr.floor);
    g.items.forEach(it=>{
      if(it.state!=='pending' || !it.start) return;
      it.savedStart = it.start; it.savedEnd = it.end;
      it.start = addDays(it.start, dr.days); it.end = addDays(it.end, dr.days);
    });
  });

  // 3) 같은 자리에서 기간이 겹치는 것 (이미 있는 계획 · 다른 사람의 아직 안 들어간 요청)
  const planBySpot = new Map(), waitBySpot = new Map();
  plans.forEach(x=> pushTo(planBySpot, x.spot, x));
  groups.forEach(g=> g.items.forEach(it=>{ if(it.state==='pending') pushTo(waitBySpot, g.spot, { g, it }); }));
  groups.forEach(g=>{
    g.conflicts = [];
    if(!g.actionable) return;
    const seen = new Set();
    g.items.forEach(it=>{
      if(it.state!=='pending') return;
      const add = (c)=>{
        it.conflicts.push(c);
        const k = c.label + '|' + c.start + '|' + c.end;
        if(!seen.has(k)){ seen.add(k); g.conflicts.push(c); }
      };
      (planBySpot.get(g.spot) || []).forEach(x=>{
        if(g.items.some(i=> i.plan===x) || !demandOverlap(it, x)) return;
        add(demandPlanConflict(x));
      });
      (waitBySpot.get(g.spot) || []).forEach(({ g: g2, it: it2 })=>{
        if(g2===g || !demandOverlap(it, it2)) return;
        add(demandWaitConflict(g2, it2));
      });
    });
    g.build = buildDemandAdoption(g);
    g.problem = g.build.error || '';
    g.canQuick = !g.problem && !g.conflicts.length;
  });

  // 4) 화면용 정리: 방 → 베드 → 층 → 시작일 순
  const roomOrder = [...new Set([...ROW1, ...ROW2])];
  const rank = (name)=>{ const i = roomOrder.indexOf(name); return i<0 ? 999 : i; };
  const actionable = groups.filter(g=> g.actionable).sort((a,b)=>
    rank(a.room)-rank(b.room) || bedOrder(a.bedNo)-bedOrder(b.bedNo) || a.floor.localeCompare(b.floor) || (a.todo[0].start||'9999').localeCompare(b.todo[0].start||'9999'));
  const byRow = new Map();
  groups.forEach(g=> g.items.forEach(it=> byRow.set(String(it.row.id), { g, it })));
  const byGid = new Map(groups.map(g=> [g.gid, g]));
  const families = new Map();   // 같은 요청에서 갈라진 묶음들 (원본 + 복사본들): family → [group]
  groups.forEach(g=> pushTo(families, g.family, g));
  // 그 사이 계획에 들어갔거나 지워진 요청의 임시 조율은 버린다
  [...planDraft.keys()].forEach(k=>{ const g = byGid.get(k); if(!g || !g.actionable) planDraft.delete(k); });
  return {
    groups, actionable, byKey, byRow, byGid, families, planBySpot, waitBySpot,
    counts: {
      wait: actionable.length,
      conflict: actionable.filter(g=> g.conflicts.length).length,
      quick: actionable.filter(g=> g.canQuick).length,
      moved: actionable.filter(g=> g.moved).length,
      drafted: actionable.filter(g=> g.drafted).length,
      done: groups.length - actionable.length
    }
  };
}

// 겹치는 항목 한 줄의 표시 (이미 있는 계획 / 아직 안 들어간 다른 요청)
function demandPlanConflict(x){
  const what = [x.crop, x.gen || demandNorm(x.p.use_purpose)].filter(Boolean).join(' ');
  return { label: `계획 · ${what}${x.who ? ` (${x.who})` : ''}`, start: x.start, end: x.end };
}

function demandWaitConflict(g2, it2){
  return { label: `요청 · ${[g2.crop, it2.gen].filter(Boolean).join(' ')} (${g2.who || '익명'})`, start: it2.start, end: it2.end };
}

// 요청 한 덩어리(g)를 그 자리(spot)에 ranges([{ start, end }])의 기간으로 놓으면 겹치게 될 항목들
function demandProbeRanges(st, g, spot, ranges){
  const out = [], seen = new Set();
  const add = (c)=>{ const k = c.label + '|' + c.start + '|' + c.end; if(!seen.has(k)){ seen.add(k); out.push(c); } };
  ranges.forEach(cand=>{
    (st.planBySpot.get(spot) || []).forEach(x=>{
      if(g.items.some(i=> i.plan===x) || !demandOverlap(cand, x)) return;
      add(demandPlanConflict(x));
    });
    (st.waitBySpot.get(spot) || []).forEach(({ g: g2, it: it2 })=>{
      if(g2===g || !demandOverlap(cand, it2)) return;
      add(demandWaitConflict(g2, it2));
    });
  });
  return out;
}

// 요청 한 덩어리(g)를 그 자리(방 · 베드 · 층)에 days일 밀어서 놓으면 겹치게 될 항목들 (놓기 전에 미리 보여주는 용도)
function demandProbeConflicts(st, g, room, bedNo, floor, days){
  const ranges = g.items.filter(it=> it.state==='pending' && it.start).map(it=> ({ start: addDays(it.start, days), end: addDays(it.end, days) }));
  return demandProbeRanges(st, g, demandSpot(room, bedNo, floor), ranges);
}

// ── 원본 보존 ──
// 수요조사 응답의 방 · 베드 · 층 · 희망 기간 칸은 신청한 그대로 두고 앱이 절대 고치지 않는다 (수요 집계 · 응답 목록은 항상 이 원본을 본다).
// 관리자가 [저장]한 조율(옮긴 자리 · 날짜)은 응답마다 adjusted(jsonb)에 따로 적는다. 계획 쪽(일정표 · 반영)은 조율이 있으면 조율값을, 없으면 원본을 쓴다.
// (예전 방식으로 저장된 옮김은 칸에 옮긴 값이, orig_request에 원본이 들어 있다. 같은 뜻으로 읽어 주고, 다시 저장하거나 되돌릴 때 새 방식으로 옮겨 담는다)
function demandJson(v){
  if(typeof v === 'string'){ try{ v = JSON.parse(v); }catch(e){ return null; } }
  return (v && typeof v === 'object') ? v : null;
}

function demandPick(o){ return Object.fromEntries(DEMAND_MOVE_FIELDS.map(k=> [k, o[k] ?? null])); }

// 응답 한 행의 { orig: 신청한 그대로, adj: 저장된 조율(없으면 null), legacy: 예전 방식 행인지 }
function demandParts(row){
  const adj = demandJson(row.adjusted);
  if(adj){
    // adjusted에는 옮긴 자리 · 날짜와 함께, 관리자가 나눠 둔 개체수(expected_scale)도 들어갈 수 있다. 개체수만 나눈 행은 '옮긴 것'이 아니다 (adj = null)
    const orig = demandPick(row), pos = demandPick(adj);
    const hasPos = DEMAND_MOVE_FIELDS.some(k=> pos[k] != null);
    const samePos = DEMAND_MOVE_FIELDS.every(k=> String(pos[k] ?? '') === String(orig[k] ?? ''));
    return { orig, adj: (hasPos && !samePos) ? pos : null, legacy: false, scale: demandAdjScale(row) };
  }
  const old = demandJson(row.orig_request);
  if(old) return { orig: demandPick(old), adj: demandPick(row), legacy: true, scale: null };
  return { orig: demandPick(row), adj: null, legacy: false, scale: null };
}

// 관리자가 나눠 둔 개체수 (신청한 개체수는 응답 칸에 그대로 있고, 나눈 값은 adjusted.expected_scale에 따로 적는다). 나눈 적이 없으면 null
function demandAdjScale(row){
  const a = demandJson(row.adjusted), v = a && a.expected_scale;
  return (v == null || v === '' || isNaN(Number(v))) ? null : Number(v);
}

// 계획 쪽에서 쓰는 응답 행: 조율이 저장돼 있으면 조율한 자리 · 날짜 · 개체수를 입힌 복사본(_src = 실제 행), 없으면 그 행 그대로
function demandEffective(row){
  const p = demandParts(row);
  if(!p.adj && p.scale == null) return row;
  const eff = { ...row, ...(p.adj || {}), _src: row };
  if(p.scale != null) eff.expected_scale = p.scale;
  return eff;
}

function demandEffRows(){ return [...demandSurveys, ...demandCopies].map(demandEffective); }

// 저장된 조율이 있는 행이면 원본(신청한 그대로), 없으면 null
function demandOrigOf(row){ const p = demandParts(row._src || row); return p.adj ? p.orig : null; }

// 저장된 조율(옮긴 자리 · 날짜), 없으면 null
function demandAdjOf(row){ return demandParts(row._src || row).adj; }

function demandOrigSpotText(o){
  return (o && o.room_name && o.floor && o.bed_no!=null) ? `${roomLabel(o.room_name)} ${spotText(o.bed_no, o.floor)}` : '';
}

function demandOrigDateText(row, o){
  const s = o.desired_start || o.desired_end, e = o.desired_end || o.desired_start;
  return s ? `${row.generation ? row.generation+' ' : ''}${demandShortDate(s)}~${demandShortDate(e)}` : '';
}

// 저장 전 조율 중인 요청의 '지금 저장돼 있는' 자리 · 기간
function demandSavedText(g){
  const dates = g.items.filter(it=> it.savedStart).map(it=> `${it.gen ? it.gen+' ' : ''}${demandShortDate(it.savedStart)}~${demandShortDate(it.savedEnd)}`).join(' · ');
  return [`${roomLabel(g.saved.room)} ${spotText(g.saved.bedNo, g.saved.floor)}`, dates].filter(Boolean).join(' · ');
}

// 처음 신청한 자리 · 기간 (예: '세대단축실 1 베드 3 · 1층 · F1 3/1~4/10')
function demandOrigText(g){
  const rows = g.movedRows || [];
  if(!rows.length) return '';
  const dates = rows.map(r=> demandOrigDateText(r, demandOrigOf(r))).filter(Boolean).join(' · ');
  return [demandOrigSpotText(demandOrigOf(rows[0])), dates].filter(Boolean).join(' · ');
}

// 요청 한 덩어리를 요청한 그대로 계획에 넣는다 (이미 있는 계획은 건드리지 않고 추가만 한다)
async function adoptDemand(gid){
  if(!isAdmin){ alert('분기별 계획은 전체 관리자만 작성할 수 있어요.'); return; }
  if(planDemandBusy) return;
  let g = computeDemandState().byGid.get(String(gid));
  if(!g || !g.actionable){ closePlanBarPopup(); await loadAll(); return; }   // 그 사이 다른 곳에서 이미 반영됨
  if(g.problem){
    showToast(`${g.problem} · 수정 창에서 채워주세요`);
    openPlanModalForDemand(gid);
    return;
  }
  const hadConflict = g.conflicts.length > 0;
  if(hadConflict){
    const lines = g.conflicts.slice(0, 5).map(c=> '· ' + demandConflictText(c)).join('\n') + (g.conflicts.length>5 ? `\n… 외 ${g.conflicts.length-5}건` : '');
    if(!confirm(`${demandSpotLabel(g)}에 기간이 겹치는 항목이 ${g.conflicts.length}개 있어요.\n\n${lines}\n\n그래도 계획에 반영할까요?${g.drafted ? '\n(저장 전에 옮겨 둔 자리 · 날짜도 함께 저장돼요)' : ''}`)) return;
  }
  // 저장 전에 옮겨 둔 요청이면 옮긴 자리 · 날짜를 먼저 저장한다 (안 그러면 계획과 요청의 자리 · 날짜가 달라서 '반영 완료'로 인식되지 않는다)
  const wasDrafted = g.drafted;
  if(wasDrafted){
    if(!(await savePlanDraft([g.gid], true))) return;
    g = computeDemandState().byGid.get(String(gid));
    if(!g || !g.actionable || g.problem) return;
  }
  planDemandBusy = true;
  try{
    const room = await ensurePlanRoom(g.room);
    if(!room) return;
    const rows = g.build.rows.map(r=> ({ ...r, room_id: room.id }));
    const ins = await insertPlanRows(rows);
    if(ins.error){ alert('반영 실패!\n\n' + (ins.error.message||JSON.stringify(ins.error))); return; }
    closePlanBarPopup();
    if(ins.droppedExtras) alertPlanExtrasDropped(ins.droppedCols);
    else showToast(`${wasDrafted ? '옮긴 내용을 저장하고 ' : ''}계획에 반영됐어요 · ${demandSpotLabel(g)}${hadConflict ? ' · 겹치는 기간은 화살표 2개로 보여요' : ''}`);
  } finally {
    planDemandBusy = false;
  }
  await loadAll();
  // 겹쳐 넣었으면, 위아래로 쌓인 화살표가 바로 보이도록 그 자리를 강조한다
  if(hadConflict && viewMode==='plan') flashPlanLane(g.room, g.bedNo, g.floor);
}

// 겹치지 않고 정보도 다 갖춰진 요청을 한꺼번에 계획에 넣는다
async function adoptAllCleanDemand(){
  if(!isAdmin){ alert('분기별 계획은 전체 관리자만 작성할 수 있어요.'); return; }
  if(planDemandBusy) return;
  let targets = computeDemandState().groups.filter(g=> g.canQuick);
  if(!targets.length){ showToast('한 번에 반영할 수 있는 요청이 없어요'); return; }
  const draftedN = targets.filter(g=> g.drafted).length;
  if(!confirm(`겹치지 않고 정보가 다 갖춰진 요청 ${targets.length}건을 계획에 한 번에 반영할까요?\n\n(기간이 겹치거나 정보가 부족한 요청은 그대로 남겨둬요)${draftedN ? `\n(저장 전에 옮겨 둔 ${draftedN}건은 옮긴 자리 · 날짜도 함께 저장돼요)` : ''}`)) return;
  if(draftedN){   // 옮겨 둔 요청은 옮긴 자리 · 날짜를 먼저 저장한 뒤 반영한다
    if(!(await savePlanDraft(targets.filter(g=> g.drafted).map(g=> g.gid), true))) return;
    const keep = new Set(targets.map(g=> g.gid));
    targets = computeDemandState().groups.filter(g=> keep.has(g.gid) && g.canQuick);
    if(!targets.length) return;
  }
  planDemandBusy = true;
  try{
    const roomIds = new Map();
    for(const name of new Set(targets.map(g=> g.room))){
      const room = await ensurePlanRoom(name);
      if(!room) return;
      roomIds.set(name, room.id);
    }
    const rows = targets.flatMap(g=> g.build.rows.map(r=> ({ ...r, room_id: roomIds.get(g.room) })));
    const ins = await insertPlanRows(rows);
    if(ins.error){ alert('반영 실패!\n\n' + (ins.error.message||JSON.stringify(ins.error))); return; }
    if(ins.droppedExtras) alertPlanExtrasDropped(ins.droppedCols);
    else showToast(`요청 ${targets.length}건이 계획에 반영됐어요`);
  } finally {
    planDemandBusy = false;
  }
  await loadAll();
}

// ── 요청 옮기기 (일정표에서 끌어서 조율) ──────────────────────────────────
// 아직 계획에 넣지 않은 요청을 다른 자리(방 · 베드 · 층)나 다른 날짜로 옮겨서, 같은 자리에서 기간이 겹치지 않게 맞춘다.
// 끌어서 놓으면 먼저 '저장 전 조율'(planDraft, 메모리에만 있음)로만 옮겨 보이고, [저장]을 눌러야 수요조사 응답(demand_survey)의
// adjusted(jsonb)에 기록된다. 저장하지 않고 새로고침하거나 [취소]하면 저장된 자리 · 날짜로 돌아간다.
// 신청한 그대로의 원본(방 · 베드 · 층 · 희망 기간 칸)은 저장해도 바뀌지 않는다. 저장된 뒤의 [반영]은 조율한 값으로, [원래 신청 그대로 반영]은 원본으로 계획에 들어가고,
// [원래대로]는 adjusted만 지워서 원본 상태로 돌린다. 계획에 이미 들어간 기간은 건드리지 않는다.
const DEMAND_MOVE_FIELDS = ['room_name','bed_no','floor','desired_start','desired_end'];

// copy_of: 일정표에서 복사 · 붙여넣기로 만든 요청의 표식 (어느 요청에서 복사했는지). 삭제 정책: 복사본을 지울 때 필요
const DEMAND_MOVE_SQL = 'alter table demand_survey add column if not exists adjusted jsonb, add column if not exists copy_of uuid;\n'
  + 'drop policy if exists "public update" on demand_survey;\n'
  + 'create policy "public update" on demand_survey for update to anon, authenticated using (true) with check (true);\n'
  + 'drop policy if exists "public delete" on demand_survey;\n'
  + 'create policy "public delete" on demand_survey for delete to anon, authenticated using (true);\n'
  + 'grant update, delete on public.demand_survey to anon, authenticated;\n'
  + "notify pgrst, 'reload schema';";

// 행마다 { row, patch }를 받아 화면부터 바꾸고 DB에 저장한다. 하나라도 실패하면 안내하고 DB 기준으로 다시 불러온다
async function applyDemandPatches(items, failTitle){
  planDemandBusy = true;
  items.forEach(({ row, patch })=> Object.assign(row, patch));
  if(viewMode==='plan') renderPlanView();
  let failMsg = '';
  try{
    const results = await Promise.all(items.map(({ row, patch })=> sb.from('demand_survey').update(patch).eq('id', row.id).select('id')));
    const bad = results.find(r=> r.error);
    if(bad) failMsg = bad.error.message || JSON.stringify(bad.error);
    else if(results.some(r=> !(r.data||[]).length)) failMsg = '수요조사 응답을 수정할 권한이 없어요.';
  } catch(e){
    failMsg = e.message || String(e);
  } finally {
    planDemandBusy = false;
  }
  if(failMsg){
    // 원인을 쉬운 말로: 조율을 저장할 칸(adjusted)이 없거나, 수요조사 응답을 수정할 권한이 없는 경우가 대부분이다 (Supabase에서 한 번만 설정하면 된다)
    const reason = /adjusted|column|PGRST204|schema cache/i.test(failMsg) ? '수요조사 테이블에 조율을 저장할 칸(adjusted)이 아직 없어요.'
      : /권한|policy|permission|row-level|not allowed|PGRST116/i.test(failMsg) ? '수요조사 응답을 수정할 권한이 아직 없어요.' : '';
    showSqlHelp(failTitle || '저장하지 못했어요!', reason, failMsg);
    await loadAll();   // 화면에서만 바꿔 둔 값을 DB에 있는 값으로 되돌린다
    return false;
  }
  return true;
}

// Supabase 설정(SQL)이 필요할 때 띄우는 안내 창: 글자를 드래그하지 않아도 [SQL 복사] 한 번이면 되고, 닫아도 옮겨 둔 내용은 그대로 남는다
function showSqlHelp(title, reason, detail){
  closeSqlHelp();
  const ov = document.createElement('div');
  ov.className = 'sqlhelp-overlay';
  ov.id = 'sqlHelpOverlay';
  ov.innerHTML = `
    <div class="sqlhelp-box" role="dialog" aria-modal="true">
      <h3>${escapeHtml(title)}</h3>
      ${reason ? `<p class="why">${escapeHtml(reason)}</p>` : ''}
      <p class="raw">자세한 오류: ${escapeHtml(detail)}</p>
      <div class="how">Supabase 설정을 <b>처음 한 번만</b> 해주세요.
        <ol>
          <li><a href="https://supabase.com/dashboard" target="_blank" rel="noopener">supabase.com</a>에서 이 프로젝트를 열고, 왼쪽 메뉴의 <b>SQL Editor</b>를 눌러요.</li>
          <li><b>New query</b>를 누르고, 아래 내용을 <b>[SQL 복사]</b>로 복사해서 붙여넣은 뒤 <b>Run</b>을 눌러요.</li>
          <li>이 화면으로 돌아와서 하던 동작(<b>[저장]</b> · <b>[붙여넣기]</b> · 삭제)을 다시 해요.</li>
        </ol>
      </div>
      <textarea id="sqlHelpText" readonly rows="7" spellcheck="false">${escapeHtml(DEMAND_MOVE_SQL)}</textarea>
      <div class="sqlhelp-act">
        <button type="button" class="btn primary" onclick="copySqlHelp()">SQL 복사</button>
        <button type="button" class="btn" onclick="closeSqlHelp()">닫기</button>
      </div>
      <p class="keep">옮겨 둔 내용은 그대로 남아 있어요. 새로고침하지 마세요.</p>
    </div>`;
  ov.addEventListener('click', (e)=>{ if(e.target===ov) closeSqlHelp(); });
  document.body.appendChild(ov);
}

function closeSqlHelp(){
  const ov = document.getElementById('sqlHelpOverlay');
  if(ov) ov.remove();
}

function copySqlHelp(){
  const ta = document.getElementById('sqlHelpText');
  if(!ta) return;
  let settled = false;
  const once = (fn)=> ()=>{ if(settled) return; settled = true; fn(); };
  const done = once(()=> showToast('SQL을 복사했어요 · Supabase SQL Editor에 붙여넣고 Run을 눌러주세요'));
  const fallback = once(()=>{   // 브라우저가 클립보드 접근을 막거나 응답이 없는 경우: 글자를 선택해 두고 복사 명령을 쓴다. 그래도 안 되면 손으로 복사하는 방법을 알려준다
    ta.focus(); ta.select();
    try{ if(document.execCommand('copy')){ showToast('SQL을 복사했어요 · Supabase SQL Editor에 붙여넣고 Run을 눌러주세요'); return; } }catch(e){}
    showToast('복사가 막혔어요 · 상자 안을 눌러 전체 선택(Ctrl+A) 후 복사(Ctrl+C)해주세요');
  });
  setTimeout(fallback, 1500);   // 클립보드 요청이 아무 응답이 없어도 사용자가 멈춘 줄 알지 않게
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, fallback);
  else fallback();
}

// 끌어서 놓은 결과를 '저장 전 조율'로 기록한다 (DB에는 쓰지 않는다).
// drop.days는 지금 화면에 보이는 날짜 기준으로 더 민 일수라서, 이미 임시로 밀어 둔 일수에 더한다
function setPlanDraft(g, drop){
  const days = (planDraft.has(g.gid) ? planDraft.get(g.gid).days : 0) + drop.days;
  if(drop.spot===g.saved.spot && days===0) planDraft.delete(g.gid);   // 저장된 자리 · 날짜로 돌아왔으면 조율한 게 없는 것
  else planDraft.set(g.gid, { room: drop.room, bedNo: drop.bedNo, floor: drop.floor, days });
}

// 요청 한 덩어리의 아직 계획에 없는 행들을 to({ room, bedNo, floor, days }) 자리로 옮기고 날짜를 days일 밀 때 DB에 쓸 값.
// 원본 칸은 건드리지 않고 adjusted만 쓴다 (원본과 같아졌으면 adjusted를 지운다)
function buildMovePatches(g, to){
  return g.todoRows.map(eff=>{
    const row = eff._src || eff;   // 실제 응답 행 (조율이 저장된 행은 eff가 복사본이다)
    const { orig, legacy } = demandParts(row);
    const next = {
      room_name: to.room, bed_no: to.bedNo, floor: to.floor,
      desired_start: eff.desired_start ? addDays(eff.desired_start, to.days) : null,   // eff = 지금 저장돼 있는 조율(없으면 원본) 기준으로 민다
      desired_end: eff.desired_end ? addDays(eff.desired_end, to.days) : null
    };
    const backToOrig = DEMAND_MOVE_FIELDS.every(k=> String(next[k] ?? '') === String(orig[k] ?? ''));
    const keepScale = legacy ? null : demandAdjScale(row);   // 관리자가 나눠 둔 개체수는 자리를 옮겨도 그대로 둔다
    const patch = { adjusted: (backToOrig && keepScale==null) ? null : { ...next, ...(keepScale!=null ? { expected_scale: keepScale } : {}) } };
    if(legacy) Object.assign(patch, orig, { orig_request: null });   // 예전 방식 행은 이때 새 방식으로 옮겨 담는다: 칸은 원본으로 되돌리고, 조율은 adjusted로
    return { row, patch };
  });
}

// 저장 전 조율을 DB에 저장한다 (gid 목록을 안 주면 전부). quiet면 완료 안내를 띄우지 않는다. 저장되면 true
async function savePlanDraft(onlyGids, quiet){
  if(tourBlockWrite()) return false;
  if(!isAdmin){ alert('분기별 계획은 전체 관리자만 조율할 수 있어요.'); return false; }
  if(planDemandBusy) return false;
  const st = computeDemandState();
  const gids = (onlyGids ? onlyGids.map(String) : [...planDraft.keys()]).filter(k=> planDraft.has(k));
  const items = [], snapshot = new Map();
  gids.forEach(k=>{
    const g = st.byGid.get(k), dr = planDraft.get(k);
    if(!g || !g.actionable || !dr) return;
    snapshot.set(k, dr);
    items.push(...buildMovePatches(g, dr));
  });
  if(!items.length){
    gids.forEach(k=> planDraft.delete(k));
    if(viewMode==='plan') renderPlanView();
    return true;
  }
  // 저장된 행에 옮긴 값이 그대로 들어가므로 임시 조율은 먼저 비운다 (안 비우면 날짜가 이중으로 밀려 보인다)
  gids.forEach(k=> planDraft.delete(k));
  const ok = await applyDemandPatches(items);
  if(!ok){   // 저장 실패: 사용자가 SQL을 실행하고 다시 저장할 수 있게 임시 조율은 되살린다
    snapshot.forEach((dr, k)=> planDraft.set(k, dr));
    if(viewMode==='plan') renderPlanView();
    return false;
  }
  if(!quiet){
    const left = computeDemandState().counts.conflict;
    showToast(`${snapshot.size}건의 조율을 저장했어요${left ? ` · ⚠ 기간 겹침 ${left}건 남음` : ' · 겹침 없음'}`);
  }
  return true;
}

// 저장 전 조율을 취소해서 저장된 자리 · 날짜로 되돌린다 (gid를 안 주면 전부)
function cancelPlanDraft(gid){
  if(gid==null){
    if(!planDraft.size) return;
    if(planDraft.size > 1 && !confirm(`저장하지 않은 조율 ${planDraft.size}건을 모두 취소하고 원래 자리로 되돌릴까요?`)) return;
    planDraft.clear();
  } else {
    planDraft.delete(String(gid));
  }
  closePlanBarPopup();
  showToast('저장하지 않은 조율을 취소했어요');
  if(viewMode==='plan') renderPlanView();
}

// 저장된 조율을 지워서 처음 신청한 자리 · 기간(원본)으로 되돌린다 (gid를 안 주면 조율을 저장해 둔 요청 전부). 원본 칸은 원래 그대로라서 adjusted만 지우면 된다
function restorePatches(g){
  return g.movedRows.map(eff=>{
    const row = eff._src || eff;
    const { orig, legacy } = demandParts(row);
    const keepScale = legacy ? null : demandAdjScale(row);   // 되돌리는 건 자리 · 날짜뿐이고, 나눠 둔 개체수는 남긴다
    const patch = { adjusted: keepScale==null ? null : { ...orig, expected_scale: keepScale } };
    if(legacy) Object.assign(patch, orig, { orig_request: null });   // 예전 방식 행: 칸에 들어 있던 옮긴 값을 원본으로 되돌린다
    return { row, patch };
  });
}

async function restoreDemand(gid){
  if(tourBlockWrite()) return;
  if(!isAdmin){ alert('분기별 계획은 전체 관리자만 조율할 수 있어요.'); return; }
  if(planDemandBusy) return;
  const st = computeDemandState();
  const targets = gid==null ? st.actionable.filter(g=> g.moved) : [st.byGid.get(String(gid))].filter(g=> g && g.actionable && g.moved);
  if(!targets.length){ showToast('되돌릴 요청이 없어요'); return; }
  if(gid==null && !confirm(`저장된 조율 ${targets.length}건을 모두 지우고 처음 신청한 자리 · 기간으로 되돌릴까요?\n(신청한 원본은 그대로 남아 있어요)`)) return;
  targets.forEach(g=> planDraft.delete(g.gid));   // 같은 요청의 저장 전 조율이 남아 있으면 같이 버린다 (되돌린 값 위에 또 밀리지 않게)
  const items = targets.flatMap(restorePatches);
  closePlanBarPopup();
  if(await applyDemandPatches(items)) showToast(`${targets.length}건을 처음 신청한 대로 되돌렸어요`);
}

// 조율을 저장해 둔 요청을 '처음 신청한 그대로' 계획에 넣는다. 신청 원본은 저장된 조율과 상관없이 남아 있어서 언제든 쓸 수 있다.
// 반영되면 그 요청의 조율은 지워져서(원본 상태로 돌아가) 방금 넣은 계획과 요청의 자리 · 날짜가 같아지고, '반영 완료'로 인식된다
async function adoptOriginalDemand(gid){
  if(tourBlockWrite()) return;
  if(!isAdmin){ alert('분기별 계획은 전체 관리자만 작성할 수 있어요.'); return; }
  if(planDemandBusy) return;
  const st = computeDemandState();
  const g = st.byGid.get(String(gid));
  if(!g || !g.actionable || !g.moved){ showToast('원래 신청대로 반영할 요청이 없어요'); return; }
  // 원본 값으로 계획 행을 만든다
  const origRows = g.todoRows.map(eff=>{ const row = eff._src || eff; return { ...row, ...demandParts(row).orig, expected_scale: eff.expected_scale }; });   // 자리 · 기간은 신청한 그대로, 개체수는 나눠 둔 값
  const o0 = demandParts(g.movedRows[0]._src || g.movedRows[0]).orig;
  const room = o0.room_name, bedNo = Number(o0.bed_no), floor = o0.floor;
  const entry = surveyGroupToEntry({ key: g.groupKey, rows: origRows });
  if(!entry.crop){ showToast('작물이 선택되지 않았어요 · 수정 창에서 채워주세요'); return; }
  const build = buildPlanRowsFromEntry(entry, { room:{ id:null }, roomName: room, bedNo, floor });
  if(build.error){ alert('원래 신청 그대로는 반영할 수 없어요.\n\n' + build.error); return; }
  const where = `${roomLabel(room)} ${spotText(bedNo, floor)}`;
  const ranges = origRows.filter(r=> r.desired_start || r.desired_end).map(r=> ({ start: r.desired_start || r.desired_end, end: r.desired_end || r.desired_start }));
  const conflicts = demandProbeRanges(st, g, demandSpot(room, bedNo, floor), ranges);
  const lines = conflicts.slice(0, 5).map(c=> '· ' + demandConflictText(c)).join('\n') + (conflicts.length>5 ? `\n… 외 ${conflicts.length-5}건` : '');
  if(!confirm(`원래 신청 그대로 계획에 반영할까요?\n\n${where} · ${demandOrigText(g)}\n\n지금 저장해 둔 조율(${demandSpotLabel(g)})은 지워져요.${conflicts.length ? `\n\n⚠ 기간이 겹치는 항목이 ${conflicts.length}개 있어요.\n${lines}` : ''}`)) return;
  planDraft.delete(g.gid);
  planDemandBusy = true;
  try{
    const r = await ensurePlanRoom(room);
    if(!r) return;
    const ins = await insertPlanRows(build.rows.map(x=> ({ ...x, room_id: r.id })));
    if(ins.error){ alert('반영 실패!\n\n' + (ins.error.message||JSON.stringify(ins.error))); return; }
    if(ins.droppedExtras) alertPlanExtrasDropped(ins.droppedCols);
  } finally {
    planDemandBusy = false;
  }
  closePlanBarPopup();
  const cleared = await applyDemandPatches(restorePatches(g), '계획에는 반영됐지만, 저장해 둔 조율을 지우지 못했어요!');
  await loadAll();
  if(cleared) showToast(`원래 신청 그대로 계획에 반영됐어요 · ${where}`);
}

// ── 요청 복사 · 붙여넣기 · 개체수 분배 ──────────────────────────────────────
// 요청 한 건(한 자리의 한 응답)을 복사해 두었다가 다른 베드 · 층에 붙여넣는다. 세대단축실 한 베드 규모로 받은 요청을 베드가 작은 방
// (인공교배실 · 고온검정실)으로 옮길 때, 같은 조합을 여러 베드에 나눠 놓기 위한 기능이다.
// 붙여넣으면 원본과 같은 내용의 응답 행이 새로 저장된다 (copy_of = 원본 묶음의 표식). 복사본은 수요 집계 · 응답 목록에는 세지 않고,
// 분기별 계획에서는 일반 요청처럼 끌어 옮기고 반영한다. 원본 + 복사본은 한 묶음(family)이라 개체수를 합계를 보며 나눈다.
// 원본 응답의 개체수 칸은 고치지 않고, 나눈 값은 adjusted.expected_scale에 따로 적는다 (복사본은 자기 개체수 칸을 고친다).
function activeClip(){ return planClip.find(c=> c.id===planClipActive) || planClip[planClip.length-1] || null; }

function scaleNum(v){ return (v == null || v === '' || isNaN(Number(v))) ? null : Number(v); }

function round2(n){ return Math.round(n * 100) / 100; }

// 요청 묶음을 복사해 둔다 (붙여넣을 때 쓸 내용을 지금 모양 그대로 기억한다. 저장 전에 옮겨 둔 날짜도 그대로)
function copyDemandToClip(gid){
  if(!isAdmin){ alert('분기별 계획은 전체 관리자만 조율할 수 있어요.'); return; }
  const g = computeDemandState().byGid.get(String(gid));
  if(!g || !g.actionable){ showToast('복사할 수 있는 요청이 아니에요'); return; }
  const rows = g.todo.map(it=>{
    const r = { ...it.row, desired_start: it.start || null, desired_end: it.end || null };
    delete r._src;
    return r;
  });
  const what = [g.crop || '작물 미정', g.todo[0].gen || (g.rows[0].purposes||[])[0]].filter(Boolean).join(' ');
  const item = { id: 'c' + (++planClipSeq), srcGid: g.gid, family: g.family, label: `${g.who || '익명'} · ${what}`, rows };
  const same = planClip.findIndex(c=> c.srcGid === g.gid);
  if(same >= 0) planClip.splice(same, 1);   // 같은 요청을 다시 복사하면 최신 내용으로 바꾼다
  planClip.push(item);
  planClipActive = item.id;
  closePlanBarPopup();
  if(viewMode==='plan') renderPlanView();
  showToast('복사했어요 · 붙여넣을 베드 · 층 줄 오른쪽의 [붙여넣기]를 눌러주세요');
}

function selectClip(id){ planClipActive = id; renderPlanView(); }

function removeClip(id){
  const i = planClip.findIndex(c=> c.id===id);
  if(i >= 0) planClip.splice(i, 1);
  if(planClipActive===id) planClipActive = planClip.length ? planClip[planClip.length-1].id : null;
  renderPlanView();
}

function clearClip(){ planClip.length = 0; planClipActive = null; renderPlanView(); }

// 일정표의 [붙여넣기] 버튼: 그 줄의 방 · 베드 · 층에 고른 복사본을 붙여넣는다
function pasteClipToLane(btn){
  const lane = btn.closest('.plan-lane');
  if(lane) pasteClip(lane.dataset.room, Number(lane.dataset.bed), lane.dataset.floor);
}

async function pasteClip(room, bedNo, floor){
  if(tourBlockWrite()) return;
  if(!isAdmin){ alert('분기별 계획은 전체 관리자만 조율할 수 있어요.'); return; }
  if(planDemandBusy) return;
  const item = activeClip();
  if(!item){ showToast('먼저 복사할 요청을 골라주세요'); return; }
  const stamp = new Date().toISOString();   // 한 번 붙여넣은 행들(세대별 여러 행)은 같은 접수 시각이라 한 요청으로 묶인다
  const rows = item.rows.map(r=>{
    const row = { ...r };
    ['id', 'adjusted', 'orig_request'].forEach(k=> delete row[k]);
    return Object.assign(row, { room_name: room, bed_no: bedNo, floor, copy_of: item.family, created_at: stamp });
  });
  planDemandBusy = true;
  let failMsg = '';
  try{
    const { error } = await sb.from('demand_survey').insert(rows);
    if(error) failMsg = error.message || JSON.stringify(error);
  } catch(e){
    failMsg = e.message || String(e);
  } finally {
    planDemandBusy = false;
  }
  if(failMsg){
    showSqlHelp('붙여넣지 못했어요!', /copy_of|column|PGRST204|schema cache/i.test(failMsg) ? '수요조사 테이블에 복사본 표식 칸(copy_of)이 아직 없어요.' : '', failMsg);
    return;
  }
  await loadAll();
  const st = computeDemandState(), spot = demandSpot(room, bedNo, floor);
  const made = st.groups.find(g=> g.isCopy && g.spot===spot && new Date(g.rows[0].created_at).getTime() === new Date(stamp).getTime());
  const famN = (st.families.get(item.family) || []).length;
  const off = !roomIsActive(roomByName(room));
  showToast(`${roomLabel(room)} ${spotText(bedNo, floor)}에 붙여넣었어요 · ${made && made.conflicts.length ? `⚠ 기간 겹침 ${made.conflicts.length}건` : '겹침 없음'}${off ? ' · ⚠ 사용 중지한 방' : ''} · 같은 조합 ${famN}곳 · 개체수는 [개체수 분배]에서 나눠요`);
  const laneEl = [...document.querySelectorAll('#planViewWrap .plan-lane')].find(el=> el.dataset.lane===spot);
  if(laneEl){ laneEl.classList.remove('flash'); void laneEl.offsetWidth; laneEl.classList.add('flash'); setTimeout(()=> laneEl.classList.remove('flash'), 2600); }
}

// 복사본을 지운다 (아직 계획에 안 넣은 기간의 행만). 원본 응답은 건드리지 않는다
async function deleteDemandCopy(gid){
  if(tourBlockWrite()) return;
  if(!isAdmin){ alert('분기별 계획은 전체 관리자만 조율할 수 있어요.'); return; }
  if(planDemandBusy) return;
  const g = computeDemandState().byGid.get(String(gid));
  if(!g || !g.isCopy || !g.actionable){ showToast('지울 수 있는 복사본이 아니에요'); return; }
  if(!confirm(`복사본을 삭제할까요?\n\n${demandSpotLabel(g)} · ${[g.crop, g.todo[0].gen].filter(Boolean).join(' ')}\n(원본 요청은 그대로 남아요)`)) return;
  const ids = g.todoRows.map(r=> r.id);
  planDraft.delete(g.gid);
  planDemandBusy = true;
  let failMsg = '', gone = [];
  try{
    const res = await sb.from('demand_survey').delete().in('id', ids).select('id');
    if(res.error) failMsg = res.error.message || JSON.stringify(res.error);
    else gone = res.data || [];
  } catch(e){
    failMsg = e.message || String(e);
  } finally {
    planDemandBusy = false;
  }
  if(failMsg || !gone.length){
    showSqlHelp('복사본을 지우지 못했어요!', '수요조사 응답을 지울 권한이 아직 없어요.', failMsg || '삭제된 행이 없어요');
    return;
  }
  closePlanBarPopup();
  showToast('복사본을 삭제했어요');
  await loadAll();
}

// 한 묶음(원본 + 복사본들)의 개체수 현황: members(원본 먼저), orig(처음 신청한 개체수, 모르면 null), sum(지금 나눠 둔 합계)
function demandFamilyInfo(st, family){
  const members = (st.families.get(String(family)) || []).slice().sort((a, b)=>
    Number(a.isCopy) - Number(b.isCopy) || (a.rows[0].created_at||'').localeCompare(b.rows[0].created_at||'') || a.gid.localeCompare(b.gid));
  const root = members.find(m=> !m.isCopy);
  const orig = root ? scaleNum((root.rows[0]._src || root.rows[0]).expected_scale) : null;   // 원본 응답에 적힌 그대로
  const sum = round2(members.reduce((a, g)=> a + (scaleNum(g.rows[0].expected_scale) || 0), 0));
  return { members, orig, sum };
}

// 개체수 분배 창: 같은 조합의 원본 + 복사본마다 개체수를 적는다. 합계는 원래 신청 개체수와 맞춰 보여준다
let scaleSplit = null;   // 열려 있는 분배 창의 상태: { family, orig, fixed } (fixed = 이미 계획에 들어가서 고칠 수 없는 자리들의 개체수 합)

function openScaleSplit(family){
  if(!isAdmin){ alert('분기별 계획은 전체 관리자만 조율할 수 있어요.'); return; }
  const info = demandFamilyInfo(computeDemandState(), family);
  if(info.members.length < 2){ showToast('아직 복사본이 없어요 · 요청을 복사해서 다른 베드에 붙여넣으면 나눌 수 있어요'); return; }
  const g0 = info.members[0], s0 = g0.rows[0];
  const fixed = round2(info.members.filter(g=> !g.actionable).reduce((a, g)=> a + (scaleNum(g.rows[0].expected_scale) || 0), 0));
  scaleSplit = { family: String(family), orig: info.orig, fixed };
  const rowsHtml = info.members.map(g=>{
    const v = scaleNum(g.rows[0].expected_scale);
    const dated = g.todo.filter(it=> it.start);
    const when = (g.actionable ? (dated.length ? demandPeriodText(dated) : '희망 기간 없음') : '계획에 반영됨');
    return `<div class="ss-row">
      <div class="ss-where"><b>${escapeHtml(demandSpotLabel(g))}</b><small>${g.isCopy ? '복사본' : '원본'} · ${escapeHtml(when)}</small></div>
      <label class="ss-field"><input type="number" class="ss-in" min="0" step="any" inputmode="decimal" data-gid="${escapeHtml(g.gid)}" value="${v==null ? '' : v}" ${g.actionable ? '' : 'disabled'} oninput="scaleSplitSum()" /><span>개체</span></label>
    </div>`;
  }).join('');
  const head = [g0.who || '익명', g0.crop || '작물 미정', (s0.purposes||[])[0]].filter(Boolean).map(escapeHtml).join(' · ');
  document.getElementById('planBarModalTitle').innerHTML =
    `<span style="width:10px; height:10px; border-radius:3px; background:${planColorOf(g0.crop, (s0.purposes||[])[0])}; flex-shrink:0;"></span><span>개체수 분배 · ${escapeHtml(g0.crop || '작물 미정')}</span>`;
  document.getElementById('planBarModalBody').innerHTML = `
    <div class="ss-intro">${head}<br>같은 조합을 <b>${info.members.length}곳</b>에 놓았어요. 자리마다 개체수를 적어 주세요.${info.orig==null ? '' : ` 처음 신청한 개체수는 <b>${info.orig.toLocaleString()}개체</b>예요.`}</div>
    <div class="ss-list">${rowsHtml}</div>
    <div class="ss-sum" id="scaleSplitSum"></div>`;
  document.getElementById('planBarModalActions').innerHTML =
    `<button class="btn" onclick="scaleSplitEven()" ${info.orig==null ? 'disabled title="처음 신청한 개체수가 없어서 똑같이 나눌 수 없어요"' : 'title="처음 신청한 개체수를 자리 수로 똑같이 나눠요"'}>똑같이 나누기</button>`
    + `<button class="btn primary" onclick="saveScaleSplit()">저장</button>`
    + `<button class="btn" onclick="closePlanBarPopup()">닫기</button>`;
  document.getElementById('planBarModalOverlay').classList.add('open');
  scaleSplitSum();
}

// 합계 줄: 입력할 때마다 원래 신청 개체수와 비교해서 남음 · 넘침을 알려준다
function scaleSplitSum(){
  const el = document.getElementById('scaleSplitSum');
  if(!el || !scaleSplit) return;
  let sum = scaleSplit.fixed, blank = 0;
  document.querySelectorAll('#planBarModalBody .ss-in:not(:disabled)').forEach(i=>{
    const t = i.value.trim();
    if(t==='') blank++; else sum += Number(t) || 0;
  });
  sum = round2(sum);
  const o = scaleSplit.orig;
  let cls = 'info', msg = `합계 ${sum.toLocaleString()}개체`;
  if(o != null){
    const diff = round2(o - sum);
    if(diff===0){ cls = 'ok'; msg += ` = 처음 신청 ${o.toLocaleString()}개체 ✓`; }
    else if(diff > 0){ cls = 'warn'; msg += ` / 처음 신청 ${o.toLocaleString()}개체 · ${diff.toLocaleString()}개체 남아요`; }
    else { cls = 'bad'; msg += ` / 처음 신청 ${o.toLocaleString()}개체 · ${(-diff).toLocaleString()}개체 넘쳐요`; }
  }
  if(blank) msg += ` · 빈 칸 ${blank}곳`;
  el.className = 'ss-sum ' + cls;
  el.textContent = msg;
}

// 처음 신청한 개체수(이미 계획에 들어간 자리는 빼고)를 고칠 수 있는 자리 수로 똑같이 나눈다. 나머지는 앞 자리부터 하나씩 더 준다
function scaleSplitEven(){
  if(!scaleSplit || scaleSplit.orig==null) return;
  const inputs = [...document.querySelectorAll('#planBarModalBody .ss-in:not(:disabled)')];
  const total = round2(scaleSplit.orig - scaleSplit.fixed);
  if(!inputs.length || total < 0){ showToast('나눌 수 있는 자리가 없어요'); return; }
  const unit = Number.isInteger(total) ? 1 : 0.01, n = inputs.length;
  const units = Math.round(total / unit), base = Math.floor(units / n);
  let rem = units - base * n;
  inputs.forEach(i=>{ const u = base + (rem > 0 ? 1 : 0); if(rem > 0) rem--; i.value = String(round2(u * unit)); });
  scaleSplitSum();
}

// 행 하나의 개체수를 v로 바꾸는 DB 값. 복사본은 자기 개체수 칸을, 원본 응답은 칸을 그대로 두고 adjusted.expected_scale만 쓴다 (원래 값과 같아지면 지운다)
function scalePatchFor(row, v){
  if(row.copy_of) return { expected_scale: v };
  const { orig, adj, legacy } = demandParts(row);
  const keep = (v == null || v === scaleNum(row.expected_scale)) ? null : v;
  const patch = {};
  if(legacy) Object.assign(patch, orig, { orig_request: null });   // 예전 방식 행은 이때 새 방식으로 옮겨 담는다
  patch.adjusted = (!adj && keep==null) ? null : { ...(adj || orig), ...(keep!=null ? { expected_scale: keep } : {}) };
  return patch;
}

async function saveScaleSplit(){
  if(tourBlockWrite()) return;
  if(!isAdmin){ alert('분기별 계획은 전체 관리자만 조율할 수 있어요.'); return; }
  if(planDemandBusy || !scaleSplit) return;
  const vals = new Map();
  for(const i of document.querySelectorAll('#planBarModalBody .ss-in:not(:disabled)')){
    const t = i.value.trim();
    if(t==='' || isNaN(Number(t)) || Number(t) < 0){ showToast('개체수 칸에 0 이상의 숫자를 적어 주세요'); i.focus(); return; }
    vals.set(i.dataset.gid, Number(t));
  }
  const sum = round2([...vals.values()].reduce((a, b)=> a + b, scaleSplit.fixed));
  if(scaleSplit.orig != null && sum !== scaleSplit.orig && !confirm(`합계(${sum.toLocaleString()}개체)가 처음 신청(${scaleSplit.orig.toLocaleString()}개체)과 달라요.\n그래도 저장할까요?`)) return;
  const st = computeDemandState();
  const items = [];
  vals.forEach((v, gid)=>{
    const g = st.byGid.get(gid);
    if(!g) return;
    g.rows.forEach(eff=>{
      if(scaleNum(eff.expected_scale) === v) return;   // 그대로인 행은 쓰지 않는다
      items.push({ row: eff._src || eff, patch: scalePatchFor(eff._src || eff, v) });
    });
  });
  if(!items.length){ closePlanBarPopup(); scaleSplit = null; showToast('바뀐 개체수가 없어요'); return; }
  if(await applyDemandPatches(items)){
    closePlanBarPopup();
    scaleSplit = null;
    showToast(`개체수를 나눠 저장했어요 · 합계 ${sum.toLocaleString()}개체`);
  }
}

// ── 일정표에서 요청 막대 끌기 ──
// 막대를 끌면 같은 요청의 막대(세대별로 여러 개)가 함께 움직인다. 위아래 = 자리 바꾸기, 좌우 = 날짜 밀기(하루 단위).
// 끄는 동안 놓으려는 자리가 초록(겹침 없음) · 빨강(겹침)으로 보이고, 놓으면 그 자리 · 날짜로 '임시' 옮겨진다(저장은 [저장] 버튼). Esc = 끌기 취소.
// 5px 미만으로 움직이면 끌기가 아니라 클릭으로 보고 그대로 팝업을 연다.

// 화면 픽셀 ÷ CSS px. body(1.1)와 #planViewWrap(1.2)에 zoom이 겹쳐 있어서 안에 폭 100px짜리 자를 넣어 직접 잰다
function cssScaleAt(el){
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute; visibility:hidden; width:100px; height:0; pointer-events:none;';
  el.appendChild(probe);
  const s = probe.getBoundingClientRect().width / 100;
  probe.remove();
  return s > 0 ? s : 1;
}

function planGhostDown(ev, gid){
  if(!isAdmin || planDrag || planDemandBusy) return;
  if(ev.pointerType==='mouse' && ev.button!==0) return;
  planDrag = { gid: String(gid), pid: ev.pointerId, bar: ev.currentTarget, x0: ev.clientX, y0: ev.clientY, sy0: window.scrollY, x: ev.clientX, y: ev.clientY, active: false };
  window.addEventListener('pointermove', planDragMove);
  window.addEventListener('pointerup', planDragEnd);
  window.addEventListener('pointercancel', planDragCancel);
  window.addEventListener('keydown', planDragKey);
}

// 5px 넘게 움직이면 그때 끌기를 시작한다: 상태를 한 번 계산해 두고, 좌우로 밀 수 있는 범위와 놓을 수 있는 줄(lane)들의 위치를 기억한다
function planDragBegin(){
  const d = planDrag;
  const st = computeDemandState();
  const g = st.byGid.get(d.gid);
  const items = g ? g.items.filter(it=> it.state==='pending' && it.start) : [];
  if(!g || !g.actionable || !items.length || !d.bar.isConnected) return false;
  const track = d.bar.parentElement;   // .plan-demand-track: 일정표 전체 기간의 폭
  const { start, end } = planRangeMonths();
  const ymd = (dt)=> `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  const rangeFirst = ymd(start), rangeLast = addDays(ymd(end), -1);
  const minStart = items.map(it=> it.start).sort()[0], maxEnd = items.map(it=> it.end).sort().pop();
  d.st = st; d.g = g; d.items = items;
  d.lockDates = planLockDates;
  d.totalDays = Math.max(1, surveyDateToDays(end) - surveyDateToDays(start));
  d.pxPerDay = track.getBoundingClientRect().width / d.totalDays;
  d.minDays = Math.min(0, daysBetween(minStart, rangeFirst));   // 일정표 기간(접수 기간) 밖으로는 밀 수 없다
  d.maxDays = Math.max(0, daysBetween(maxEnd, rangeLast));
  d.scale = cssScaleAt(track);
  d.bars = [...document.querySelectorAll('#planViewWrap .plan-ghost[data-gid]')].filter(el=> el.dataset.gid===d.gid);
  d.barColors = d.bars.map(b=> b.style.getPropertyValue('--c'));   // 끝나면 원래 색으로 (끄는 동안엔 미리보기 결과 색)
  d.lanes = [...document.querySelectorAll('#planViewWrap .plan-lane[data-room]')].map(el=>{
    const r = el.getBoundingClientRect();
    return { el, top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, left: r.left, right: r.right };
  });
  d.tip = document.createElement('div');
  d.tip.className = 'plan-drag-tip';
  document.body.appendChild(d.tip);
  d.tipScale = cssScaleAt(document.body);
  d.bars.forEach(b=> b.classList.add('dragging'));
  document.body.classList.add('plan-dragging');
  window.addEventListener('scroll', planDragUpdate, { passive: true });   // 마우스 휠로 스크롤해도 막대와 놓을 자리가 포인터에 맞춰 따라오게
  d.raf = requestAnimationFrame(planDragScrollTick);
  return true;
}

function planDragMove(ev){
  const d = planDrag;
  if(!d || ev.pointerId!==d.pid) return;
  d.x = ev.clientX; d.y = ev.clientY;
  if(!d.active){
    if(Math.hypot(d.x - d.x0, d.y - d.y0) < 5) return;
    if(!planDragBegin()){ planDragCleanup(); return; }
    d.active = true;
  }
  if(ev.cancelable) ev.preventDefault();
  planDragUpdate();
}

function planDragUpdate(){
  const d = planDrag;
  if(!d || !d.active) return;
  if(!d.bar.isConnected){ planDragCleanup(); return; }   // 끄는 중에 화면이 새로 그려졌으면 (다른 곳에서 저장됨 등) 취소
  // 날짜 고정이면 좌우로는 움직이지 않는다 (days = 0). 끌기를 시작한 순간의 설정을 따른다
  const days = d.lockDates ? 0 : Math.max(d.minDays, Math.min(d.maxDays, Math.round((d.x - d.x0) / d.pxPerDay)));
  const dy = (d.y - d.y0) + (window.scrollY - d.sy0);   // 끄는 동안 화면이 스크롤돼도 막대가 포인터 아래에 붙어 있게
  d.bars.forEach(b=> { b.style.transform = `translate(${days * d.pxPerDay / d.scale}px, ${dy / d.scale}px)`; });

  // 포인터 아래의 줄 (줄 사이 틈에서는 6px 안쪽의 가장 가까운 줄)
  const docY = d.y + window.scrollY;
  let hit = null, best = 7;
  d.lanes.forEach(l=>{
    if(d.x < l.left || d.x > l.right) return;
    const dist = docY < l.top ? l.top - docY : docY > l.bottom ? docY - l.bottom : 0;
    if(dist < best){ best = dist; hit = l; }
  });
  if(d.hot && d.hot !== (hit && hit.el)) d.hot.classList.remove('drop-ok', 'drop-bad', 'drop-warn');
  d.hot = hit ? hit.el : null;

  let drop = null;
  const shifted = demandPeriodText(d.items.map(it=> ({ gen: it.gen, start: addDays(it.start, days), end: addDays(it.end, days) })));
  const dayNote = d.lockDates ? ' · 날짜 고정' : days ? ` (${days > 0 ? '+' : ''}${days}일)` : '';
  let bad = true, html = '';
  if(!hit){
    html = `놓을 수 없는 곳이에요<small>베드 줄 위에서 놓아 주세요 · Esc = 취소</small>`;
  } else {
    const room = hit.el.dataset.room, bedNo = Number(hit.el.dataset.bed), floor = hit.el.dataset.floor;
    const where = `${roomLabel(room)} ${spotText(bedNo, floor)}`;
    const off = !roomIsActive(roomByName(room));   // 사용 중지한 방에도 옮길 수 있다 (막지 않고 경고만 보여준다)
    const conflicts = demandProbeConflicts(d.st, d.g, room, bedNo, floor, days);
    drop = { room, bedNo, floor, days, conflicts, off, spot: demandSpot(room, bedNo, floor) };
    bad = conflicts.length > 0;
    const lines = conflicts.slice(0, 3).map(c=> `· ${escapeHtml(demandConflictText(c))}`).join('<br>') + (conflicts.length > 3 ? `<br>… 외 ${conflicts.length - 3}건` : '');
    html = `${escapeHtml(where)}<small>${escapeHtml(shifted)}${dayNote}</small>`
      + (bad ? `<small>⚠ 기간이 겹쳐요 (${conflicts.length}건)<br>${lines}</small>` : `<small>✓ 겹침 없음</small>`)
      + (off ? `<small>⚠ 사용 중지한 방이에요 (계획에는 넣을 수 있어요)</small>` : '');
    hit.el.classList.toggle('drop-ok', !bad && !off);
    hit.el.classList.toggle('drop-warn', !bad && off);
    hit.el.classList.toggle('drop-bad', bad);
  }
  // 날짜 고정 중에 좌우로 끌려고 하면, 왜 안 움직이는지 알려준다
  if(d.lockDates && Math.abs(d.x - d.x0) > 24) html += `<small>🔒 날짜 고정 중이라 좌우로는 안 움직여요 · 일정표 위의 체크를 풀면 날짜도 옮길 수 있어요</small>`;
  d.drop = drop;
  d.bars.forEach(b=>{ b.classList.toggle('preview-ok', !bad); b.style.setProperty('--c', bad ? 'var(--danger)' : (b.dataset.c || 'var(--teal)')); });   // 막대도 놓았을 때의 결과를 따라간다: 겹침 없음 = 요청 색, 겹침 · 못 놓음 = 빨강
  d.tip.classList.toggle('bad', bad);
  d.tip.innerHTML = html;
  // 설명 상자는 포인터 오른쪽 아래에 붙이고, 화면 밖으로 나가면 왼쪽 · 위쪽으로 옮긴다 (화면 픽셀로 맞춘 뒤 CSS px로 환산)
  const tr = d.tip.getBoundingClientRect();
  const tx = d.x + 18 + tr.width > window.innerWidth ? d.x - 18 - tr.width : d.x + 18;
  const ty = d.y + 18 + tr.height > window.innerHeight ? d.y - 18 - tr.height : d.y + 18;
  d.tip.style.left = Math.max(4, tx) / d.tipScale + 'px';
  d.tip.style.top = Math.max(4, ty) / d.tipScale + 'px';
}

// 포인터가 화면 위 · 아래 가장자리에 닿으면 페이지를 스크롤해서 멀리 있는 자리로도 끌고 갈 수 있게 한다
function planDragScrollTick(){
  const d = planDrag;
  if(!d || !d.active) return;
  const topEdge = (document.querySelector('header')?.getBoundingClientRect().bottom || 0) + 90;   // 헤더 + 고정된 월 눈금 아래
  const bottomEdge = window.innerHeight - 70;
  let v = 0;
  if(d.y < topEdge) v = -Math.min(26, (topEdge - d.y) / 3 + 4);
  else if(d.y > bottomEdge) v = Math.min(26, (d.y - bottomEdge) / 3 + 4);
  if(v){ window.scrollBy({ top: v, behavior: 'instant' }); planDragUpdate(); }
  d.raf = requestAnimationFrame(planDragScrollTick);
}

function planDragKey(ev){ if(ev.key==='Escape') planDragCancel(); }

function planDragCleanup(){
  const d = planDrag;
  if(!d) return;
  window.removeEventListener('pointermove', planDragMove);
  window.removeEventListener('pointerup', planDragEnd);
  window.removeEventListener('pointercancel', planDragCancel);
  window.removeEventListener('keydown', planDragKey);
  if(d.raf) cancelAnimationFrame(d.raf);
  (d.bars || []).forEach((b, i)=>{
    b.style.transform = '';
    b.classList.remove('dragging', 'preview-ok');
    const c = (d.barColors || [])[i];
    if(c) b.style.setProperty('--c', c); else b.style.removeProperty('--c');
  });
  if(d.hot) d.hot.classList.remove('drop-ok', 'drop-bad', 'drop-warn');
  window.removeEventListener('scroll', planDragUpdate);
  if(d.tip) d.tip.remove();
  document.body.classList.remove('plan-dragging');
  planDrag = null;
}

// 끌기를 끝낸 직후에 따라오는 클릭은 삼킨다 (안 그러면 막대가 놓인 자리에서 팝업이 열린다)
function planDragSwallowClick(){
  const stop = (e)=>{ e.stopPropagation(); e.preventDefault(); };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(()=> window.removeEventListener('click', stop, { capture: true }), 60);
}

function planDragCancel(){
  const wasActive = planDrag && planDrag.active;
  planDragCleanup();
  if(wasActive) planDragSwallowClick();
}

async function planDragEnd(ev){
  const d = planDrag;
  if(!d || ev.pointerId!==d.pid) return;
  const { active, drop, g } = d;
  planDragCleanup();
  if(!active) return;
  planDragSwallowClick();
  if(!drop) return;   // 줄이 아닌 곳에 놓음: 제자리로
  if(drop.spot===g.spot && drop.days===0) return;   // 제자리
  setPlanDraft(g, drop);   // 저장하지 않고 화면에서만 옮긴다 (아래 [저장]을 눌러야 DB에 들어간다)
  renderPlanView();
  const after = computeDemandState().byGid.get(g.gid);
  const where = `${roomLabel(drop.room)} ${spotText(drop.bedNo, drop.floor)}`;
  if(!after || !after.drafted) showToast('저장된 자리 · 날짜로 돌아왔어요');
  else showToast(`${where}에 임시로 옮겼어요 · ${after.conflicts.length ? `⚠ 기간 겹침 ${after.conflicts.length}건 · ` : '겹침 없음 · '}${drop.off ? '⚠ 사용 중지한 방 · ' : ''}[저장]을 눌러야 확정돼요`);
}
