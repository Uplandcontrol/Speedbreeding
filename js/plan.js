/* plan.js — [분기별 계획] 화면: 계획 작성·저장, 일정표 그리기, 막대 끌어서 옮기기 */

function openPlanModal(existingGroup){
  if(!isAdmin){ alert('분기별 계획은 전체 관리자만 작성할 수 있어요.'); return; }
  planEditPrefill = existingGroup || null;
  planEntries = existingGroup ? planRowsToEntries(existingGroup.items) : [newPlanEntry()];
  document.getElementById('planModalTitle').textContent = existingGroup ? '장기 계획 수정' : '+ 장기 계획 제출';
  // 사용 중지된 방은 고를 수 없게 막는다 (이미 있는 계획을 고칠 때 그 계획의 방은 그대로 둔다)
  const roomSelectHtml = `<option value="">방을 선택하세요</option>${[...new Set([...ROW1, ...ROW2])].filter(n=>!isMutedRoom(n)).map(n=>{
    const mine = existingGroup && existingGroup.room_name===n;
    const off = !roomIsActive(roomByName(n));
    return `<option value="${escapeHtml(n)}" ${mine ? 'selected':''} ${off && !mine ? 'disabled' : ''}>${escapeHtml(n)}${off ? ' (사용 중지)' : ''}</option>`;
  }).join('')}`;
  const periodHintHtml = (planPeriod && planPeriod.period_start && planPeriod.period_end)
    ? `<div style="font-size:11px; color:var(--amber); font-weight:700;">※ ${planPeriod.period_start} ~ ${planPeriod.period_end} 사이 날짜만 등록돼요</div>`
    : '';
  document.getElementById('planModalBody').innerHTML = `
    <select id="planRoomInput" onchange="renderPlanBedPicker()">${roomSelectHtml}</select>
    <div id="planBedPickerWrap"></div>
    <div id="planSurveyRefWrap"></div>
    ${periodHintHtml}
    <div style="font-size:11px; font-weight:700; color:var(--ink-faint); margin-top:4px;">계획 내용 (수요조사 입력 항목과 같아요)</div>
    <div id="planEntryRows"></div>
    <button type="button" class="add-batch-btn" onclick="addPlanEntry()">+ 항목 추가</button>
  `;
  renderPlanBedPicker();
  renderPlanEntries();
  document.getElementById('planModalOverlay').classList.add('open');
}

function closePlanModal(){
  document.getElementById('planModalOverlay').classList.remove('open');
  planEditPrefill = null;
}

// 수요조사 응답 행이 선택한 방·베드·층에 해당하는지 (DB 값이 문자열로 와도 맞도록 느슨하게 비교)
function planSurveyRowAt(s, roomName, bedNo, floor){
  return String(s.room_name||'').trim()===roomName && s.bed_no!=null && Number(s.bed_no)===bedNo && String(s.floor||'').trim()===floor;
}

// 이 방에서 수요조사 응답이 있는 자리들 (베드·층 순서, 건수 포함)
function planDemandSpots(roomName){
  const spots = new Map();
  demandEffRows().forEach(s=>{   // 계획 제출 창은 조율한 자리 기준 (조율이 없으면 신청한 자리)
    if(String(s.room_name||'').trim()!==roomName || s.bed_no==null || !s.floor) return;
    const key = Number(s.bed_no)+'|'+String(s.floor).trim();
    if(!spots.has(key)) spots.set(key, { bedNo: Number(s.bed_no), floor: String(s.floor).trim(), rows: [] });
    spots.get(key).rows.push(s);
  });
  return [...spots.values()].sort((x,y)=> bedOrder(x.bedNo)-bedOrder(y.bedNo) || x.floor.localeCompare(y.floor));
}

// keep=true: 베드 선택을 바꿨을 때 현재 선택한 베드·층을 유지한 채 다시 그린다 (수요조사 건수 표시 갱신용)
// target={bedNo,floor}: 그 자리로 이동
// 처음 방을 고르면, 수요조사 응답이 있는 첫 자리를 자동으로 선택해서 바로 불러올 수 있게 한다
function renderPlanBedPicker(keep, target){
  const wrap = document.getElementById('planBedPickerWrap');
  if(!wrap) return;
  const roomName = document.getElementById('planRoomInput').value;
  const cfg = roomBedConfig(roomName);
  if(!roomName || !cfg || !cfg.bed_count){
    wrap.innerHTML = `<div style="font-size:11.5px; color:var(--ink-faint); padding:4px 0;">이 방은 베드가 없어요</div>`;
    renderPlanSurveyRef();
    return;
  }
  const bedFloorList = cfg.bed_floors===2 ? ['1층','2층'] : ['1층'];
  const hasAisle = AISLE_ROOMS.has(roomName);   // 인공교배실 1·2는 '통로'도 하나의 자리로 고를 수 있다
  const pre = (planEditPrefill && planEditPrefill.room_name===roomName) ? planEditPrefill : null;
  const prevBedEl = keep===true ? document.getElementById('planBedNoInput') : null;
  const prevFloorEl = keep===true ? document.getElementById('planFloorInput') : null;
  const firstSpot = (!target && !prevBedEl && !pre) ? planDemandSpots(roomName).find(sp=> sp.bedNo>=1 && sp.bedNo<=cfg.bed_count && bedFloorList.includes(sp.floor)) : null;
  let selBed = target ? target.bedNo : prevBedEl ? parseInt(prevBedEl.value) : pre ? Number(pre.structure_no) : firstSpot ? firstSpot.bedNo : 1;
  if(isAisleSpot(selBed) && !hasAisle) selBed = 1;
  const floorList = isAisleSpot(selBed) ? [AISLE_FLOOR] : bedFloorList;   // 통로는 층 없이 '통로' 하나
  let selFloor = target ? target.floor : prevFloorEl ? prevFloorEl.value : pre ? pre.floor : firstSpot ? firstSpot.floor : '1층';
  if(!floorList.includes(selFloor)) selFloor = floorList[0];
  const effSurveys = demandEffRows();
  const surveyCount = (bedNo, floor)=> effSurveys.filter(s=> String(s.room_name||'').trim()===roomName && s.bed_no!=null && Number(s.bed_no)===bedNo && (floor==null || String(s.floor||'').trim()===floor)).length;
  const countLabel = (n)=> n ? ` · 수요 ${n}건` : '';
  let bedOptions = '';
  for(let i=1;i<=cfg.bed_count;i++){ bedOptions += `<option value="${i}" ${selBed===i ? 'selected':''}>베드 ${i}${countLabel(surveyCount(i))}</option>`; }
  if(hasAisle) bedOptions += `<option value="${AISLE_BED_NO}" ${isAisleSpot(selBed) ? 'selected':''}>통로${countLabel(surveyCount(AISLE_BED_NO))}</option>`;
  const floorOptions = floorList.map(fl=>`<option value="${fl}" ${selFloor===fl?'selected':''}>${fl}${countLabel(surveyCount(selBed, fl))}</option>`).join('');
  wrap.innerHTML = `
    <div class="row2" style="display:flex; gap:7px;">
      <select id="planBedNoInput" style="flex:1; min-width:0;" onchange="renderPlanBedPicker(true)">${bedOptions}</select>
      <select id="planFloorInput" style="flex:1; min-width:0;" onchange="renderPlanSurveyRef()">${floorOptions}</select>
    </div>
  `;
  renderPlanSurveyRef();
}

function goPlanBed(bedNo, floor){ renderPlanBedPicker(true, { bedNo, floor }); }

// ── 수요조사 → 계획 연계 ──────────────────────────────────────────────
// 계획 제출 창의 입력 항목은 수요조사 입력 화면과 같아요 (담당자 · 사용 목적 · 작물 · 교배조합/교배목적 · 처리 온도/단계 · 희망 기간 · 예상 개체수 · 요청사항).
// 관리자가 수요조사 응답을 불러오면 응답 내용이 그대로 채워지고, 수정한 뒤 제출해요.
const PLAN_USE_PERIOD_PURPOSES = ['인공교배','고온검정'];   // 세대별 기간 대신 '희망 사용기간' 하나만 받는 목적

// bed_plans 테이블에 추가로 필요한 컬럼 (수요조사 내용을 그대로 담기 위해)
const PLAN_EXTRA_COLS = ['use_purpose','heat_temp','heat_stage','expected_scale','notes','line_no','cross_extra'];

const PLAN_EXTRA_LABELS = { use_purpose:'사용 목적', heat_temp:'처리 온도', heat_stage:'처리 단계', expected_scale:'예상 개체수', notes:'요청사항', line_no:'계통번호', cross_extra:'외 N조합' };

const PLAN_EXTRA_SQL = 'alter table bed_plans add column if not exists use_purpose text, add column if not exists heat_temp text, add column if not exists heat_stage text, add column if not exists expected_scale numeric, add column if not exists notes text, add column if not exists line_no text, add column if not exists cross_extra integer;';

// 계통번호(line_no)는 수요조사 → 분기별 계획 → 계통작성으로 이어지므로 두 테이블에 모두 필요하다
const LINE_NO_SQL = 'alter table demand_survey add column if not exists line_no text;\nalter table bed_plans add column if not exists line_no text;';

// 수요조사의 온도·일장 처리 조건(기타·세대단축·인공교배)과 기타의 처리 요인 (수요조사에만 저장한다. 계획으로 옮길 때는 요청사항에 합쳐진다)
const EXP_SQL = 'alter table demand_survey add column if not exists exp_factors text, add column if not exists exp_condition text;';

function newPlanEntry(){
  return { src:null, respondent:'', purpose:'', purpose_other:'', crop:'', line_no:'', cross_combo:'', cross_extra:'', breeding_purpose:'',
    heat_temp:'', heat_stage:'', gens:{}, use_start:'', use_end:'', gen_label:'', force_use:false, scale:'', notes:'' };
}

function planEntryUsesPeriod(e){ return PLAN_USE_PERIOD_PURPOSES.includes(e.purpose) || e.force_use; }

function planEntryPurposeLabel(e){ return e.purpose==='기타' ? (e.purpose_other.trim() || '기타') : e.purpose; }

function planEntryIsBlank(e){
  return !e.respondent && !e.purpose && !e.purpose_other && !e.crop && !e.line_no && !e.cross_combo && !e.breeding_purpose && !e.heat_temp && !e.heat_stage
    && !Object.keys(e.gens).length && !e.use_start && !e.use_end && e.scale==='' && !e.notes;
}

// 선택한 방·베드·층에 접수된 수요조사 응답 행 (희망 시작일 순, 기간 없는 응답은 뒤로)
function planSurveyMatches(roomName, bedNo, floor){
  return demandEffRows()   // 조율한 자리 기준
    .filter(s=> planSurveyRowAt(s, roomName, bedNo, floor))
    .sort((a,b)=> (a.desired_start||'9999-12-31').localeCompare(b.desired_start||'9999-12-31') || (a.created_at||'').localeCompare(b.created_at||''));
}

// 같은 제출에서 나온 행들(세대별로 여러 행)을 하나의 응답으로 묶는 기준 (한 자리 안에서 같은 값이면 같은 응답)
function surveyRowGroupKey(s){
  return JSON.stringify([s.created_at||'', s.respondent_name||'', s.purposes||[], s.crops||[], s.line_no||'', s.cross_combo||'', crossExtraOf(s), s.breeding_purpose||'',
    s.heat_temp||'', s.heat_stage||'', s.expected_scale ?? '', s.notes||'']);
}

// 같은 제출에서 나온 행들(세대별로 여러 행)을 하나의 응답으로 묶는다
function planSurveyGroups(roomName, bedNo, floor){
  const groups = new Map();
  planSurveyMatches(roomName, bedNo, floor).forEach(s=>{
    const key = surveyRowGroupKey(s);
    if(!groups.has(key)) groups.set(key, { key, rows: [] });
    groups.get(key).rows.push(s);
  });
  return [...groups.values()];
}

function currentPlanBed(){
  const roomName = document.getElementById('planRoomInput')?.value;
  const bedSel = document.getElementById('planBedNoInput'), floorSel = document.getElementById('planFloorInput');
  if(!roomName || !bedSel || !floorSel) return null;
  return { roomName, bedNo: parseInt(bedSel.value), floor: floorSel.value };
}

