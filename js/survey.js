/* survey.js — [수요조사] 화면: 신청 양식, 방·베드 선택, 세대별 희망 기간, 응답 결과 */

function selectSurveyRoom(name){
  if(isMutedRoom(name)) return;   // 창고 · 조사실은 계통작성과 같이 눌러도 열리지 않는다
  if(!roomIsActive(roomByName(name)) && surveySelectedRoomName!==name){ showToast('관리자가 사용 중지한 방이라 수요조사에서 고를 수 없어요'); return; }
  surveySelectedRoomName = surveySelectedRoomName===name ? null : name;
  surveySelectedBeds = new Set();
  surveySelectedPurposes = new Set();
  surveySelectedCrops = new Set();
  surveySelectedGenerations = new Set();
  surveySelectedFactors = new Set();
  renderSurveyView();
}

function selectSurveyBed(bedNo, floor){
  const key = bedNo+'|'+floor;
  if(surveySelectedBeds.has(key)) surveySelectedBeds.delete(key);
  else surveySelectedBeds.add(key);
  renderSurveyView();
}

// 베드 두 층을 한꺼번에 고르거나 푼다 (베드 이름을 눌렀을 때). 계통작성과 같은 동작
function toggleSurveyBedFloors(bedNo){
  const room = surveyPseudoRoom();
  if(!room) return;
  const keys = workRoomInfo(room).floors.map(fl=> bedNo+'|'+fl);
  const allOn = keys.every(k=> surveySelectedBeds.has(k));
  keys.forEach(k=>{ if(allOn) surveySelectedBeds.delete(k); else surveySelectedBeds.add(k); });
  renderSurveyView();
}

// 지금 고른 방. DB에 아직 없는 방이라도 베드 맵을 그릴 수 있게 이름만 있는 방을 돌려준다 (심긴 계통 · 계획은 없음으로 나온다)
function surveyPseudoRoom(){
  if(!surveySelectedRoomName) return null;
  return rooms.find(r=> r.name===surveySelectedRoomName) || { id:null, name:surveySelectedRoomName };
}

// 가운데 베드 맵 패널의 안쪽: 계통작성과 같은 머리글 · 베드 맵 (심긴 계통 · 계획은 보여주지 않는다)
function renderSurveyBedPanelHtml(){
  const room = surveyPseudoRoom();
  if(!room) return `<div class="empty-materials" style="padding:60px 20px;">← 왼쪽 배치도에서 방을 선택해주세요</div>`;
  const info = workRoomInfo(room);
  const hint = !info.bedCount ? '이 방은 베드 구조가 없어요' : '자리를 눌러 여러 개 고르세요 · 베드 이름을 누르면 두 층이 함께 선택돼요';
  return `
    ${bedPanelHeadHtml(room, hint, '', { hideEnv: true, nameNote: '(복수선택가능)' })}
    ${info.bedCount ? surveyBedMapHtml(room, info) : ''}
  `;
}

function toggleSurveyDemandDetail(roomName){
  surveyDemandExpandedRoom = surveyDemandExpandedRoom===roomName ? null : roomName;
  renderSurveyView();
}

function surveyDateToDays(d){ return Math.floor(d.getTime()/86400000); }

function surveyRangesOverlap(ranges){
  const sorted = [...ranges].sort((a,b)=> a.start-b.start);
  for(let i=1;i<sorted.length;i++){
    if(sorted[i].start <= sorted[i-1].end) return true;
  }
  return false;
}

function roomHasBedOverlap(roomName){
  const items = demandSurveys.filter(s=> s.room_name===roomName && s.desired_start);
  const groups = {};
  items.forEach(s=>{
    const key = s.bed_no!=null ? `${s.bed_no}|||${s.floor||''}` : '__미지정__';
    if(!groups[key]) groups[key] = [];
    groups[key].push(s);
  });
  return Object.values(groups).some(g=>{
    if(g.length<2) return false;
    const ranges = g.map(s=>({
      start: new Date(s.desired_start+'T00:00:00'),
      end: s.desired_end ? new Date(s.desired_end+'T00:00:00') : new Date(s.desired_start+'T00:00:00')
    }));
    return surveyRangesOverlap(ranges);
  });
}

function renderSurveyRoomTimelineHtml(roomName){
  const items = demandSurveys.filter(s=> s.room_name===roomName && s.desired_start);
  if(!items.length){
    return `<div class="empty-materials" style="padding:14px 0;">이 방은 희망 기간이 입력된 응답이 없어요.</div>`;
  }

  let minStart = null, maxEnd = null;
  items.forEach(s=>{
    const st = new Date(s.desired_start+'T00:00:00');
    const en = s.desired_end ? new Date(s.desired_end+'T00:00:00') : st;
    if(!minStart || st<minStart) minStart = st;
    if(!maxEnd || en>maxEnd) maxEnd = en;
  });
  const rangeStart = new Date(minStart.getFullYear(), minStart.getMonth(), 1);
  const rangeEnd = new Date(maxEnd.getFullYear(), maxEnd.getMonth()+1, 1);
  const totalDays = Math.max(1, surveyDateToDays(rangeEnd) - surveyDateToDays(rangeStart));

  let monthTicks = '';
  let cursor = new Date(rangeStart);
  while(cursor < rangeEnd){
    const offsetDays = surveyDateToDays(cursor) - surveyDateToDays(rangeStart);
    const leftPct = (offsetDays/totalDays*100).toFixed(2);
    monthTicks += `<div style="position:absolute; left:${leftPct}%; top:0; bottom:0; border-left:1px dashed var(--line); font-size:10px; font-weight:700; color:var(--ink-faint); padding-left:4px;">${cursor.getMonth()+1}월</div>`;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth()+1, 1);
  }

  const CROP_RESPONDENT_SHADES = [1, 0.72, 1.3, 0.58, 1.5, 0.85];
  const cropRespondents = {};
  items.forEach(s=>{
    const crop = (s.crops&&s.crops[0]) || '';
    const resp = s.respondent_name || '익명';
    if(!cropRespondents[crop]) cropRespondents[crop] = [];
    if(!cropRespondents[crop].includes(resp)) cropRespondents[crop].push(resp);
  });
  const shadeFor = (crop, resp)=>{
    const list = cropRespondents[crop] || [];
    const i = list.indexOf(resp);
    return CROP_RESPONDENT_SHADES[i % CROP_RESPONDENT_SHADES.length];
  };

  const groups = {};
  items.forEach(s=>{
    const key = s.bed_no!=null ? `${s.bed_no}|||${s.floor||''}` : '__미지정__';
    if(!groups[key]) groups[key] = { bedNo: s.bed_no, floor: s.floor, items: [] };
    groups[key].items.push(s);
  });
  const groupList = Object.values(groups).map(g=>{
    const ranges = g.items.map(s=>({
      start: new Date(s.desired_start+'T00:00:00'),
      end: s.desired_end ? new Date(s.desired_end+'T00:00:00') : new Date(s.desired_start+'T00:00:00')
    }));
    g.hasOverlap = g.items.length>1 && surveyRangesOverlap(ranges);
    return g;
  }).sort((a,b)=>{
    if(a.hasOverlap !== b.hasOverlap) return a.hasOverlap ? -1 : 1;
    if(b.items.length !== a.items.length) return b.items.length - a.items.length;
    return (a.bedNo||0)-(b.bedNo||0) || (a.floor||'').localeCompare(b.floor||'');
  });

  const groupsHtml = groupList.map(g=>{
    const bedLabel = isAisleSpot(g.bedNo) ? '통로' : g.bedNo!=null ? `베드${g.bedNo}${g.floor?`·${escapeHtml(g.floor)}`:''}` : '베드 미지정';
    const sortedItems = [...g.items].sort((a,b)=> a.desired_start.localeCompare(b.desired_start));
    const barsHtml = sortedItems.map(s=>{
      const cropLabel = (s.crops||[]).join(', ') || '작물 미정';
      const crop0 = (s.crops&&s.crops[0])||'';
      const color = cropColor(crop0);
      const brightness = shadeFor(crop0, s.respondent_name || '익명');
      const st = new Date(s.desired_start+'T00:00:00');
      const en = s.desired_end ? new Date(s.desired_end+'T00:00:00') : st;
      const left = surveyDateToDays(st) - surveyDateToDays(rangeStart);
      const width = Math.max(1, surveyDateToDays(en) - surveyDateToDays(st));
      const leftPct = (left/totalDays*100).toFixed(2);
      const widthPct = Math.max(1.2, (width/totalDays*100)).toFixed(2);
      const tooltip = [s.generation, cropLabel, `${s.desired_start} ~ ${s.desired_end||'?'}`, s.line_no?`${lineNoLabel((s.purposes||[])[0])}: ${s.line_no}`:'', s.cross_combo?`교배조합: ${crossComboLabel(s)}`:'', s.breeding_purpose?`${purposeFieldLabel((s.purposes||[])[0])}: ${s.breeding_purpose}`:'', s.respondent_name?`담당: ${s.respondent_name}`:''].filter(Boolean).join(' · ');
      const genLabel = s.generation ? `${s.generation} · ` : '';
      return `<div title="${escapeHtml(tooltip)}" style="position:absolute; left:${leftPct}%; width:${widthPct}%; top:0; bottom:0; background:${color}; filter:brightness(${brightness}); border-radius:999px; display:flex; align-items:center; padding:0 8px; overflow:hidden; white-space:nowrap; font-size:9px; font-weight:700; color:#fff;">${genLabel}${escapeHtml(cropLabel)} · ${escapeHtml(s.respondent_name||'익명')}</div>`;
    }).join('');
    return `
      <div style="margin-bottom:8px; ${g.hasOverlap ? 'background:#FBEBE9; border-radius:9px; padding:9px 9px 6px;' : ''}">
        <div style="font-size:11.5px; font-weight:800; color:${g.hasOverlap?'var(--danger)':'var(--ink)'}; margin-bottom:5px; display:flex; align-items:center; gap:5px;">
          ${g.hasOverlap?'⚠️ ':''}${escapeHtml(bedLabel)} <span style="font-weight:600; color:${g.hasOverlap?'var(--danger)':'var(--ink-faint)'};">· 요청 ${g.items.length}건${g.hasOverlap?' 겹침':''}</span>
        </div>
        <div style="position:relative; height:16px;">${barsHtml}</div>
      </div>
    `;
  }).join('');

  return `
    <div style="margin-top:10px; padding-top:12px; border-top:1.6px dashed var(--line-soft);">
      <div style="position:relative; height:20px; border-bottom:1.6px solid var(--line); margin-bottom:10px;">${monthTicks}</div>
      ${groupsHtml}
    </div>
  `;
}

