/* lines.js — [계통작성] 화면: 방·자리 선택, 베드 맵, 작성 패널, 계통 카드, 재료 */

function openWorkRoomDetail(roomId){
  workActiveRoomId = roomId;
  resetWorkMulti();
  renderDetail('work');
}

function closeWorkRoomDetail(){
  workActiveRoomId = null;
  resetWorkMulti();
  renderDetail('work');
}

function resetWorkMulti(){ workMultiSpots = new Set(); }

// 계통작성 ─ 배치도에서 방을 누르면: 그 방을 열고, 이미 열린 방을 다시 누르면 닫는다. 아직 만들지 않은 방은 관리자만 만들 수 있다.
function pickWorkRoom(name){
  if(isMutedRoom(name)) return;
  const room = rooms.find(r=> r.name===name);
  if(!room){
    if(!isAdmin){ showToast('아직 만들어지지 않은 방이에요 (관리자가 만들 수 있어요)'); return; }
    createWorkRoom(name);
    return;
  }
  if(workActiveRoomId===room.id) closeWorkRoomDetail();
  else openWorkRoomDetail(room.id);
}

async function createWorkRoom(name){
  await quickCreateRoom(name);
  const room = rooms.find(r=> r.name===name);
  if(room) openWorkRoomDetail(room.id);
}

// ── 자리 선택: 베드 맵에서 자리를 눌러 여러 개 고르면, 같은 계통을 적는 작성 칸이 바로 열리고 개체수는 베드마다 따로 적는다 ──
function workSpotKey(bedNo, floor){ return `${bedNo}|${floor}`; }

function parseWorkSpotKey(key){ const [b, f] = key.split('|'); return { bedNo: parseInt(b), floor: f }; }

function workSpotLabel(room, t){ return isAisleSpot(t.bedNo) ? '통로' : `베드 ${t.bedNo}${workRoomInfo(room).bedFloors===2 ? ` · ${t.floor}` : ''}`; }

function workMultiTargets(){
  // 베드 번호 순(통로는 맨 뒤), 같은 베드에서는 2층이 먼저
  return [...workMultiSpots].map(parseWorkSpotKey).sort((a, b)=> bedOrder(a.bedNo)-bedOrder(b.bedNo) || b.floor.localeCompare(a.floor));
}

// 딱 한 자리만 골랐을 때 그 자리 { bedNo, floor } (아니면 null)
function workOnlySpot(){
  return workMultiSpots.size === 1 ? parseWorkSpotKey([...workMultiSpots][0]) : null;
}

// 한 자리만 고른 상태로 만든다 (등록을 마치고 그 자리를 열어 보여 줄 때)
function setWorkOnlySpot(bedNo, floor){ workMultiSpots = new Set([workSpotKey(bedNo, floor)]); }

// 지금 방·자리 선택 상태를 한 줄로 만든다. 집단 추가 입력칸을 연 뒤 이 값이 바뀌면(다른 자리 · 방을 눌렀다는 뜻) 입력칸을 닫는다.
function workSelectionSig(){
  return `${workActiveRoomId}#${[...workMultiSpots].sort().join(',')}`;
}

// 그 자리에 지금 심겨 있는 계통이 없는가
function workSpotKeyIsEmpty(room, key){
  const s = parseWorkSpotKey(key);
  return workSpotBatches(room, s.bedNo, s.floor).length === 0;
}

// 빈 자리만 새로 고르는 클릭이면, 이미 골라 둔 '사용중' 자리는 선택에서 뺀다 → 빈 자리만 골라진다.
// (자리를 등록하고 나면 그 자리가 선택된 채 남는데, 이어서 빈 자리를 눌렀을 때 방금 등록한 자리가 같이 끼지 않게 하려는 것)
function dropFilledWorkSpotsWhenAddingEmpty(room, addedKeys){
  if(!room || !addedKeys.length || !addedKeys.every(k=> workSpotKeyIsEmpty(room, k))) return;
  [...workMultiSpots].forEach(k=>{ if(!workSpotKeyIsEmpty(room, k)) workMultiSpots.delete(k); });
}

// 베드 맵의 칸을 누르면 그 자리를 고르거나 푼다 (수요조사와 같다)
function toggleWorkMultiSpot(bedNo, floor){
  const key = workSpotKey(bedNo, floor);
  if(workMultiSpots.has(key)) workMultiSpots.delete(key);
  else{
    workMultiSpots.add(key);
    dropFilledWorkSpotsWhenAddingEmpty(rooms.find(r=> r.id===workActiveRoomId), [key]);
  }
  renderDetail('work');
}

// 베드 이름을 누르면 그 베드의 모든 층을 함께 고르거나 푼다
function toggleWorkMultiBed(bedNo){
  const room = rooms.find(r=> r.id===workActiveRoomId);
  if(!room) return;
  const keys = workRoomInfo(room).floors.map(fl=> workSpotKey(bedNo, fl));
  const allOn = keys.every(k=> workMultiSpots.has(k));
  keys.forEach(k=>{ if(allOn) workMultiSpots.delete(k); else workMultiSpots.add(k); });
  if(!allOn) dropFilledWorkSpotsWhenAddingEmpty(room, keys);
  renderDetail('work');
}

function clearWorkMulti(){ workMultiSpots = new Set(); renderDetail('work'); }

function workRowStatus(harvestDate){
  if(!harvestDate) return { cls:'none', label:'-', diff:null, style:'background:var(--line-soft); color:var(--ink-faint);' };
  const diff = daysBetween(todayKST(), harvestDate);
  let cls, label, style;
  if(diff < 0){
    cls = 'overdue';
    label = `${Math.abs(diff)}일 지남`;
    if(Math.abs(diff) >= 7) style = 'background:#B5453B; color:#fff;';
    else if(Math.abs(diff) >= 3) style = 'background:#D9756A; color:#fff;';
    else style = 'background:#F5D4CF; color:#8A342B;';
  } else if(diff <= 7){
    cls = 'soon';
    label = `D-${diff}`;
    style = diff <= 2 ? 'background:#F0AE7A; color:#fff;' : 'background:#FBEEDD; color:var(--amber);';
  } else {
    cls = 'ok';
    label = `D-${diff}`;
    style = 'background:var(--teal-soft); color:var(--teal-deep);';
  }
  return { cls, label, diff, style };
}

async function harvestAndReplant(materialId){
  if(tourBlockWrite()) return;
  const b = materials.find(m=>m.id===materialId);
  if(!b) return;
  const doneWord = { '인공교배':'사용 완료', '기타':'실험 완료' }[batchPurposeOf(b)] || '수확';
  const againWord = { advance:'세대진전', replant:'다시 심기' }[harvestActionOf(b)];   // 인공교배는 사용 완료로 끝이라 이어서 심는 안내가 없다
  if(!confirm(`${doneWord} 처리할까요?\n이 자리가 비워져요.${againWord ? ` (나중에 "수확 완료 목록"에서 [${againWord}] 버튼으로 이어서 심을 수 있어요)` : ''}`)) return;
  const now = new Date().toISOString();
  const { error } = await sb.from('materials').update({ harvested_at: now, harvest_confirmed_at: now }).eq('id', materialId);
  if(error){ alert('처리 실패!\n\n' + (error.message||JSON.stringify(error))); return; }
  showToast(`${doneWord} 처리됐어요, 자리가 비워졌어요`);
  await loadAll();
}

