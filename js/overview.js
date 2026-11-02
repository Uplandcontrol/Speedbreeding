/* overview.js — [종합현황] 화면: 시설 배치도, 방 상세 보기, 공간 요약 카드, 환경 설정, 방 상태(정상·점검중), 방 추가·삭제 */

function cardHtmlFor(name){
  const room = rooms.find(r=> r.name === name);
  const displayLabel = roomLabel(name);
  if(isMutedRoom(name)){
    // 관리자는 쓸 수 있게 열 수 있는 칸(조사실 · 세대단축실 4)을 눌러 방 상태 설정(사용 가능 켜기)으로 들어간다. 그 밖의 사람에게는 예전처럼 눌리지 않는다
    const adminOpenable = isAdmin && OPENABLE_MUTED_ROOMS.has(name);
    if(!room){
      if(adminOpenable){
        return `<div class="room-card info-card" style="cursor:pointer;" onclick="quickCreateRoom('${name.replace(/'/g,"")}')" title="관리자: 눌러서 방을 만들고 '사용 가능'을 켤 수 있어요"><div>${escapeHtml(displayLabel)}<br><span style="font-size:11px;">미등록 · 눌러서 설정</span></div></div>`;
      }
      return `<div class="room-card info-card"><div>${escapeHtml(displayLabel)}<br><span style="font-size:11px;">미등록</span></div></div>`;
    }
    const items = materials.filter(m=>m.room_id===room.id && !m.harvest_confirmed_at);   // 수확 · 사용 완료로 자리를 비운 기록은 세지 않는다
    const statusLabel = items.length===0 ? '미사용' : '보관중';
    const statusClass = items.length===0 ? 'idle' : 'ok';
    const clickAttr = adminOpenable ? `onclick="openRoomDetailModal('${room.id}')" title="관리자: 눌러서 방 상태 · 사용 가능을 설정해요"` : 'style="cursor:default;"';
    return `<div class="room-card muted-room ${roomIsActive(room)?'':'inactive-room'}" ${clickAttr}>
      <div class="top-row" style="align-items:flex-start;">
        <div>
          <div class="rname" style="margin:0;">${escapeHtml(displayLabel)}</div>
          ${roomStateBadgesHtml(room) ? `<div class="room-state-badges">${roomStateBadgesHtml(room)}</div>` : ''}
        </div>
        <span class="room-status-badge ${statusClass}">${statusLabel}</span>
      </div>
      ${items.length>0 ? `<div class="room-summary">${items.length}종 보관 중</div>` : ''}
    </div>`;
  }
  if(!room){
    if(!isAdmin){
      return `<div class="room-card info-card"><div>${escapeHtml(name)}<br><span style="font-size:11px;">미등록</span></div></div>`;
    }
    return `<div class="room-card placeholder" onclick="quickCreateRoom('${name.replace(/'/g,"")}')">
      <div class="placeholder-label">${escapeHtml(name)}</div>
      <div class="placeholder-hint">+ 클릭해서 방 만들기</div>
    </div>`;
  }
  const items = materials.filter(m=>m.room_id===room.id && !m.harvest_confirmed_at);   // 수확 · 사용 완료로 자리를 비운 기록은 세지 않는다 (방 상세 · 상단 통계와 같은 기준)
  const total = items.reduce((s,m)=> s + (Number(m.quantity)||0), 0);
  const topItems = items.slice(0,2).map(m=> `${escapeHtml(m.name)} (${m.quantity ?? 0}${escapeHtml(m.unit||'')})`);
  const moreCount = items.length - topItems.length;
  const summary = items.length
    ? topItems.join(', ') + (moreCount>0 ? `<span class="more"> 외 ${moreCount}종</span>` : '')
    : '등록된 재료 없음';
  const cropNames = [...new Set(items.map(m=>m.name).filter(Boolean))];

  let displaySummary = summary;

  if(cropNames.length === 1){
    const c1 = cropColor(cropNames[0]);
    displaySummary = `<div style="display:flex; justify-content:space-between; align-items:baseline;"><span style="color:${c1}; font-weight:700;">${escapeHtml(cropNames[0])}</span><span style="font-weight:800; color:var(--ink);">${total.toLocaleString()}개</span></div>`;
  } else if(cropNames.length > 1){
    const n = cropNames.length;
    displaySummary = `<div style="display:flex; justify-content:space-between; align-items:baseline;"><span style="color:${cropColor(cropNames[0])}; font-weight:700;">${escapeHtml(cropNames[0])} 외 ${n-1}종</span><span style="font-weight:800; color:var(--ink);">${total.toLocaleString()}개</span></div>`;
  }
  const iconThermo = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"></path></svg>`;
  const iconSun = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path></svg>`;

  const hasOverdue = materials.some(m=>m.room_id===room.id && !m.harvest_confirmed_at && workRowStatus(m.harvest_date).cls==='overdue');
  const hasSoon = materials.some(m=>m.room_id===room.id && !m.harvest_confirmed_at && workRowStatus(m.harvest_date).cls==='soon');
  let statusLabel, statusClass;
  if(room.name==='고온검정실'){ statusLabel='고온검정'; statusClass='hot'; }
  else if(hasOverdue){ statusLabel='수확지연'; statusClass='danger'; }
  else if(hasSoon){ statusLabel='임박'; statusClass='soon'; }
  else if(items.length===0){ statusLabel='미사용'; statusClass='idle'; }
  else{ statusLabel='정상'; statusClass='ok'; }
  const statusBadge = `<span class="room-status-badge ${statusClass}">${statusLabel}</span>`;
  const envMetaHtml = (room.temperature!=null || (room.light_start && room.light_end))
    ? `<div class="room-env-meta">
        <span style="color:#C2703E;">${iconThermo} ${room.temperature!=null? room.temperature+'°':'-'}</span>
        <span class="room-env-sep"></span>
        <span style="color:#B08A3C;">${iconSun} ${room.light_start && room.light_end ? lightDurationLabel(room.light_start, room.light_end) : '-'}</span>
      </div>`
    : '';
  return `
    <div class="room-card ${room.id===modalRoomId?'active':''} ${items.length===0?'empty-room':''} ${isMutedRoom(room.name)?'muted-room':''} ${roomIsActive(room)?'':'inactive-room'}" onclick="openRoomDetailModal('${room.id}')"${room.status_note ? ` title="${escapeHtml(room.status_note)}"` : ''}>
      <div class="top-row" style="align-items:flex-start;">
        <div>
          <div class="rname" style="margin:0;">${escapeHtml(displayLabel)}</div>
          ${roomStateBadgesHtml(room) ? `<div class="room-state-badges">${roomStateBadgesHtml(room)}</div>` : ''}
          ${envMetaHtml}
        </div>
        ${statusBadge}
      </div>
      <div class="room-summary">${displaySummary}</div>
    </div>
  `;
}

function renderFacility(){
  const wrap = document.getElementById('facility');
  if(!wrap) return;
  const row1Html = ROW1.map(cardHtmlFor).join('') + cardHtmlFor(ROW1_INFO);
  const row2Html = ROW2.map(cardHtmlFor).join('');

  const extraRooms = rooms.filter(r=> !FIXED_NAMES.has(r.name));
  const extraHtml = extraRooms.length ? `
    <div class="extra-head">추가로 등록한 방</div>
    <div class="extra-grid">${extraRooms.map(r=>cardHtmlFor(r.name)).join('')}</div>
  ` : '';

  const headerHtml = `
    <div class="panel-box-head">
      <div>
        <h3>시설 공간 배치도</h3>
        <p>중앙 복도를 중심으로 서측/동측 방이 배치되어 있습니다.</p>
      </div>
    </div>
  `;

  wrap.innerHTML = `
    ${headerHtml}
    <div class="facility-vertical">
      <div class="facility-col">${row2Html}</div>
      <div class="corridor-bar-vertical">통&nbsp;&nbsp;&nbsp;&nbsp;로</div>
      <div class="facility-col">${row1Html}</div>
    </div>
    ${extraHtml}
  `;
}

function goHome(){
  if(viewMode!=='space') switchView('space');
  activeRoomId = null;
  renderFacility();
  renderDetail();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openRoomDetailModal(id){
  modalRoomId = id;
  renderFacility();
  renderDetail('modal');
  document.getElementById('roomDetailModalOverlay').classList.add('open');
}

function closeRoomDetailModal(){
  modalRoomId = null;
  document.getElementById('roomDetailModalOverlay').classList.remove('open');
  renderFacility();
}

function exitFocusMode(){
  activeRoomId = null;
  renderFacility();
  renderDetail();
}

async function quickCreateRoom(name){
  if(tourBlockWrite()) return;
  const cfg = DEFAULT_ROOM_CONFIG[name] || { bed_count:0, bed_floors:2, tray_capacity:null };
  const { data, error } = await sb.from('rooms').insert({
    name, structure_count: cfg.bed_count, bed_floors: cfg.bed_floors, tray_capacity: cfg.tray_capacity
  }).select().single();
  if(error){ alert('방 생성 실패!\n\n' + (error.message||JSON.stringify(error))); return; }
  activeRoomId = data.id;
  showToast(`"${name}" 방이 만들어졌어요`);
  await loadAll();
}

function cropSummaryCardHtml(cropName){
  const allMaterialsForCrop = materials.filter(m=> m.name===cropName && !m.harvest_confirmed_at);
  // 세대단축이 있는 작물: 위쪽 흐름(F1~포장)에는 세대단축 내용만 올리고, 인공교배 · 고온검정 · 기타 실험은
  //   카드 아랫줄에 "실험 진행 중: 인공교배 N집단 · 고온검정 N집단"처럼 개수만 작게 보여준다.
  // 세대단축이 없는 작물: 인공교배는 흐름으로 보여주고(F1 앞에 'C'(Cross, 인공교배) 단계가 붙는다), 고온검정 · 기타 실험은 목록으로 보여준다.
  const isCross = (m)=> batchPurposeOf(m)==='인공교배';
  const breedBatches = allMaterialsForCrop.filter(m=> batchPurposeOf(m)==='세대단축');
  const crossBatches = allMaterialsForCrop.filter(isCross);
  const otherBatches = allMaterialsForCrop.filter(m=> !isCross(m) && batchPurposeOf(m)!=='세대단축');   // 고온검정 · 기타 실험
  const hasBreed = breedBatches.length > 0;
  const batches = hasBreed ? breedBatches : crossBatches;                      // 흐름 줄에 올리는 계통
  const expBatches = hasBreed ? [] : otherBatches;                             // 목록으로 보여주는 실험
  const footerBatches = hasBreed ? [...crossBatches, ...otherBatches] : [];    // 아랫줄에 개수로만 보여주는 계통
  // 흐름 줄의 이름: 계통번호. 인공교배는 계통번호가 없어서 교배조합이 이름이다
  const lineKeyOf = (b)=> b.line_no || (isCross(b) ? crossComboLabel(b) : '') || '(계통번호 없음)';   // 인공교배는 '선풍/남천 외 3조합'
  // 인공교배 조합 수: 교배조합이 같은 계통은 한 번만 세고(외 N은 그중 큰 값), 조합마다 1 + 외 N
  const crossComboCount = (list)=>{
    const byCombo = new Map();
    list.filter(isCross).forEach(b=>{ const k = b.cross_combo || '(교배조합 없음)'; byCombo.set(k, Math.max(byCombo.get(k) || 0, crossExtraOf(b))); });
    return [...byCombo.values()].reduce((s, n)=> s + 1 + n, 0);
  };
  const purposeOf = (b)=> b.purpose || '목표 미설정';   // 계통번호가 없는 세대단축 계통은 같은 목표끼리 한 집단 (아래 groupCount)
  const hasCross = !hasBreed && crossBatches.length > 0;   // 세대단축이 없어서 인공교배가 흐름에 오를 때만 C 단계를 둔다 (세대단축 흐름은 예전 그대로 F1부터)
  const qtyOf = (list)=> list.reduce((s,b)=> s + (Number(b.quantity)||0), 0);
  const totalQty = qtyOf(batches) + qtyOf(expBatches);
  const color = cropColor(cropName);
  const GEN_STAGES = [...(hasCross ? ['C'] : []), 'F1','F2','F3','F4','F5','F6','포장'];
  // '진행중만 보기': 세대가 적혀 있는 계통과 인공교배(교배 단계)를 진행 중으로 본다
  const isActiveBatch = (b)=> !!extractGenStage(b.generation) || isCross(b);

  const byPurpose = {};
  batches.forEach(b=>{
    const pKey = b.purpose || '목표 미설정';
    const lKey = lineKeyOf(b);
    if(!byPurpose[pKey]) byPurpose[pKey] = {};
    if(!byPurpose[pKey][lKey]) byPurpose[pKey][lKey] = [];
    byPurpose[pKey][lKey].push(b);
  });
  let purposeKeys = Object.keys(byPurpose).sort((a,b)=> a==='목표 미설정' ? 1 : b==='목표 미설정' ? -1 : 0);
  // 집단 수: 세대단축만 센다. 계통번호가 같으면 한 집단(베드가 달라도), 계통번호가 없으면 같은 목표끼리 한 집단. '진행중만 보기'로 걸러지기 전 전체
  //   인공교배 · 고온검정 · 기타 실험은 집단으로 세지 않고 각자의 단위(조합 · 품종 · 건)로 보여 준다 (아래 expUnitText)
  const groupCount = new Set(breedBatches.map(b=>{ const line = String(b.line_no ?? '').trim(); return line ? `L|${line}` : `P|${purposeOf(b)}`; })).size;
  if(showActiveOnlyCrops){
    purposeKeys = purposeKeys.filter(purpose=>
      Object.values(byPurpose[purpose]).some(lBatches=> lBatches.some(isActiveBatch))
    );
  }

  const renderLineSubRow = (lineKey, lBatches)=>{
    const genCounts = {};
    lBatches.forEach(b=>{
      const stage = extractGenStage(b.generation);
      if(stage){ genCounts[stage] = (genCounts[stage]||0) + 1; }
      if(isCross(b)){ genCounts['C'] = (genCounts['C']||0) + 1; }   // 인공교배(C) 단계에 색이 찬다
    });
    const lQty = lBatches.reduce((s,b)=> s + (Number(b.quantity)||0), 0);
    return `
      <div class="csc-line-subrow">
        <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:4px;">
          <span style="font-size:11.5px; font-weight:800; color:${color};">${lineKey==='(계통번호 없음)' ? '<span style="color:var(--ink-faint); font-weight:700;">계통번호 없음</span>' : escapeHtml(lineKey)}</span>
          <span style="font-size:11px; font-weight:700; color:var(--ink-faint);">${lQty.toLocaleString()}개체</span>
        </div>
        <div class="gen-timeline${hasCross ? ' compact' : ''}">
          ${GEN_STAGES.map((g,i)=>{
            const count = genCounts[g] || 0;
            const active = count > 0;
            return `
            <div class="gen-step ${active?'active':'inactive'}" style="${active?`--dot-glow:${color};`:''}"${g==='C' ? ' title="인공교배"' : ''}>
              <div class="gen-dot" style="${active ? `background:${color}; border-color:${color}; color:#fff;` : `border-color:var(--line); color:var(--ink-faint);`} ${g.length>2?'font-size:7.5px; line-height:1; white-space:normal;':''}">${g.length>2 ? escapeHtml(g.slice(0,2))+'<br>'+escapeHtml(g.slice(2)) : escapeHtml(g)}</div>
            </div>
            ${i<GEN_STAGES.length-1 ? `<div class="gen-line" style="background:${active?color:'var(--line)'};"></div>` : ''}
          `;}).join('')}
        </div>
      </div>
    `;
  };

  const renderTargetRow = (purpose)=>{
    const lineGroups = byPurpose[purpose];
    let lineKeysInPurpose = Object.keys(lineGroups).sort((a,b)=> a==='(계통번호 없음)' ? 1 : b==='(계통번호 없음)' ? -1 : a.localeCompare(b));
    if(showActiveOnlyCrops){
      lineKeysInPurpose = lineKeysInPurpose.filter(lineKey=> lineGroups[lineKey].some(isActiveBatch));
    }
    const purposeQty = lineKeysInPurpose.reduce((s,lineKey)=> s + lineGroups[lineKey].reduce((s2,b)=> s2 + (Number(b.quantity)||0), 0), 0);
    // 인공교배가 흐름으로 오를 때: 목적 줄에 조합 수를 함께 적는다 (예: 내병성 [인공교배] 7조합)
    const comboN = hasCross ? crossComboCount(lineKeysInPurpose.flatMap(k=> lineGroups[k])) : 0;
    return `
      <div class="csc-target-row">
        <div class="csc-target-label" style="display:flex; justify-content:space-between; align-items:baseline;">
          <span style="font-size:13px; font-weight:900; color:var(--ink);">${purpose==='목표 미설정' ? '<span style="color:var(--ink-faint); font-weight:700;">목표 미설정</span>' : `${escapeHtml(purpose)}`}${hasCross ? ` ${expKindBadge('인공교배')}` : ''}${comboN ? ` <span style="font-size:11px; font-weight:800; color:#2F5DA8;">${comboN}조합</span>` : ''}</span>
          <span style="font-weight:800; color:var(--ink);">${purposeQty.toLocaleString()}개체</span>
        </div>
        <div class="csc-line-sublist">
          ${lineKeysInPurpose.map(lineKey=> renderLineSubRow(lineKey, lineGroups[lineKey])).join('')}
        </div>
      </div>
    `;
  };

  // 실험 목록(고온검정 · 기타 실험): 종류 · 목적 · 처리 조건(온도 · 처리시기 · 일장)이 모두 같으면 베드가 달라도 한 줄로 합친다.
  //   한 줄 = 목적 + 종류 뱃지 · 총 개체수 / 처리 조건 (베드별 계통 이름은 보여 주지 않는다)
  const EXP_KIND_ORDER = ['고온검정','기타'];
  const EXP_EMPTY_LABEL = { '고온검정':'검정 목적 미기재', '기타':'실험 내용 미기재' };
  const expKindBadge = (kind)=> {
    const st = { '인공교배':'background:#E7EEF9; color:#2F5DA8;', '고온검정':'background:#FBEEDD; color:#C2410C;', '기타':'background:#EFE8F7; color:#6A3FA0;' }[kind];
    return `<span class="task-worker-badge" style="${st}">${kind==='기타' ? '기타 실험' : kind}</span>`;
  };
  // 고온검정 한 줄의 재료 요약: 품종 이름을 늘어놓지 않고 '품종 10종 · 3반복'만 보여 준다 (이름은 마우스를 올리면 나온다)
  //   같은 품종 묶음(계통/품종 칸의 글자가 같은 것)이 몇 줄 등록돼 있는지가 반복 수다.
  //   칸에 '(3반복)'처럼 적어 둔 글자는 떼고 같은 묶음으로 센다. 묶음마다 반복 수가 다르면 '2~3반복'
  const heatSetsSummary = (list)=>{
    const sets = new Map();
    list.forEach(b=>{
      const key = stripRepeatSuffix(b.line_no);
      if(key) sets.set(key, (sets.get(key) || 0) + 1);
    });
    const varieties = new Set();
    sets.forEach((_, key)=> key.split(VARIETY_SPLIT).map(s=> s.trim()).filter(Boolean).forEach(v=> varieties.add(v)));
    const reps = [...sets.values()], lo = Math.min(...reps), hi = Math.max(...reps);
    const text = [varieties.size ? `품종 ${varieties.size}개` : '', hi > 1 ? (lo === hi ? `${hi}반복` : `${lo}~${hi}반복`) : ''].filter(Boolean).join(' · ');
    return text ? `<div title="${escapeHtml([...sets.keys()].join('\n'))}" style="font-size:11.5px; font-weight:700; color:${color}; margin-top:2px;">${text}</div>` : '';
  };
  const renderExperiments = ()=>{
    const groups = new Map();
    expBatches.forEach(b=>{
      const kind = batchPurposeOf(b), label = b.purpose || EXP_EMPTY_LABEL[kind];
      const cond = String(b.test_condition ?? '').trim();
      const key = kind + '|' + label + '|' + cond;
      if(!groups.has(key)) groups.set(key, { kind, label, cond, list: [] });
      groups.get(key).list.push(b);
    });
    return [...groups.values()]
      .sort((a, b)=> EXP_KIND_ORDER.indexOf(a.kind) - EXP_KIND_ORDER.indexOf(b.kind) || a.label.localeCompare(b.label) || a.cond.localeCompare(b.cond))
      .map(g=> `
          <div class="csc-target-row">
            <div class="csc-target-label" style="display:flex; justify-content:space-between; align-items:baseline; gap:8px;">
              <span style="font-size:13px; font-weight:900; color:var(--ink); min-width:0;">${escapeHtml(g.label)} ${expKindBadge(g.kind)}</span>
              <span style="font-weight:800; color:var(--ink); flex-shrink:0;">${qtyOf(g.list).toLocaleString()}개체</span>
            </div>
            ${g.kind === '고온검정' ? heatSetsSummary(g.list) : (()=>{
              // 재료: 계통번호(없으면 교배조합) — 베드가 달라도 같은 재료는 한 번만
              const names = [...new Set(g.list.map(b=> b.line_no || crossComboLabel(b)).filter(Boolean))];
              return names.length ? `<div style="font-size:11.5px; font-weight:700; color:${color}; margin-top:2px; word-break:break-word;">${names.map(escapeHtml).join(', ')}</div>` : '';
            })()}
            ${g.cond ? `<div style="font-size:11.5px; font-weight:700; color:var(--ink-soft); margin-top:2px; word-break:break-word;">${escapeHtml(g.cond)}</div>` : ''}
          </div>`).join('');
  };
  // 인공교배 · 고온검정 · 기타 실험은 집단 대신 각자의 단위로 센다: 인공교배 8조합 · 고온검정 품종 10개 · 기타 실험 1건
  //   (고온검정은 품종 이름이 없으면 건수. 건수는 같은 목적이면 한 건)
  const expUnitText = (kind, list)=>{
    if(kind==='인공교배') return `${crossComboCount(list)}조합`;
    const varieties = kind==='고온검정' ? new Set(list.flatMap(b=> heatVarietiesOf(b))).size : 0;
    return varieties ? `품종 ${varieties}개` : `${new Set(list.map(purposeOf)).size}건`;
  };
  const KIND_LABEL = { '인공교배':'인공교배', '고온검정':'고온검정', '기타':'기타 실험' };
  // 종류마다 { kind, text:'인공교배 8조합', qty } (없는 종류는 뺀다)
  const unitParts = (list)=> ['인공교배','고온검정','기타'].map(kind=>{
    const l = list.filter(b=> batchPurposeOf(b)===kind);
    return l.length ? { kind, text:`${KIND_LABEL[kind]} ${expUnitText(kind, l)}`, qty: qtyOf(l) } : null;
  }).filter(Boolean);
  // 세대단축이 있는 작물의 아랫줄: 인공교배 · 고온검정 · 기타 실험을 각자의 단위로
  const expFooter = (()=>{
    // 예: 인공교배 8조합(28개체) · 고온검정 품종 10개(30개체)
    //     종류마다 글자색을 뱃지 색과 맞춘다 (인공교배 파랑 · 고온검정 주황 · 기타 실험 보라)
    const KIND_COLOR = { '인공교배':'#2F5DA8', '고온검정':'#B8763F', '기타':'#6A3FA0' };
    const parts = unitParts(footerBatches).map(p=> `<span style="color:${KIND_COLOR[p.kind]};">${p.text}(${p.qty.toLocaleString()}개체)</span>`);
    return parts.length ? `<div class="csc-heattest-row">${parts.join(' · ')}</div>` : '';
  })();
  // 카드 이름 아래 작은 글씨: 세대단축이 있으면 '3집단'(나머지는 아랫줄에), 없으면 인공교배 · 실험의 단위들 (아무것도 없으면 0집단)
  const headInfo = hasBreed ? `${groupCount}집단` : (unitParts(otherBatches.concat(crossBatches)).map(p=> p.text).join(' · ') || '0집단');
  const flowRowsHtml = purposeKeys.map(renderTargetRow).join('');
  const expRowsHtml = expBatches.length ? renderExperiments() : '';
  const timelineRowsHtml = (flowRowsHtml || expRowsHtml) ? flowRowsHtml + expRowsHtml : `<div class="empty-chip">등록된 목표 없음</div>`;

  return `
    <div class="crop-summary-card">
      <div class="csc-head" style="align-items:flex-start;">
        <span class="crop-dot" style="background:${color}; margin-top:5px;"></span>
        <div style="flex:1; min-width:0;">
          <h4 style="margin-bottom:2px; color:${color};">${escapeHtml(cropName)}</h4>
          <div style="font-size:10.5px; color:var(--ink-faint); font-weight:700;">${headInfo}</div>
        </div>
        <span style="font-weight:900; font-size:15px; color:var(--ink); flex-shrink:0;">${totalQty.toLocaleString()}개체</span>
      </div>
      <div class="csc-target-list">${timelineRowsHtml}</div>
      ${expFooter}
    </div>
  `;
}

function spaceOverviewHtml(){
  return `
    <div class="detail-card space-overview">
      <div class="panel-box">
        <div class="panel-box-head">
          <div>
            <h3>작물별 세대 육종(실험) 현황</h3>
            <p>주요 작물별 세대 진행 단계(F1~포장)를 한눈에 대조 관찰합니다.</p>
          </div>
          <div style="display:flex; align-items:center; gap:12px; flex-shrink:0;">
            <button class="btn small" onclick="openLineHistoryModal()">계통 이력 조회</button>
            <label style="display:flex; align-items:center; gap:6px; font-size:11px; font-weight:700; color:var(--ink-faint); cursor:pointer;">
              진행중만
              <input type="checkbox" ${showActiveOnlyCrops?'checked':''} onchange="toggleActiveOnlyCrops(this.checked)" />
            </label>
          </div>
        </div>
        <div class="crop-summary-grid">
          ${(()=>{
            // '진행중만'을 켜면 지금 심겨 있는 작물만, 끄면 모든 작물 카드를 보여 준다 (심긴 게 없는 작물은 '등록된 목표 없음'으로 나온다)
            const visible = showActiveOnlyCrops ? CROP_OPTIONS.filter(name=> materials.some(m=>m.name===name && !m.harvest_confirmed_at)) : CROP_OPTIONS;
            return visible.length ? visible.map(cropSummaryCardHtml).join('') : `<div class="empty-materials">표시할 작물이 없어요</div>`;
          })()}
        </div>
      </div>
    </div>
  `;
}

let showActiveOnlyCrops = true;

function toggleActiveOnlyCrops(checked){
  showActiveOnlyCrops = checked;
  renderDetail();   // 작물 카드를 다시 그린다
}

function renderDetail(context){
  context = context || 'space';
  if(context==='work'){ renderWorkView(); return; }   // 계통작성은 3열 화면(renderWorkView)이 따로 그린다
  const wrap = document.getElementById(context==='modal' ? 'roomDetailModalBody' : 'detail');
  const roomId = context==='modal' ? modalRoomId : activeRoomId;
  const room = rooms.find(r=>r.id===roomId);
  if(!room){
    wrap.innerHTML = (context==='space') ? spaceOverviewHtml() : '';
    return;
  }
  const roomMaterials = materials.filter(m=>m.room_id===room.id);

  const fixedCfg = DEFAULT_ROOM_CONFIG[room.name];
  const bedCount = fixedCfg ? fixedCfg.bed_count : (room.structure_count || 0);
  const bedFloors = fixedCfg ? fixedCfg.bed_floors : (room.bed_floors || 2);

  let bodyHtml;
  if(bedCount > 0){
    const colsPerRow = ROOM_COLS_PER_ROW[room.name] || bedCount;

    // 공간뷰: 최소 정보만(계통명/교배조합/목적/규모), 편집·달력·일지 없음
    const spaceGrid = (bedFloors === 2)
      ? spaceBedGroupedGrid(room, roomMaterials, bedCount, colsPerRow)
      : minimalBedGrid(room, roomMaterials, bedCount, bedFloors, colsPerRow);
    bodyHtml = (bedCount > 4) ? spaceGrid : `<div class="space-bed-wrap">${spaceGrid}</div>`;
  } else {
    bodyHtml = roomMaterials.length ? `
      <div class="mini-chip-list">
        ${roomMaterials.map(m=>`<div class="mini-chip"><span class="crop-dot" style="background:${cropColor(m.name)};"></span><div class="mini-chip-text"><div class="mc-line">${escapeHtml(m.name||'-')}</div><div class="mc-sub">${m.quantity!=null? escapeHtml(String(m.quantity))+'개' : '-'}</div></div></div>`).join('')}
      </div>
    ` : `<div class="empty-materials">등록된 재료가 없어요.</div>`;
  }

  const closeAction = context==='modal' ? `closeRoomDetailModal()` : `exitFocusMode()`;
  wrap.innerHTML = `
    <div class="detail-card">
      <div class="detail-head">
        <div>
          <h3 style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            ${escapeHtml(roomLabel(room.name))}
            ${roomStateBadgesHtml(room)}
            ${(room.temperature!=null || (room.light_start && room.light_end)) ? `
              <span style="font-size:12.5px; font-weight:600; color:var(--teal-deep); background:var(--teal-soft); border-radius:7px; padding:4px 12px; display:inline-flex; gap:8px;">
                ${room.temperature!=null ? `${room.temperature}°C` : ''}
                ${room.light_start && room.light_end ? `${lightDurationLabel(room.light_start, room.light_end)}` : ''}
              </span>
            ` : ''}
          </h3>
          <div class="detail-meta">
            ${room.location? `<span>${escapeHtml(room.location)}</span>`:''}
            ${room.manager? `<span>담당자 ${escapeHtml(room.manager)}</span>`:''}
          </div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="btn close-x" onclick="${closeAction}">✕</button>
        </div>
      </div>
      ${roomStateNoticeHtml(room)}
      ${bodyHtml}
      ${roomStateSettingsHtml(room)}
    </div>
  `;
  // 가로로 미는 베드 줄이 있는 방(인공교배실 1)은 팝업을 넓히고 카드 폭을 줄여서 한 화면에 더 많은 베드를 보여 준다
  const wide = !!wrap.querySelector('.struct-cols.scrollable');
  wrap.firstElementChild.classList.toggle('wide-room', wide);
  if(context==='modal'){
    const modalBox = wrap.parentElement;
    // 화면 전체(body)에 zoom:1.10이 걸려 있어 vw도 1.1배로 계산되므로, 팝업이 화면 폭의 92%를 넘지 않게 1.1로 나눈다
    // (폰 화면은 예전 크기를 그대로 둔다)
    const wideBox = wide && window.innerWidth > 640;
    modalBox.style.width = wideBox ? '1100px' : '920px';
    modalBox.style.maxWidth = wideBox ? 'calc(92vw / 1.1)' : '94vw';
    modalBox.style.padding = wideBox ? '12px' : '';
    modalBox.style.maxHeight = wideBox ? 'calc(97vh / 1.1)' : '86vh';   // 위 · 아래 줄을 모두 펼쳐도 한눈에 보이도록 화면 높이를 더 쓴다
  }
}

function spaceBedColumnsHtml(room, roomMaterials, order){
  return order.map(i=>{
    const floor1 = roomMaterials.filter(m=> m.structure_no===i && m.floor==='1층' && !m.harvest_confirmed_at);
    const floor2 = roomMaterials.filter(m=> m.structure_no===i && m.floor==='2층' && !m.harvest_confirmed_at);
    return `
      <div class="struct-col expanded">
        <div class="bed-col-title">베드 ${i}</div>
        <div class="bed-floor-section">
          <div class="bed-floor-label">2층</div>
          ${floor2.length ? floor2.map(b=>spaceBatchCardHtml(b)).join('') : `<div class="empty-chip">등록된 작물이 없어요</div>`}
        </div>
        <div class="bed-floor-section">
          <div class="bed-floor-label">1층</div>
          ${floor1.length ? floor1.map(b=>spaceBatchCardHtml(b)).join('') : `<div class="empty-chip">등록된 작물이 없어요</div>`}
        </div>
      </div>
    `;
  }).join('');
}

function spaceBedGroupedGrid(room, roomMaterials, bedCount, colsPerRow){
  const layout = ROOM_BED_LAYOUT[room.name];
  let topOrder, bottomOrder;
  if(layout){
    topOrder = layout.top; bottomOrder = layout.bottom;
  } else {
    topOrder = []; bottomOrder = [];
    for(let i=1;i<=bedCount;i++){ (i<=colsPerRow ? topOrder : bottomOrder).push(i); }
  }
  return `
    ${structColsWrapper(topOrder, spaceBedColumnsHtml(room, roomMaterials, topOrder))}
    ${innerCorridorHtml(topOrder, bottomOrder, spaceAisleList(room, roomMaterials))}
    ${structColsWrapper(bottomOrder, spaceBedColumnsHtml(room, roomMaterials, bottomOrder))}
  `;
}

// 인공교배실의 통로에 심긴 계통들 (통로가 아닌 방이거나 비어 있으면 빈 목록)
function spaceAisleList(room, roomMaterials){
  if(!AISLE_ROOMS.has(room.name)) return [];
  return roomMaterials.filter(m=> isAisleSpot(m.structure_no) && !m.harvest_confirmed_at);
}

function minimalBedGrid(room, roomMaterials, bedCount, bedFloors, colsPerRow){
  // 베드 하나(한 열)
  const colHtml = (i)=>{
    if(bedFloors===2){
      const floor1 = roomMaterials.filter(m=> m.structure_no===i && m.floor==='1층' && !m.harvest_confirmed_at);
      const floor2 = roomMaterials.filter(m=> m.structure_no===i && m.floor==='2층' && !m.harvest_confirmed_at);
      return `
        <div class="struct-col expanded">
          <div class="bed-col-title">베드 ${i}</div>
          <div class="bed-floor-section">
            <div class="bed-floor-label">2층</div>
            ${floor2.length ? floor2.map(b=>spaceBatchCardHtml(b)).join('') : `<div class="empty-chip">등록된 작물이 없어요</div>`}
          </div>
          <div class="bed-floor-section">
            <div class="bed-floor-label">1층</div>
            ${floor1.length ? floor1.map(b=>spaceBatchCardHtml(b)).join('') : `<div class="empty-chip">등록된 작물이 없어요</div>`}
          </div>
        </div>
      `;
    }
    const batches = roomMaterials.filter(m=> m.structure_no===i && !m.harvest_confirmed_at);
    return `
      <div class="struct-col expanded">
        <div class="bed-col-title">베드 ${i}</div>
        ${batches.length ? batches.map(b=>spaceBatchCardHtml(b)).join('') : `<div class="empty-chip">등록된 작물이 없어요</div>`}
      </div>
    `;
  };

  // 인공교배실(1·2): 베드 줄 사이에 입구 · 통로 띠를 두고, 통로에 계통이 있으면 띠 안에 카드로 보여준다 (인공교배실 1과 같은 모양)
  if(AISLE_ROOMS.has(room.name)){
    const layout = ROOM_BED_LAYOUT[room.name];
    let topOrder, bottomOrder;
    if(layout){ topOrder = layout.top; bottomOrder = layout.bottom; }
    else {
      topOrder = []; bottomOrder = [];
      for(let i=1;i<=bedCount;i++){ (i<=colsPerRow ? topOrder : bottomOrder).push(i); }
    }
    const rowHtml = (order)=> structColsWrapper(order, order.map(colHtml).join(''));
    return `
      ${rowHtml(topOrder)}
      ${innerCorridorHtml(topOrder, bottomOrder, spaceAisleList(room, roomMaterials))}
      ${bottomOrder.length ? rowHtml(bottomOrder) : ''}
    `;
  }

  const many = bedCount > 4;
  const cls = many ? 'struct-cols scrollable' : 'struct-cols';
  const style = many ? '' : ` style="grid-template-columns:repeat(${colsPerRow}, 1fr);"`;
  let cols = '';
  for(let i=1;i<=bedCount;i++) cols += colHtml(i);
  return `<div class="${cls}"${style}>${cols}</div>`;
}

function lightDurationLabel(start, end){
  if(!start || !end) return '';
  const toMin = (t)=>{ const [h,m] = t.split(':').map(Number); return h*60+m; };
  let diff = toMin(end) - toMin(start);
  if(diff < 0) diff += 24*60;
  const h = Math.floor(diff/60), m = diff%60;
  return `${h}시간${m ? m+'분':''}`;
}

function envSettingsHtml(room){
  const t = room.temperature, ls = room.light_start, le = room.light_end;
  if(!isAdmin){
    return '';
  }
  return `
    <div class="env-config" data-room-id="${room.id}">
      <label style="width:80px;">온도
        <div style="position:relative; width:80px;">
          <input type="number" step="0.1" data-env-field="temperature" value="${t ?? ''}" style="padding-right:22px; width:80px; box-sizing:border-box;" />
          <span style="position:absolute; right:9px; top:50%; transform:translateY(-50%); color:var(--ink-faint); font-size:12px; pointer-events:none;">℃</span>
        </div>
      </label>
      <label>점등${hourSelectHtml('light_start', ls)}</label>
      <label>소등${hourSelectHtml('light_end', le)}</label>
      <button class="btn small primary" onclick="saveEnvSettings('${room.id}', this)">저장</button>
    </div>
  `;
}

function hourSelectHtml(field, currentTime){
  const currentHour = currentTime ? currentTime.slice(0,2) : '';
  let opts = '<option value="">-</option>';
  for(let h=0; h<=24; h++){
    const hh = String(h).padStart(2,'0');
    opts += `<option value="${hh}:00" ${currentHour===hh?'selected':''}>${hh}시</option>`;
  }
  return `<select data-env-field="${field}" style="width:80px; box-sizing:border-box;">${opts}</select>`;
}

async function saveEnvSettings(roomId, btnEl){
  if(tourBlockWrite()) return;
  const wrap = btnEl.closest('.env-config');
  const get = (f)=> wrap.querySelector(`[data-env-field="${f}"]`).value;
  const payload = {
    temperature: get('temperature')===''? null : Number(get('temperature')),
    light_start: get('light_start') || null,
    light_end: get('light_end') || null,
    updated_at: new Date().toISOString()
  };
  const { error } = await sb.from('rooms').update(payload).eq('id', roomId);
  if(error){ alert('저장 실패!\n\n' + (error.message||JSON.stringify(error))); return; }
  showToast('저장됐어요');
  await loadAll();
}

// ── 방 상태(정상 · 점검중 · 수리중) · 사용 활성화/비활성화 ─────────────────────────────
// 관리자만 바꿀 수 있고, 표시는 누구에게나 보인다. rooms 테이블의 status · status_note · is_active 컬럼에 저장한다.
// 컬럼이 아직 없으면(값이 undefined) 정상 · 사용 중으로 본다.
const ROOM_STATUSES = ['정상', '점검중', '수리중'];

const ROOM_STATE_SQL = "alter table rooms add column if not exists status text default '정상';\nalter table rooms add column if not exists status_note text;\nalter table rooms add column if not exists is_active boolean default true;\nalter table rooms add column if not exists open_for_use boolean;";

function roomStatusOf(room){ return (room && ROOM_STATUSES.includes(room.status)) ? room.status : '정상'; }

function roomIsActive(room){ return !room || room.is_active !== false; }   // 아직 만들지 않은 방(room 없음)도 사용 중으로 본다

function roomByName(name){ return rooms.find(r=> r.name===name) || null; }

// 방 이름 옆에 붙이는 뱃지: 사용 중지 · 점검중 · 수리중 (정상 · 사용 중이면 아무것도 붙이지 않는다). mini: 작은 배치도용 작은 뱃지
function roomStateBadgesHtml(room, mini){
  if(!room) return '';
  const st = roomStatusOf(room), note = String(room.status_note || '').trim();
  const tip = note ? ` title="${escapeHtml(note)}"` : '';
  const cls = mini ? 'room-state-badge mini' : 'room-state-badge';
  let html = '';
  if(!roomIsActive(room)) html += `<span class="${cls} off"${tip}>사용 중지</span>`;
  if(st === '수리중') html += `<span class="${cls} repair"${tip}>수리중</span>`;
  else if(st === '점검중') html += `<span class="${cls} check"${tip}>점검중</span>`;
  return html;
}

// 방 상세 머리글 아래에 붙이는 안내 줄 (메모가 있거나 사용 중지일 때)
function roomStateNoticeHtml(room){
  if(!room) return '';
  const st = roomStatusOf(room), note = String(room.status_note || '').trim(), off = !roomIsActive(room);
  if(!off && st === '정상' && !note) return '';
  const parts = [];
  if(off) parts.push('<b>사용 중지된 방이에요.</b> 새 계통 등록 · 수요조사 · 계획에서 고를 수 없어요 (심겨 있는 계통 조회 · 수정 · 수확은 할 수 있어요)');
  if(st !== '정상') parts.push(`<b>${st}</b>${note ? ` · ${escapeHtml(note)}` : ''}`);
  else if(note) parts.push(escapeHtml(note));
  return `<div class="room-state-notice ${off ? 'off' : st === '수리중' ? 'repair' : st === '점검중' ? 'check' : ''}">${parts.join('<br>')}</div>`;
}

// 사용 중지된 방에 새로 심으려고 할 때의 안내. 막혔으면 true
function blockInactiveRoom(room){
  if(roomIsActive(room)) return false;
  alert(`${roomLabel(room.name)}은(는) 관리자가 사용 중지한 방이에요.\n새 계통을 등록할 수 없어요. (심겨 있는 계통 조회 · 수정 · 수확은 할 수 있어요)`);
  return true;
}

// 관리자용 방 상태 · 사용 설정 칸 (계통작성 베드 맵 아래 · 종합현황 방 상세에 붙는다)
function roomStateSettingsHtml(room){
  if(!isAdmin || !room) return '';
  const st = roomStatusOf(room);
  // 조사실 · 세대단축실 4처럼 기본은 쓰지 않는 칸: '사용 가능'은 open_for_use(켜야 쓰는 칸)로 저장한다
  const openable = OPENABLE_MUTED_ROOMS.has(room.name);
  const active = openable ? (room.open_for_use === true && roomIsActive(room)) : roomIsActive(room);
  // 도면 기준 베드 구성이 정해지지 않은 방(DEFAULT_ROOM_CONFIG에 없음)은 베드 수 · 층을 관리자가 정한다
  const bedCfgHtml = DEFAULT_ROOM_CONFIG[room.name] ? '' : `
      <label style="width:70px;">베드 수
        <input type="number" min="0" max="30" data-rs-field="structure_count" value="${room.structure_count ?? 0}" style="width:70px; box-sizing:border-box;" />
      </label>
      <label>층
        <select data-rs-field="bed_floors" style="width:72px; box-sizing:border-box;">
          <option value="2" ${(room.bed_floors || 2)===2 ? 'selected' : ''}>2층</option>
          <option value="1" ${room.bed_floors===1 ? 'selected' : ''}>1층</option>
        </select>
      </label>`;
  return `
    <div class="env-config room-state-config" data-room-id="${room.id}">
      <label style="min-width:150px;">표시 이름
        <input data-rs-field="display_label" placeholder="${escapeHtml(ROOM_DISPLAY_LABELS[room.name] || room.name)}" value="${escapeHtml(room.display_label || '')}" title="화면에 보이는 방 이름이에요. 비워 두면 기본 이름(${escapeHtml(ROOM_DISPLAY_LABELS[room.name] || room.name)})으로 보여요" />
      </label>
      <label>방 상태
        <select data-rs-field="status" style="width:96px; box-sizing:border-box;">${ROOM_STATUSES.map(s=> `<option value="${s}" ${s===st ? 'selected' : ''}>${s}</option>`).join('')}</select>
      </label>
      <label style="flex:1; min-width:160px;">메모 (선택)
        <input data-rs-field="status_note" placeholder="예: 냉방기 교체, ~10/20" value="${escapeHtml(room.status_note || '')}" />
      </label>
      ${bedCfgHtml}
      <label class="room-state-toggle" ${openable ? 'title="기본은 쓰지 않는 칸이에요. 켜면 다른 방처럼 계통작성 · 수요조사 · 계획에서 쓸 수 있어요"' : ''}><input type="checkbox" data-rs-field="is_active" ${active ? 'checked' : ''} /> 사용 가능${openable ? ' (기본 미사용 칸)' : ''}</label>
      <button class="btn small primary" onclick="saveRoomState('${room.id}', this)">상태 저장</button>
    </div>`;
}

async function saveRoomState(roomId, btnEl){
  if(tourBlockWrite()) return;
  if(!isAdmin){ alert('방 상태는 전체 관리자만 바꿀 수 있어요.'); return; }
  const wrap = btnEl.closest('.room-state-config');
  const get = (f)=> wrap.querySelector(`[data-rs-field="${f}"]`);
  const room = rooms.find(r=> r.id===roomId);
  const isActive = get('is_active').checked;
  const openable = !!room && OPENABLE_MUTED_ROOMS.has(room.name);
  const usableNow = room && (openable ? !isMutedRoom(room.name) && roomIsActive(room) : roomIsActive(room));
  if(usableNow && !isActive){
    const n = materials.filter(m=> m.room_id===roomId && !m.harvest_confirmed_at).length;
    if(!confirm(`이 방을 사용 중지할까요?\n새 계통 등록 · 수요조사 · 계획에서 이 방을 고를 수 없게 돼요.${n ? `\n(지금 심겨 있는 계통 ${n}개는 그대로 두고, 조회 · 수정 · 수확은 계속할 수 있어요)` : ''}`)) return;
  }
  const payload = {
    status: get('status').value || '정상',
    status_note: get('status_note').value.trim() || null,
    // 기본 미사용 칸은 끄면 예전처럼 흐린 칸으로 돌아간다 ('사용 중지' 뱃지는 붙이지 않는다)
    is_active: openable ? true : isActive,
    updated_at: new Date().toISOString()
  };
  if(openable) payload.open_for_use = isActive;
  // 베드 구성(도면 기준이 없는 방만): 베드 수 0~30, 층 1 · 2
  const cntEl = get('structure_count'), flEl = get('bed_floors');
  if(cntEl){
    const cnt = parseInt(cntEl.value);
    if(!(cnt >= 0 && cnt <= 30)){ alert('베드 수는 0~30 사이로 적어주세요.'); cntEl.focus(); return; }
    payload.structure_count = cnt;
    payload.bed_floors = flEl && flEl.value === '1' ? 1 : 2;
  }
  // 표시 이름: 바뀌었을 때만 보낸다 (컬럼이 아직 없어도 다른 설정은 저장되게)
  const labelEl = get('display_label');
  const newLabel = labelEl ? (labelEl.value.trim() || null) : undefined;
  const labelChanged = labelEl && newLabel !== (String(room?.display_label || '').trim() || null);
  if(labelChanged) payload.display_label = newLabel;
  let { error } = await sb.from('rooms').update(payload).eq('id', roomId);
  if(error && labelChanged && /display_label/.test(error.message||'')){
    delete payload.display_label;
    ({ error } = await sb.from('rooms').update(payload).eq('id', roomId));
    if(!error) alert('다른 설정은 저장됐지만, 표시 이름은 rooms 테이블에 컬럼이 없어 저장되지 않았어요.\n\n(관리자 확인 필요) Supabase SQL Editor에서 아래를 한 번 실행해주세요:\n\n' + ROOM_LABEL_SQL);
  }
  if(error){
    if(/status|is_active|open_for_use/.test(error.message||'')){
      alert('저장 실패: rooms 테이블에 방 상태 컬럼이 아직 없어요.\n\n(관리자 확인 필요) Supabase SQL Editor에서 아래를 한 번 실행해주세요:\n\n' + ROOM_STATE_SQL);
    } else alert('저장 실패!\n\n' + (error.message||JSON.stringify(error)));
    return;
  }
  showToast('방 상태를 저장했어요');
  await loadAll();
}

async function deleteRoom(id){
  if(tourBlockWrite()) return;
  if(!confirm('이 방과 안의 모든 재료가 삭제됩니다. 계속할까요?')) return;
  const { error } = await sb.from('rooms').delete().eq('id', id);
  if(error) showToast('삭제 실패');
  else { activeRoomId = null; await loadAll(); }
}

function openRoomModal(){
  document.getElementById('roomModalOverlay').classList.add('open');
  document.getElementById('newRoomName').value='';
  document.getElementById('newRoomLocation').value='';
  document.getElementById('newRoomManager').value='';
  document.getElementById('newRoomName').focus();
}

function closeRoomModal(){ document.getElementById('roomModalOverlay').classList.remove('open'); }

async function createRoom(){
  if(tourBlockWrite()) return;
  const name = document.getElementById('newRoomName').value.trim();
  if(!name){ showToast('방 이름을 입력해주세요'); return; }
  const location = document.getElementById('newRoomLocation').value.trim();
  const manager = document.getElementById('newRoomManager').value.trim();
  const { data, error } = await sb.from('rooms').insert({ name, location, manager }).select().single();
  if(error){
    console.error(error);
    alert('방 추가 실패!\n\n에러 메시지: ' + (error.message || JSON.stringify(error)) + '\n\n코드: ' + (error.code || '없음') + '\n힌트: ' + (error.hint || '없음'));
    return;
  }
  closeRoomModal();
  activeRoomId = data.id;
  showToast('방이 추가되었어요');
  await loadAll();
}