function renderSurveyFacilityHtml(){
  // 수요조사는 계통작성에 등록된 계통 · 계획을 보여주지 않는다 (방 카드에 사용 현황 글도 달지 않는다)
  return `
    <div class="survey-facility-hint">방을 누르면 안쪽 베드가 나와요</div>
    ${miniFacilityHtml(surveySelectedRoomName, 'selectSurveyRoom')}
  `;
}

// 시설 공간 배치도(작은 방 카드들). 수요조사와 계통작성이 함께 쓴다.
// pickFn: 방을 눌렀을 때 부를 함수 이름, tipFn: 방 카드에 마우스를 올렸을 때 보이는 짧은 글(선택). 카드 크기는 두 화면이 같게 글을 카드 안에 덧붙이지 않는다
function miniFacilityHtml(selectedName, pickFn, tipFn){
  const miniCard = (name)=>{
    const label = roomLabel(name);
    const selected = selectedName === name;
    const muted = isMutedRoom(name);
    // 관리자가 정한 방 상태: 사용 중지면 회색, 수리중 · 점검중 · 사용 중지는 카드 모서리에 작은 뱃지 (카드 크기는 그대로)
    const room = roomByName(name);
    const inactive = !roomIsActive(room);
    const badges = roomStateBadgesHtml(room, true);
    const stateTip = room && (inactive || roomStatusOf(room) !== '정상' || room.status_note)
      ? [inactive ? '사용 중지' : '', roomStatusOf(room) !== '정상' ? roomStatusOf(room) : '', room.status_note || ''].filter(Boolean).join(' · ') : '';
    const tip = [tipFn ? tipFn(name) : '', stateTip].filter(Boolean).join(' · ');
    return `<div class="survey-mini-room ${selected?'selected':''} ${muted?'muted':''} ${inactive?'inactive':''}" ${tip ? ` title="${escapeHtml(tip)}"` : ''} onclick="${pickFn}('${name.replace(/'/g,"")}')">${escapeHtml(label)}${badges ? `<span class="mini-state">${badges}</span>` : ''}</div>`;
  };
  const row1Html = ROW1.map(miniCard).join('') + miniCard(ROW1_INFO);
  const row2Html = ROW2.map(miniCard).join('');
  return `
    <div class="survey-facility-vertical">
      <div class="survey-facility-col">${row2Html}</div>
      <div class="survey-corridor">통로</div>
      <div class="survey-facility-col">${row1Html}</div>
    </div>
  `;
}

function surveyIsHeatTest(){ return surveySelectedPurposes.has('고온검정'); }

// 기타 = 온도·일장 등 다양한 실험. 교배조합·교배목적·세대별 기간 대신 처리 요인·구간별 조건과 희망 사용기간을 받는다
function surveyIsEtc(){ return surveySelectedPurposes.has('기타'); }

// 온도·일장 조건을 받는 목적:
//  · 'pick': 기타 — 처리 요인(온도·일장)을 골라서 고른 것만, 처리 구간 카드로 받는다 (중간에 조건이 바뀔 수 있다)
//  · 'all' : 세대단축·인공교배 — 기간 내내 조건이 같아서, 구간 없이 온도·일장 칸 하나씩만 받는다
//  · ''    : 그 밖(고온검정 등)은 받지 않는다
function surveyExpMode(){
  if(surveyIsEtc()) return 'pick';
  return (surveySelectedPurposes.has('세대단축') || surveySelectedPurposes.has('인공교배')) ? 'all' : '';
}

function surveyExpFactorOn(f){ return surveyExpMode() === 'pick' && surveySelectedFactors.has(f); }

// 칸에 적힌 조건을 '온도 25℃' 꼴로 (비었거나 단위만 남아 있으면 '')
function surveyExpValue(input, f){
  const v = input.value.trim();
  return v && v !== SURVEY_EXP_FACTORS[f].unit ? `${f} ${v}` : '';
}

// 지금 고른 목적에 맞게 온도·일장 영역을 보이고 숨긴다 (영역 전체 · 단순 칸 · 요인 칩 · 처리 구간 · 구간마다의 조건 칸)
function surveyExpApply(){
  const mode = surveyExpMode();
  const show = (id, on, display = '')=>{ const el = document.getElementById(id); if(el) el.style.display = on ? display : 'none'; };
  show('surveyEtcWrap', mode, 'flex');
  show('surveyExpSimple', mode === 'all', 'flex');
  show('surveyExpFactorRow', mode === 'pick');
  show('surveyExpPhaseBox', mode === 'pick');
  show('surveyExpHint', mode === 'pick' && !surveySelectedFactors.size);
  document.querySelectorAll('#surveyExpPhases .sexp-cond').forEach(l=>{ l.style.display = surveyExpFactorOn(l.dataset.f) ? 'flex' : 'none'; });
}

// 계통번호 칸이 한 줄을 다 쓰는 목적 (옆에 교배조합 칸이 없는 고온검정·기타)
function surveyLineWide(){ return surveyIsHeatTest() || surveyIsEtc(); }

// 기타(실험) 응답에 적힌 처리 요인·조건을 한 줄로 (목록·계획 반영 화면용)
const SURVEY_EXP_LABELS = { exp_factors:'처리 요인', exp_condition:'처리 조건' };

function surveyExpText(s){
  return Object.entries(SURVEY_EXP_LABELS).filter(([k])=> s[k]).map(([k, label])=> `${label}: ${s[k]}`).join(' · ');
}

// 계통번호 칸은 사용 목적에 따라 달라진다 (값은 모두 같은 line_no 칸에 저장된다)
//  · 인공교배: 계통번호를 받지 않는다 (칸을 숨기고, 적혀 있어도 저장하지 않는다)
//  · 고온검정·기타(실험): '계통/품종'으로 받는다 (예: YPL277, 대원)
//  · 그 밖: 계통번호 (예: YPL277)
// 저장된 응답·계획에서는 기타 목적이 '기타'가 아니라 직접 적은 실험 내용으로 들어 있어서, 세 가지 목적이 아닌 글도 기타로 본다
function lineNoHidden(purpose){ return purpose === '인공교배'; }

function lineNoIsVariety(purpose){ return purpose === '고온검정' || purpose === '기타' || (!!purpose && !SURVEY_PURPOSE_OPTIONS.includes(purpose)); }

function lineNoLabel(purpose){ return lineNoIsVariety(purpose) ? '계통/품종' : '계통번호'; }

function lineNoPlaceholder(purpose){ return purpose === '고온검정' ? '예: 대원콩, 선풍 (반복 횟수는 적지 않아요)' : lineNoIsVariety(purpose) ? '예: YPL277, 대원' : '예: YPL277'; }

// 교배목적 칸은 사용 목적이 고온검정이면 '검정 목적'이다 (수요조사 breeding_purpose · 분기별 계획 purpose · 계통작성 검정 목적이 같은 값으로 이어진다)
function purposeFieldLabel(purpose){ return purpose === '고온검정' ? '검정 목적' : '교배목적'; }

// 수요조사 폼의 계통번호 칸을 지금 고른 사용 목적에 맞춘다
function surveyApplyLineNoField(){
  const wrap = document.getElementById('surveyLineWrap');
  if(!wrap) return;
  const p = [...surveySelectedPurposes][0] || '';
  wrap.style.display = lineNoHidden(p) ? 'none' : 'flex';
  wrap.style.width = surveyLineWide() ? '100%' : '50%';
  document.getElementById('surveyLineLabel').textContent = `${lineNoLabel(p)} (선택)`;
  document.getElementById('surveyLineNo').placeholder = lineNoPlaceholder(p);
}

// 세대별 희망 기간을 받지 않는 목적 (고온검정, 인공교배, 기타)
function surveyHidesGenPeriod(){ return surveySelectedPurposes.has('고온검정') || surveySelectedPurposes.has('인공교배') || surveyIsEtc(); }

// 칩 하나만 선택되게 한다: 다른 칩을 누르면 기존 선택이 바뀌고, 선택된 칩을 다시 누르면 해제된다
function surveyPickSingle(set, val, el){
  const wasSelected = set.has(val);
  set.clear();
  el.parentElement.querySelectorAll('.task-bed-chip').forEach(c=> c.classList.remove('active'));
  if(!wasSelected){ set.add(val); el.classList.add('active'); }
}