async function completeHeatTest(materialId){
  if(tourBlockWrite()) return;
  const b = materials.find(m=>m.id===materialId);
  if(!b) return;
  if(!confirm('고온검정 완료 처리할까요?\n이 자리가 비워져요. (나중에 "수확 완료 목록"에서 [다시 심기] 버튼으로 새로 심을 수 있어요)')) return;
  const now = new Date().toISOString();
  const { error } = await sb.from('materials').update({ harvested_at: now, harvest_confirmed_at: now }).eq('id', materialId);
  if(error){ alert('처리 실패!\n\n' + (error.message||JSON.stringify(error))); return; }
  showToast('검정완료 처리됐어요, 자리가 비워졌어요');
  await loadAll();
}

// ── 계통작성 화면: 시설 배치도 | 실 내부 베드 맵 | 작성 패널 ─────────────────────────────
// 수요조사 화면과 같은 3열 틀이다.
//   ① 배치도에서 방을 고르면  ② 가운데에 그 방의 베드 맵이 나오고
//   ③ 맵에서 자리(베드 · 층)를 누르면 오른쪽에서 그 자리의 계통을 등록 · 수정한다.
function renderWorkView(){
  // 방이 지워졌으면 선택을 푼다
  if(workActiveRoomId && !rooms.some(r=> r.id===workActiveRoomId)){ workActiveRoomId = null; resetWorkMulti(); }
  const room = rooms.find(r=> r.id===workActiveRoomId) || null;
  renderWorkMap(room);
  renderWorkBedPanel(room);
  renderWorkWritePanel(room);
}

function workRoomInfo(room){
  const cfg = DEFAULT_ROOM_CONFIG[room.name];
  const bedCount = cfg ? cfg.bed_count : (room.structure_count || 0);
  const bedFloors = cfg ? cfg.bed_floors : (room.bed_floors || 2);
  return { bedCount, bedFloors, floors: bedFloors===2 ? ['2층','1층'] : ['1층'] };
}

// 한 자리(베드 · 층)에 지금 심겨 있는 계통들. 층이 하나뿐인 방은 층 구분 없이 베드 번호로만 찾는다
function workSpotBatches(room, bedNo, floor){
  const info = workRoomInfo(room);
  return materials.filter(m=> m.room_id===room.id && m.structure_no===bedNo && (info.bedFloors===2 ? m.floor===floor : true) && !m.harvest_confirmed_at);
}

// 배치도의 방 카드 밑에 붙이는 사용 현황 글 ('3계통' · '비어 있음'). 아직 만들지 않은 방이면 null. 계통작성과 수요조사가 함께 쓴다
function roomUseSubText(name){
  const room = rooms.find(r=> r.name===name);
  if(!room) return null;
  const n = materials.filter(m=> m.room_id===room.id && !m.harvest_confirmed_at).length;
  return n ? `${n}계통` : '비어 있음';
}

// ① 시설 공간 배치도
function renderWorkMap(activeRoom){
  const wrap = document.getElementById('workMapPanel');
  if(!wrap) return;
  // 방마다 사용 현황('3계통' · '비어 있음' · 아직 안 만든 방)은 카드 안에 쓰지 않고 마우스를 올리면 보이게 한다 (수요조사와 카드 크기를 맞추려고)
  const tip = (name)=>{
    if(isMutedRoom(name)) return '';
    const use = roomUseSubText(name) ?? (isAdmin ? '+ 방 만들기' : '미등록');
    return `${roomLabel(name)} · ${use}`;
  };
  wrap.innerHTML = `
    <div class="survey-facility-title">시설 공간 배치도</div>
    <div class="survey-facility-hint">방을 누르면 안쪽 베드가 나와요</div>
    ${miniFacilityHtml(activeRoom ? activeRoom.name : null, 'pickWorkRoom', tip)}
  `;
}

// ② 실 내부 베드 맵
function renderWorkBedPanel(room){
  const wrap = document.getElementById('workBedPanel');
  if(!wrap) return;
  if(!room){
    wrap.innerHTML = `<div class="empty-materials" style="padding:60px 20px;">← 왼쪽 배치도에서 방을 선택해주세요</div>`;
    return;
  }
  const info = workRoomInfo(room);
  const hint = !info.bedCount ? '이 방은 베드 구조가 없어요' : '자리를 눌러 여러 개 고르세요 · 베드 이름을 누르면 두 층이 함께 선택돼요';
  const actions = isAdmin ? `<button class="btn small danger-text" onclick="deleteRoom('${room.id}')">방 삭제</button>` : '';
  wrap.innerHTML = `
    ${bedPanelHeadHtml(room, hint, actions, info.bedCount ? { nameNote: '(복수선택가능)' } : {})}
    ${info.bedCount ? workBedMapHtml(room, info) : ''}
    ${bedMapLegendHtml(room)}
    <div style="margin-top:16px;">${envSettingsHtml(room)}${roomStateSettingsHtml(room)}</div>
  `;
}

// 베드 맵 위쪽 머리글: 방 이름 · 온도/일장 · 위치/담당자 + 안내 글. (계통작성과 수요조사가 함께 쓴다)
//  opts.hideEnv: 온도 · 일장 칩을 숨긴다 · opts.nameNote: 방 이름 옆에 붙이는 작은 글 (수요조사)
function bedPanelHeadHtml(room, hint, actionsHtml, opts = {}){
  const envChip = (!opts.hideEnv && (room.temperature!=null || (room.light_start && room.light_end))) ? `
    <span style="font-size:12px; font-weight:600; color:var(--teal-deep); background:var(--teal-soft); border-radius:7px; padding:3px 10px; display:inline-flex; gap:8px;">
      ${room.temperature!=null ? `${room.temperature}°C` : ''}
      ${room.light_start && room.light_end ? lightDurationLabel(room.light_start, room.light_end) : ''}
    </span>` : '';
  const meta = [room.location, room.manager ? `담당자 ${room.manager}` : ''].filter(Boolean).map(escapeHtml).join(' · ');
  return `
    <div class="panel-box-head">
      <div>
        <h3 style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">${escapeHtml(roomLabel(room.name))}${opts.nameNote ? ` <span style="font-size:12.5px; font-weight:800; color:var(--ink);">${escapeHtml(opts.nameNote)}</span>` : ''} ${roomStateBadgesHtml(room)} ${envChip}</h3>
        <p>${meta ? meta + ' · ' : ''}${hint}</p>
      </div>
      <div style="display:flex; align-items:center; gap:6px; flex-shrink:0; flex-wrap:wrap; justify-content:flex-end;">${actionsHtml || ''}
      </div>
    </div>
    ${roomStateNoticeHtml(room)}`;
}