// 수요조사 응답 1건 → 계획 항목 (응답에 적힌 내용을 그대로 옮긴다)
function surveyGroupToEntry(g){
  const s0 = g.rows[0], e = newPlanEntry();
  e.src = g.key;
  e.respondent = s0.respondent_name || '';
  const p0 = (s0.purposes||[])[0] || '';
  if(SURVEY_PURPOSE_OPTIONS.includes(p0)) e.purpose = p0;
  else if(p0){ e.purpose = '기타'; e.purpose_other = p0; }
  e.crop = (s0.crops||[])[0] || '';
  e.line_no = s0.line_no || '';
  e.cross_combo = s0.cross_combo || '';
  e.cross_extra = crossExtraOf(s0) ? String(crossExtraOf(s0)) : '';   // 수요조사의 '외 N조합'을 그대로 옮긴다
  e.breeding_purpose = s0.breeding_purpose || '';
  e.heat_temp = s0.heat_temp || '';
  e.heat_stage = s0.heat_stage || '';
  e.scale = s0.expected_scale!=null ? String(s0.expected_scale) : '';
  e.notes = [surveyExpText(s0), s0.notes].filter(Boolean).join('\n');   // 실험 처리 내용은 계획에 따로 칸이 없어서 요청사항에 합쳐 옮긴다
  g.rows.forEach(s=>{
    if(s.generation && SURVEY_GEN_STAGES.includes(s.generation)) e.gens[s.generation] = { start: s.desired_start||'', end: s.desired_end||'' };
    else if(s.desired_start || s.desired_end){ e.use_start = s.desired_start||''; e.use_end = s.desired_end||''; }
  });
  e.force_use = !!(e.use_start || e.use_end) && !PLAN_USE_PERIOD_PURPOSES.includes(e.purpose);
  return e;
}

// 이미 저장된 계획(베드 하나의 행들) → 계획 항목들 (수정 화면용)
function planRowsToEntries(items){
  const entries = [], byKey = new Map();
  items.forEach(p=>{
    const genStage = SURVEY_GEN_STAGES.includes(p.generation) ? p.generation : null;
    const base = { respondent: p.submitted_by||'', crop: p.crop_name||'', line_no: p.line_no||'', cross_combo: p.cross_combo||'', cross_extra: crossExtraOf(p) ? String(crossExtraOf(p)) : '', breeding_purpose: p.purpose||'',
      heat_temp: p.heat_temp||'', heat_stage: p.heat_stage||'', scale: p.expected_scale!=null ? String(p.expected_scale) : '', notes: p.notes||'' };
    const up = p.use_purpose || '';
    let purpose = '', purpose_other = '';
    if(SURVEY_PURPOSE_OPTIONS.includes(up)) purpose = up;
    else if(up){ purpose = '기타'; purpose_other = up; }
    else if(genStage) purpose = '세대단축';
    if(genStage){
      const key = JSON.stringify([base, purpose, purpose_other]);
      let e = byKey.get(key);
      if(!e || e.gens[genStage]){ e = Object.assign(newPlanEntry(), base, { purpose, purpose_other }); byKey.set(key, e); entries.push(e); }
      e.gens[genStage] = { start: p.planned_start||'', end: p.planned_end||'' };
    } else {
      const e = Object.assign(newPlanEntry(), base, { purpose, purpose_other, use_start: p.planned_start||'', use_end: p.planned_end||'', gen_label: p.generation||'' });
      e.force_use = !PLAN_USE_PERIOD_PURPOSES.includes(purpose);
      entries.push(e);
    }
  });
  return entries.length ? entries : [newPlanEntry()];
}

function pushPlanEntry(e){
  if(planEntries.length===1 && planEntryIsBlank(planEntries[0])) planEntries[0] = e;
  else planEntries.push(e);
}

// 일부 기간만 이미 계획에 들어간 응답이면, 아직 들어가지 않은 기간만 가져온다
function planImportGroup(g){ return g.todoRows && g.todoRows.length ? { key: g.key, rows: g.todoRows } : g; }

function importPlanSurveyGroup(idx){
  const g = currentPlanSurveyGroups[idx];
  if(!g) return;
  pushPlanEntry(surveyGroupToEntry(planImportGroup(g)));
  renderPlanEntries();
  renderPlanSurveyRef();
}

function importAllPlanSurveys(){
  const imported = new Set(planEntries.map(e=>e.src).filter(Boolean));
  currentPlanSurveyGroups.filter(g=> !imported.has(g.key) && !g.reflected).forEach(g=> pushPlanEntry(surveyGroupToEntry(planImportGroup(g))));
  renderPlanEntries();
  renderPlanSurveyRef();
}