function toggleSurveyPurpose(val, el){
  surveyPickSingle(surveySelectedPurposes, val, el);
  const otherWrap = document.getElementById('surveyPurposeOtherWrap');
  if(otherWrap) otherWrap.style.display = surveySelectedPurposes.has('기타') ? '' : 'none';
  const heatPurposeWrap = document.getElementById('surveyHeatPurpose');   // 고온검정의 '검정 목적' 글쓰기 칸
  if(heatPurposeWrap) heatPurposeWrap.style.display = surveySelectedPurposes.has('고온검정') ? '' : 'none';
  const heat = surveyIsHeatTest();
  const crossWrap = document.getElementById('surveyCrossWrap');
  if(crossWrap) crossWrap.style.display = (heat || surveyIsEtc()) ? 'none' : 'flex';
  const crossExtraWrap = document.getElementById('surveyCrossExtraWrap');   // '외 N조합'은 인공교배일 때만
  if(crossExtraWrap) crossExtraWrap.style.display = surveySelectedPurposes.has('인공교배') ? '' : 'none';
  const repNote = document.getElementById('surveyPurposeRepNote');   // 교배목적 '(대표1개 작성)'도 인공교배일 때만
  if(repNote) repNote.style.display = surveySelectedPurposes.has('인공교배') ? '' : 'none';
  surveyExpApply();
  const genWrap = document.getElementById('surveyGenWrap');
  if(genWrap) genWrap.style.display = surveyHidesGenPeriod() ? 'none' : '';
  const useWrap = document.getElementById('surveyUsePeriodWrap');
  if(useWrap) useWrap.style.display = surveyHidesGenPeriod() ? '' : 'none';
  const heatWrap = document.getElementById('surveyHeatWrap');
  if(heatWrap) heatWrap.style.display = heat ? 'flex' : 'none';
  surveyApplyLineNoField();
}

// 기타(실험)의 처리 구간 카드 한 장: [적용 시기] + 고른 요인(온도·일장)의 조건 칸. 구간은 [+ 구간 추가]로 늘린다.
function surveyExpPhaseHtml(){
  const conds = Object.entries(SURVEY_EXP_FACTORS).map(([f, { unit, ph }])=>`
        <label class="sexp-cond" data-f="${f}" style="display:${surveyExpFactorOn(f)?'flex':'none'};">
          ${f} 조건
          <input class="sexp-val" data-f="${f}" placeholder="${ph}" onfocus="unitFocus(this,'${unit}')" oninput="unitInput(this,'${unit}')" onblur="unitBlur(this,'${unit}')" />
        </label>`).join('');
  return `
    <div class="sgen-card sexp-card">
      <div class="sgen-head"><span class="sexp-title">구간 1</span><button type="button" class="sexp-del" title="이 구간 삭제" style="display:none;" onclick="removeSurveyExpPhase(this)">✕</button></div>
      <label>적용 시기
        <input class="sexp-when" placeholder="예: 발아 후 ~14일, 개화기(R1) 이후" />
      </label>
      <div class="sexp-conds">${conds}
      </div>
    </div>`;
}

// 구간 번호를 다시 매기고, 구간이 둘 이상일 때만 삭제(✕) 버튼을 보인다
function surveyExpRenumber(){
  const cards = document.querySelectorAll('#surveyExpPhases .sexp-card');
  cards.forEach((c, i)=>{
    c.querySelector('.sexp-title').textContent = `구간 ${i+1}`;
    c.querySelector('.sexp-del').style.display = cards.length > 1 ? '' : 'none';
  });
}

function addSurveyExpPhase(){
  const list = document.getElementById('surveyExpPhases');
  if(!list) return;
  list.insertAdjacentHTML('beforeend', surveyExpPhaseHtml());
  surveyExpRenumber();
  list.lastElementChild.querySelector('.sexp-when').focus();
}

function removeSurveyExpPhase(btn){
  btn.closest('.sexp-card').remove();
  surveyExpRenumber();
}

function toggleSurveyFactor(val, el){
  if(surveySelectedFactors.has(val)){ surveySelectedFactors.delete(val); el.classList.remove('active'); }
  else{ surveySelectedFactors.add(val); el.classList.add('active'); }
  surveyExpApply();   // 고른 요인의 조건 칸만 모든 구간에서 보인다
  const first = surveySelectedFactors.has(val) && document.querySelector(`#surveyExpPhases .sexp-cond[data-f="${val}"] input`);
  if(first) first.focus();
}

function toggleSurveyCrop(val, el){
  surveyPickSingle(surveySelectedCrops, val, el);
  surveyApplyDefaultDays();   // 작물이 바뀌면 생육일수 기본값도 그 작물 것으로 바뀐다
}

function toggleSurveyGeneration(val, el){
  if(surveySelectedGenerations.has(val)){ surveySelectedGenerations.delete(val); el.classList.remove('active'); }
  else{ surveySelectedGenerations.add(val); el.classList.add('active'); }
  const row = document.getElementById(`surveyGenRow-${val}`);
  if(row) row.style.display = surveySelectedGenerations.has(val) ? 'block' : 'none';
  surveyGenSync();
}

// ── 세대별 희망 기간: 생육일수는 한 번만 쓰고, 세대마다 시작일만 고르면 종료일이 자동으로 채워진다 ───────────
// 생육일수 칸은 하나다 (세대 간격은 모든 세대가 같다고 본다). 세대마다 [시작일] ~ [종료일]은 달력으로 고른다.
//  · 시작일을 고르면 시작일 + 생육일수로 그 세대의 종료일이 자동으로 채워진다 (계통작성의 수확예정일과 같은 계산)
//  · 생육일수는 고른 작물의 기본 생육일수(SURVEY_DEFAULT_DAYS, 없으면 crop_profiles — 계통작성에서 쓰던 값)가 미리 들어가고, 사용자가 고칠 수 있다
//  · 생육일수를 고치면 시작일이 있는 세대의 종료일이 모두 다시 계산된다 (달력에서 종료일을 직접 고른 세대는 그대로 둔다)
//  · 다음 세대 시작일은 앞 세대 종료일 다음 날부터 고를 수 있다 (선택한 세대만 F1 → F2 → … 순서로 본다)
function surveyGenEl(kind, g){ return document.getElementById(`surveyGen${kind}-${g}`); }   // kind: Start · End · Note

function surveyDaysEl(){ return document.getElementById('surveyGenDays'); }                      // 모든 세대 공통 생육일수

// 지금 쓰여 있는 생육일수 (비었거나 숫자가 아니면 null)
function surveyGrowDays(){
  const el = surveyDaysEl();
  const n = el && el.value !== '' ? Math.floor(Number(el.value)) : NaN;
  return n >= 0 ? n : null;
}

// 선택한 작물의 기본 생육일수 (없으면 null)
function surveyDefaultDays(){
  const crop = [...surveySelectedCrops][0];
  const n = crop ? Number(SURVEY_DEFAULT_DAYS[crop] ?? cropProfiles[crop]) : NaN;
  return n > 0 ? Math.floor(n) : null;
}

// 시작일이 있는 세대의 종료일을 시작일 + 생육일수로 다시 계산한다. keepManual이면 종료일을 달력에서 직접 고른 세대는 건드리지 않는다.
function surveyRecalcEnds(keepManual){
  const n = surveyGrowDays();
  if(n === null) return;
  SURVEY_GEN_STAGES.forEach(g=>{
    const s = surveyGenEl('Start', g), e = surveyGenEl('End', g);
    if(!s || !e || !s.value || (keepManual && e.dataset.manual === '1')) return;
    e.value = addDays(s.value, n);
    e.dataset.manual = '';
  });
}

// 생육일수 칸을 작물의 기본값으로 채운다. 사용자가 직접 쓴 값은 그대로 둔다.
function surveyApplyDefaultDays(){
  const d = surveyDaysEl();
  if(!d) return;
  const def = surveyDefaultDays();
  if(d.value === '' || d.dataset.auto === '1'){
    d.value = def==null ? '' : String(def);
    d.dataset.auto = def==null ? '' : '1';
    surveyRecalcEnds(true);
  }
  const hint = document.getElementById('surveyGenDefaultHint');
  if(hint){
    const crop = [...surveySelectedCrops][0];
    hint.textContent = !crop ? '' : def!=null ? '다르면 수정해주세요.'
      : '이 작물은 기본 생육일수가 없어요. 생육일수를 직접 쓰거나 종료일을 달력에서 골라주세요.';
  }
  surveyGenSync();
}

// 사용자가 생육일수를 직접 고쳤을 때
function surveyDaysChanged(){
  const d = surveyDaysEl();
  if(d) d.dataset.auto = '';   // 직접 쓴 값은 작물이 바뀌어도 덮어쓰지 않는다
  surveyRecalcEnds(true);
  surveyGenSync();
}

// 날짜 칸에 키보드로 직접 쓰는 경우: 브라우저는 연도를 '2' → '20' → '202' → '2026'으로 치는 도중에도, 날짜를 '7월 3' → '7월 30'으로 치는 도중에도
// 그때그때 완성된 날짜로 보고 change를 낸다. 그걸 바로 검사하면 아직 다 쓰지도 않았는데 '비웠어요' 안내가 뜨고 칸이 지워진다.
// 그래서 키보드로 쓰는 중의 change는 모아 두었다가, 칸을 벗어나거나(Tab · 다른 곳 클릭 · 제출하기) Enter를 누르면 그때 한 번만 처리한다.
// 달력에서 고른 날짜는 예전처럼 바로 처리한다 (달력을 누르면 직접 쓰던 상태가 끝난 것으로 본다).
const SURVEY_DATE_EVENTS = `onkeydown="surveyDateKey(event)" onmousedown="this.dataset.typing=''" onchange="surveyDateChange(this)" onblur="surveyDateFlush(this)"`;