// 베드 맵 아래 작물 색 범례 (지금 심겨 있는 작물만)
function bedMapLegendHtml(room){
  if(!room || !room.id) return '';
  const cropNames = [...new Set(materials.filter(m=> m.room_id===room.id && !m.harvest_confirmed_at).map(m=> m.name).filter(Boolean))];
  return cropNames.length ? `
    <div class="crop-legend" style="margin:14px 0 0;">
      ${cropNames.map(n=>`<span class="legend-chip"><span class="legend-dot" style="background:${cropColor(n)};"></span>${escapeHtml(n)}</span>`).join('')}
    </div>` : '';
}

// 계통작성의 베드 맵: 수요조사처럼 늘 여러 자리를 고르는 상태다 (누를 때마다 고름/풀림, 고른 칸에 ✓, 베드 이름을 누르면 두 층이 함께)
function workBedMapHtml(room, info){
  return bedMapHtml(room, info, {
    multi: true,
    isSelected: (bedNo, floor)=> workMultiSpots.has(workSpotKey(bedNo, floor)),
    pickFn: 'toggleWorkMultiSpot',
    bedPickFn: 'toggleWorkMultiBed'
  });
}

// 수요조사의 베드 맵: 계통작성과 같은 모양이고, 늘 여러 자리를 고르는 상태다 (고른 칸에 ✓, 베드 이름을 누르면 두 층이 함께).
// plain: 이미 등록된 계통 · 계획은 그리지 않고 '1층 · 2층' 칸만 보여준다
function surveyBedMapHtml(room, info){
  return bedMapHtml(room, info, {
    plain: true,
    multi: true,
    isSelected: (bedNo, floor)=> surveySelectedBeds.has(bedNo+'|'+floor),
    pickFn: 'selectSurveyBed',
    bedPickFn: 'toggleSurveyBedFloors'
  });
}

// 베드 맵 공통 그리기. 계통작성(workBedMapHtml)과 수요조사(surveyBedMapHtml)가 같은 모양을 쓴다.
//  opts.multi: 여러 자리를 고르는 맵인가 (✓ 표시, 베드 이름 눌러 두 층 선택) · opts.isSelected(bedNo, floor): 고른 칸인가
//  opts.pickFn: 칸을 눌렀을 때 부를 함수 이름 · opts.bedPickFn: 베드 이름을 눌렀을 때 부를 함수 이름
//  opts.plain: 심긴 계통 · 계획 없이 층 이름만 있는 칸으로 그린다 (수요조사)
function bedMapHtml(room, info, opts){
  const multi = !!opts.multi, plain = !!opts.plain;
  const colsPerRow = ROOM_COLS_PER_ROW[room.name] || info.bedCount;
  const layout = ROOM_BED_LAYOUT[room.name];
  let topOrder, bottomOrder;
  if(layout){ topOrder = layout.top; bottomOrder = layout.bottom; }
  else {
    topOrder = []; bottomOrder = [];
    for(let i=1;i<=info.bedCount;i++){ (i<=colsPerRow ? topOrder : bottomOrder).push(i); }
  }
  // 한 칸 = 한 베드의 한 층: 심긴 계통 이름 + 수확 D-day. 비어 있으면 '빈 자리'(분기별 계획이 있으면 📅)
  // aisle=true: 인공교배실의 통로. 베드 사이 띠 전체가 하나의 자리(버튼)이고, 입구는 왼쪽 끝에 둔다
  const slot = (bedNo, floor, aisle = false)=>{
    const list = plain ? [] : workSpotBatches(room, bedNo, floor);
    const selected = opts.isSelected(bedNo, floor);
    const floorLabel = (!aisle && !plain && info.bedFloors===2) ? `<span class="wbed-floor">${floor}</span>` : '';
    const check = (multi && selected) ? `<span class="wbed-check">✓</span>` : '';
    const entrance = aisle ? `<span class="survey-bed-entrance">입구</span>` : '';
    const attrs = `onclick="${opts.pickFn}(${bedNo}, '${floor}')"`;
    if(!list.length){
      const planned = plain ? [] : bedPlansAt(room.name, bedNo, floor).filter(x=> x.when!=='past');
      const tip = plain ? (aisle ? '통로도 선택할 수 있어요' : '') : planned.length ? `계획 있음 · ${planTitleText(planned[0].p)}` : (aisle ? '통로 · 빈 자리' : '빈 자리');
      return `
        <button type="button" class="wbed-slot ${aisle ? 'aisle' : ''} empty ${selected ? 'selected' : ''}" ${attrs}${tip ? ` title="${escapeHtml(tip)}"` : ''}>
          ${check}${entrance}${floorLabel}
          <span class="wbed-main" style="color:var(--ink-faint);">${aisle ? '통로(선택가능)' : plain ? floor : '빈 자리'}</span>
          ${planned.length ? `<span class="wbed-sub"><span class="wbed-chip plan">📅 계획</span></span>` : ''}
        </button>`;
    }
    const b = list[0];
    const color = cropColor(b.name);
    const nextHarvest = list.filter(m=> m.harvest_date).sort((x, y)=> x.harvest_date.localeCompare(y.harvest_date))[0];
    const stat = nextHarvest ? workRowStatus(nextHarvest.harvest_date) : null;
    const tip = list.map(m=> [batchTitleOf(m), (m.name && m.name !== batchTitleOf(m)) ? m.name : '', m.generation].filter(Boolean).join(' · ')).join('\n');
    const chips = [
      list.some(m=> m.record_type==='heat_test') ? `<span class="wbed-chip heat">고온검정</span>` : '',
      list.some(m=> batchPurposeOf(m)==='인공교배') ? `<span class="wbed-chip cross">인공교배</span>` : '',
      list.some(m=> batchPurposeOf(m)==='기타') ? `<span class="wbed-chip etc">기타</span>` : '',
      stat ? `<span class="wbed-chip" style="${stat.style}">${stat.label}</span>` : ''
    ].join('');
    // 재료가 있는 칸에는 늘 '사용중 N' 뱃지를 붙인다 (계통번호 줄 아래 뱃지 줄 맨 앞). 고르면 칸 전체가 주황 테두리로 바뀐다
    const usedChip = `<span class="wbed-chip used">사용중 ${list.length}</span>`;
    return `
      <button type="button" class="wbed-slot filled ${aisle ? 'aisle' : ''} ${selected ? 'selected' : ''}" ${attrs} title="${escapeHtml(tip)}">
        ${check}${entrance}${floorLabel}
        <span class="wbed-main">
          <span class="crop-dot" style="background:${color}; width:9px; height:9px;"></span>
          <span class="wbed-name" style="color:${color};">${escapeHtml(batchTitleOf(b))}</span>
          ${list.length>1 ? `<span class="wbed-more">외 ${list.length-1}</span>` : ''}
        </span>
        <span class="wbed-sub">${usedChip}${chips}</span>
      </button>`;
  };
  const col = (bedNo)=> `
    <div class="survey-bed-col">
      <div class="survey-bed-col-title ${multi ? 'wbed-title-pick' : ''}" ${multi ? `onclick="${opts.bedPickFn}(${bedNo})" title="${info.bedFloors===2 ? '두 층을 함께 선택 · 해제' : '선택 · 해제'}"` : ''}>베드 ${bedNo}</div>
      ${info.floors.map(fl=> slot(bedNo, fl)).join('')}
    </div>`;
  const grid = (order)=> `<div class="survey-bed-grid">${order.map(col).join('')}</div>`;
  // 통로 띠: 입구는 왼쪽 끝, 통로는 가운데. 인공교배실 1·2는 이 띠가 하나의 자리라서 눌러서 계통을 등록할 수 있다
  const corridor = AISLE_ROOMS.has(room.name)
    ? slot(AISLE_BED_NO, AISLE_FLOOR, true)
    : `<div class="survey-bed-corridor"><span class="survey-bed-entrance">입구</span>통&nbsp;&nbsp;로</div>`;
  return grid(topOrder) + (bottomOrder.length ? `${corridor}${grid(bottomOrder)}` : '');
}