function renderPlanSurveyRef(){
  const wrap = document.getElementById('planSurveyRefWrap');
  if(!wrap) return;
  const bed = currentPlanBed();
  if(!bed){ currentPlanSurveyGroups = []; wrap.innerHTML = ''; return; }
  const groups = currentPlanSurveyGroups = planSurveyGroups(bed.roomName, bed.bedNo, bed.floor);
  // 이 방에서 응답이 있는 다른 자리로 바로 이동하는 버튼 (베드가 많은 방에서 응답 있는 자리를 찾기 쉽게)
  const otherSpots = planDemandSpots(bed.roomName).filter(sp=> !(sp.bedNo===bed.bedNo && sp.floor===bed.floor));
  const spotsHtml = otherSpots.length ? `
    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
      <span style="font-size:11px; font-weight:700; color:var(--ink-faint);">이 방에서 응답이 있는 다른 자리</span>
      ${otherSpots.map(sp=>`<button type="button" class="task-bed-chip" style="padding:4px 10px; font-size:11px;" onclick="goPlanBed(${sp.bedNo}, '${escapeHtml(sp.floor)}')">${escapeHtml(spotText(sp.bedNo, sp.floor))} (${sp.rows.length})</button>`).join('')}
    </div>` : '';
  if(!groups.length){
    wrap.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:8px;">
        <div style="font-size:11.5px; color:var(--ink-faint);">이 베드·층에 접수된 수요조사 응답이 없어요. 아래 항목을 직접 입력할 수도 있어요.</div>
        ${spotsHtml}
      </div>`;
    return;
  }
  // 이미 계획에 들어간 응답은 다시 불러오지 않도록 표시한다 (같은 응답이 계획에 두 번 들어가는 걸 막는다)
  const demandSt = computeDemandState();
  const spotKey = demandSpot(bed.roomName, bed.bedNo, bed.floor);
  groups.forEach(g=>{
    const dg = demandSt.byKey.get(spotKey + '#' + g.key);
    g.reflected = !!dg && !dg.actionable;
    g.partial = !!dg && dg.status==='partial';
    g.todoRows = dg ? dg.todoRows : g.rows;
  });
  const imported = new Set(planEntries.map(e=>e.src).filter(Boolean));
  const pending = groups.filter(g=> !imported.has(g.key) && !g.reflected).length;
  const line = (txt)=> `<div style="font-size:11.5px; color:var(--ink-soft); line-height:1.45;">${txt}</div>`;
  const cardsHtml = groups.map((g, idx)=>{
    const s0 = g.rows[0];
    const isImported = imported.has(g.key);
    const head = [s0.respondent_name||'(이름 없음)', (s0.purposes||[]).join(', '), (s0.crops||[]).join(', ')].filter(Boolean).map(escapeHtml).join(' · ');
    const gens = g.rows.filter(s=> s.generation && (s.desired_start||s.desired_end)).map(s=> `${escapeHtml(s.generation)} ${escapeHtml(s.desired_start||'?')}~${escapeHtml(s.desired_end||'?')}`);
    const use = g.rows.find(s=> !s.generation && (s.desired_start||s.desired_end));
    const period = gens.length ? gens.join(' · ')
      : use ? `희망 사용기간 ${escapeHtml(use.desired_start||'?')} ~ ${escapeHtml(use.desired_end||'?')}`
      : '희망 기간 없음';
    const scale = s0.expected_scale!=null ? ` · 예상 ${escapeHtml(String(s0.expected_scale))}${escapeHtml(s0.scale_unit||'')}` : '';
    const extra = [
      s0.line_no ? `${lineNoLabel((s0.purposes||[])[0])}: ${escapeHtml(s0.line_no)}` : '',
      s0.cross_combo ? `교배조합: ${escapeHtml(crossComboLabel(s0))}` : '',
      s0.breeding_purpose ? `${purposeFieldLabel((s0.purposes||[])[0])}: ${escapeHtml(s0.breeding_purpose)}` : '',
      s0.heat_temp ? `처리 온도: ${escapeHtml(s0.heat_temp)}` : '',
      s0.heat_stage ? `처리 단계: ${escapeHtml(s0.heat_stage)}` : '',
      escapeHtml(surveyExpText(s0))
    ].filter(Boolean).join(' · ');
    return `
      <div style="display:flex; align-items:flex-start; gap:8px; background:#fff; border:1px solid var(--line-soft); border-radius:8px; padding:8px 10px;">
        <div style="flex:1; min-width:0;">
          <div style="font-size:12px; font-weight:800; color:var(--ink);">${head}</div>
          ${line(period + scale)}
          ${extra ? line(extra) : ''}
          ${s0.notes ? line('요청: ' + escapeHtml(s0.notes)) : ''}
        </div>
        ${isImported
          ? `<span style="flex-shrink:0; font-size:11px; font-weight:800; color:var(--teal-deep); padding-top:2px;">추가됨</span>`
          : g.reflected
            ? `<span style="flex-shrink:0; font-size:11px; font-weight:800; color:var(--ink-faint); padding-top:2px;">이미 계획에 있음</span>`
            : `<button type="button" class="btn small" style="flex-shrink:0;" onclick="importPlanSurveyGroup(${idx})">${g.partial ? '남은 기간 불러오기' : '불러오기'}</button>`}
      </div>`;
  }).join('');
  wrap.innerHTML = `
    <div style="border:1.5px solid var(--line-soft); border-radius:10px; padding:10px; background:#F5F8F6; display:flex; flex-direction:column; gap:8px;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <div style="font-size:11.5px; font-weight:800; color:var(--teal-deep);">📋 이 베드·층의 수요조사 응답 ${groups.length}건</div>
        ${pending ? `<button type="button" class="btn small" onclick="importAllPlanSurveys()">전체 불러오기</button>` : ''}
      </div>
      <div style="font-size:11px; color:var(--ink-faint);">불러오면 아래 계획 항목에 응답 내용이 그대로 채워지고, 수정한 뒤 제출할 수 있어요.</div>
      ${cardsHtml}
      ${spotsHtml}
    </div>`;
}

// 계획 항목 입력칸 (수요조사 입력 화면과 같은 구성)
function renderPlanEntries(){
  const wrap = document.getElementById('planEntryRows');
  if(!wrap) return;
  const minAttr = (planPeriod && planPeriod.period_start) ? `min="${planPeriod.period_start}"` : '';
  const maxAttr = (planPeriod && planPeriod.period_end) ? `max="${planPeriod.period_end}"` : '';
  const fld = 'padding:10px 12px; border:1.2px solid var(--line); border-radius:9px; font-size:13.5px; font-family:inherit;';
  const lab = 'font-size:11px; font-weight:700; color:var(--ink-faint);';
  const chip = (label, active, handler)=> `<button type="button" class="task-bed-chip ${active?'active':''}" data-val="${escapeHtml(label)}" onclick="${handler}">${escapeHtml(label)}</button>`;
  const textField = (i, field, value, placeholder)=> `<input placeholder="${placeholder}" value="${escapeHtml(value)}" oninput="updatePlanEntry(${i},'${field}',this.value)" style="${fld}" />`;
  const dateField = (value, handler)=> `<input type="date" ${minAttr} ${maxAttr} value="${escapeHtml(value)}" oninput="${handler}" style="flex:1; min-width:0; ${fld}" />`;

  wrap.innerHTML = planEntries.map((e, i)=>{
    const heat = e.purpose==='고온검정';
    const useMode = planEntryUsesPeriod(e);
    const crops = (e.crop && !CROP_OPTIONS.includes(e.crop)) ? [...CROP_OPTIONS, e.crop] : CROP_OPTIONS;
    const labelBox = 'flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; ' + lab;
    const periodHtml = useMode ? `
      <div>
        <div style="${lab} margin-bottom:6px;">희망 사용기간</div>
        <div style="display:flex; align-items:center; gap:10px;">
          ${dateField(e.use_start, `updatePlanEntry(${i},'use_start',this.value)`)}
          <span style="color:var(--ink-faint); font-size:12px;">~</span>
          ${dateField(e.use_end, `updatePlanEntry(${i},'use_end',this.value)`)}
        </div>
      </div>` : `
      <div>
        <div style="${lab} margin-bottom:6px;">세대별 희망 기간 (복수 선택 가능)</div>
        <div class="task-bed-chips">${SURVEY_GEN_STAGES.map(g=> chip(g, !!e.gens[g], `togglePlanEntryGen(${i}, this.dataset.val)`)).join('')}</div>
        <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
          ${SURVEY_GEN_STAGES.filter(g=>e.gens[g]).map(g=>`
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="width:28px; flex-shrink:0; font-size:12.5px; font-weight:800; color:var(--ink);">${g}</span>
              ${dateField(e.gens[g].start, `updatePlanEntryGen(${i},'${g}','start',this.value)`)}
              <span style="color:var(--ink-faint); font-size:12px;">~</span>
              ${dateField(e.gens[g].end, `updatePlanEntryGen(${i},'${g}','end',this.value)`)}
            </div>`).join('')}
        </div>
      </div>`;
    return `
      <div class="batch-card plan-entry" style="margin-bottom:8px; gap:14px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <div style="font-size:11.5px; font-weight:800; color:var(--teal-deep);">${i+1}번째 항목${e.src ? ' <span style="font-weight:700; color:var(--ink-faint);">· 수요조사에서 불러옴</span>' : ''}</div>
          ${planEntries.length>1 ? `<button type="button" class="btn small danger-text" onclick="removePlanEntry(${i})">삭제</button>` : ''}
        </div>
        <div style="display:flex; gap:10px;">
          <label style="${labelBox}${lineNoHidden(e.purpose) ? ' flex:0 0 calc(50% - 5px);' : ''}">담당자${textField(i, 'respondent', e.respondent, '담당자(이름)')}</label>
          ${lineNoHidden(e.purpose) ? '' : `<label style="${labelBox}">${lineNoLabel(e.purpose)} (선택)${textField(i, 'line_no', e.line_no, lineNoPlaceholder(e.purpose))}</label>`}
        </div>
        <div>
          <div style="${lab} margin-bottom:6px;">사용 목적 (하나만 선택)</div>
          <div class="task-bed-chips">${SURVEY_PURPOSE_OPTIONS.map(p=> chip(p, e.purpose===p, `setPlanEntryPurpose(${i}, this.dataset.val)`)).join('')}</div>
          ${e.purpose==='기타' ? `<div style="margin-top:8px;">${textField(i, 'purpose_other', e.purpose_other, '기타 목적을 적어주세요')}</div>` : ''}
        </div>
        <div>
          <div style="${lab} margin-bottom:6px;">계획 작물 (하나만 선택)</div>
          <div class="task-bed-chips">${crops.map(c=> chip(c, e.crop===c, `setPlanEntryCrop(${i}, this.dataset.val)`)).join('')}</div>
        </div>
        ${heat ? `
        <label style="display:flex; flex-direction:column; gap:4px; ${lab}">검정 목적 (선택)${textField(i, 'breeding_purpose', e.breeding_purpose, '예: 고온검정 조건 확립')}</label>
        <div style="display:flex; gap:10px;">
          <label style="${labelBox}">처리 온도<input placeholder="예: 45℃" value="${escapeHtml(e.heat_temp)}" onfocus="tempFocus(this)" oninput="updatePlanEntry(${i},'heat_temp',tempInput(this))" onblur="tempBlur(this)" style="${fld}" /></label>
          <label style="${labelBox} flex:1.6;">처리 단계${textField(i, 'heat_stage', e.heat_stage, '예: V1~V6, 개화기(R1~R2), 성숙기(R7)')}</label>
        </div>` : `
        <div style="display:flex; gap:10px;">
          <label style="${labelBox}">교배조합 (선택)${e.purpose==='인공교배' ? `
            <span class="cross-combo-row">${textField(i, 'cross_combo', e.cross_combo, '예: 선풍/남천')}<span class="cross-extra" title="대표 교배조합 말고 더 있는 조합 수 (없으면 비워 두세요)">외 <input type="number" min="0" step="1" inputmode="numeric" value="${escapeHtml(e.cross_extra || '')}" oninput="updatePlanEntry(${i},'cross_extra',this.value)" style="${fld}" /> 조합</span></span>` : textField(i, 'cross_combo', e.cross_combo, '예: 선풍/남천')}</label>
          <label style="${labelBox}">${e.purpose==='인공교배' ? '교배목적(대표1개 작성)' : '교배목적 (선택)'}${textField(i, 'breeding_purpose', e.breeding_purpose, '예: 내병성 검정용')}</label>
        </div>`}
        ${periodHtml}
        <label style="display:flex; flex-direction:column; gap:4px; ${lab}">예상 개체수
          <input type="number" placeholder="개체수" value="${escapeHtml(e.scale)}" oninput="updatePlanEntry(${i},'scale',this.value)" style="${fld}" />
        </label>
        <label style="display:flex; flex-direction:column; gap:4px; ${lab}">자유 요청사항
          <textarea rows="2" placeholder="추가로 전달하고 싶은 내용" oninput="updatePlanEntry(${i},'notes',this.value)" style="width:100%; box-sizing:border-box; padding:10px 12px; border:1.2px solid var(--line); border-radius:9px; font-family:inherit; font-size:13.5px; resize:vertical;">${escapeHtml(e.notes)}</textarea>
        </label>
      </div>`;
  }).join('');
}

function updatePlanEntry(i, field, val){ if(planEntries[i]) planEntries[i][field] = val; }

function updatePlanEntryGen(i, g, field, val){ const e = planEntries[i]; if(e && e.gens[g]) e.gens[g][field] = val; }

function setPlanEntryPurpose(i, val){
  const e = planEntries[i]; if(!e) return;
  e.purpose = e.purpose===val ? '' : val;
  e.force_use = false;
  renderPlanEntries();
}

function setPlanEntryCrop(i, val){
  const e = planEntries[i]; if(!e) return;
  e.crop = e.crop===val ? '' : val;
  renderPlanEntries();
}

function togglePlanEntryGen(i, g){
  const e = planEntries[i]; if(!e) return;
  if(e.gens[g]) delete e.gens[g]; else e.gens[g] = { start:'', end:'' };
  renderPlanEntries();
}

function addPlanEntry(){
  planEntries.push(newPlanEntry());
  renderPlanEntries();
}

function removePlanEntry(i){
  planEntries.splice(i, 1);
  if(!planEntries.length) planEntries.push(newPlanEntry());
  renderPlanEntries();
  renderPlanSurveyRef();
}

// 계획 항목 1개 → bed_plans 행들 (세대별 기간마다 1행, 사용기간이면 1행)
function planEntryPeriods(e){
  if(planEntryUsesPeriod(e)) return (e.use_start || e.use_end) ? [{ generation: e.gen_label || null, start: e.use_start, end: e.use_end }] : [];
  return SURVEY_GEN_STAGES.filter(g=> e.gens[g]).map(g=> ({ generation: g, start: e.gens[g].start, end: e.gens[g].end })).filter(p=> p.start || p.end);
}

function buildPlanRowsFromEntry(e, ctx){
  const heat = e.purpose==='고온검정';
  const label = planEntryPurposeLabel(e);
  const rows = [];
  for(const p of planEntryPeriods(e)){
    const start = p.start || p.end, end = p.end || p.start;
    const what = SURVEY_GEN_STAGES.includes(p.generation) ? `${p.generation} 희망 기간` : '희망 사용기간';
    if(end < start) return { error: `${what}의 종료일이 시작일보다 빠를 수 없어요.` };
    if(planPeriod && planPeriod.period_start && planPeriod.period_end && (start < planPeriod.period_start || end > planPeriod.period_end)){
      return { error: `${what}은 ${planPeriod.period_start} ~ ${planPeriod.period_end} 사이여야 해요.` };
    }
    rows.push({
      room_id: ctx.room.id, room_name: ctx.roomName, structure_no: ctx.bedNo, floor: ctx.floor,
      crop_name: e.crop, generation: p.generation || null,
      // 계통번호는 적었을 때만 보낸다 (bed_plans에 line_no 컬럼이 아직 없어도 계통번호 없는 계획은 그대로 저장되게)
      ...(e.line_no.trim() && !lineNoHidden(e.purpose) ? { line_no: e.line_no.trim() } : {}),
      cross_combo: heat ? null : (e.cross_combo.trim() || null),
      // '외 N조합'은 인공교배이고 적었을 때만 보낸다 (컬럼이 없어도 안 적은 계획은 그대로 저장되게)
      ...(e.purpose==='인공교배' && parseCrossExtra(e.cross_extra) ? { cross_extra: parseCrossExtra(e.cross_extra) } : {}),
      purpose: e.breeding_purpose.trim() || null,   // 고온검정은 이 칸이 '검정 목적'이다
      planned_start: start, planned_days: daysBetween(start, end), planned_end: end,
      submitted_by: e.respondent.trim(),
      use_purpose: label || null,
      heat_temp: heat ? (normalizeTemp(e.heat_temp) || null) : null,
      heat_stage: heat ? (e.heat_stage.trim() || null) : null,
      expected_scale: e.scale==='' ? null : Number(e.scale),
      notes: e.notes.trim() || null
    });
  }
  return { rows };
}

// 새 컬럼(PLAN_EXTRA_COLS)이 아직 DB에 없으면, 그 항목만 빼고 다시 저장해서 계획 자체는 잃지 않게 한다
function planExtraColMissing(err){
  const msg = `${err.message||''} ${err.details||''}`;
  return err.code==='PGRST204' || (/column/i.test(msg) && PLAN_EXTRA_COLS.some(k=> msg.includes(k)));
}

// DB가 "이 컬럼이 없다"고 알려 주는 컬럼만 빼고 다시 저장한다 (한 번에 컬럼 하나씩 알려 주므로 필요한 만큼 반복).
// 에러에 컬럼 이름이 없으면 새 컬럼을 전부 뺀다. 이미 있는 컬럼의 내용은 최대한 그대로 저장한다.
async function insertPlanRows(rows){
  let cur = rows;
  const dropped = [];
  for(let attempt=0; attempt<=PLAN_EXTRA_COLS.length; attempt++){
    const res = await sb.from('bed_plans').insert(cur);
    if(!res.error) return { error: null, droppedExtras: dropped.length>0, droppedCols: dropped };
    if(!planExtraColMissing(res.error)) return { error: res.error, droppedExtras: false, droppedCols: [] };
    const msg = `${res.error.message||''} ${res.error.details||''}`;
    const present = PLAN_EXTRA_COLS.filter(k=> !dropped.includes(k) && cur.some(r=> k in r));
    const named = present.filter(k=> msg.includes(k));
    const drop = named.length ? named : present;
    if(!drop.length) return { error: res.error, droppedExtras: false, droppedCols: [] };
    dropped.push(...drop);
    cur = cur.map(r=>{ const c = { ...r }; drop.forEach(k=> delete c[k]); return c; });
  }
  return { error: { message: 'bed_plans 저장에 필요한 컬럼을 확인하지 못했어요.' }, droppedExtras: false, droppedCols: [] };
}

function alertPlanExtrasDropped(cols){
  const names = (cols && cols.length ? cols : PLAN_EXTRA_COLS).map(k=> PLAN_EXTRA_LABELS[k] || k).join(' · ');
  alert(`계획은 저장됐지만, ${names}은(는) bed_plans 테이블에 해당 컬럼이 없어 저장되지 않았어요.\n\n(관리자 확인 필요) Supabase SQL Editor에서 아래를 한 번 실행해주세요:\n\n` + PLAN_EXTRA_SQL);
}

// 이 자리(방 이름 · 베드 · 층)에 DB에 있는 계획들의 id. 조회에 실패하면 null (호출한 쪽이 화면 데이터로 대신한다)
async function fetchPlanRowsAt(roomName, bedNo, floor){
  const { data, error } = await sb.from('bed_plans').select('id').eq('room_name', roomName).eq('structure_no', bedNo).eq('floor', floor);
  return error ? null : (data || []);
}

// 계획은 방(rooms)에 연결돼서 저장되는데, 방은 계통작성에서 처음 열 때 DB에 만들어져요.
// 아직 만들어지지 않은 고정 방(예: 인공교배실)이면 기본 설정 그대로 자동으로 만들어서 계획 제출이 막히지 않게 한다.
async function ensurePlanRoom(roomName){
  const existing = rooms.find(r=>r.name===roomName);
  if(existing) return existing;
  const cfg = DEFAULT_ROOM_CONFIG[roomName];
  if(!cfg){ alert('이 방은 아직 계통작성에 등록되지 않았어요. 먼저 방을 만들어주세요.'); return null; }
  const { data, error } = await sb.from('rooms').insert({
    name: roomName, structure_count: cfg.bed_count, bed_floors: cfg.bed_floors, tray_capacity: cfg.tray_capacity
  }).select().single();
  if(error){ alert('방 등록 실패!\n\n' + (error.message||JSON.stringify(error))); return null; }
  rooms.push(data);
  return data;
}

async function submitPlan(){
  if(!isAdmin){ alert('분기별 계획은 전체 관리자만 작성할 수 있어요.'); return; }
  const roomName = document.getElementById('planRoomInput').value;
  if(!roomName){ alert('방을 선택해주세요.'); return; }
  if(!roomIsActive(roomByName(roomName)) && !(planEditPrefill && planEditPrefill.room_name===roomName)){ alert('관리자가 사용 중지한 방이라 새 계획을 넣을 수 없어요. 다른 방을 골라주세요.'); return; }
  const bedSel = document.getElementById('planBedNoInput');
  const floorSel = document.getElementById('planFloorInput');
  if(!bedSel || !bedSel.value || !floorSel || !floorSel.value){ alert('베드와 층을 선택해주세요.'); return; }
  const bedNo = parseInt(bedSel.value);
  const floor = floorSel.value;
  const ctx = { room: rooms.find(r=>r.name===roomName) || { id: null }, roomName, bedNo, floor };  // room_id는 검증이 끝난 뒤 확정

  const rows = [];
  for(let i=0; i<planEntries.length; i++){
    const e = planEntries[i];
    if(planEntryIsBlank(e)) continue;
    const who = planEntries.length>1 ? `${i+1}번째 항목: ` : '';
    if(!e.crop){ alert(`${who}계획 작물을 선택해주세요.`); return; }
    const built = buildPlanRowsFromEntry(e, ctx);
    if(built.error){ alert(who + built.error); return; }
    if(!built.rows.length){ alert(`${who}희망 기간(세대별 기간 또는 희망 사용기간)을 입력해주세요.`); return; }
    rows.push(...built.rows);
  }
  if(!rows.length){ alert('제출할 계획이 없어요. 수요조사 응답을 불러오거나 작물과 희망 기간을 입력해주세요.'); return; }

  const room = await ensurePlanRoom(roomName);
  if(!room) return;
  rows.forEach(r=>{ r.room_id = room.id; });

  const isEditingSameBed = planEditPrefill && planEditPrefill.room_name===roomName && Number(planEditPrefill.structure_no)===bedNo && planEditPrefill.floor===floor;
  // 이 자리(방 이름 · 베드 · 층)에 지금 있는 계획. 일정표가 방 이름으로 묶어서 보여주므로 같은 기준으로 찾고,
  // 다른 곳에서 방금 등록됐을 수도 있어서 화면에 불러와 둔 데이터가 아니라 DB에서 다시 읽는다.
  let oldRows = await fetchPlanRowsAt(roomName, bedNo, floor);
  if(oldRows === null){
    oldRows = bedPlans.filter(p=> p.room_name===roomName && Number(p.structure_no)===bedNo && String(p.floor||'').trim()===floor);
  }
  if(oldRows.length && !isEditingSameBed){
    if(!confirm(`${roomName} ${spotText(bedNo, floor)}에는 이미 제출된 계획이 있어요.\n기존 계획을 지우고 새로 등록할까요?`)) return;
  }

  // 새 계획을 먼저 저장한 뒤 이전 계획을 지운다 (저장이 실패해도 기존 계획이 사라지지 않게)
  const deleteByIds = oldRows.length>0 && oldRows.every(p=> p.id!=null);
  if(oldRows.length && !deleteByIds){
    // id를 알 수 없는 예외 상황: 저장 전에 자리 기준으로 지운다. 지워진 게 없으면 겹쳐 보이게 되므로 여기서 멈춘다.
    const { data: gone, error: delErr } = await sb.from('bed_plans').delete().eq('room_name', roomName).eq('structure_no', bedNo).eq('floor', floor).select();
    if(delErr){ alert('제출 실패!\n\n' + (delErr.message||JSON.stringify(delErr))); return; }
    if((gone||[]).length < oldRows.length){ alert('기존 계획을 지우지 못해서 제출을 멈췄어요.\n\n(Supabase의 bed_plans 삭제 권한 설정을 확인해주세요)'); return; }
  }
  const ins = await insertPlanRows(rows);
  if(ins.error){ alert('제출 실패!\n\n' + (ins.error.message||JSON.stringify(ins.error))); return; }
  if(deleteByIds){
    const ids = oldRows.map(p=> p.id);
    const { data: gone, error: delErr } = await sb.from('bed_plans').delete().in('id', ids).select('id');
    if(delErr) alert('새 계획은 저장됐지만 이전 계획을 지우지 못했어요.\n\n' + (delErr.message||JSON.stringify(delErr)));
    else if((gone||[]).length < ids.length) alert(`새 계획은 저장됐지만 이전 계획 ${ids.length}건 중 ${(gone||[]).length}건만 지워져서 일정표에 겹쳐 보일 수 있어요.\n\n(Supabase의 bed_plans 삭제 권한 설정을 확인해주세요)`);
  }
  closePlanModal();
  if(ins.droppedExtras){
    alertPlanExtrasDropped(ins.droppedCols);
  } else {
    showToast(isEditingSameBed ? '장기 계획이 수정됐어요' : '장기 계획이 제출됐어요');
  }
  await loadAll();
}

async function savePlanPeriod(){
  if(!isAdmin){ alert('전체 관리자만 할 수 있어요.'); return; }
  const s = document.getElementById('planPeriodStart').value;
  const e = document.getElementById('planPeriodEnd').value;
  if(!s || !e){ alert('시작일과 종료일을 모두 선택해주세요.'); return; }
  if(s > e){ alert('종료일이 시작일보다 빠를 수 없어요.'); return; }
  const { error } = await sb.from('plan_period').upsert({ id:'default', period_start:s, period_end:e, updated_at: new Date().toISOString() });
  if(error){ alert('저장 실패!\n\n' + (error.message||JSON.stringify(error))); return; }
  planPeriodEditing = false;
  showToast('접수 기간이 저장됐어요');
  await loadAll();
}

function openPlanPeriodEditor(){
  planPeriodEditing = true;
  if(viewMode==='survey') renderSurveyView(); else renderPlanView();
}

function closePlanPeriodEditor(){
  planPeriodEditing = false;
  if(viewMode==='survey') renderSurveyView(); else renderPlanView();
}

async function deleteAllPlans(){
  if(!isAdmin){ alert('전체 관리자만 할 수 있어요.'); return; }
  if(!confirm('정말로 모든 장기 계획을 삭제할까요? (되돌릴 수 없어요)')) return;
  const { error } = await sb.from('bed_plans').delete().gte('created_at', '1900-01-01');
  if(error){ alert('삭제 실패!\n\n'+error.message); return; }
  showToast('장기 계획이 모두 삭제됐어요');
  await loadAll();
}

// 방 바로가기: 그 방 구역으로 스크롤하고 잠깐 강조한다 (수요가 없는 방도 똑같이 갈 수 있다)
function jumpToPlanRoom(name){
  const sec = [...document.querySelectorAll('#planViewWrap .plan-room-section')].find(el=> el.dataset.roomName===name);
  if(!sec){ showToast('일정표에서 이 방을 찾지 못했어요'); return; }
  sec.scrollIntoView({ behavior:'smooth', block:'start' });
  sec.classList.remove('flash');
  void sec.offsetWidth;   // 같은 방을 연달아 눌러도 강조가 다시 시작되도록
  sec.classList.add('flash');
  setTimeout(()=> sec.classList.remove('flash'), 2600);
}

function togglePlanLockDates(on){
  planLockDates = !!on;
  try{ localStorage.setItem('sb_plan_lock_dates', planLockDates ? '1' : '0'); }catch(e){}
  renderPlanView();
  showToast(planLockDates ? '날짜 고정: 받은 날짜는 그대로 두고 자리만 옮겨요' : '날짜 고정 해제: 좌우로 끌어 날짜도 옮길 수 있어요');
}

function setPlanBedView(mode){
  mode = (mode==='free' || mode==='used') ? mode : 'all';
  if(mode===planBedView) return;
  planBedView = mode;
  try{ localStorage.setItem('sb_plan_bed_view_v2', planBedView); }catch(e){}
  renderPlanView();
}

// 요청을 고쳐서 계획에 넣는다: 계획 제출 창을 그 자리로 열고, 아직 계획에 없는 기간을 계획 항목으로 채워 둔다
async function openPlanModalForDemand(gid){
  if(!isAdmin){ alert('분기별 계획은 전체 관리자만 작성할 수 있어요.'); return; }
  if(planDraft.has(String(gid))){   // 저장 전에 옮겨 둔 요청: 옮긴 자리 · 날짜를 먼저 저장하고 그 값으로 창을 연다
    if(!(await savePlanDraft([String(gid)], true))) return;
    showToast('옮긴 자리 · 날짜를 저장했어요');
  }
  const g = computeDemandState().byGid.get(String(gid));
  if(!g) return;
  closePlanBarPopup();
  const existing = bedPlans.filter(p=> demandSpot(p.room_name, p.structure_no, p.floor)===g.spot);
  if(existing.length){
    openPlanModal({ room_name: existing[0].room_name, structure_no: existing[0].structure_no, floor: existing[0].floor, items: existing });
  } else {
    openPlanModal();
    document.getElementById('planRoomInput').value = g.room;
    renderPlanBedPicker(false, { bedNo: g.bedNo, floor: g.floor });
  }
  document.getElementById('planModalTitle').textContent = '수요조사 요청 반영';
  if(g.todoRows.length) pushPlanEntry(surveyGroupToEntry({ key: g.groupKey, rows: g.todoRows }));
  renderPlanEntries();
  renderPlanSurveyRef();
}

// 일정표에서 요청 막대를 누르면: 요청 내용 + 겹치는 항목 + [그대로 반영] / [수정하고 반영]
function openDemandPopup(gid){
  if(!isAdmin) return;
  const st = computeDemandState();
  const g = st.byGid.get(String(gid));
  if(!g || !g.actionable) return;
  const s0 = g.rows[0];
  const fam = demandFamilyInfo(st, g.family);   // 복사해서 나눈 요청이면 같은 조합의 개체수 현황
  const txt = (v)=> `<span style="white-space:pre-wrap;">${escapeHtml(String(v))}</span>`;
  const periodHtml = g.todo.map(it=> it.start
    ? `<div>${it.gen ? `<b>${escapeHtml(it.gen)}</b> ` : ''}${escapeHtml(it.start)} ~ ${escapeHtml(it.end)} (${daysBetween(it.start, it.end)}일)${it.conflicts.length ? ' <span style="color:var(--danger); font-weight:800;">⚠ 겹침</span>' : ''}</div>`
    : `<div>${it.gen ? `<b>${escapeHtml(it.gen)}</b> ` : ''}희망 기간 없음</div>`).join('');
  const doneHtml = g.items.filter(it=> it.state==='done').map(it=> `<div>${it.gen ? `<b>${escapeHtml(it.gen)}</b> ` : ''}${escapeHtml(it.start)} ~ ${escapeHtml(it.end)}</div>`).join('');
  const rows = [
    ['위치', txt(demandSpotLabel(g))],
    ['담당자', g.who ? txt(g.who) : ''],
    ['사용 목적', (s0.purposes||[]).length ? txt(s0.purposes.join(', ')) : ''],
    ['작물', g.crop ? txt(g.crop) : ''],
    ['희망 기간', periodHtml],
    ['저장된 위치', g.drafted ? txt(demandSavedText(g)) : ''],
    ['원래 신청', g.moved ? txt(demandOrigText(g)) : ''],
    ['이미 반영됨', doneHtml],
    [lineNoLabel((s0.purposes||[])[0]), s0.line_no ? txt(s0.line_no) : ''],
    ['교배조합', s0.cross_combo ? txt(crossComboLabel(s0)) : ''],
    [purposeFieldLabel((s0.purposes||[])[0]), s0.breeding_purpose ? txt(s0.breeding_purpose) : ''],
    ['처리 온도', s0.heat_temp ? txt(s0.heat_temp) : ''],
    ['처리 단계', s0.heat_stage ? txt(s0.heat_stage) : ''],
    ['처리 요인', s0.exp_factors ? txt(s0.exp_factors) : ''],
    ['처리 조건', s0.exp_condition ? txt(s0.exp_condition) : ''],
    ['예상 개체수', s0.expected_scale!=null ? txt(`${Number(s0.expected_scale).toLocaleString()}개체`) : ''],
    ['복사', fam.members.length > 1 ? txt(`${g.isCopy ? '복사본이에요 (원본 응답은 그대로 보관돼요)' : '원본이에요'} · 같은 조합 ${fam.members.length}곳 · 개체수 합계 ${fam.sum.toLocaleString()}${fam.orig!=null ? ` / 처음 신청 ${fam.orig.toLocaleString()}` : ''}`) : ''],
    ['요청사항', s0.notes ? txt(s0.notes) : ''],
    ['접수일', s0.created_at ? txt(kstDateOfTimestamp(s0.created_at)) : '']
  ].filter(([, html])=> html);
  const conflictHtml = g.conflicts.length
    ? `<div class="pd-box warn"><b>⚠ 같은 자리에서 기간이 겹쳐요</b><ul>${g.conflicts.map(c=> `<li>${escapeHtml(demandConflictText(c))}</li>`).join('')}</ul></div>` : '';
  const problemHtml = g.problem
    ? `<div class="pd-box info"><b>그대로는 반영할 수 없어요</b> · ${escapeHtml(g.problem)}<br>‘수정하고 반영’에서 채워주세요.</div>` : '';
  const titleText = ['요청', g.crop, g.todo[0].gen || (s0.purposes||[])[0]].filter(Boolean).join(' · ');
  document.getElementById('planBarModalTitle').innerHTML =
    `<span style="width:10px; height:10px; border-radius:3px; background:${planColorOf(g.crop, (s0.purposes||[])[0])}; flex-shrink:0;"></span><span>${escapeHtml(titleText)}</span><span class="sv-chip wait">반영 대기</span>`;
  document.getElementById('planBarModalBody').innerHTML = `
    <div style="display:grid; grid-template-columns:78px 1fr; gap:10px 12px; font-size:13px; line-height:1.45;">
      ${rows.map(([k, html])=> `<div style="color:var(--ink-faint); font-weight:700;">${k}</div><div style="min-width:0; color:var(--ink); word-break:break-word;">${html}</div>`).join('')}
    </div>
    ${conflictHtml}${problemHtml}`;
  const id = escapeHtml(g.gid);
  document.getElementById('planBarModalActions').innerHTML =
    `<button class="btn" onclick="copyDemandToClip('${id}')" title="이 요청을 복사해 두고, 다른 베드 · 층 줄의 [붙여넣기]로 붙여넣어요">복사</button>` +
    (fam.members.length > 1 ? `<button class="btn" onclick="openScaleSplit('${escapeHtml(g.family)}')">개체수 분배</button>` : '') +
    (g.isCopy ? `<button class="btn danger-text" onclick="deleteDemandCopy('${id}')">복사본 삭제</button>` : '') +
    (g.drafted ? `<button class="btn" onclick="cancelPlanDraft('${id}')">이 옮김 취소</button>` : '') +
    (g.moved && !g.drafted ? `<button class="btn" onclick="restoreDemand('${id}')">원래 신청대로 되돌리기</button>` : '') +
    (g.moved ? `<button class="btn" onclick="adoptOriginalDemand('${id}')">원래 신청 그대로 반영</button>` : '') +
    `<button class="btn ${g.problem ? 'primary' : ''}" onclick="openPlanModalForDemand('${id}')">${g.drafted ? '저장하고 수정 · 반영' : '수정하고 반영'}</button>` +
    (g.problem ? '' : `<button class="btn primary" onclick="adoptDemand('${id}')">${g.conflicts.length ? '겹침 확인 후 ' : g.drafted ? '저장하고 ' : '그대로 '}반영</button>`) +
    `<button class="btn" onclick="closePlanBarPopup()">닫기</button>`;
  document.getElementById('planBarModalOverlay').classList.add('open');
}

// 일정표 위의 '수요조사 반영' 패널: 반영 대기 요청을 방별로 모아 보여주고, 한 줄에서 바로 [반영] / [수정]
function renderDemandInboxHtml(st){
  if(!st.groups.length) return '';
  const c = st.counts;
  const byRoom = new Map();
  st.actionable.forEach(g=> pushTo(byRoom, g.room, g));
  const cardHtml = (g)=>{
    const s0 = g.rows[0];
    const title = [g.who || '(이름 없음)', g.crop || '작물 미정', (s0.purposes||[]).join(', ')].filter(Boolean).map(escapeHtml).join(' · ');
    const dated = g.todo.filter(it=> it.start);
    const sub = [dated.length ? demandPeriodText(dated) : '희망 기간 없음', s0.line_no ? `${lineNoLabel((s0.purposes||[])[0])} ${s0.line_no}` : '', s0.expected_scale!=null ? `예상 ${Number(s0.expected_scale).toLocaleString()}개체` : ''].filter(Boolean).join(' · ');
    const flags = [];
    if(g.conflicts.length) flags.push(`<span class="pd-flag warn" title="${escapeHtml(g.conflicts.map(demandConflictText).join('\n'))}">⚠ 기간 겹침 ${g.conflicts.length}</span>`);
    if(g.problem) flags.push(`<span class="pd-flag info">${escapeHtml(g.problem)}</span>`);
    if(g.status==='partial') flags.push(`<span class="pd-flag info">일부 기간만 반영됨</span>`);
    if(g.drafted) flags.push(`<span class="pd-flag draft">✎ 저장 전</span>`);
    else if(g.moved) flags.push(`<span class="pd-flag info">↪ 옮김</span>`);
    const fam = demandFamilyInfo(st, g.family);
    if(fam.members.length > 1){
      flags.push(`<span class="pd-flag copy" title="같은 요청을 복사해서 ${fam.members.length}곳에 놓았어요">⧉ ${g.isCopy ? '복사본' : '원본'}</span>`);
      if(fam.orig != null && fam.sum !== fam.orig) flags.push(`<span class="pd-flag info" title="개체수 합계가 처음 신청과 달라요. [분배]에서 맞춰 주세요">개체수 합계 ${fam.sum.toLocaleString()}/${fam.orig.toLocaleString()}</span>`);
    }
    const id = escapeHtml(g.gid);
    return `
      <div class="pd-card ${g.conflicts.length ? 'conflict' : ''}">
        <button type="button" class="pd-loc" title="일정표에서 이 자리 보기" onclick="goToPlanLane('${escapeHtml(g.room)}', ${g.bedNo}, '${escapeHtml(g.floor)}')">${isAisleSpot(g.bedNo) ? '통로' : `베드 ${g.bedNo}<br>${escapeHtml(g.floor)}`}</button>
        <div class="pd-main">
          <div class="pd-title"><span class="pd-dot" style="background:${planColorOf(g.crop, (s0.purposes||[])[0])};"></span>${title}${flags.join('')}</div>
          <div class="pd-sub">${escapeHtml(sub)}</div>
          ${g.drafted ? `<div class="pd-sub pd-orig">✎ 저장된 위치: ${escapeHtml(demandSavedText(g))}</div>` : ''}
          ${g.moved ? `<div class="pd-sub pd-orig">↪ 원래 신청 (원본 그대로 보관 중): ${escapeHtml(demandOrigText(g))}</div>` : ''}
        </div>
        <div class="pd-act">
          <button type="button" class="btn small" onclick="copyDemandToClip('${id}')" title="복사해 두고 다른 베드 · 층에 붙여넣어요">복사</button>
          ${fam.members.length > 1 ? `<button type="button" class="btn small" onclick="openScaleSplit('${escapeHtml(g.family)}')" title="원본과 복사본의 개체수를 나눠요">분배</button>` : ''}
          ${g.drafted ? `<button type="button" class="btn small" onclick="cancelPlanDraft('${id}')">옮김 취소</button>` : ''}
          ${g.moved && !g.drafted ? `<button type="button" class="btn small" onclick="restoreDemand('${id}')" title="저장해 둔 조율을 지우고 원래 신청 상태로 돌려요">원래대로</button>` : ''}
          ${g.moved ? `<button type="button" class="btn small" onclick="adoptOriginalDemand('${id}')" title="저장해 둔 조율은 지우고, 원래 신청 그대로 계획에 넣어요">원본 그대로 반영</button>` : ''}
          <button type="button" class="btn small ${g.problem ? 'primary' : ''}" onclick="openPlanModalForDemand('${id}')">수정</button>
          ${g.problem ? '' : `<button type="button" class="btn small ${g.conflicts.length ? '' : 'primary'}" onclick="adoptDemand('${id}')">반영</button>`}
        </div>
      </div>`;
  };
  const listHtml = byRoom.size
    ? `<div class="pd-list">${[...byRoom.entries()].map(([room, list])=> `
        <div>
          <div class="pd-room-name">${escapeHtml(roomLabel(room))} · ${list.length}건</div>
          <div class="pd-cards">${list.map(cardHtml).join('')}</div>
        </div>`).join('')}</div>`
    : `<div class="empty-materials" style="padding:18px 0;">접수된 요청 ${c.done}건이 모두 계획에 반영됐어요 ✓</div>`;
  return `
    <div class="panel-box pd-panel">
      <div class="panel-box-head">
        <div>
          <h3>수요조사 반영</h3>
          <p>접수된 요청을 일정표에 넣는 곳이에요. <b>반영</b>은 요청한 그대로, <b>수정</b>은 고쳐서 넣어요. 왼쪽 위치 버튼을 누르면 일정표의 그 자리로 이동해요.</p>
        </div>
        <div class="pd-head-act">
          <label class="pd-toggle"><input type="checkbox" ${planShowDemand ? 'checked' : ''} onchange="togglePlanShowDemand(this.checked)" /> 일정표에 요청 함께 보기</label>
          ${c.moved ? `<button type="button" class="btn small" onclick="restoreDemand()">저장된 옮김 ${c.moved}건 모두 원래대로</button>` : ''}
          ${c.quick ? `<button type="button" class="btn small primary" onclick="adoptAllCleanDemand()">겹침 없는 ${c.quick}건 한 번에 반영</button>` : ''}
        </div>
      </div>
      <div class="pd-stats">
        <span class="pd-stat"><b>${c.wait}</b> 반영 대기</span>
        ${c.conflict ? `<span class="pd-stat warn"><b>${c.conflict}</b> 기간 겹침</span>` : ''}
        ${c.drafted ? `<span class="pd-stat draft"><b>${c.drafted}</b> 저장 전</span>` : ''}
        ${c.moved ? `<span class="pd-stat"><b>${c.moved}</b> 저장된 옮김</span>` : ''}
        <span class="pd-stat ok"><b>${c.done}</b> 반영 완료</span>
      </div>
      ${listHtml}
    </div>`;
}

function togglePlanShowDemand(on){
  planShowDemand = !!on;
  renderPlanView();
}

// 지금 그려진 일정표에서 그 자리(방 · 베드 · 층)를 찾아 스크롤하고 잠깐 강조한다. 찾으면 true
function flashPlanLane(room, bedNo, floor){
  const key = demandSpot(room, bedNo, floor);
  const lane = [...document.querySelectorAll('#planViewWrap .plan-lane')].find(el=> el.dataset.lane===key);
  if(!lane) return false;
  lane.scrollIntoView({ behavior:'smooth', block:'center' });
  lane.classList.remove('flash');
  void lane.offsetWidth;   // 같은 자리를 연달아 눌러도 강조가 다시 시작되도록
  lane.classList.add('flash');
  setTimeout(()=> lane.classList.remove('flash'), 2600);
  return true;
}

// 분기별 계획 탭으로 가서 그 자리를 보여준다. 수요조사 탭에서도 쓴다.
function goToPlanLane(room, bedNo, floor){
  const needRender = !planShowDemand;
  planShowDemand = true;
  if(viewMode!=='plan') switchView('plan');
  else if(needRender) renderPlanView();
  if(!flashPlanLane(room, bedNo, floor)) showToast('일정표에서 이 자리를 찾지 못했어요');
}

// 수요조사 탭의 응답 카드 한 장에 붙는 '계획 반영 상태' 줄
function demandLinkHtml(st, s){
  const hit = st.byRow.get(String(s.id));
  if(!hit) return '';
  const { g, it } = hit;
  const id = escapeHtml(g.gid);
  const jump = (room, bedNo, floor)=> `<button type="button" class="btn small" onclick="goToPlanLane('${escapeHtml(room)}', ${Number(bedNo)}, '${escapeHtml(floor)}')">일정표에서 보기</button>`;
  // 이 응답에 적힌 내용(위)은 신청한 그대로다. 관리자가 조율을 저장해 뒀으면 계획에 쓰이는 조율 위치를 따로 보여준다
  const adj = demandAdjOf(s);
  const adjChip = adj ? `<span class="sv-chip adj" title="관리자가 조율해서 저장해 둔 자리 · 날짜예요. 이 응답에 적힌 원래 신청은 그대로 보관돼 있어요">↪ 조율 저장됨 → ${escapeHtml([demandOrigSpotText(adj), demandOrigDateText(s, adj)].filter(Boolean).join(' · '))}</span>` : '';
  if(it.state==='done'){
    const p = it.plan.p;
    const note = it.plan.spot!==g.spot ? ` · ${spotText(p.structure_no, p.floor, true)}에 반영` : it.how==='adjusted' ? ' · 기간은 조정됨' : '';
    return `<div class="sv-link"><span class="sv-chip done">✓ 계획에 반영됨${escapeHtml(note)}</span>${adjChip}${jump(p.room_name, p.structure_no, p.floor)}</div>`;
  }
  if(it.state==='nodate') return `<div class="sv-link"><span class="sv-chip wait">희망 기간이 없어 일정표에 넣을 수 없어요</span>${adjChip}</div>`;
  return `<div class="sv-link">
    <span class="sv-chip wait">${g.conflicts.length ? '⚠ 기간 겹침 · ' : ''}반영 대기</span>
    ${adjChip}
    ${g.problem
      ? `<button type="button" class="btn small primary" onclick="openPlanModalForDemand('${id}')">수정하고 반영</button>`
      : `<button type="button" class="btn small primary" onclick="adoptDemand('${id}')">${adj ? '조율한 대로 반영' : '계획에 반영'}</button>`}
    ${adj ? `<button type="button" class="btn small" onclick="adoptOriginalDemand('${id}')" title="저장해 둔 조율은 지우고, 이 응답에 적힌 원래 신청 그대로 계획에 넣어요">원래 신청 그대로 반영</button>` : ''}
    ${jump(g.room, g.bedNo, g.floor)}
  </div>`;
}

function planRangeMonths(){
  if(planPeriod && planPeriod.period_start && planPeriod.period_end){
    const s = new Date(planPeriod.period_start+'T00:00:00');
    const e = new Date(planPeriod.period_end+'T00:00:00');
    e.setDate(e.getDate()+1);
    return { start: s, end: e };
  }
  const start = kstTodayDate(); start.setDate(1);
  const end = new Date(start.getFullYear(), start.getMonth()+6, 1);
  return { start, end };
}

function genStageIndex(genStr){
  const stage = extractGenStage(genStr);
  if(!stage) return null;
  if(stage==='포장') return 7;
  const m = stage.match(/F(\d+)/);
  return m ? parseInt(m[1]) : null;
}

// 일정표 막대를 누르면 그 계획의 내용을 팝업으로 보여준다 (위치 · 기간 · 수요조사에서 온 상세 내용)
function openPlanBarPopup(idx){
  const p = currentPlanBarItems[idx];
  if(!p) return;
  const start = p.planned_start, end = p.planned_end || p.planned_start;
  const days = (p.planned_days!=null && p.planned_days!=='') ? Number(p.planned_days) : daysBetween(start, end);
  const color = planColorOf(p.crop_name, planPurposeKind(p));
  const txt = (v)=> `<span style="white-space:pre-wrap;">${escapeHtml(String(v))}</span>`;
  const rows = [
    ['위치', txt(`${roomLabel(p.room_name)} · ${spotText(p.structure_no, p.floor)}`)],
    ['작물', p.crop_name ? txt(p.crop_name) : ''],
    ['세대', p.generation ? txt(p.generation) : ''],
    ['사용 목적', p.use_purpose ? txt(p.use_purpose) : ''],
    ['기간', txt(`${start} ~ ${end} (${days}일)`)],
    [lineNoLabel(p.use_purpose), p.line_no ? txt(p.line_no) : ''],
    ['교배조합', p.cross_combo ? txt(crossComboLabel(p)) : ''],
    [purposeFieldLabel(p.use_purpose), p.purpose ? txt(p.purpose) : ''],
    ['처리 온도', p.heat_temp ? txt(p.heat_temp) : ''],
    ['처리 단계', p.heat_stage ? txt(p.heat_stage) : ''],
    ['예상 개체수', p.expected_scale!=null ? txt(`${Number(p.expected_scale).toLocaleString()}개체`) : ''],
    ['요청사항', p.notes ? txt(p.notes) : ''],
    ['담당자', p.submitted_by ? txt(p.submitted_by) : '']
  ].filter(([, html])=> html);

  const titleText = [p.crop_name, p.generation || p.use_purpose].filter(Boolean).join(' ') || '계획';
  document.getElementById('planBarModalTitle').innerHTML =
    `<span style="width:10px; height:10px; border-radius:3px; background:${color}; flex-shrink:0;"></span><span>${escapeHtml(titleText)}</span>`;
  document.getElementById('planBarModalBody').innerHTML = `
    <div style="display:grid; grid-template-columns:78px 1fr; gap:10px 12px; font-size:13px; line-height:1.45;">
      ${rows.map(([k, html])=> `<div style="color:var(--ink-faint); font-weight:700;">${k}</div><div style="min-width:0; color:var(--ink); word-break:break-word;">${html}</div>`).join('')}
    </div>`;
  // 관리자는 팝업에서 바로 이 층의 계획을 수정할 수 있다
  const gi = isAdmin ? currentPlanGroups.findIndex(g=> g.room_name===p.room_name && g.structure_no===p.structure_no && g.floor===p.floor) : -1;
  document.getElementById('planBarModalActions').innerHTML =
    (gi>=0 ? `<button class="btn" onclick="closePlanBarPopup(); openPlanModal(currentPlanGroups[${gi}])">이 층 계획 수정</button>` : '') +
    (isAdmin && p.id!=null ? `<button class="btn danger-text" onclick="deletePlanRow(${idx})">이 계획 삭제</button>` : '') +
    `<button class="btn primary" onclick="closePlanBarPopup()">닫기</button>`;
  document.getElementById('planBarModalOverlay').classList.add('open');
}

function closePlanBarPopup(){
  document.getElementById('planBarModalOverlay').classList.remove('open');
}

// 관리자: 일정표 막대 하나(계획 한 건)만 지운다 (같은 층의 다른 계획은 그대로)
async function deletePlanRow(idx){
  if(tourBlockWrite()) return;
  if(!isAdmin){ alert('전체 관리자만 할 수 있어요.'); return; }
  const p = currentPlanBarItems[idx];
  if(!p || p.id==null) return;
  const what = [p.crop_name, p.generation || p.use_purpose, p.line_no || (p.cross_combo ? crossComboLabel(p) : '')].filter(Boolean).join(' · ') || '이 계획';
  const where = `${roomLabel(p.room_name)} ${spotText(p.structure_no, p.floor)}`;
  if(!confirm(`${where}의 '${what}' 계획(${p.planned_start} ~ ${p.planned_end || p.planned_start})을 삭제할까요?\n(되돌릴 수 없어요)`)) return;
  const { data: gone, error } = await sb.from('bed_plans').delete().eq('id', p.id).select('id');
  if(error){ alert('삭제 실패!\n\n' + (error.message||JSON.stringify(error))); return; }
  if(!(gone||[]).length){ alert('삭제되지 않았어요.\n\n(Supabase의 bed_plans 삭제 권한 설정을 확인해주세요)'); return; }
  closePlanBarPopup();
  showToast('계획을 삭제했어요');
  await loadAll();
}

// 분기별 계획 일정표: 방 → 베드 → 층 순서로 묶어서, 한 베드의 1층·2층을 한 카드에 나란히 보여준다
// st(수요조사 연계 상태)를 받으면(관리자) 아직 계획에 넣지 않은 요청을 점선 막대로 함께 보여준다
function renderPlanTimeline(st){
  const { start, end } = planRangeMonths();
  const totalDays = Math.max(1, surveyDateToDays(end) - surveyDateToDays(start));
  const startYmd = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;

  let axisTicks = '', gridLines = '';
  let cursor = new Date(start);
  while(cursor < end){
    const offsetDays = surveyDateToDays(cursor) - surveyDateToDays(start);
    const leftPct = (offsetDays/totalDays*100).toFixed(2);
    axisTicks += `<div style="position:absolute; left:${leftPct}%; top:0; bottom:0; border-left:1px dashed var(--plan-month-line); font-size:10.5px; font-weight:700; color:var(--ink-faint); padding-left:5px;">${cursor.getMonth()+1}월</div>`;
    // 위아래로 4px 늘려서(층 줄의 여백만큼) 두 층 사이에서도 끊기지 않고 이어져 보이게 한다
    gridLines += `<div style="position:absolute; left:${leftPct}%; top:-4px; bottom:-4px; border-left:1px dashed var(--plan-month-line);"></div>`;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth()+1, 1);
  }
  const axisHtml = `
    <div class="plan-axis">
      <div class="plan-axis-spacer"></div>
      <div class="plan-axis-lane"><div class="plan-axis-tag"></div><div class="plan-axis-track">${axisTicks}</div>${isAdmin ? '<div class="plan-axis-act"></div>' : ''}</div>
    </div>`;

  // 방 → 베드 → 층 → 계획들
  const roomBeds = {};
  bedPlans.forEach(p=>{
    const beds = (roomBeds[p.room_name] = roomBeds[p.room_name] || {});
    const floors = (beds[p.structure_no] = beds[p.structure_no] || {});
    (floors[p.floor] = floors[p.floor] || []).push(p);
  });
  // 아직 계획에 넣지 않은 요청: 자리(방 · 베드 · 층)별로 모은다. 계획이 하나도 없는 베드도 일정표에 나타나도록 베드를 만들어 둔다
  const ghostBySpot = new Map();
  if(st && planShowDemand){
    st.actionable.forEach(g=> g.items.forEach(it=>{
      if(it.state!=='pending') return;
      pushTo(ghostBySpot, g.spot, { g, it });
      const beds = (roomBeds[g.room] = roomBeds[g.room] || {});
      beds[g.bedNo] = beds[g.bedNo] || {};
    }));
  }
  // 수요도 계획도 없는 방과 빈 베드도 모두 만들어 둔다 (요청을 끌어다 놓을 자리 · 어디가 비었는지 한눈에 보기). '남은 베드 보기'는 아래에서 이 중 쓰이는 줄을 걸러낸다.
  // 도면의 고정 방뿐 아니라 관리자가 추가한 방 · '사용 가능'을 켠 칸도 포함하고, 사용 중지한 방도 (흐리게 표시해서) 보여준다. 베드가 없는 칸(창고 · 쓰지 않는 조사실)만 뺀다
  new Set([...ROW1, ...ROW2, ...rooms.map(r=> r.name)]).forEach(name=>{
    const cfg = roomBedConfig(name);
    if(!cfg || isMutedRoom(name)) return;
    const beds = (roomBeds[name] = roomBeds[name] || {});
    for(let n = 1; n <= cfg.bed_count; n++) beds[n] = beds[n] || {};
    if(AISLE_ROOMS.has(name)) beds[AISLE_BED_NO] = beds[AISLE_BED_NO] || {};
  });
  const roomOrder = [...new Set([...ROW1, ...ROW2])];
  const allRoomNames = Object.keys(roomBeds).sort((a,b)=>{
    const ra = roomOrder.indexOf(a), rb = roomOrder.indexOf(b);
    return (ra<0?999:ra) - (rb<0?999:rb) || a.localeCompare(b);   // 도면 순서 → 그 밖의 방은 이름 순
  });
  const roomIsOff = (name)=> !roomIsActive(roomByName(name));   // 관리자가 사용 중지한 방
  const pendingByRoom = new Map();   // 방별 반영 대기 요청 수 ('방 바로가기'에 보여준다)
  if(st && planShowDemand) st.actionable.forEach(g=> pendingByRoom.set(g.room, (pendingByRoom.get(g.room) || 0) + 1));
  const FLOOR_ORDER = ['2층','1층'];   // 위층이 위에 오도록 (수요조사 베드 선택 화면과 같은 순서)
  const floorRank = (fl)=>{ const i = FLOOR_ORDER.indexOf(fl); return i<0 ? 99 : i; };

  // 계획 하나가 일정표에서 차지하는 구간 { left, width } (일 단위, 범위에 맞게 잘라낸 값). 일정표 범위 밖이면 null
  const planSpan = (p)=>{
    if(!p.planned_start) return null;
    const pStart = new Date(p.planned_start+'T00:00:00');
    const pEnd = p.planned_end ? new Date(p.planned_end+'T00:00:00') : pStart;
    let left = surveyDateToDays(pStart) - surveyDateToDays(start);
    let width = Math.max(1, surveyDateToDays(pEnd) - surveyDateToDays(pStart));
    if(left < 0){ width += left; left = 0; }
    if(left + width > totalDays) width = totalDays - left;
    if(width <= 0 || left >= totalDays) return null;
    return { left, width };
  };

  // 한 베드에서 보여줄 층들 (방 설정에 있는 층은 계획이 없어도 함께 보여준다). '남은 베드만'에서는 일정표 기간에 확정된 계획이 하나도 없는 층만 남기고,
  // '사용중인 베드만'에서는 반대로 확정된 계획이 있는 층만 남긴다.
  // '남은 베드만'에서 반영 대기 요청이 있는 층은 계획이 있어도 남겨서 요청이 일정표에서 사라지지 않게 한다
  const bedNoOf = (bedKey, byFloor)=>{
    // 객체 키는 문자열이 되므로, 베드 번호는 계획 데이터에 들어 있는 원래 값(숫자)을 쓴다 (수정 창·팝업이 베드를 정확히 찾도록)
    // 계획이 하나도 없고 요청만 있는 베드는 키를 숫자로 바꿔 쓴다
    const firstPlans = Object.values(byFloor).find(arr=> arr.length);
    return firstPlans ? firstPlans[0].structure_no : Number(bedKey);
  };
  const floorsOf = (roomName, bedNo, byFloor)=>{
    const cfg = roomBedConfig(roomName);
    const cfgFloors = isAisleSpot(bedNo) ? [AISLE_FLOOR] : cfg ? (cfg.bed_floors===2 ? ['2층','1층'] : ['1층']) : [];   // 인공교배실의 통로는 '통로' 한 줄뿐
    const floors = [...new Set([...cfgFloors, ...Object.keys(byFloor)])].sort((a,b)=> floorRank(a)-floorRank(b) || a.localeCompare(b));
    if(planBedView==='all') return floors;
    const hasPlan = (fl)=> (byFloor[fl]||[]).some(p=> planSpan(p));
    if(planBedView==='used') return floors.filter(hasPlan);
    return floors.filter(fl=> !hasPlan(fl) || ghostBySpot.has(demandSpot(roomName, bedNo, fl)));
  };
  const roomNames = planBedView!=='all'
    ? allRoomNames.filter(name=> Object.keys(roomBeds[name]).some(k=> floorsOf(name, bedNoOf(k, roomBeds[name][k]), roomBeds[name][k]).length))
    : allRoomNames;

  // 한 층 줄의 확정 계획 막대들. 기간이 겹치는 계획(예: '겹침 확인 후 반영'으로 같은 자리에 넣은 계획)은 줄을 나눠 위아래로 쌓아서
  // 화살표가 모두 보이게 한다. 돌려주는 값: { html, rows } (rows = 쌓인 줄 수)
  const barsFor = (items)=>{
    const placed = [];
    items.forEach(p=>{
      const span = planSpan(p);
      if(span) placed.push({ p, left: span.left, width: span.width });
    });
    placed.sort((a, b)=> a.left - b.left);   // 먼저 시작하는 계획이 위쪽 줄
    const rowEnds = [];
    placed.forEach(b=>{
      let r = rowEnds.findIndex(e=> e <= b.left);
      if(r < 0){ r = rowEnds.length; rowEnds.push(0); }
      b.row = r;
      rowEnds[r] = b.left + b.width;
    });
    return { rows: Math.max(1, rowEnds.length), html: placed.map(({ p, left, width, row })=>{
      const color = planColorOf(p.crop_name, planPurposeKind(p));   // 고온검정은 작물 색에 붉은 기를 섞는다
      const stageIdx = genStageIndex(p.generation);
      const brightness = stageIdx ? Math.max(0.62, 1.22 - stageIdx*0.09) : 1;
      // 화면에 그려지는 구간(잘린 경우 잘린 만큼)의 한국 시간 시작·끝 → 지금까지 지난 비율만큼 색이 찬다
      const visS = kstMidnightMs(addDays(startYmd, left));
      const visE = visS + width * 86400000;
      const fillPct = planFillPct(Date.now(), visS, visE);
      const leftPct = (left/totalDays*100).toFixed(2);
      const widthPct = Math.max(1.2, (width/totalDays*100)).toFixed(2);
      // 세대가 없는 계획(인공교배·고온검정 등)은 막대 이름에 사용 목적을 붙인다
      const label = [p.crop_name, p.generation || p.use_purpose].filter(Boolean).join(' ');
      const tooltip = [label, `${p.planned_start} ~ ${p.planned_end||''}`,
        (p.generation && p.use_purpose) ? `사용 목적: ${p.use_purpose}` : '',
        p.line_no?`${lineNoLabel(p.use_purpose)}: ${p.line_no}`:'', p.cross_combo?`교배조합: ${crossComboLabel(p)}`:'', p.purpose?`목적: ${p.purpose}`:'',
        p.heat_temp?`처리 온도: ${p.heat_temp}`:'', p.heat_stage?`처리 단계: ${p.heat_stage}`:'',
        p.expected_scale!=null?`예상 ${Number(p.expected_scale).toLocaleString()}개체`:'', p.notes?`요청: ${p.notes}`:'',
        `담당: ${p.submitted_by||''}`].filter(Boolean).join(' · ');
      // 막대 이름 뒤에 목적(교배목적, 없으면 이름에 아직 안 나온 사용 목적)과 예상 개체수를 연하게 덧붙인다
      const subText = [p.purpose || (p.generation ? p.use_purpose : ''), p.expected_scale!=null ? `${Number(p.expected_scale).toLocaleString()}개체` : ''].filter(Boolean).join(' · ');
      // 맨 앞에는 담당자 이름 (반영 대기 요청 막대와 같은 순서: 이름 · 작물 세대)
      const who = String(p.submitted_by || '').trim();
      const labelHtml = `${who ? `<span class="plan-bar-who">${escapeHtml(who)}</span>` : ''}${escapeHtml(label)}${subText ? `<i class="plan-bar-sub">${escapeHtml(subText)}</i>` : ''}`;
      const barIdx = currentPlanBarItems.length;
      currentPlanBarItems.push(p);
      return `<div class="plan-bar" role="button" tabindex="0" title="${escapeHtml(tooltip)}" onclick="openPlanBarPopup(${barIdx})" onkeydown="if(event.key==='Enter'||event.key===' '){ event.preventDefault(); openPlanBarPopup(${barIdx}); }" data-vs="${visS}" data-ve="${visE}" style="left:${leftPct}%; width:${widthPct}%; top:calc((var(--plan-bar-h) + 2px) * ${row}); bottom:auto; height:var(--plan-bar-h); --c:${color}; --plan-p:${fillPct}%; filter:brightness(${brightness});"><span class="plan-bar-label plan-bar-label-empty">${labelHtml}</span><span class="plan-bar-label plan-bar-label-full" aria-hidden="true">${labelHtml}</span></div>`;
    }).join('') };
  };

  // 아직 계획에 넣지 않은 요청 막대들 (확정된 계획 줄 바로 아래에 점선·빗금으로). 기간이 겹치는 요청끼리는 줄을 나눠 쌓는다
  const ghostTrackFor = (list)=>{
    const placed = [];
    list.forEach(({ g, it })=>{
      let left = surveyDateToDays(new Date(it.start+'T00:00:00')) - surveyDateToDays(start);
      let width = Math.max(1, surveyDateToDays(new Date(it.end+'T00:00:00')) - surveyDateToDays(new Date(it.start+'T00:00:00')));
      if(left < 0){ width += left; left = 0; }
      if(left + width > totalDays) width = totalDays - left;
      if(width <= 0 || left >= totalDays) return;   // 일정표 범위 밖
      placed.push({ g, it, left, width });
    });
    if(!placed.length) return '';
    placed.sort((a, b)=> a.left - b.left);
    const rowEnds = [];
    placed.forEach(b=>{
      let r = rowEnds.findIndex(e=> e <= b.left);
      if(r < 0){ r = rowEnds.length; rowEnds.push(0); }
      b.row = r;
      rowEnds[r] = b.left + b.width;
    });
    const bars = placed.map(({ g, it, left, width, row })=>{
      const conflict = it.conflicts.length > 0;
      const what = [g.crop || '작물 미정', it.gen || (g.rows[0].purposes||[])[0]].filter(Boolean).join(' ');
      const famN = (st.families.get(g.family) || []).length;   // 복사해서 나눈 요청이면 막대에 이 자리의 개체수를 보여준다
      const scaleNow = scaleNum(g.rows[0].expected_scale);
      const label = `${g.who || '익명'} · ${what}${famN > 1 && scaleNow != null ? ` · ${scaleNow.toLocaleString()}개체` : ''}`;
      const tip = [`반영 대기 요청 · ${what}`, `${it.start} ~ ${it.end}`, g.rows[0].line_no ? `${lineNoLabel((g.rows[0].purposes||[])[0])}: ${g.rows[0].line_no}` : '', `담당: ${g.who || '익명'}`,
        famN > 1 ? `⧉ ${g.isCopy ? '복사본' : '원본'} · 같은 조합 ${famN}곳${scaleNow != null ? ` · 이 자리 ${scaleNow.toLocaleString()}개체` : ''}` : '',
        g.drafted ? `✎ 저장 전에 옮긴 상태 · 저장된 위치: ${demandSavedText(g)}` : '',
        g.moved ? `↪ 원래 신청: ${demandOrigText(g)}` : '',
        ...it.conflicts.map(c=> `⚠ 겹침: ${demandConflictText(c)}`), '(누르면 계획에 반영 · 끌어서 자리 · 날짜 옮기기)'].filter(Boolean).join('\n');
      const id = escapeHtml(g.gid);
      return `<div class="plan-ghost movable ${conflict ? 'conflict' : ''} ${g.moved ? 'moved' : ''} ${g.drafted ? 'draft' : ''}" data-gid="${id}" data-c="${planColorOf(g.crop, (g.rows[0].purposes||[])[0])}" role="button" tabindex="0" title="${escapeHtml(tip)}" onpointerdown="planGhostDown(event, '${id}')" onclick="openDemandPopup('${id}')" onkeydown="if(event.key==='Enter'||event.key===' '){ event.preventDefault(); openDemandPopup('${id}'); }" style="left:${(left/totalDays*100).toFixed(2)}%; width:${Math.max(1.2, width/totalDays*100).toFixed(2)}%; top:calc((var(--plan-bar-h) + 2px) * ${row}); ${conflict ? '' : `--c:${planColorOf(g.crop, (g.rows[0].purposes||[])[0])};`}">${g.drafted ? '✎ ' : g.moved ? '↪ ' : ''}${famN > 1 ? '⧉ ' : ''}${conflict ? '<span class="gh-warn">⚠ </span>' : ''}${escapeHtml(label)}</div>`;
    }).join('');
    const rowCount = rowEnds.length;
    return `<div class="plan-demand-track" style="height:calc(var(--plan-bar-h) * ${rowCount} + ${(rowCount-1)*2}px);">${gridLines}${bars}</div>`;
  };

  currentPlanGroups = [];
  currentPlanBarItems = [];
  const clipNow = (st && planShowDemand && isAdmin) ? activeClip() : null;   // 붙여넣을 복사본 (없으면 [붙여넣기] 버튼도 없다)
  // 한 베드의 한 층 줄 (계획이 없으면 '계획 없음'). 층별 상세 내용은 줄 안에 적지 않고 막대에 마우스를 올리면 툴팁으로 보여준다
  const renderLane = (roomName, bedNo, floor, items)=>{
    let editBtn = '';
    if(items.length && isAdmin){
      const gIdx = currentPlanGroups.length;
      currentPlanGroups.push({ room_name: roomName, structure_no: bedNo, floor, items });
      editBtn = `<button class="btn small" onclick="openPlanModal(currentPlanGroups[${gIdx}])">수정</button>`;
    }
    // 복사해 둔 요청이 있으면 모든 줄에 [붙여넣기] (고른 복사본을 이 베드 · 층에 붙여넣는다)
    const pasteBtn = clipNow ? `<button class="btn small primary" onclick="pasteClipToLane(this)" title="${escapeHtml(`복사한 '${clipNow.label}'을(를) 이 자리에 붙여넣어요`)}">붙여넣기</button>` : '';
    const spot = demandSpot(roomName, bedNo, floor);
    const bars = items.length ? barsFor(items) : null;
    const trackStyle = (bars && bars.rows > 1) ? ` style="height:calc(var(--plan-bar-h) * ${bars.rows} + ${(bars.rows-1)*2}px);"` : '';
    return `
      <div class="plan-lane ${roomIsOff(roomName) ? 'room-off' : ''}" data-lane="${escapeHtml(spot)}" data-room="${escapeHtml(roomName)}" data-bed="${Number(bedNo)}" data-floor="${escapeHtml(floor)}">
        <div class="plan-lane-tag">${escapeHtml(floor)}</div>
        <div class="plan-lane-body">
          <div class="plan-lane-track"${trackStyle}>${gridLines}${bars ? bars.html : '<span class="plan-lane-empty">계획 없음</span>'}</div>
          ${ghostBySpot.has(spot) ? ghostTrackFor(ghostBySpot.get(spot)) : ''}
        </div>
        ${isAdmin ? `<div class="plan-lane-act">${pasteBtn}${editBtn}</div>` : ''}
      </div>`;
  };
  // 베드 카드: 왼쪽 '베드 N' + 오른쪽 층별 줄 (방 설정에 있는 층은 계획이 없어도 함께 보여준다)
  const renderBedBlock = (roomName, bedKey, byFloor)=>{
    const bedNo = bedNoOf(bedKey, byFloor);
    const aisle = isAisleSpot(bedNo);   // 인공교배실의 통로: 베드가 아니라 '통로' 한 줄만 있다
    const floors = floorsOf(roomName, bedNo, byFloor);
    if(!floors.length) return '';   // '남은 베드만'에서 모든 층이 쓰이는 베드 · '사용중인 베드만'에서 쓰이는 층이 없는 베드
    return `
      <div class="plan-bed-block">
        <div class="plan-bed-name">${aisle ? '통로' : `베드 ${escapeHtml(String(bedNo))}`}</div>
        <div class="plan-lanes">${floors.map(fl=> renderLane(roomName, bedNo, fl, byFloor[fl]||[])).join('')}</div>
      </div>`;
  };
  // 실 박스: 왼쪽에 실 이름, 오른쪽에 월 눈금과 베드 카드들 (베드 번호 순)
  const sectionsHtml = roomNames.map(roomName=>{
    const beds = roomBeds[roomName];
    const bedNos = Object.keys(beds).sort((a,b)=> bedOrder(a) - bedOrder(b));
    const off = roomIsOff(roomName);
    return `
      <div class="plan-room-section ${off ? 'room-off' : ''}" data-room-name="${escapeHtml(roomName)}">
        <div class="plan-room-name">${escapeHtml(roomLabel(roomName))}${off ? '<small>사용 중지</small>' : ''}</div>
        <div class="plan-room-main">
          <div class="plan-room-section-body">${bedNos.map(no=> renderBedBlock(roomName, no, beds[no])).join('')}</div>
        </div>
      </div>
    `;
  }).join('');

  // 월 눈금은 맨 위에 하나만 (실 박스와 같은 구조: 실 이름 칸 자리를 비우고 그 오른쪽에 눈금)
  const stickyAxisHtml = roomNames.length ? `
    <div class="plan-axis-sticky">
      <div class="plan-axis-roomspacer"></div>
      <div class="plan-axis-main">${axisHtml}</div>
    </div>` : '';

  // 방 바로가기: 수요가 있는 방도 없는 방도 한 줄에 모두 보여주고, 눌러서 그 방으로 이동한다 (요청을 멀리 있는 방으로 옮길 때 어디에 어떤 방이 있는지 한눈에 보이게)
  const roomJumpHtml = (st && planShowDemand && roomNames.length > 1) ? `
    <div class="plan-room-jump">
      <span>방 바로가기</span>
      ${roomNames.map(n=>{
        const c = pendingByRoom.get(n) || 0, off = roomIsOff(n);
        return `<button type="button" class="rj ${c ? 'has' : ''} ${off ? 'off' : ''}" data-room="${escapeHtml(n)}" onclick="jumpToPlanRoom(this.dataset.room)">${escapeHtml(roomLabel(n))}<i>${off ? '사용 중지' : c ? `요청 ${c}` : '요청 없음'}</i></button>`;
      }).join('')}
    </div>` : '';

  return `
    <div class="plan-bed-list${clipNow ? ' has-clip' : ''}">
      ${roomJumpHtml}
      ${stickyAxisHtml}
      ${roomNames.length ? sectionsHtml : `<div class="empty-materials" style="padding:24px 0;">${planBedView==='free' ? '일정표 기간에 남은 베드가 없어요. 모든 베드에 계획이 있어요.' : planBedView==='used' ? '일정표 기간에 사용 중인 베드가 없어요. 확정된 계획이 있는 베드가 없어요.' : isAdmin ? '아직 제출된 장기 계획이 없어요. "+ 계획 제출"로 등록해보세요.' : '아직 등록된 장기 계획이 없어요.'}</div>`}
    </div>
  `;
}

function renderPlanPeriodBannerHtml(){
  if(planPeriodEditing && isAdmin){
    return `
      <div style="background:#F5F8F6; border:1.8px solid var(--line-soft); border-radius:6px; padding:12px 14px; margin-bottom:16px; display:flex; align-items:flex-end; gap:8px; flex-wrap:wrap;">
        <label style="font-size:11px; color:var(--ink-faint); font-weight:700; display:flex; flex-direction:column; gap:4px;">접수 시작일
          <input type="date" id="planPeriodStart" value="${planPeriod?.period_start||''}" />
        </label>
        <label style="font-size:11px; color:var(--ink-faint); font-weight:700; display:flex; flex-direction:column; gap:4px;">접수 종료일
          <input type="date" id="planPeriodEnd" value="${planPeriod?.period_end||''}" />
        </label>
        <button class="btn small primary" onclick="savePlanPeriod()">저장</button>
        <button class="btn small" onclick="closePlanPeriodEditor()">취소</button>
      </div>
    `;
  }
  if(planPeriod && planPeriod.period_start && planPeriod.period_end){
    return `
      <div style="background:var(--teal-soft); color:var(--teal-deep); border-radius:6px; padding:10px 14px; font-size:12.5px; font-weight:700; margin-bottom:16px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
        <span>📅 지금은 <b>${planPeriod.period_start} ~ ${planPeriod.period_end}</b> 기간의 계획만 접수하고 있어요.</span>
        ${isAdmin ? `<button class="btn small" onclick="openPlanPeriodEditor()">기간 변경</button>` : ''}
      </div>
    `;
  }
  if(isAdmin){
    return `
      <div style="background:#FBEEDD; color:#8A4E14; border-radius:6px; padding:10px 14px; font-size:12.5px; font-weight:700; margin-bottom:16px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
        <span>⚠️ 아직 계획 접수 기간이 설정되지 않았어요.</span>
        <button class="btn small primary" onclick="openPlanPeriodEditor()">기간 설정</button>
      </div>
    `;
  }
  return '';
}

// 화면 아래에 떠 있는 '복사한 요청' 바: 붙여넣을 복사본을 고르는 칩 + [개체수 분배] · [모두 비우기]
function renderPlanClipBarHtml(st){
  if(!st || !planShowDemand || !planClip.length) return '';
  const act = activeClip();
  const fam = (st.families.get(act.family) || []).length;
  const chips = planClip.map(c=>{
    const sc = scaleNum(c.rows[0] && c.rows[0].expected_scale);
    return `<span class="pc-chip ${c.id===act.id ? 'on' : ''}"><button type="button" class="pc-pick" onclick="selectClip('${c.id}')" title="이 복사본을 붙여넣기 대상으로 골라요">${escapeHtml(c.label)}${sc!=null ? ` · ${sc.toLocaleString()}개체` : ''}</button><button type="button" class="pc-x" onclick="removeClip('${c.id}')" title="복사한 목록에서 빼요">×</button></span>`;
  }).join('');
  return `
      <div class="plan-clip-bar" role="status">
        <span>📋 복사한 요청 <b>${planClip.length}건</b> · 놓을 베드 · 층 줄 오른쪽의 <b>[붙여넣기]</b>를 누르세요
          <small>같은 복사본을 여러 번 붙여넣을 수 있어요${planClip.length > 1 ? ' · 붙여넣을 것을 아래에서 골라요' : ''}</small></span>
        <span class="pc-chips">${chips}</span>
        ${fam > 1 ? `<button type="button" class="btn small" onclick="openScaleSplit('${escapeHtml(act.family)}')">개체수 분배 (${fam}곳)</button>` : ''}
        <button type="button" class="btn small" onclick="clearClip()">모두 비우기</button>
      </div>`;
}

function renderPlanView(){
  const wrap = document.getElementById('planViewWrap');
  if(!wrap) return;
  // 관리자에게는 수요조사 요청이 계획에 들어갔는지까지 계산해서 함께 보여준다
  const st = isAdmin ? computeDemandState() : null;
  const prevList = wrap.querySelector('.pd-list');
  const prevListTop = prevList ? prevList.scrollTop : 0;   // 연달아 반영할 때 목록이 맨 위로 튀지 않게
  const legendHtml = (st && planShowDemand && st.counts.wait) ? `
      <div class="pd-legend">
        <span><i class="pd-swatch"></i>확정된 계획</span>
        <span><i class="pd-swatch ghost"></i>반영 대기 요청 (누르면 반영)</span>
        <span><i class="pd-swatch conflict"></i>기간 겹침</span>
      </div>
      <div class="pd-hint">💡 점선 막대를 <b>끌어서</b> 다른 베드 · 층(위아래)으로 옮겨 보세요. <b>날짜 고정</b>을 체크해 두면 받은 날짜 그대로 자리만 옮기고, 체크를 풀면 좌우로 끌어 날짜도 옮길 수 있어요. 놓기 전에 초록 = 겹침 없음, 빨강 = 겹침으로 미리 보여줘요. 놓으면 <b>임시로만</b> 옮겨지고, 아래 <b>[저장]</b>을 눌러야 확정돼요. 저장하지 않으면 새로고침할 때 원래대로 돌아가요.<br>📋 같은 조합을 여러 베드에 나눠 놓으려면 막대를 눌러 <b>[복사]</b>한 뒤, 놓을 베드 · 층 줄 오른쪽의 <b>[붙여넣기]</b>를 누르세요. 복사본은 원본과 따로 끌어 옮길 수 있고, <b>[개체수 분배]</b>에서 원본 + 복사본의 개체수를 나눠요.</div>` : '';
  // 일정표 위의 '날짜 고정' 체크: 요청을 끌어 옮길 때 날짜를 받은 그대로 둘지 (끌 수 있는 요청이 있을 때만 보인다)
  const lockHtml = (st && planShowDemand && st.counts.wait) ? `
        <label class="plan-lock ${planLockDates ? 'on' : ''}" title="체크하면 수요조사로 받은 날짜는 그대로 두고 자리(방 · 베드 · 층)만 옮겨요. 풀면 좌우로 끌어서 날짜도 옮길 수 있어요.">
          <input type="checkbox" id="planLockDates" ${planLockDates ? 'checked' : ''} onchange="togglePlanLockDates(this.checked)" />
          <span>날짜 고정</span>
        </label>` : '';
  // 일정표 위의 '사용중인 베드만' · '남은 베드만' 체크 (종합현황의 '진행중만'과 같은 작은 체크박스): 하나를 체크하면 다른 하나는 풀리고, 둘 다 풀면 전체. 누구에게나 보이고, 고른 상태는 브라우저에 기억
  const bedViewHtml = `
        <label style="display:flex; align-items:center; gap:6px; font-size:11px; font-weight:700; color:var(--ink-faint); cursor:pointer; white-space:nowrap;" title="체크하면 일정표 기간에 확정된 계획이 있는 베드 · 층만 보여줘요. 풀면 계획이 있는 베드와 비어 있는 베드를 모두 보여줘요.">
          사용중인 베드
          <input type="checkbox" id="planUsedBedsOnly" ${planBedView==='used' ? 'checked' : ''} onchange="setPlanBedView(this.checked ? 'used' : 'all')" />
        </label>
        <label style="display:flex; align-items:center; gap:6px; font-size:11px; font-weight:700; color:var(--ink-faint); cursor:pointer; white-space:nowrap;" title="체크하면 일정표 기간에 확정된 계획이 없는 베드 · 층만 보여줘요 (반영 대기 요청이 있는 자리는 계획이 있어도 함께 보여요). 풀면 계획이 있는 베드와 비어 있는 베드를 모두 보여줘요.">
          남은 베드
          <input type="checkbox" id="planFreeBedsOnly" ${planBedView==='free' ? 'checked' : ''} onchange="setPlanBedView(this.checked ? 'free' : 'all')" />
        </label>`;
  const draftBarHtml = (st && st.counts.drafted) ? `
      <div class="plan-draft-bar" role="status">
        <span>✎ <b>${st.counts.drafted}건</b>을 옮겨 보는 중이에요 · ${st.counts.conflict ? `<span class="pdb-warn">기간 겹침 ${st.counts.conflict}건 남음</span>` : '겹침 없음'}
          <small>저장하기 전에는 임시예요. 새로고침하면 원래 자리로 돌아가요.</small></span>
        <button type="button" class="btn small" onclick="cancelPlanDraft()">모두 취소</button>
        <button type="button" class="btn small primary" onclick="savePlanDraft()">저장</button>
      </div>` : '';
  // 복사해 둔 요청들: 붙여넣을 것을 고르고(칩), 각 베드 · 층 줄의 [붙여넣기]로 붙여넣는다
  const clipBarHtml = renderPlanClipBarHtml(st);
  const floatHtml = (draftBarHtml || clipBarHtml) ? `<div class="plan-float">${clipBarHtml}${draftBarHtml}</div>` : '';
  wrap.innerHTML = `
    ${st ? renderDemandInboxHtml(st) : ''}
    <div class="panel-box">
      <div class="panel-box-head">
        <div>
          <h3>분기별 일정${(planPeriod && planPeriod.period_start && planPeriod.period_end) ? ` (${planPeriod.period_start} ~ ${planPeriod.period_end})` : ' (6개월)'}</h3>
        </div>
        <div style="display:flex; gap:8px; flex-shrink:0; flex-wrap:wrap; justify-content:flex-end; align-items:center;">
          ${bedViewHtml}
          ${lockHtml}
          ${isAdmin ? `<button class="btn small danger-text" onclick="deleteAllPlans()">전체 삭제</button>` : ''}
          ${isAdmin ? `<button class="btn small primary" onclick="openPlanModal()">+ 계획 제출</button>` : ''}
        </div>
      </div>
      ${legendHtml}
      ${renderPlanTimeline(st)}
    </div>
    ${floatHtml}
  `;
  const newList = wrap.querySelector('.pd-list');
  if(newList) newList.scrollTop = prevListTop;
  updatePlanStickyTop();
}

// 고정된 월 눈금이 앱 맨 위 헤더 바로 아래에 붙도록 위치를 맞춘다.
// 화면 확대(zoom)가 겹쳐 있어 CSS 길이와 실제 화면 픽셀의 비율이 다르므로, 눈금 영역 안에 폭 100px짜리 자를 넣어 그 비율을 재고 헤더 높이를 환산한다.
function updatePlanStickyTop(){
  const list = document.querySelector('#planViewWrap .plan-bed-list');
  const header = document.querySelector('header');
  if(!list || !header) return;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute; visibility:hidden; width:100px; height:0; pointer-events:none;';
  list.appendChild(probe);
  const scale = probe.getBoundingClientRect().width / 100;   // 화면 픽셀 ÷ CSS px
  probe.remove();
  if(!(scale > 0)) return;   // 화면에 안 보이는 상태(숨김)면 다음 렌더 때 다시 맞춘다
  list.style.setProperty('--plan-sticky-top', (header.getBoundingClientRect().height / scale) + 'px');
}