function surveyDateKey(ev){
  const el = ev.target;
  if(ev.key === 'Enter'){ surveyDateFlush(el); return; }
  if(/^\d$/.test(ev.key) || ['Backspace', 'Delete', 'ArrowUp', 'ArrowDown'].includes(ev.key)) el.dataset.typing = '1';
}

function surveyDateChange(el){
  if(el.dataset.typing === '1'){ el.dataset.pending = '1'; return; }   // 쓰는 중: 칸을 벗어날 때 처리
  surveyGenFlow(el.dataset.g, el.dataset.field);
}

function surveyDateFlush(el){
  el.dataset.typing = '';
  if(el.dataset.pending !== '1') return;
  el.dataset.pending = '';
  surveyGenFlow(el.dataset.g, el.dataset.field);
}

// 아직 처리하지 못한(쓰는 중인) 날짜 칸이 있으면 모두 처리한다. 제출 직전에 부른다.
function surveyDateFlushAll(){
  SURVEY_GEN_STAGES.forEach(g=> ['Start', 'End'].forEach(k=>{ const el = surveyGenEl(k, g); if(el) surveyDateFlush(el); }));
}

// 세대의 시작일 또는 종료일(field: 'start' | 'end')을 고쳤을 때 (달력에서 골랐거나, 직접 쓰고 칸을 벗어났을 때)
function surveyGenFlow(g, field){
  const s = surveyGenEl('Start', g), e = surveyGenEl('End', g);
  if(!s || !e) return;
  const notes = [];
  if(field==='start'){
    e.dataset.manual = '';
    const n = surveyGrowDays();
    if(s.value && n !== null) e.value = addDays(s.value, n);
  } else {
    e.dataset.manual = e.value ? '1' : '';   // 직접 고른 종료일: 생육일수를 바꿔도 그대로 둔다
    if(s.value && e.value && daysBetween(s.value, e.value) < 0){
      e.value = ''; e.dataset.manual = '';
      notes.push(`${g} 종료일이 시작일보다 빠를 수 없어서 비웠어요`);
    }
  }
  surveyGenSync(notes);
}

// 달력의 선택 범위를 맞춘다: 앞 세대 종료일 다음 날부터 (종료일이 없으면 시작일 기준). 범위를 벗어난 값은 비우고 알려 준다.
// 종료일이 접수 기간의 마지막 날을 넘으면(시작일 + 생육일수가 넘는 경우 포함) 마지막 날로 맞춘다. (예: 접수 기간이 6/30까지인데 7/10이 되면 6/30)
function surveyGenSync(notes = []){
  const planStart = (planPeriod && planPeriod.period_start) || '', planEnd = (planPeriod && planPeriod.period_end) || '';
  const setMin = (el, v)=>{ if(v) el.min = v; else el.removeAttribute('min'); };
  let prevEnd = '';
  const cleared = [], clamped = [];
  SURVEY_GEN_STAGES.filter(g=> surveySelectedGenerations.has(g)).forEach(g=>{
    const s = surveyGenEl('Start', g), e = surveyGenEl('End', g), note = surveyGenEl('Note', g);
    if(!s || !e) return;
    const afterPrev = prevEnd ? addDays(prevEnd, 1) : '';
    const minStart = afterPrev > planStart ? afterPrev : planStart;   // 날짜 문자열(YYYY-MM-DD)은 그대로 크기 비교가 된다
    setMin(s, minStart);
    if(s.value && s.value < minStart){ s.value = ''; e.value = ''; cleared.push(g); }
    else if(e.value && e.value < minStart){ e.value = ''; cleared.push(g); }
    // 시작일이 접수 기간 안일 때만 맞춘다 (시작일부터 벗어났으면 아래 안내가 뜨고, 종료일이 시작일보다 앞서 버리지 않게)
    if(planEnd && e.value > planEnd && (!s.value || s.value <= planEnd)){ e.value = planEnd; clamped.push(g); }
    setMin(e, s.value > minStart ? s.value : minStart);
    if(note){
      const out = planStart && planEnd && ((s.value && s.value < planStart) || ((e.value || s.value) > planEnd));
      note.textContent = out ? `접수 기간(${planStart} ~ ${planEnd})을 벗어났어요. 시작일이나 생육일수를 조정해주세요.` : '';
    }
    const myEnd = e.value || s.value;
    if(myEnd) prevEnd = myEnd;
  });
  if(cleared.length) notes.push(`${cleared.join(', ')} 기간이 앞 세대 종료일 이전이라 비웠어요`);
  if(clamped.length) notes.push(`${clamped.join(', ')} 종료일이 접수 기간 마지막 날(${planEnd})로 맞춰졌어요`);
  if(notes.length) showToast(notes.join(' · '));
}

// ── 고온검정 '처리 온도' 입력: ℃를 자동으로 붙인다 ───────────────────────────
// 칸을 누르면 '℃'가 미리 들어가 있고(커서는 ℃ 앞), 숫자만 치면 '45℃'가 된다. 아무것도 안 쓰고 나가면 다시 비워진다.
// (예전에 저장된 값이나 '40~45' 같은 범위도 그대로 두고, 저장할 때 숫자만 있으면 ℃를 붙인다)
// 단위는 ℃ 말고도 쓸 수 있다 (기타 실험의 일장은 '시간'). 단위별 동작은 같고 단위 글자만 다르다.
function unitFocus(el, unit){
  if(el.value) return;
  el.value = unit;
  setTimeout(()=>{ if(document.activeElement===el && el.value===unit) el.setSelectionRange(0, 0); }, 0);   // 클릭으로 들어올 때 브라우저가 커서를 옮기므로 한 박자 뒤에 맞춘다
}

// 입력할 때마다 단위가 한 번만, 맨 뒤에 오도록 정리한다. 돌려주는 값은 실제 입력 내용(단위만 있으면 '')
function unitInput(el, unit){
  const pos = el.selectionStart ?? 0;
  const body = el.value.split(unit).join('');
  el.value = body + unit;
  el.setSelectionRange(Math.min(pos, body.length), Math.min(pos, body.length));
  return body ? el.value : '';
}

function unitBlur(el, unit){ if(el.value===unit) el.value = ''; }

function tempFocus(el){ unitFocus(el, '℃'); }

function tempInput(el){ return unitInput(el, '℃'); }

function tempBlur(el){ unitBlur(el, '℃'); }

// 저장하기 전에: 비었거나 '℃'뿐이면 빈 값, 숫자(범위)만 적었으면 ℃를 붙인다
function normalizeTemp(v){
  const t = String(v || '').trim();
  if(!t || t==='℃') return '';
  return /^[\d.\s~\-–,]+$/.test(t) ? t + '℃' : t;
}

const TEMP_INPUT_ATTRS = `onfocus="tempFocus(this)" oninput="tempInput(this)" onblur="tempBlur(this)"`;