// ③ 작성 패널: 선택한 자리의 계통 카드(편집 · 수확 · 복사 · 삭제)와 집단 추가
function renderWorkWritePanel(room){
  const wrap = document.getElementById('workRoomDetail');
  if(!wrap) return;
  renderWorkHarvestPanel(room);
  // 집단 추가 · 복사 입력칸이 열려 있으면 그대로 둔다. 다른 사람이 저장해서 화면이 다시 그려져도 입력하던 내용이 지워지지 않게 하려는 것.
  // (다른 방이나 자리를 눌러 선택이 바뀌었으면 입력칸을 닫고 아래에서 평소 패널을 그린다)
  if(batchCompose){
    if(room && batchCompose.auto){
      // 자리를 눌러 저절로 열린 입력칸: 자리를 더 누르거나 빼도 입력하던 내용은 두고 자리 목록 · 개체수 칸만 맞춘다
      // (같은 방에서 아직 입력칸이 열려야 하는 선택일 때만. 계통이 있는 자리 하나만 남았거나 방이 바뀌면 닫는다)
      if(batchCompose.roomId===room.id && workAutoComposeWanted(room) && wrap.querySelector('.batch-compose')){ refreshWorkMultiCompose(room); return; }
    } else if(room && batchCompose.sig===workSelectionSig() && wrap.querySelector('.batch-compose')) return;
    batchCompose = null;
  }
  if(!room){
    wrap.innerHTML = `<div class="empty-materials" style="padding:60px 20px;">방을 선택하면 여기서<br>재료를 등록 · 수정할 수 있어요</div>`;
    return;
  }
  const info = workRoomInfo(room);
  if(!info.bedCount){
    // 베드 구조가 없는 방: 재료 표로 관리
    const roomMaterials = materials.filter(m=> m.room_id===room.id);
    wrap.innerHTML = `
      <div class="panel-box-head"><div><h3>${escapeHtml(roomLabel(room.name))}</h3><p>재료 표</p></div></div>
      ${roomMaterials.length ? `
      <table>
        <thead>
          <tr>
            <th style="width:26%">재료명</th>
            <th style="width:22%">수량</th>
            <th style="width:18%">보관 위치</th>
            <th style="width:14%">유통기한</th>
            <th style="width:12%">담당자</th>
            ${isAdmin ? '<th style="width:8%"></th>' : ''}
          </tr>
        </thead>
        <tbody>${roomMaterials.map(m=>materialRow(m)).join('')}</tbody>
      </table>` : `<div class="empty-materials">등록된 재료가 없어요.${isAdmin?' 아래 버튼으로 추가해보세요.':''}</div>`}
      ${isAdmin ? `<button class="add-row-btn" onclick="addMaterial('${room.id}')">+ 재료 추가</button>` : ''}
    `;
    return;
  }
  // 빈 자리를 누르거나 두 자리 이상 골랐으면 바로 작성 칸(자리마다 개체수 칸), 계통이 있는 자리 하나만 골랐으면 그 자리의 계통 카드, 아무것도 안 골랐으면 안내
  if(workAutoComposeWanted(room)){ openBatchLocationModal(room.id, null, { multi: workMultiTargets() }); return; }
  const roomOff = !roomIsActive(room);
  const offNote = roomOff ? `<div class="room-state-notice off">사용 중지된 방이라 새 계통은 등록할 수 없어요. 심겨 있는 계통 조회 · 수정 · 수확은 할 수 있어요.</div>` : '';
  // 사용 중지된 방에서 여러 자리를 골랐으면: 작성 칸 대신 사용중 상자와 [한번에 수확]만 보여 준다
  if(roomOff && workMultiSpots.size > 1){
    const targets = workMultiTargets();
    wrap.innerHTML = `
      <div class="panel-box-head"><div><h3>선택한 자리 ${targets.length}곳</h3><p>${escapeHtml(roomLabel(room.name))}</p></div></div>
      ${offNote}
      ${workMultiLocationHtml(room, targets)}`;
    return;
  }
  const spot = workOnlySpot();
  if(!spot){
    wrap.innerHTML = `
      <div class="panel-box-head"><div><h3>작성</h3><p>가운데 베드 맵에서 자리를 선택해주세요 (여러 개 선택 가능)</p></div></div>
      <div class="empty-materials" style="padding:36px 20px;">베드와 층을 선택해주세요 (여러 개 선택 가능)</div>`;
    return;
  }
  const list = workSpotBatches(room, spot.bedNo, spot.floor);
  const addBtn = (canWriteMaterials() && !roomOff) ? `<button class="add-batch-btn" onclick="confirmAddBatch('${room.id}', ${spot.bedNo}, '${spot.floor}', true)">+ 집단 추가</button>` : '';
  // 접힌 계통 카드는 위 주황 상자와 내용이 겹쳐서 그리지 않는다 ([수확] · [편집] 버튼은 상자의 각 줄로 옮겼다).
  // [편집]을 눌러 펼친 카드와, 아직 내용이 비어 있는 카드(바로 입력 양식)는 저장 · 복사 · 삭제를 해야 하므로 그대로 보여 준다.
  const editCards = canWriteMaterials() ? list.filter(b=> expandedBatchIds.has(b.id) || !(b.name || b.line_no)).map(b=> batchCardHtml(b)).join('') : '';
  wrap.innerHTML = `
    <div class="panel-box-head">
      <div>
        <h3>${isAisleSpot(spot.bedNo) ? '통로' : `베드 ${spot.bedNo}${info.bedFloors===2 ? ` · ${escapeHtml(spot.floor)}` : ''}`}</h3>
        <p>${escapeHtml(roomLabel(room.name))} · ${list.length ? `계통 ${list.length}개` : '비어 있는 자리'}</p>
      </div>
      ${list.length ? `<span class="wbed-chip used" style="flex-shrink:0; font-size:11px; padding:3px 10px;">사용중 ${list.length}</span>` : ''}
    </div>
    ${offNote}
    <div style="margin-bottom:12px;">${workSpotOccupancyHtml(room, [spot], { actions: true })}</div>
    ${list.length ? editCards + addBtn : `<div class="empty-chip">등록된 작물이 없어요</div>`}
  `;
}

// 수확 완료 목록: 작성 칸(#workRoomDetail) 아래의 따로 떨어진 칸에 그린다. 방을 안 골랐거나 작성 권한이 없으면 칸을 숨긴다.
function renderWorkHarvestPanel(room){
  const box = document.getElementById('workHarvestPanel');
  if(!box) return;
  const html = room ? recentHarvestedHtml(room.id) : '';
  box.innerHTML = html;
  box.style.display = html ? '' : 'none';
}

// 자리를 눌러서 작성 칸이 저절로 열려야 하는 선택인지: 두 자리 이상 골랐거나, 비어 있는 자리 하나를 골랐을 때
// (계통이 있는 자리 하나는 그 자리의 계통 카드를 보여주고, 더 심으려면 [+ 집단 추가]를 누른다)
function workAutoComposeWanted(room){
  if(!canWriteMaterials()) return false;
  if(!roomIsActive(room)) return false;   // 사용 중지된 방은 작성 칸을 열지 않는다 (조회 · 수확만)
  if(workMultiSpots.size > 1) return true;
  const only = workOnlySpot();
  return !!only && workSpotBatches(room, only.bedNo, only.floor).length === 0;
}

function innerCorridorHtml(topOrder, bottomOrder, aisleList){
  // 인공교배실의 통로에 계통이 있으면, 띠 안에 입구 · 통로 이름표와 계통 카드를 함께 담는다
  if(aisleList && aisleList.length){
    return `
      <div class="inner-corridor aisle-filled">
        <div class="aisle-head">
          <span class="entrance-label">입구</span>
          <span class="corridor-text">통&nbsp;&nbsp;로</span>
          <span class="aisle-count">${aisleList.length}집단</span>
        </div>
        ${structColsWrapper(aisleList, aisleList.map(b=> `<div class="struct-col expanded">${spaceBatchCardHtml(b)}</div>`).join(''))}
      </div>`;
  }
  return `
    <div class="inner-corridor">
      <span class="entrance-label">입구</span>
      <span class="corridor-text">통&nbsp;&nbsp;로</span>
    </div>
  `;
}

function structColsWrapper(items, innerHtml){
  const many = items.length > 4;
  const cls = many ? 'struct-cols scrollable' : 'struct-cols';
  const style = many ? '' : ` style="grid-template-columns:repeat(${items.length}, 1fr);"`;
  return `<div class="${cls}"${style}>${innerHtml}</div>`;
}

function toggleBatchExpand(id){
  if(expandedBatchIds.has(id)) expandedBatchIds.delete(id);
  else expandedBatchIds.add(id);
  const sp = captureScrollPositions();
  renderDetail('work');
  restoreScrollPositions(sp);
}

let spaceDetailIds = new Set(); // 종합현황(공간뷰)에서 "자세히 보기"로 펼쳐본 계통 id들

function toggleSpaceCardDetail(id){
  if(spaceDetailIds.has(id)) spaceDetailIds.delete(id);
  else spaceDetailIds.add(id);
  // 다시 그리면 가로로 밀어 둔 베드 줄과 팝업 · 화면의 세로 스크롤이 맨 앞으로 돌아가므로, 그리기 전에 저장했다가 되돌린다
  const modalScroller = document.getElementById('roomDetailModalBody')?.parentElement;
  const sp = captureScrollPositions();
  const modalTop = modalScroller ? modalScroller.scrollTop : 0;
  const pageX = window.scrollX, pageY = window.scrollY;
  renderDetail();
  if(modalRoomId) renderDetail('modal');
  restoreScrollPositions(sp);
  if(modalScroller) modalScroller.scrollTop = modalTop;
  window.scrollTo(pageX, pageY);
}

// 계통 카드에 붙는 사용 목적 표시 (세대단축은 표시하지 않는다. 고온검정은 카드마다 따로 그린다)
function batchPurposeBadgeHtml(b){
  const p = batchPurposeOf(b);
  if(p==='인공교배') return `<span class="task-worker-badge" style="background:#E7EEF9; color:#2F5DA8; white-space:nowrap; flex-shrink:0;">인공교배용</span>`;
  if(p==='기타') return `<span class="task-worker-badge" style="background:#EFE8F7; color:#6A3FA0; white-space:nowrap; flex-shrink:0;">기타 실험</span>`;
  return '';
}

// 고온검정 계통의 품종 목록: 계통/품종 칸의 글자를 쉼표로 나눈다 (끝에 적힌 '(3반복)' 같은 글자는 뗀다)
const VARIETY_SPLIT = /[,，、·\n]/;

function stripRepeatSuffix(s){ return String(s ?? '').replace(/\s*[(（]?\s*\d+\s*반복\s*[)）]?\s*$/, '').trim(); }

function heatVarietiesOf(b){ return stripRepeatSuffix(b.line_no).split(VARIETY_SPLIT).map(s=> s.trim()).filter(Boolean); }

// 고온검정 카드 제목: 품종이 여러 개면 '대원콩 외 4개' (전체 목록은 마우스를 올리거나 카드를 펼치면 보인다). 하나뿐이면 그대로
function heatTitleParts(b){
  const v = heatVarietiesOf(b);
  return { first: v[0] || batchTitleOf(b), more: v.length > 1 ? `외 ${v.length - 1}개` : '' };
}

function heatTitleOf(b){ const t = heatTitleParts(b); return t.more ? `${t.first} ${t.more}` : t.first; }

// 좁은 카드용 제목: 자리가 모자라면 첫 품종 이름만 줄어들고 '외 4개'는 늘 보인다
function heatTitleHtml(b){
  const t = heatTitleParts(b);
  return `<span style="display:flex; align-items:baseline; gap:4px; min-width:0;"><span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0;">${escapeHtml(t.first)}</span>${t.more ? `<span style="flex-shrink:0; white-space:nowrap;">${t.more}</span>` : ''}</span>`;
}

// '고온검정용' 뱃지: 좁은 카드에서도 글자가 세로로 쪼개지지 않게 한 줄로 고정한다 (다른 목적 뱃지와 같다). tight: 바깥 여백을 없앤다 (공간 모자랄 때)
function heatTestBadgeHtml(tight){ return `<span class="task-worker-badge" style="background:#FBEEDD; color:#C2410C; white-space:nowrap; flex-shrink:0;${tight ? ' margin-left:0;' : ''}">고온검정용</span>`; }