function renderSurveyView(){
  const wrap = document.getElementById('surveyViewWrap');
  if(!wrap) return;

  const dateFieldStyle = 'padding:10px 12px; border:1.2px solid var(--line); border-radius:9px; font-size:13.5px; font-family:inherit;';

  const sortedSelectedBeds = [...surveySelectedBeds].map(k=>{
    const [bedNo, floor] = k.split('|');
    return { bedNo: parseInt(bedNo), floor };
  }).sort((a,b)=> bedOrder(a.bedNo) - bedOrder(b.bedNo) || a.floor.localeCompare(b.floor));

  const formInnerHtml = !surveySelectedRoomName ? `
    <div class="empty-materials" style="padding:60px 20px;">방을 선택하면 여기서<br>수요조사를 작성할 수 있어요</div>
  ` : !surveySelectedBeds.size ? `
    <div class="empty-materials" style="padding:60px 20px;">베드와 층을 선택해주세요 (여러 개 선택 가능)</div>
  ` : `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <input id="surveyName" placeholder="담당자(이름) *" style="width:50%; box-sizing:border-box; ${dateFieldStyle}" />

      <div>
        <div style="font-size:11px; font-weight:700; color:var(--ink-faint); margin-bottom:6px;">사용 목적 <span style="color:var(--danger);">*</span></div>
        <div class="task-bed-chips">
          ${SURVEY_PURPOSE_OPTIONS.map(p=>`<button type="button" class="task-bed-chip ${surveySelectedPurposes.has(p)?'active':''}" onclick="toggleSurveyPurpose('${p}', this)">${p}</button>`).join('')}
        </div>
        <input id="surveyPurposeOtherWrap" placeholder="실험 내용을 적어주세요 (예: 일장 반응 실험)" style="display:${surveySelectedPurposes.has('기타')?'':'none'}; margin-top:8px; width:100%; box-sizing:border-box; ${dateFieldStyle}" />
        <input id="surveyHeatPurpose" placeholder="검정 목적을 적어주세요 (예: 고온검정 조건 확립)" style="display:${surveySelectedPurposes.has('고온검정')?'':'none'}; margin-top:8px; width:100%; box-sizing:border-box; ${dateFieldStyle}" />
      </div>

      <div>
        <div style="font-size:11px; font-weight:700; color:var(--ink-faint); margin-bottom:6px;">작물 <span style="color:var(--danger);">*</span></div>
        <div class="task-bed-chips">
          ${SURVEY_CROP_OPTIONS.map(c=>`<button type="button" class="task-bed-chip ${surveySelectedCrops.has(c)?'active':''}" onclick="toggleSurveyCrop('${c}', this)">${c}</button>`).join('')}
        </div>      </div>

      <label id="surveyLineWrap" style="font-size:11px; color:var(--ink-faint); font-weight:700; display:${lineNoHidden([...surveySelectedPurposes][0])?'none':'flex'}; flex-direction:column; gap:4px; width:${surveyLineWide()?'100%':'50%'};">
        <span id="surveyLineLabel">${lineNoLabel([...surveySelectedPurposes][0])} (선택)</span>
        <input id="surveyLineNo" placeholder="${lineNoPlaceholder([...surveySelectedPurposes][0])}" style="${dateFieldStyle}" />
      </label>

      <div id="surveyCrossWrap" style="display:${(surveyIsHeatTest()||surveyIsEtc())?'none':'flex'}; gap:10px;">
        <label style="flex:1; min-width:0; font-size:11px; color:var(--ink-faint); font-weight:700; display:flex; flex-direction:column; gap:4px;">
          <span>교배조합 <span style="color:var(--danger);">*</span></span>
          <span class="cross-combo-row">
            <input id="surveyCrossCombo" placeholder="예: 선풍/남천" style="${dateFieldStyle}" />
            <span class="cross-extra" id="surveyCrossExtraWrap" style="display:${surveySelectedPurposes.has('인공교배') ? '' : 'none'};" title="대표 교배조합 말고 더 있는 조합 수 (없으면 비워 두세요)">외 <input id="surveyCrossExtra" type="number" min="0" step="1" inputmode="numeric" style="${dateFieldStyle}" /> 조합</span>
          </span>
        </label>
        <label style="flex:1; min-width:0; font-size:11px; color:var(--ink-faint); font-weight:700; display:flex; flex-direction:column; gap:4px;">
          <span>교배목적<span id="surveyPurposeRepNote" style="display:${surveySelectedPurposes.has('인공교배') ? '' : 'none'};">(대표1개 작성)</span> <span style="color:var(--danger);">*</span></span>
          <input id="surveyBreedingPurpose" placeholder="예: 내병성" style="${dateFieldStyle}" />
        </label>
      </div>

      <div id="surveyHeatWrap" style="display:${surveyIsHeatTest()?'flex':'none'}; flex-direction:column; gap:10px;">
        <div style="display:flex; gap:10px;">
          <label style="flex:1; min-width:0; font-size:11px; color:var(--ink-faint); font-weight:700; display:flex; flex-direction:column; gap:4px;">
            처리 온도
            <input id="surveyHeatTemp" placeholder="예: 45℃" ${TEMP_INPUT_ATTRS} style="${dateFieldStyle}" />
          </label>
          <label style="flex:1.6; min-width:0; font-size:11px; color:var(--ink-faint); font-weight:700; display:flex; flex-direction:column; gap:4px;">
            처리 단계
            <input id="surveyHeatStage" placeholder="예: V1~V6, 개화기(R1~R2), 성숙기(R7)" style="${dateFieldStyle}" />
          </label>
        </div>
        <label style="width:50%; font-size:11px; color:var(--ink-faint); font-weight:700; display:flex; flex-direction:column; gap:4px;">
          일장
          <input id="surveyHeatDaylen" placeholder="${SURVEY_EXP_FACTORS['일장'].ph}" onfocus="unitFocus(this,'시간')" oninput="unitInput(this,'시간')" onblur="unitBlur(this,'시간')" style="${dateFieldStyle}" />
        </label>
      </div>

      <div id="surveyEtcWrap" style="display:${surveyExpMode()?'flex':'none'}; flex-direction:column; gap:12px;">
        <div id="surveyExpSimple" style="display:${surveyExpMode()==='all'?'flex':'none'}; gap:10px;">
          ${Object.entries(SURVEY_EXP_FACTORS).map(([f, { unit, ph }])=>`
          <label style="flex:1; min-width:0; font-size:11px; color:var(--ink-faint); font-weight:700; display:flex; flex-direction:column; gap:4px;">
            ${f}
            <input class="sexp-simple-val" data-f="${f}" placeholder="${ph}" onfocus="unitFocus(this,'${unit}')" oninput="unitInput(this,'${unit}')" onblur="unitBlur(this,'${unit}')" style="${dateFieldStyle}" />
          </label>`).join('')}
        </div>
        <div id="surveyExpFactorRow" style="display:${surveyExpMode()==='pick'?'':'none'};">
          <div style="font-size:11px; font-weight:700; color:var(--ink-faint); margin-bottom:6px;">처리 요인 (복수 선택 가능)</div>
          <div class="task-bed-chips">
            ${Object.keys(SURVEY_EXP_FACTORS).map(f=>`<button type="button" class="task-bed-chip ${surveySelectedFactors.has(f)?'active':''}" onclick="toggleSurveyFactor('${f}', this)">${f}</button>`).join('')}
          </div>
        </div>
        <div id="surveyExpPhaseBox" style="display:${surveyExpMode()==='pick'?'':'none'};">
          <div style="font-size:11px; font-weight:700; color:var(--ink-faint); margin-bottom:6px;">처리 구간 (중간에 조건이 바뀌면 구간을 추가해주세요)</div>
          <div id="surveyExpHint" class="sgen-help" style="margin:0 0 6px; display:${surveyExpMode()==='pick'&&!surveySelectedFactors.size?'':'none'};">위에서 처리 요인을 고르면 구간마다 조건 칸이 나와요</div>
          <div id="surveyExpPhases" class="sexp-list">${surveyExpPhaseHtml()}</div>
          <button type="button" class="btn small" style="margin-top:8px;" onclick="addSurveyExpPhase()">+ 구간 추가</button>
        </div>
      </div>

      <div id="surveyUsePeriodWrap" style="display:${surveyHidesGenPeriod()?'':'none'};">
        <div style="font-size:11px; font-weight:700; color:var(--ink-faint); margin-bottom:6px;">희망 사용기간 <span style="color:var(--danger);">*</span></div>
        <div style="display:flex; align-items:center; gap:10px;">
          <input id="surveyUseStart" type="date" ${(planPeriod&&planPeriod.period_start)?`min="${planPeriod.period_start}"`:''} ${(planPeriod&&planPeriod.period_end)?`max="${planPeriod.period_end}"`:''} style="flex:1; min-width:0; ${dateFieldStyle}" />
          <span style="color:var(--ink-faint); font-size:12px;">~</span>
          <input id="surveyUseEnd" type="date" ${(planPeriod&&planPeriod.period_start)?`min="${planPeriod.period_start}"`:''} ${(planPeriod&&planPeriod.period_end)?`max="${planPeriod.period_end}"`:''} style="flex:1; min-width:0; ${dateFieldStyle}" />
        </div>
      </div>

      <div id="surveyGenWrap" style="display:${surveyHidesGenPeriod()?'none':''};">
        <div style="font-size:11px; font-weight:700; color:var(--ink-faint); margin-bottom:6px;">세대별 희망 기간 (복수 선택 가능) <span style="color:var(--danger);">*</span></div>
        <div class="task-bed-chips">
          ${SURVEY_GEN_STAGES.map(g=>`<button type="button" class="task-bed-chip ${surveySelectedGenerations.has(g)?'active':''}" onclick="toggleSurveyGeneration('${g}', this)">${g}</button>`).join('')}
        </div>
        <div class="sgen-main">
          <label><span>생육일수</span>
            <span class="sgen-days"><input id="surveyGenDays" type="number" min="0" inputmode="numeric" placeholder="예: 60" oninput="surveyDaysChanged()" /><i>일</i></span>
          </label>
          <div id="surveyGenDefaultHint" class="sgen-hint"></div>
        </div>
        <div class="sgen-list">
          ${SURVEY_GEN_STAGES.map(g=>`
            <div id="surveyGenRow-${g}" style="display:${surveySelectedGenerations.has(g)?'block':'none'};">
              <div class="sgen-card">
                <div class="sgen-head">${g}</div>
                <div class="sgen-grid">
                  <label>시작일
                    <input id="surveyGenStart-${g}" type="date" data-g="${g}" data-field="start" ${SURVEY_DATE_EVENTS} ${(planPeriod&&planPeriod.period_start)?`min="${planPeriod.period_start}"`:''} ${(planPeriod&&planPeriod.period_end)?`max="${planPeriod.period_end}"`:''} />
                  </label>
                  <label>종료일
                    <input id="surveyGenEnd-${g}" type="date" data-g="${g}" data-field="end" ${SURVEY_DATE_EVENTS} ${(planPeriod&&planPeriod.period_start)?`min="${planPeriod.period_start}"`:''} ${(planPeriod&&planPeriod.period_end)?`max="${planPeriod.period_end}"`:''} />
                  </label>
                </div>
                <div id="surveyGenNote-${g}" class="sgen-note"></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div>
        <div style="font-size:11px; font-weight:700; color:var(--ink-faint); margin-bottom:6px;">베드별 예상 개체수 <span style="color:var(--danger);">*</span></div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${sortedSelectedBeds.map(b=>`
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="width:110px; flex-shrink:0; font-size:12.5px; font-weight:700; color:var(--ink);">${escapeHtml(spotText(b.bedNo, b.floor, true))}</span>
              <input id="surveyScale-${b.bedNo}-${escapeHtml(b.floor)}" type="number" placeholder="개체수" style="flex:1; min-width:0; ${dateFieldStyle}" />
            </div>
          `).join('')}
        </div>
      </div>

      <label style="font-size:11px; color:var(--ink-faint); font-weight:700; display:flex; flex-direction:column; gap:4px;">
        자유 요청사항
        <textarea id="surveyNotes" rows="3" placeholder="추가로 전달하고 싶은 내용이 있으면 적어주세요" style="width:100%; box-sizing:border-box; padding:10px 12px; border:1.2px solid var(--line); border-radius:9px; font-family:inherit; font-size:13.5px; resize:vertical;"></textarea>
      </label>

      <div style="font-size:11px; color:var(--ink-faint);"><span style="color:var(--danger);">*</span> 표시는 꼭 입력해야 제출돼요</div>
      <button class="btn primary" style="align-self:flex-start; margin-top:-6px;" onclick="submitDemandSurvey()">제출하기</button>
    </div>
  `;

  // 계통작성과 같은 3열 틀: 시설 배치도 | 실 내부 베드 맵 | 작성 칸 (방을 고르기 전에도 가운데 칸은 안내와 함께 자리를 지킨다)
  const topHtml = `
    ${renderPlanPeriodBannerHtml()}
    <div class="survey-two-col">
      <div class="survey-facility-panel work-map-panel">
        <div class="survey-facility-title">시설 공간 배치도</div>
        ${renderSurveyFacilityHtml()}
      </div>
      <div class="panel-box survey-bed-panel work-bed-panel">
        ${renderSurveyBedPanelHtml()}
      </div>
      <div class="panel-box survey-form-panel">
        <div class="panel-box-head">
          <div>
            <h3>스피드브리딩 활용 계획 수요조사</h3>
          </div>
        </div>
        ${formInnerHtml}
      </div>
    </div>
  `;

  // 관리자용 결과 영역은 따로 그린다 (방 필터를 바꿀 때 이 영역만 다시 그려서, 위쪽 수요조사 입력 칸에 쓰던 내용이 지워지지 않게)
  wrap.innerHTML = `<div class="survey-user-area">${topHtml}</div>` + (isAdmin ? `<div id="surveyResultsWrap">${surveyResultsHtml()}</div>` : '');
  surveyApplyDefaultDays();   // 생육일수를 선택한 작물의 기본값으로 채우고 달력 범위를 현재 선택에 맞춰 둔다
}

// 응답 결과 목록의 방 필터를 바꾸고 결과 영역만 다시 그린다
function setSurveyResultRoom(name){
  surveyResultRoomFilter = name || '';
  const el = document.getElementById('surveyResultsWrap');
  if(el) el.innerHTML = surveyResultsHtml();
  else renderSurveyView();
}

function surveyResultsHtml(){
  let resultsHtml = '';
  if(isAdmin){
    const st = computeDemandState();   // 응답이 계획에 들어갔는지 (분기별 계획과 같은 기준)

    const allRoomNames = [...new Set([...ROW1, ...ROW2])].filter(n=>!isMutedRoom(n));
    const fullRoomCounts = {};
    allRoomNames.forEach(n=> fullRoomCounts[n] = 0);
    demandSurveys.forEach(s=>{ if(s.room_name) fullRoomCounts[s.room_name] = (fullRoomCounts[s.room_name]||0)+1; });

    // 응답 결과 목록: 방별 필터 (신청한 방 기준 = 목록에 적힌 방). 목적별 · 작물별 건수도 필터를 따른다
    const noRoomN = demandSurveys.filter(s=> !s.room_name).length;
    const roomMatches = (s)=> !surveyResultRoomFilter || (surveyResultRoomFilter==='__none__' ? !s.room_name : s.room_name===surveyResultRoomFilter);
    const shownSurveys = demandSurveys.filter(roomMatches);
    const purposeCounts = {};
    const cropCounts = {};
    shownSurveys.forEach(s=>{
      (s.purposes||[]).forEach(p=> purposeCounts[p] = (purposeCounts[p]||0)+1);
      (s.crops||[]).forEach(c=> cropCounts[c] = (cropCounts[c]||0)+1);
    });
    const countRow = (counts)=> Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`<span class="item-count-tag">${escapeHtml(k)} ${n}</span>`).join(' ');
    // 필터 칩: 도면 순서의 모든 방(응답이 없는 방도) → 그 밖의 방 이름 순 → 방 미지정
    const filterRooms = [...allRoomNames, ...Object.keys(fullRoomCounts).filter(n=> !allRoomNames.includes(n)).sort((a,b)=> a.localeCompare(b))];
    const filterChip = (key, label, n)=> `<button type="button" class="svf ${surveyResultRoomFilter===key ? 'on' : ''} ${n ? '' : 'zero'}" data-room="${escapeHtml(key)}" onclick="setSurveyResultRoom(this.dataset.room)">${escapeHtml(label)}<i>${n}</i></button>`;
    const filterLabel = surveyResultRoomFilter==='__none__' ? '방 미지정' : roomLabel(surveyResultRoomFilter);
    const filterHtml = `
      <div class="sv-filter">
        <span>방별 보기</span>
        ${filterChip('', '전체', demandSurveys.length)}
        ${filterRooms.map(n=> filterChip(n, roomLabel(n), fullRoomCounts[n] || 0)).join('')}
        ${noRoomN ? filterChip('__none__', '방 미지정', noRoomN) : ''}
      </div>`;
    const roomEntries = Object.entries(fullRoomCounts).sort((a,b)=> b[1]-a[1]);
    const maxRoomCount = Math.max(1, ...roomEntries.map(e=>e[1]));
    const demandSummaryHtml = roomEntries.map(([name, count], idx)=>{
      const pct = (count/maxRoomCount*100).toFixed(1);
      const hasOverlap = count>0 && roomHasBedOverlap(name);
      const barColor = hasOverlap ? 'var(--amber)' : 'var(--teal)';
      const isExpanded = surveyDemandExpandedRoom === name;
      const waitN = st.actionable.filter(g=> g.room===name).length;
      const roomGroupN = st.groups.filter(g=> g.room===name).length;
      const linkChip = waitN ? `<span class="sv-chip wait">반영 대기 ${waitN}</span>` : roomGroupN ? `<span class="sv-chip done">✓ 모두 반영</span>` : '';
      return `
        <div style="margin-bottom:9px;">
          <div class="survey-demand-row" style="margin-bottom:0;">
            <span class="survey-demand-label" title="${escapeHtml(roomLabel(name))}">${hasOverlap?'🔥 ':''}${escapeHtml(roomLabel(name))}</span>
            <div class="survey-demand-bar-track"><div class="survey-demand-bar-fill" style="width:${pct}%; background:${barColor};"></div></div>
            <span class="survey-demand-count">${count}건</span>
            <span style="flex:0 0 92px; text-align:left;">${linkChip}</span>
            ${count>0 ? `<button class="btn small" onclick="toggleSurveyDemandDetail('${name.replace(/'/g,"")}')" style="flex-shrink:0;">${isExpanded?'접기':'자세히'}</button>` : ''}
          </div>
          ${isExpanded ? renderSurveyRoomTimelineHtml(name) : ''}
        </div>
      `;
    }).join('');

    resultsHtml = `
      <div class="panel-box" style="margin-top:20px;">
        <div class="panel-box-head">
          <div>
            <h3>방별 수요 현황</h3>
            <p>어느 방에 수요가 몰려 있는지 한눈에 보여드려요. 같은 위치(베드)에 기간이 겹치면 🔥로 표시돼요.</p>
          </div>
          ${st.groups.length ? `
          <div style="display:flex; align-items:center; gap:10px; flex-shrink:0; flex-wrap:wrap; justify-content:flex-end;">
            ${st.counts.wait
              ? `<span class="sv-chip wait">계획에 반영 대기 ${st.counts.wait}건</span><button class="btn small primary" onclick="switchView('plan')">분기별 계획에서 반영하기 →</button>`
              : `<span class="sv-chip done">✓ 모든 응답이 계획에 반영됐어요</span>`}
          </div>` : ''}
        </div>
        ${demandSummaryHtml}
      </div>
      <div class="panel-box" style="margin-top:20px;">
        <div class="panel-box-head">
          <div>
            <h3>응답 결과 (관리자 전용)</h3>
            <p>${surveyResultRoomFilter ? `<b>${escapeHtml(filterLabel)}</b> ${shownSurveys.length}건을 보고 있어요 (전체 ${demandSurveys.length}건 중)` : `총 ${demandSurveys.length}건의 응답이 접수됐어요.`}</p>
          </div>
          <button class="btn small danger-text" onclick="deleteAllSurveys()" title="방 필터와 상관없이 모든 응답이 삭제돼요">전체 삭제</button>
        </div>
        ${filterHtml}
        <div style="display:flex; gap:24px; flex-wrap:wrap; margin-bottom:18px;">
          <div><div style="font-size:11px; color:var(--ink-faint); font-weight:700; margin-bottom:6px;">목적별</div>${countRow(purposeCounts) || '<span class="empty-chip">데이터 없음</span>'}</div>
          <div><div style="font-size:11px; color:var(--ink-faint); font-weight:700; margin-bottom:6px;">작물별</div>${countRow(cropCounts) || '<span class="empty-chip">데이터 없음</span>'}</div>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${shownSurveys.length ? shownSurveys.map(s=>`
            <div class="task-row-wrap">
              <div class="task-row" style="flex:1; cursor:default; align-items:flex-start;">
                <div class="task-row-body">
                  <span class="task-row-loc">${s.room_name?`<b style="color:var(--teal-deep);">${escapeHtml(roomLabel(s.room_name))}${isAisleSpot(s.bed_no) ? ' · 통로' : `${s.bed_no?` 베드${s.bed_no}`:''}${s.floor?` · ${escapeHtml(s.floor)}`:''}`}</b> · `:''}${escapeHtml(s.respondent_name||'(이름 없음)')}</span>
                  <span class="task-row-note">${(s.purposes||[]).map(x=>escapeHtml(x)).join(', ')||'-'} · ${(s.crops||[]).map(x=>escapeHtml(x)).join(', ')||'-'} · ${s.expected_scale!=null?`${s.expected_scale}${escapeHtml(s.scale_unit||'')}`:'-'}</span>
                  ${s.line_no ? `<span style="font-size:11.5px; color:var(--ink-soft);">${lineNoLabel((s.purposes||[])[0])}: <b>${escapeHtml(s.line_no)}</b></span>` : ''}
                  ${s.cross_combo ? `<span style="font-size:11.5px; color:var(--ink-soft);">교배조합: ${escapeHtml(crossComboLabel(s))}</span>` : ''}
                  ${s.breeding_purpose ? `<span style="font-size:11.5px; color:var(--ink-soft);">${purposeFieldLabel((s.purposes||[])[0])}: ${escapeHtml(s.breeding_purpose)}</span>` : ''}
                  ${s.heat_temp ? `<span style="font-size:11.5px; color:var(--ink-soft);">처리 온도: ${escapeHtml(s.heat_temp)}</span>` : ''}
                  ${s.heat_stage ? `<span style="font-size:11.5px; color:var(--ink-soft);">처리 단계: ${escapeHtml(s.heat_stage)}</span>` : ''}
                  ${surveyExpText(s) ? `<span style="font-size:11.5px; color:var(--ink-soft);">${escapeHtml(surveyExpText(s))}</span>` : ''}
                  ${(s.desired_start||s.desired_end) ? `<span class="task-requester-tag">${s.generation?`${escapeHtml(s.generation)} `:'희망 사용기간 '}${escapeHtml(s.desired_start||'?')} ~ ${escapeHtml(s.desired_end||'?')}</span>` : ''}
                  ${s.notes ? `<div style="font-size:12.5px; color:var(--ink-soft); margin-top:4px;">${escapeHtml(s.notes)}</div>` : ''}
                  ${demandLinkHtml(st, s)}
                </div>
              </div>
              <button class="task-cancel-btn" onclick="deleteSurvey('${s.id}')" title="삭제">✕</button>
            </div>
          `).join('') : `<div class="empty-materials">${demandSurveys.length ? `<b>${escapeHtml(filterLabel)}</b>에는 접수된 응답이 없어요` : '아직 응답이 없어요'}</div>`}
        </div>
      </div>
    `;
  }
  return resultsHtml;
}

async function submitDemandSurvey(){
  if(tourBlockWrite()) return;   // 사용법 체험 중에는 실제로 제출하지 않는다
  surveyDateFlushAll();          // 날짜를 직접 쓰던 중이었다면 그 값을 먼저 반영한다
  if(!surveySelectedRoomName){ alert('방을 먼저 선택해주세요.'); return; }
  if(!roomIsActive(roomByName(surveySelectedRoomName))){ alert('관리자가 사용 중지한 방이라 수요조사를 제출할 수 없어요. 다른 방을 골라주세요.'); return; }
  if(!surveySelectedBeds.size){ alert('베드와 층을 먼저 선택해주세요.'); return; }
  // 필수 항목: 담당자 · 사용 목적 · 작물 · 교배조합 · 교배목적(세대단축 · 인공교배) · 희망 기간(선택한 세대마다, 또는 희망 사용기간) · 베드별 예상 개체수. 하나라도 비어 있으면 제출하지 않는다.
  const nameEl = document.getElementById('surveyName');
  const name = nameEl.value.trim() || null;
  if(!name){ alert('담당자(이름)를 입력해주세요.'); nameEl.focus(); return; }

  const purposes = [...surveySelectedPurposes].filter(p=>p!=='기타');
  const purposeOtherEl = document.getElementById('surveyPurposeOtherWrap');
  if(surveySelectedPurposes.has('기타') && purposeOtherEl.value.trim()) purposes.push(purposeOtherEl.value.trim());
  if(!surveySelectedPurposes.size){ alert('사용 목적을 선택해주세요.'); return; }
  if(!purposes.length){ alert('실험 내용을 적어주세요.'); purposeOtherEl.focus(); return; }

  const crops = [...surveySelectedCrops];
  if(!crops.length){ alert('작물을 선택해주세요.'); return; }

  // 고온검정·기타는 교배조합·교배목적·세대별 희망기간 입력칸이 숨겨지므로, 이전에 입력된 값이 남아 있어도 제출하지 않는다
  // 고온검정은 대신 '검정 목적' 칸을 받아서 같은 breeding_purpose 칸에 담는다 (분기별 계획 → 계통작성의 검정 목적으로 이어진다)
  const isHeatTest = surveyIsHeatTest();
  const isEtc = surveyIsEtc();
  const hideCross = isHeatTest || isEtc;
  const breedingPurpose = isHeatTest ? (document.getElementById('surveyHeatPurpose').value.trim() || null)
    : hideCross ? null : (document.getElementById('surveyBreedingPurpose').value.trim() || null);
  const crossCombo = hideCross ? null : (document.getElementById('surveyCrossCombo').value.trim() || null);
  // 교배조합 · 교배목적 칸이 보이는 목적(세대단축 · 인공교배)에서는 둘 다 꼭 적어야 한다
  if(!hideCross && !crossCombo){ alert('교배조합을 입력해주세요.'); document.getElementById('surveyCrossCombo').focus(); return; }
  if(!hideCross && !breedingPurpose){ alert('교배목적을 입력해주세요.'); document.getElementById('surveyBreedingPurpose').focus(); return; }
  // 계통번호(고온검정은 계통/품종)는 적었을 때만 line_no로 보내서, DB에 컬럼이 아직 없어도 없는 제출은 영향받지 않게 한다.
  // 인공교배는 이 칸을 숨기므로, 이전에 적어 둔 값이 남아 있어도 보내지 않는다.
  const lineNo = lineNoHidden([...surveySelectedPurposes][0]) ? null : (document.getElementById('surveyLineNo').value.trim() || null);
  // 인공교배: 대표 교배조합 말고 더 있는 조합 수 ('외 N조합')
  const crossExtraEl = document.getElementById('surveyCrossExtra');
  if(surveySelectedPurposes.has('인공교배') && crossExtraEl && crossExtraEl.value.trim() !== '' && !(Number.isInteger(Number(crossExtraEl.value)) && Number(crossExtraEl.value) >= 0)){
    alert("'외 N조합'에는 0 이상의 정수를 적어주세요. (조합이 하나뿐이면 비워 두세요)"); crossExtraEl.focus(); return;
  }
  const crossExtra = (surveySelectedPurposes.has('인공교배') && !hideCross && crossExtraEl) ? parseCrossExtra(crossExtraEl.value) : null;

  // 고온검정일 때만 처리 온도·단계를 보낸다 (DB 컬럼이 없어도 다른 목적의 제출은 영향받지 않도록)
  const heatFields = isHeatTest ? {
    heat_temp: normalizeTemp(document.getElementById('surveyHeatTemp').value) || null,
    heat_stage: document.getElementById('surveyHeatStage').value.trim() || null
  } : {};

  // 온도·일장 조건을 받는 목적일 때만 처리 조건을 보낸다. 적은 것만 보내서, DB 컬럼이 아직 없어도 이 칸을 안 쓴 제출은 영향받지 않게 한다.
  //  · 세대단축·인공교배: 기간 내내 조건이 같아서 온도·일장 칸 하나씩만 받는다 (예: '온도 25℃, 일장 10시간')
  //  · 기타: 고른 처리 요인과, 구간을 화살표로 이어 한 줄로 (예: '발아 후 ~14일: 온도 25℃, 일장 10시간 → 개화기 이후: 온도 30℃, 일장 8시간')
  // 받지 않는 요인의 칸에 남은 글이나 단위만 남은 칸은 보내지 않고, 아무것도 안 적은 구간은 건너뛴다.
  const expFields = {};
  const expMode = surveyExpMode();
  if(expMode === 'all'){
    const condition = [...document.querySelectorAll('#surveyExpSimple .sexp-simple-val')].map(inp=> surveyExpValue(inp, inp.dataset.f)).filter(Boolean).join(', ');
    if(condition) expFields.exp_condition = condition;
  } else if(expMode === 'pick'){
    const picked = Object.keys(SURVEY_EXP_FACTORS).filter(surveyExpFactorOn);
    const phases = [...document.querySelectorAll('#surveyExpPhases .sexp-card')].map((card, i)=>({
      i, card,
      when: card.querySelector('.sexp-when').value.trim(),
      conds: picked.map(f=> surveyExpValue(card.querySelector(`.sexp-val[data-f="${f}"]`), f)).filter(Boolean).join(', ')
    })).filter(p=> p.when || p.conds);
    // 구간이 둘 이상이면 언제 바뀌는지 알 수 있어야 해서, 구간마다 적용 시기를 받는다
    const noWhen = phases.length > 1 && phases.find(p=> !p.when);
    if(noWhen){ alert(`구간 ${noWhen.i + 1}의 적용 시기를 적어주세요.\n(예: 발아 후 ~14일, 개화기 이후)`); noWhen.card.querySelector('.sexp-when').focus(); return; }
    const condition = phases.map(p=> p.when && p.conds ? `${p.when}: ${p.conds}` : (p.when || p.conds)).join(' → ');
    if(picked.length) expFields.exp_factors = picked.join(', ');
    if(condition) expFields.exp_condition = condition;
  } else if(isHeatTest){
    // 고온검정은 온도를 '처리 온도' 칸(heat_temp)으로 받으므로, 일장만 같은 처리 조건 칸(exp_condition)에 담는다 (예: '일장 10시간')
    const daylen = surveyExpValue(document.getElementById('surveyHeatDaylen'), '일장');
    if(daylen) expFields.exp_condition = daylen;
  }

  // 인공교배·고온검정·기타는 세대별 희망 기간 대신 '희망 사용기간' 하나만 받는다 (세대 없이 desired_start/desired_end에 저장 → 분기별 계획 연계에 그대로 쓰인다).
  // 반대로 세대별 칸이 보이는 목적은 숨겨진 사용기간 값이 남아 있어도 제출하지 않는다.
  // 기간은 시작일과 종료일이 모두 있어야 한다. 세대를 고른 만큼(F1·F2·F3…) 그 세대의 기간이 다 채워져야 하고, 세대를 하나도 안 골랐어도 제출되지 않는다.
  let genEntries;
  if(surveyHidesGenPeriod()){
    const startEl = document.getElementById('surveyUseStart'), endEl = document.getElementById('surveyUseEnd');
    const s = startEl.value || null, e = endEl.value || null;
    if(!s || !e){ alert('희망 사용기간의 시작일과 종료일을 모두 입력해주세요.'); (s ? endEl : startEl).focus(); return; }
    genEntries = [{ generation: null, desired_start: s, desired_end: e }];
  } else {
    const picked = SURVEY_GEN_STAGES.filter(g=>surveySelectedGenerations.has(g));
    if(!picked.length){ alert('세대(F1~F6)를 선택하고 세대별 희망 기간을 입력해주세요.'); return; }
    genEntries = picked.map(g=>({
      generation: g,
      desired_start: document.getElementById(`surveyGenStart-${g}`).value || null,
      desired_end: document.getElementById(`surveyGenEnd-${g}`).value || null
    }));
    const incomplete = genEntries.filter(g=> !g.desired_start || !g.desired_end);
    if(incomplete.length){
      const first = incomplete[0];
      alert(`${incomplete.map(g=>g.generation).join(', ')}의 시작일과 종료일을 입력해주세요.\n(시작일을 고르면 생육일수만큼 종료일이 자동으로 채워져요)`);
      document.getElementById(first.desired_start ? `surveyGenEnd-${first.generation}` : `surveyGenStart-${first.generation}`).focus();
      return;
    }
  }

  let prevGen = null, prevEnd = null;
  for(const g of genEntries){
    const label = g.generation ? `${g.generation} 희망 기간` : '희망 사용기간';
    if(g.desired_start && g.desired_end && g.desired_end < g.desired_start){
      alert(`${label}의 종료일이 시작일보다 빠를 수 없어요.`);
      return;
    }
    // 세대별 기간은 앞 세대 종료일 다음 날부터 (달력에서 막아도 직접 입력한 날짜는 여기서 걸러낸다)
    if(g.generation){
      const first = g.desired_start || g.desired_end;
      if(prevEnd && first && first <= prevEnd){
        alert(`${label}은 ${prevGen} 종료일(${prevEnd}) 다음 날부터 선택할 수 있어요.`);
        return;
      }
      const last = g.desired_end || g.desired_start;
      if(last){ prevGen = g.generation; prevEnd = last; }
    }
    if(planPeriod && planPeriod.period_start && planPeriod.period_end){
      const s = g.desired_start || planPeriod.period_start;
      const e = g.desired_end || g.desired_start;
      if(s < planPeriod.period_start || e > planPeriod.period_end){
        alert(`${label}은 ${planPeriod.period_start} ~ ${planPeriod.period_end} 사이여야 해요.`);
        return;
      }
    }
  }

  // 고른 베드마다 예상 개체수가 있어야 한다 (0 이하는 안 된다)
  for(const key of [...surveySelectedBeds].sort((a, b)=> parseInt(a) - parseInt(b) || a.localeCompare(b))){
    const [bedNo, floor] = key.split('|');
    const scaleEl = document.getElementById(`surveyScale-${bedNo}-${floor}`);
    if(!scaleEl || scaleEl.value === '' || !(Number(scaleEl.value) > 0)){
      alert(`${spotText(bedNo, floor, true)}의 예상 개체수를 입력해주세요.`);
      if(scaleEl) scaleEl.focus();
      return;
    }
  }

  const scale_unit = '개체수';
  const notes = document.getElementById('surveyNotes').value.trim() || null;

  let rows = [...surveySelectedBeds].flatMap(key=>{
    const [bedNo, floor] = key.split('|');
    const scaleEl = document.getElementById(`surveyScale-${bedNo}-${floor}`);
    const scaleVal = scaleEl ? scaleEl.value : '';
    const expected_scale = scaleVal === '' ? null : Number(scaleVal);
    return genEntries.map(g=>({
      room_name: surveySelectedRoomName, bed_no: parseInt(bedNo), floor,
      respondent_name: name, purposes, crops, cross_combo: crossCombo, breeding_purpose: breedingPurpose,
      generation: g.generation, desired_start: g.desired_start, desired_end: g.desired_end,
      expected_scale, scale_unit, notes, ...heatFields, ...expFields, ...(lineNo ? { line_no: lineNo } : {}),
      ...(crossExtra ? { cross_extra: crossExtra } : {})   // '외 N조합'은 적었을 때만 보낸다 (컬럼이 없어도 안 적은 제출은 영향 없음)
    }));
  });

  const bedCount = surveySelectedBeds.size;
  let { error } = await sb.from('demand_survey').insert(rows);
  let lineNoDropped = false, expFolded = false, crossDropped = false;
  // 새 컬럼이 DB에 아직 없을 수 있어서, 없는 컬럼 하나씩 빼고 다시 보내 응답 자체는 잃지 않게 한다 (컬럼마다 최대 한 번)
  for(let i = 0; i < 3 && error; i++){
    if(crossExtra && !crossDropped && isCrossExtraColError(error)){
      rows = stripCrossExtra(rows);
      crossDropped = true;
    } else if(Object.keys(expFields).length && !expFolded && /exp_(factors|condition)/.test(error.message||'')){
      // 처리 요인·조건 컬럼이 없으면, 내용을 요청사항 앞에 합쳐서 보낸다
      const expText = surveyExpText(expFields);
      rows = rows.map(r=>{ const c = { ...r }; delete c.exp_factors; delete c.exp_condition; c.notes = [expText, r.notes].filter(Boolean).join('\n'); return c; });
      expFolded = true;
    } else if(lineNo && !lineNoDropped && (error.code==='PGRST204' || /line_no/.test(error.message||''))){
      // demand_survey에 line_no 컬럼이 아직 없으면, 계통번호만 빼고 다시 보낸다
      rows = rows.map(r=>{ const c = { ...r }; delete c.line_no; return c; });
      lineNoDropped = true;
    } else break;
    ({ error } = await sb.from('demand_survey').insert(rows));
  }
  if(error){
    const missingHeatCol = isHeatTest && /heat_(temp|stage)/.test(error.message||'');
    alert('제출 실패!\n\n' + (error.message||JSON.stringify(error)) + (missingHeatCol ? '\n\n(관리자 확인 필요: demand_survey 테이블에 heat_temp, heat_stage 컬럼을 추가해야 해요)' : ''));
    return;
  }
  if(crossDropped) crossExtraDroppedAlert();
  if(lineNoDropped) alert('응답은 제출됐지만, 계통번호는 demand_survey 테이블에 해당 컬럼이 없어 저장되지 않았어요.\n\n(관리자 확인 필요) Supabase SQL Editor에서 아래를 한 번 실행해주세요:\n\n' + LINE_NO_SQL);
  if(expFolded) alert('응답은 제출됐지만, 처리 요인·조건은 demand_survey 테이블에 해당 컬럼이 없어 요청사항에 합쳐서 저장됐어요.\n\n(관리자 확인 필요) Supabase SQL Editor에서 아래를 한 번 실행해주세요:\n\n' + EXP_SQL);
  surveySelectedPurposes = new Set();
  surveySelectedCrops = new Set();
  surveySelectedGenerations = new Set();
  surveySelectedFactors = new Set();
  surveySelectedRoomName = null;
  surveySelectedBeds = new Set();
  showToast(`응답이 제출됐어요${bedCount>1?` (베드 ${bedCount}곳)`:''}. 감사합니다!`);
  await loadAll();
}

async function deleteSurvey(id){
  if(!confirm('이 응답을 삭제할까요?')) return;
  const { error } = await sb.from('demand_survey').delete().eq('id', id);
  if(error){ alert('삭제 실패!\n\n'+error.message); return; }
  await loadAll();
}

async function deleteAllSurveys(){
  if(!isAdmin){ alert('전체 관리자만 할 수 있어요.'); return; }
  if(!confirm('정말로 모든 수요조사 응답을 삭제할까요? (되돌릴 수 없어요)')) return;
  const { error } = await sb.from('demand_survey').delete().gte('created_at', '1900-01-01');
  if(error){ alert('삭제 실패!\n\n'+error.message); return; }
  showToast('수요조사 응답이 모두 삭제됐어요');
  await loadAll();
}