// 끝내는 버튼 이름: 세대단축은 수확, 인공교배는 사용완료, 기타는 실험완료
function batchDoneLabel(b){ return { '인공교배':'사용완료', '기타':'실험완료' }[batchPurposeOf(b)] || '수확'; }

// 세대단축 · 인공교배 · 기타 계통 카드의 내용 줄들 (고온검정은 카드마다 따로 그린다)
function batchDetailLinesHtml(b){
  const p = batchPurposeOf(b), e = escapeHtml;
  const ln = (s, style = 'color:var(--ink-soft);')=> `<div style="font-size:13px; ${style}">${s}</div>`;
  const out = [];
  const nw = (d)=> `<span style="white-space:nowrap;">${d}</span>`;   // 날짜는 줄이 바뀌어도 가운데서 끊기지 않게
  if(p==='기타'){
    if(b.purpose) out.push(ln(`실험 내용: ${e(b.purpose)}`));
    if(b.test_condition) out.push(ln(`처리 조건: ${e(b.test_condition)}`));
    if(b.quantity!=null) out.push(ln(`규모: ${e(String(b.quantity))}개`));
    if(b.manager) out.push(ln(`담당: ${e(b.manager)}`));
    if(b.sowing_date) out.push(`<div class="bd-period" style="font-size:12.5px; color:var(--ink-faint);">기간 ${nw(b.sowing_date)}${b.harvest_date ? ` → ${nw(b.harvest_date)}` : ''}</div>`);
    return out.join('');
  }
  const cross = p==='인공교배';
  out.push(`<div style="font-size:13px; color:var(--ink-soft); display:flex; gap:12px; flex-wrap:wrap;"><span>교배조합: ${b.cross_combo ? e(crossComboLabel(b)) : '-'}</span>${(cross && !b.generation) ? '' : `<span>세대: ${b.generation ? e(b.generation) : '-'}</span>`}</div>`);
  if(b.purpose) out.push(ln(`목적: ${e(b.purpose)}`));
  if(b.test_condition) out.push(ln(`처리 조건: ${e(b.test_condition)}`));
  if(b.quantity!=null) out.push(ln(`규모: ${e(String(b.quantity))}개`));
  if(b.manager) out.push(ln(`담당: ${e(b.manager)}`));
  if(b.sowing_date) out.push(`<div class="bd-period" style="font-size:12.5px; color:var(--ink-faint);">${cross ? '사용' : '파종'} ${nw(b.sowing_date)}${b.harvest_date ? ` → ${cross ? '종료' : '수확예정'} ${nw(b.harvest_date)}` : ''}</div>`);
  return out.join('');
}

function spaceBatchCardHtml(b){
  const color = cropColor(b.name);
  const isHeatTest = b.record_type==='heat_test';
  const isDetailed = spaceDetailIds.has(b.id);
  const label = escapeHtml(batchTitleOf(b));
  const toggleBtn = `<button class="btn small" onclick="toggleSpaceCardDetail('${b.id}')" title="${isDetailed?'접기':'자세히 보기'}" style="padding:3px 7px; font-size:11px; flex-shrink:0; line-height:1;">${isDetailed ? '▴' : '▾'}</button>`;

  if(isHeatTest){
    const badge = heatTestBadgeHtml();
    // 품종이 여러 개면 제목은 '대원콩 외 4개'로 줄이고, 전체 목록은 마우스를 올리거나(툴팁) 카드를 펼치면 보인다
    const varieties = heatVarietiesOf(b);
    const title = escapeHtml(heatTitleOf(b)), full = escapeHtml(varieties.length ? varieties.join(', ') : batchTitleOf(b));
    const qty = b.quantity!=null ? `<span style="font-size:12px; color:var(--ink-faint); font-weight:700; white-space:nowrap;">${Number(b.quantity).toLocaleString()}개</span>` : '';
    if(!isDetailed){
      return `
        <div class="batch-card" style="gap:6px; padding:10px 11px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
            <div style="font-weight:800; font-size:14px; display:flex; align-items:center; gap:6px; min-width:0; overflow:hidden;">
              <span title="${full}" style="color:${color}; display:flex; min-width:0;">${heatTitleHtml(b)}</span>${heatTestBadgeHtml(true)}
            </div>
            <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">${qty}${toggleBtn}</div>
          </div>
        </div>
      `;
    }
    return `
      <div class="batch-card" style="gap:7px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <div style="font-weight:800; font-size:15px; display:flex; align-items:center; gap:7px; min-width:0;">
            <span style="color:${color};">${title}</span>${badge}
          </div>
          ${toggleBtn}
        </div>
        <div class="card-extra">
          ${varieties.length > 1 ? `<div style="font-size:13px; color:var(--ink-soft);">품종 ${varieties.length}개: ${full}</div>` : ''}
          ${b.purpose ? `<div style="font-size:13px; color:var(--ink-soft);">검정 목적: ${escapeHtml(b.purpose)}</div>` : ''}
          ${b.test_condition ? `<div style="font-size:13px; color:var(--ink-soft);">처리 조건: ${escapeHtml(b.test_condition)}</div>` : ''}
          ${b.quantity!=null ? `<div style="font-size:13px; color:var(--ink-soft);">규모: ${escapeHtml(String(b.quantity))}개</div>` : ''}
        </div>
      </div>
    `;
  }

  const pct = growthProgress(b.sowing_date, b.harvest_date);
  if(!isDetailed){
    return `
      <div class="batch-card" style="gap:6px; padding:10px 11px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <div style="font-weight:800; font-size:14px; display:flex; align-items:center; gap:2px 6px; min-width:0; overflow:hidden; flex-wrap:wrap;">
            <span class="crop-dot" style="background:${color}; width:9px; height:9px; flex-shrink:0;"></span>
            <span title="${label}" style="color:${color}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${label}</span>${batchPurposeBadgeHtml(b)}
          </div>
          <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
            ${b.quantity!=null ? `<span style="font-size:12px; color:var(--ink-faint); font-weight:700; white-space:nowrap;">${Number(b.quantity).toLocaleString()}개</span>` : ''}
            ${toggleBtn}
          </div>
        </div>
        ${pct!=null ? `<div class="progress-wrap"><div class="progress-track"><div class="progress-fill" style="width:${pct.toFixed(0)}%; background:${pct>=100?'var(--danger)':color};"></div></div></div>` : ''}
      </div>
    `;
  }

  const histBadge = historySummary(b.id) ? `<div onclick="openHistoryModal('${b.id}')" style="cursor:pointer; font-size:11px; font-weight:700; color:var(--amber); background:#FBEEDD; border-radius:8px; padding:6px 10px;">세대 이력: ${historySummary(b.id)}</div>` : '';
  const progressHtml = pct!=null ? `
    <div class="progress-wrap">
      <div class="progress-track"><div class="progress-fill" style="width:${pct.toFixed(0)}%; background:${pct>=100?'var(--danger)':color};"></div></div>
      <div class="progress-label">${daysLeftLabel(b.harvest_date)}</div>
    </div>
  ` : '';
  return `
    <div class="batch-card" style="gap:7px;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <div style="font-weight:800; font-size:15px; display:flex; align-items:center; gap:7px; min-width:0;">
          <span class="crop-dot" style="background:${color}; width:9px; height:9px; flex-shrink:0;"></span><span style="color:${color};">${label}</span>${batchPurposeBadgeHtml(b)}
        </div>
        ${toggleBtn}
      </div>
      <div class="card-extra">
        ${batchDetailLinesHtml(b)}
        ${histBadge}
        ${progressHtml}
      </div>
    </div>
  `;
}

function batchCardHtml(b){
  const color = cropColor(b.name);
  const isHeatTest = b.record_type==='heat_test';
  const pct = growthProgress(b.sowing_date, b.harvest_date);
  const progressHtml = pct!=null ? `
    <div class="progress-wrap">
      <div class="progress-track"><div class="progress-fill" style="width:${pct.toFixed(0)}%; background:${pct>=100?'var(--danger)':color};"></div></div>
      <div class="progress-label">${daysLeftLabel(b.harvest_date)}</div>
    </div>
  ` : '';
  const histBadge = historySummary(b.id) ? `<div onclick="openHistoryModal('${b.id}')" style="cursor:pointer; font-size:11px; font-weight:700; color:var(--amber); background:#FBEEDD; border-radius:8px; padding:6px 10px;">세대 이력: ${historySummary(b.id)}</div>` : '';

  const hasData = !!(b.name || b.line_no);
  const isExpanded = expandedBatchIds.has(b.id);

  if(!canWriteMaterials() || (hasData && !isExpanded)){
    const writableAndFilled = canWriteMaterials() && hasData;
    if(isHeatTest){
      return `
        <div class="batch-card" style="gap:7px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
            <div style="font-weight:800; font-size:15px; display:flex; align-items:center; gap:7px; min-width:0;">
              <span style="color:${color};">${escapeHtml(batchTitleOf(b))}</span>
              ${heatTestBadgeHtml()}
            </div>
            <div style="display:flex; gap:6px; flex-shrink:0;">
              ${writableAndFilled ? `<button class="btn small" onclick="completeHeatTest('${b.id}')" style="padding:4px 9px; font-size:11px; color:var(--amber); border-color:var(--amber);">검정완료</button>` : ''}
              ${writableAndFilled ? `<button class="btn small" onclick="toggleBatchExpand('${b.id}')" style="padding:4px 9px; font-size:11px;">편집</button>` : ''}
              ${writableAndFilled ? `<button class="btn small" onclick="deleteMaterial('${b.id}')" style="padding:4px 9px; font-size:11px; color:var(--danger); border-color:var(--danger);">삭제</button>` : ''}
            </div>
          </div>
          <div class="card-extra">
            ${b.purpose ? `<div style="font-size:13px; color:var(--ink-soft);">검정 목적: ${escapeHtml(b.purpose)}</div>` : ''}
            ${b.test_condition ? `<div style="font-size:13px; color:var(--ink-soft);">처리 조건: ${escapeHtml(b.test_condition)}</div>` : ''}
            ${b.quantity!=null ? `<div style="font-size:13px; color:var(--ink-soft);">규모: ${escapeHtml(String(b.quantity))}개</div>` : ''}
            ${b.manager ? `<div style="font-size:13px; color:var(--ink-soft);">담당: ${escapeHtml(b.manager)}</div>` : ''}
            ${b.sowing_date ? `<div style="font-size:12.5px; color:var(--ink-faint);">기간 ${b.sowing_date}${b.harvest_date ? ` → ${b.harvest_date}` : ''}</div>` : ''}
          </div>
        </div>
      `;
    }
    return `
      <div class="batch-card" style="gap:7px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <div style="font-weight:800; font-size:15px; display:flex; align-items:center; gap:7px; min-width:0;">
            <span class="crop-dot" style="background:${color}; width:9px; height:9px; flex-shrink:0;"></span><span style="color:${color};">${escapeHtml(batchTitleOf(b))}</span>${batchPurposeBadgeHtml(b)}
          </div>
          <div style="display:flex; gap:6px; flex-shrink:0;">
            ${writableAndFilled ? `<button class="btn small" onclick="harvestAndReplant('${b.id}')" style="padding:4px 9px; font-size:11px; color:var(--amber); border-color:var(--amber);">${batchDoneLabel(b)}</button>` : ''}
            ${writableAndFilled ? `<button class="btn small" onclick="toggleBatchExpand('${b.id}')" style="padding:4px 9px; font-size:11px;">편집</button>` : ''}
            ${writableAndFilled ? `<button class="btn small" onclick="deleteMaterial('${b.id}')" style="padding:4px 9px; font-size:11px; color:var(--danger); border-color:var(--danger);">삭제</button>` : ''}
          </div>
        </div>
        <div class="card-extra">
          ${batchDetailLinesHtml(b)}
          ${histBadge}
          ${progressHtml}
        </div>
      </div>
    `;
  }
  return `
    <div class="batch-card" data-batch-id="${b.id}" data-bf-root data-bf-mode="edit">
      ${hasData ? `<div style="display:flex; justify-content:flex-end;"><button class="btn small" onclick="toggleBatchExpand('${b.id}')" style="padding:4px 9px; font-size:11px;">▲ 접기</button></div>` : ''}
      ${batchFormHtml(batchFormValues(b), 'edit', { progressHtml, histHtml: histBadge })}

      <div class="batch-actions">
        <button class="batch-save-btn" onclick="saveBatchCard('${b.id}', this)">저장</button>
        <button class="batch-del-btn" onclick="openCopyModal('${b.id}')" style="color:var(--teal-deep);">복사</button>
        <button class="batch-del-btn" onclick="deleteMaterial('${b.id}')">삭제</button>
      </div>
    </div>
  `;
}

function materialRow(m){
  let expClass = '';
  if(m.expiry_date){
    const days = daysBetween(todayKST(), m.expiry_date);
    if(days < 0) expClass = 'expiry-over';
    else if(days < 14) expClass = 'expiry-warn';
  }
  if(!isAdmin){
    return `
      <tr>
        <td>${escapeHtml(m.name||'')}</td>
        <td>${m.quantity ?? ''} ${escapeHtml(m.unit||'')}</td>
        <td>${escapeHtml(m.location_detail||'')}</td>
        <td class="${expClass}">${m.expiry_date||''}</td>
        <td>${escapeHtml(m.manager||'')}</td>
      </tr>
    `;
  }
  return `
    <tr data-mat-id="${m.id}">
      <td><input class="editable" data-field="name" value="${escapeHtml(m.name||'')}" /></td>
      <td>
        <div class="qty-cell">
          <button class="step-btn" onclick="stepQty('${m.id}', -1)">−</button>
          <input class="editable" data-field="quantity" type="number" value="${m.quantity ?? ''}" />
          <button class="step-btn" onclick="stepQty('${m.id}', 1)">+</button>
          <input class="editable" data-field="unit" style="width:48px" placeholder="단위" value="${escapeHtml(m.unit||'')}" />
        </div>
      </td>
      <td><input class="editable" data-field="location_detail" value="${escapeHtml(m.location_detail||'')}" /></td>
      <td><input class="editable ${expClass}" data-field="expiry_date" type="date" value="${m.expiry_date||''}" /></td>
      <td><input class="editable" data-field="manager" value="${escapeHtml(m.manager||'')}" /></td>
      <td style="white-space:nowrap;">
        <button class="btn small primary" onclick="saveMaterialRow('${m.id}', this)">저장</button>
        <button class="btn danger-text small" onclick="deleteMaterial('${m.id}')">삭제</button>
      </td>
    </tr>
  `;
}

async function saveMaterialRow(id, btnEl){
  if(tourBlockWrite()) return;
  const row = btnEl.closest('tr');
  const get = (f)=> row.querySelector(`[data-field="${f}"]`).value;
  const payload = {
    name: get('name').trim(),
    quantity: get('quantity')===''? null : get('quantity'),
    unit: get('unit') || null,
    location_detail: get('location_detail') || null,
    expiry_date: get('expiry_date') || null,
    manager: get('manager') || null,
    updated_at: new Date().toISOString()
  };
  const { error } = await sb.from('materials').update(payload).eq('id', id);
  if(error){ alert('저장 실패!\n\n' + (error.message||JSON.stringify(error))); return; }
  showToast('저장됐어요');
  await loadAll();
}

async function saveBatchCard(id, btnEl){
  if(tourBlockWrite()) return;
  const card = btnEl.closest('.batch-card');
  // 선택한 사용 목적(세대단축 · 인공교배 · 고온검정 · 기타)의 칸만 읽는다
  const form = readBatchForm(card);
  const payload = form.payload, name = payload.name;
  const cur = materials.find(m=> m.id===id);

  // 사용 목적(인공교배 · 기타)은 use_purpose에 담는다. 세대단축 · 고온검정은 컬럼이 이미 있을 때만 비워 둔다(없는 컬럼은 건드리지 않는다)
  const needsPurposeCol = form.purpose==='인공교배' || form.purpose==='기타';
  if(needsPurposeCol) payload.use_purpose = form.purpose;
  else if(cur && 'use_purpose' in cur) payload.use_purpose = null;

  tidyCrossExtra(payload, cur);   // '외 N조합': 값이 없고 원래도 없던 계통이면 칸을 아예 보내지 않는다
  btnEl.textContent = '저장 중...';
  let { error } = await sb.from('materials').update(payload).eq('id', id);
  let purposeDropped = false, crossDropped = false;
  // 컬럼이 아직 없으면(use_purpose · cross_extra), 그 항목만 빼고 다시 저장해서 내용 자체는 잃지 않게 한다
  for(let tries = 0; error && tries < 2; tries++){
    if(needsPurposeCol && !purposeDropped && /use_purpose/.test(error.message||'')){ delete payload.use_purpose; purposeDropped = true; }
    else if(!crossDropped && isCrossExtraColError(error)){ delete payload.cross_extra; crossDropped = true; }
    else break;
    ({ error } = await sb.from('materials').update(payload).eq('id', id));
  }
  if(crossDropped && !error) crossExtraDroppedAlert();
  if(error){
    alert('저장 실패!\n\n' + (error.message||JSON.stringify(error)));
    btnEl.textContent = '저장';
    return;
  }
  // 세대단축의 예상기간만 작물별 기본 기간으로 기억한다 (인공교배 · 기타의 사용기간은 작물의 생육일수가 아니다)
  if(form.rememberDays){
    await sb.from('crop_profiles').upsert({ name, typical_days: payload.expected_days, updated_at: new Date().toISOString() });
  }
  expandedBatchIds.delete(id);
  showToast('저장됐어요');
  const scrollPositions = captureScrollPositions();
  await loadAll();
  restoreScrollPositions(scrollPositions);
  if(purposeDropped) alert('저장은 됐지만, 사용 목적(' + form.purpose + ')은 materials 테이블에 해당 컬럼이 없어 저장되지 않았어요.\n\n(관리자 확인 필요) Supabase SQL Editor에서 아래를 한 번 실행해주세요:\n\n' + MATERIAL_PURPOSE_SQL);
}

async function updateMaterial(id, field, value){
  if(tourBlockWrite()) return;
  const payload = { [field]: value === '' ? null : value, updated_at: new Date().toISOString() };
  const { error } = await sb.from('materials').update(payload).eq('id', id);
  if(error){ console.error(error); showToast('저장 실패'); }
  else { showToast('저장됨'); await loadAll(); }
}

async function stepQty(id, delta){
  if(tourBlockWrite()) return;
  const m = materials.find(x=>x.id===id);
  if(!m) return;
  const newQty = (Number(m.quantity)||0) + delta;
  await updateMaterial(id, 'quantity', newQty < 0 ? 0 : newQty);
}

async function addMaterial(roomId){
  if(tourBlockWrite()) return;
  const { error } = await sb.from('materials').insert({ room_id: roomId, name: '새 재료', quantity: 0 });
  if(error){ console.error(error); showToast('추가 실패'); }
  else await loadAll();
}

async function deleteAllMaterials(){
  if(tourBlockWrite()) return;
  if(!isAdmin){ alert('전체 관리자만 할 수 있어요.'); return; }
  if(!confirm(`정말로 계통작성의 모든 재료 데이터를 전부 삭제할까요?\n(현재 등록된 모든 계통·베드 정보가 사라져요, 되돌릴 수 없어요)`)) return;
  const typed = prompt('되돌릴 수 없는 작업이에요. 계속하려면 "삭제확인"이라고 입력해주세요.');
  if(typed !== '삭제확인'){ alert('입력이 일치하지 않아 취소됐어요.'); return; }
  const { error } = await sb.from('materials').delete().gte('created_at', '1900-01-01');
  if(error){ alert('삭제 실패!\n\n' + (error.message||JSON.stringify(error))); return; }
  showToast('계통작성 데이터가 모두 삭제됐어요');
  await loadAll();
}

async function deleteMaterial(id){
  if(tourBlockWrite()) return;
  if(!confirm('이 재료를 삭제할까요?')) return;
  const m = materials.find(x=> x.id===id);
  const { error } = await sb.from('materials').delete().eq('id', id);
  if(error){ showToast('삭제 실패'); return; }
  // 계통작성: 지운 계통이 있던 자리는 선택에서 뺀다 → 다음에 누르는 칸이 첫 번째로 고른 칸이 된다
  expandedBatchIds.delete(id);
  if(m && viewMode==='work' && m.structure_no != null) workMultiSpots.delete(workSpotKey(m.structure_no, m.floor));
  await loadAll();
}
