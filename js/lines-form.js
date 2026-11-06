/* lines-form.js — [계통작성] 입력 양식: 엑셀 업로드, 분기별 계획에서 불러오기, 집단 추가 창, 사용 목적별 입력 칸과 날짜 계산 */

const EXCEL_HEADERS = ['방이름','베드번호','층','작물','계통번호','교배조합','세대','교배목적','트레이1종류','트레이1개수','트레이2종류','트레이2개수','개체수','파종일','예상재배기간(일)','수확예정일'];

function downloadSampleExcel(){
  const sample = [
    ['세대단축실 1','1','1층','콩','YPL277','남천/YCPL547','F3','내병성 검정용','32구 트레이','12','','','300','2026-07-23','89',''],
    ['고온검정실','2','2층','들깨','GG-102','','F2','고온검정 예비실험','50구 트레이','4','','','120','2026-08-01','',''],
  ];
  const ws = XLSX.utils.aoa_to_sheet([EXCEL_HEADERS, ...sample]);
  ws['!cols'] = EXCEL_HEADERS.map(()=>({wch:14}));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '작물배치');
  XLSX.writeFile(wb, '스피드브리딩_업로드양식.xlsx');
}

function normalizeExcelDate(v){
  if(!v) return null;
  if(v instanceof Date){
    const y=v.getFullYear(), m=String(v.getMonth()+1).padStart(2,'0'), d=String(v.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if(!s) return null;
  const m = s.match(/(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})/);
  if(m){ return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`; }
  return null;
}

async function handleExcelUpload(e){
  if(tourBlockWrite()) return;
  const file = e.target.files[0];
  if(!file) return;
  const btn = document.getElementById('excelUploadBtn');
  const originalText = btn.textContent;
  btn.textContent = '처리 중...';
  btn.disabled = true;

  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type:'array', cellDates:true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval:'' });

    if(!rows.length){ alert('엑셀에 데이터가 없어요.'); return; }

    let updated=0, inserted=0;
    const errors=[];

    for(let i=0;i<rows.length;i++){
      const r = rows[i];
      const rowNum = i+2;
      const roomName = String(r['방이름']||'').trim();
      if(!roomName) continue;

      const room = rooms.find(x=>x.name===roomName);
      if(!room){ errors.push(`${rowNum}행: "${roomName}" 방을 찾을 수 없어요`); continue; }

      const structure_no = r['베드번호']===''? null : parseInt(r['베드번호']);
      const floor = String(r['층']||'').trim() || null;
      const name = String(r['작물']||'').trim() || null;
      const line_no = String(r['계통번호']||'').trim() || null;
      const cross_combo = String(r['교배조합']||'').trim() || null;
      const generation = String(r['세대']||'').trim() || null;
      const purpose = String(r['교배목적']||'').trim() || null;
      const quantity = r['개체수']===''? null : Number(r['개체수']);

      const trays = [];
      const t1type = String(r['트레이1종류']||'').trim();
      if(t1type) trays.push({ type:t1type, count: r['트레이1개수']===''?null:Number(r['트레이1개수']) });
      const t2type = String(r['트레이2종류']||'').trim();
      if(t2type) trays.push({ type:t2type, count: r['트레이2개수']===''?null:Number(r['트레이2개수']) });

      let sowing_date = normalizeExcelDate(r['파종일']);
      let expected_days = r['예상재배기간(일)']===''? null : parseInt(r['예상재배기간(일)']);
      let harvest_date = normalizeExcelDate(r['수확예정일']);

      if(expected_days == null && name && cropProfiles[name] != null){ expected_days = cropProfiles[name]; }
      if(!harvest_date && sowing_date && expected_days != null){ harvest_date = addDays(sowing_date, expected_days); }

      const payload = {
        room_id: room.id, structure_no, floor, name, line_no, cross_combo, generation, purpose, quantity,
        trays, container_type: trays[0]?.type || null, container_count: trays[0]?.count ?? null,
        sowing_date, expected_days, harvest_date, updated_at: new Date().toISOString()
      };

      const existing = materials.find(m =>
        m.room_id===room.id && m.structure_no===structure_no && m.floor===floor &&
        (line_no ? m.line_no===line_no : m.name===name)
      );

      if(existing){
        const { error } = await sb.from('materials').update(payload).eq('id', existing.id);
        if(error) errors.push(`${rowNum}행: ${error.message}`); else updated++;
      } else {
        const { error } = await sb.from('materials').insert(payload);
        if(error) errors.push(`${rowNum}행: ${error.message}`); else inserted++;
      }
      if(expected_days!=null && name){
        await sb.from('crop_profiles').upsert({ name, typical_days: expected_days, updated_at: new Date().toISOString() });
      }
    }

    await loadAll();
    let msg = `엑셀 처리 완료!\n\n수정 ${updated}건 · 추가 ${inserted}건`;
    if(errors.length){
      msg += `\n\n⚠️ 처리 못한 행 ${errors.length}건:\n` + errors.slice(0,15).join('\n');
      if(errors.length>15) msg += `\n... 외 ${errors.length-15}건`;
    }
    alert(msg);
  } catch(err){
    console.error(err);
    alert('엑셀 처리 중 오류가 발생했어요!\n\n' + err.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
    e.target.value = '';
  }
}

let batchLocModalRoomId = null;

function confirmAddBatch(roomId, bedNo, floor, hasExisting){
  const room = rooms.find(r=> r.id===roomId);
  if(room && blockInactiveRoom(room)) return;
  if(hasExisting){
    if(!confirm(`${spotText(bedNo, floor)}에는 이미 등록된 작물이 있어요.\n그래도 새로 추가할까요?`)) return;
  }
  openBatchLocationModal(roomId, null, {bedNo, floor});
}

// ── 분기별 계획 → 계통작성 불러오기 ─────────────────────────────────────────
// 집단 추가 창을 열면 그 베드·층에 잡힌 분기별 계획을 보여주고, [불러오기]를 누르면 계획 내용이 입력칸에 채워진다.
// 계통번호처럼 실제로 심을 때 정해지는 값만 직접 입력하면 된다. (수요조사 → 계획 → 계통작성이 한 흐름으로 이어진다)
const PLAN_WHEN_CHIP = { now:'done', soon:'wait', past:'past' };

// 이 베드·층의 계획을 오늘 기준으로 정리한다: 진행 중 → 예정(빠른 순) → 지난 계획(최근 순)
function bedPlansAt(roomName, bedNo, floor){
  const spot = demandSpot(roomName, bedNo, floor), today = todayKST();
  const rank = { now:0, soon:1, past:2 };
  return bedPlans.filter(p=> p.planned_start && demandSpot(p.room_name, p.structure_no, p.floor)===spot).map(p=>{
    const end = p.planned_end || p.planned_start;
    return { p, when: p.planned_start > today ? 'soon' : end < today ? 'past' : 'now' };
  }).sort((a, b)=> rank[a.when]-rank[b.when]
    || (a.when==='past' ? b.p.planned_start.localeCompare(a.p.planned_start) : a.p.planned_start.localeCompare(b.p.planned_start)));
}

function planTitleText(p){ return [p.crop_name, p.generation || p.use_purpose].filter(Boolean).join(' · ') || '계획'; }

// 'YYYY-MM-DD'에 달 수를 더한다. 그 달에 없는 날이면 말일로 맞춘다 (예: 3/31 − 1개월 = 2/28)
function addMonthsYmd(ymd, n){
  const [y, m, d] = ymd.split('-').map(Number);
  const t = y*12 + (m-1) + n, ny = Math.floor(t/12), nm = t % 12;
  const last = new Date(ny, nm+1, 0).getDate();
  return `${ny}-${String(nm+1).padStart(2,'0')}-${String(Math.min(d, last)).padStart(2,'0')}`;
}

// 계통작성의 계획 목록에는 오늘(한국 시간)을 기준으로 앞뒤 한 달 안에 걸치는 계획만 보여준다. 기간이 이 범위와 조금이라도 겹치면 보인다.
const BATCH_PLAN_WINDOW_MONTHS = 1;

let batchPlanRefItems = [];     // 지금 집단 추가 창에 보이는 계획들

function renderBatchPlanRef(room, target){
  const wrap = document.getElementById('batchLocPlanRef');
  if(!wrap) return;
  const all = target ? bedPlansAt(room.name, target.bedNo, target.floor) : [];
  const today = todayKST();
  const winStart = addMonthsYmd(today, -BATCH_PLAN_WINDOW_MONTHS), winEnd = addMonthsYmd(today, BATCH_PLAN_WINDOW_MONTHS);
  batchPlanRefItems = all.filter(({ p })=> p.planned_start <= winEnd && (p.planned_end || p.planned_start) >= winStart);
  if(!batchPlanRefItems.length){ wrap.innerHTML = ''; return; }   // 보여줄 계획이 없으면 아무것도 보이지 않는다
  // 계획 하나가 카드 하나. 카드를 누르면 그 계획 내용이 아래 칸에 자동으로 채워진다.
  // 계통번호가 제일 크게 보이고(없으면 '계통번호 미정'), 그 아래에 작물·세대와 기간·규모·담당이 한눈에 보인다.
  const ymdDots = (ymd)=> ymd.replace(/-/g, '.');
  const whenText = (when, p)=>{
    if(when==='soon') return `예정 · ${daysBetween(today, p.planned_start)}일 후 시작`;
    if(when==='now'){ const left = daysBetween(today, p.planned_end || p.planned_start); return left>0 ? `진행 중 · ${left}일 남음` : '진행 중 · 오늘 끝나요'; }
    return '지난 계획';
  };
  const cards = batchPlanRefItems.map(({ p, when }, idx)=>{
    const end = p.planned_end || p.planned_start;
    const facts = [
      ['기간', `${ymdDots(p.planned_start)} ~ ${ymdDots(end)} · ${daysBetween(p.planned_start, end)}일`],
      ['검정 목적', planPurposeKind(p)==='고온검정' ? p.purpose : ''],
      ['교배', crossComboLabel(p)],
      ['처리 조건', planCondText(p) || [p.heat_temp, p.heat_stage].filter(Boolean).join(' · ')],
      ['규모', p.expected_scale!=null ? `${Number(p.expected_scale).toLocaleString()}개체` : ''],
      ['담당', p.submitted_by]
    ].filter(([, v])=> v);
    return `
      <div class="bp-card ${when==='past' ? 'past' : ''}" role="button" tabindex="0" title="누르면 이 계획 내용이 아래 칸에 채워져요"
           onclick="loadBatchFromPlan(${idx})" onkeydown="if(event.key==='Enter'||event.key===' '){ event.preventDefault(); loadBatchFromPlan(${idx}); }">
        <div class="bp-main">
          <div class="bp-head">
            ${p.line_no ? `<span class="bp-line">${escapeHtml(p.line_no)}</span>` : lineNoHidden(p.use_purpose) ? '' : `<span class="bp-line none">${lineNoLabel(p.use_purpose)} 미정</span>`}
            <span class="sv-chip ${PLAN_WHEN_CHIP[when]}">${whenText(when, p)}</span>
          </div>
          <div class="bp-what"><span class="pd-dot" style="background:${planColorOf(p.crop_name, planPurposeKind(p))};"></span>${escapeHtml(planTitleText(p))}</div>
          <dl class="bp-facts">${facts.map(([k, v])=> `<dt>${k}</dt><dd>${escapeHtml(String(v))}</dd>`).join('')}</dl>
        </div>
        <span class="bp-go">이 계획으로 채우기</span>
      </div>`;
  }).join('');
  const lacksLineNo = batchPlanRefItems.some(({ p })=> !p.line_no && !lineNoHidden(p.use_purpose));
  wrap.innerHTML = `
    <div class="bp-ref">
      <div class="bp-ref-title">📅 ${escapeHtml(spotText(target.bedNo, target.floor))}의 분기별 계획 ${batchPlanRefItems.length}건</div>
      <div class="bp-ref-hint">계획을 누르면 아래 칸이 자동으로 채워져요.${lacksLineNo ? ' 계통번호(고온검정은 계통/품종)가 미정인 계획은 그 칸만 직접 입력해주세요.' : ''}</div>
      <div class="bp-cards">${cards}</div>
    </div>`;
}

function loadBatchFromPlan(idx){
  const item = batchPlanRefItems[idx];
  if(!item) return;
  const p = item.p;
  const root = document.getElementById('batchLocFields');
  if(!root) return;
  fillBatchFormFromPlan(root, p);   // 계획의 사용 목적(세대단축 · 인공교배 · 고온검정 · 기타)에 맞는 양식으로 바뀌고, 계획 내용이 채워진다
  // 방금 채운 카드는 강조하고 '✓ 채워짐'으로 바꾼다 (다른 카드를 누르면 그쪽으로 옮겨 간다)
  document.querySelectorAll('#batchLocPlanRef .bp-card').forEach((card, i)=>{
    card.classList.toggle('loaded', i===idx);
    card.querySelector('.bp-go').textContent = i===idx ? '✓ 채워짐' : '이 계획으로 채우기';
  });
  if(p.line_no){
    showToast(`${lineNoLabel(p.use_purpose)} ${p.line_no} · 계획 내용을 채웠어요`);
  } else if(lineNoHidden(p.use_purpose)){
    showToast('계획 내용을 채웠어요');
  } else {
    showToast('계획 내용을 불러왔어요 · 계통번호를 입력해주세요');
    const lineEl = root.querySelector('[data-bf="line_no"]');
    if(lineEl && lineEl.offsetParent !== null) lineEl.focus();   // 계통번호 칸이 보이는 목적일 때만
  }
}

// '집단 추가 · 복사' 입력칸은 팝업이 아니라 계통작성 오른쪽 작성 패널(#workRoomDetail) 안에 바로 열린다.
// (함수 이름의 'Modal'은 예전 팝업 시절 이름을 그대로 쓴 것이다)
function openBatchLocationModal(roomId, prefill, defaultChecked, opts){
  const srcRoom = rooms.find(r=>r.id===roomId);   // 작성 칸을 연 방 (세대진전 · 다시 심기면 수확한 방)
  const panel = document.getElementById('workRoomDetail');
  if(!srcRoom || !panel) return;
  // room = 새로 심을 방. 집단 추가 · 복사는 연 방 그대로. 세대진전 · 다시 심기는 방을 고를 수 있어서, 수확한 방을 더 못 쓰면(사용 중지 등)
  // 심을 수 있는 첫 방에서 시작한다 (심을 수 있는 방이 하나도 없을 때만 막는다)
  let room = srcRoom;
  if(opts && opts.replant){
    const plantable = plantableRooms();
    if(plantable.length){ if(!plantable.includes(srcRoom)) room = plantable[0]; }
    else if(blockInactiveRoom(srcRoom)) return;
  } else if(blockInactiveRoom(srcRoom)) return;   // 사용 중지된 방에는 집단 추가 · 복사로 새로 심을 수 없다
  batchLocModalRoomId = room.id;
  const cfg = DEFAULT_ROOM_CONFIG[room.name];
  const bedCount = cfg ? cfg.bed_count : (room.structure_count||0);
  const bedFloors = cfg ? cfg.bed_floors : (room.bed_floors||2);

  // 자리를 눌러 바로 열린 작성 칸은 defaultChecked = { multi: [{bedNo, floor}, ...] } (renderWorkWritePanel이 빈 자리를 누르거나 자리를 2개 이상 고른 순간 저절로 연다)
  const multiTargets = (!prefill && defaultChecked && defaultChecked.multi) ? defaultChecked.multi : null;
  // 새로 등록할 때(복사 · 다시 심기가 아닐 때)는 등록할 자리마다 개체수 칸이 자동으로 생긴다 (수요조사의 '베드별 개체수'처럼)
  const qtyTargets = prefill ? null : (multiTargets || (defaultChecked && defaultChecked.bedNo != null ? [defaultChecked] : null));
  const qtyHtml = qtyTargets ? `
      <div class="bf-sec">
        ${bfLbl('베드별 개체수', true)}
        <div class="bf-qty-list" data-keys="${qtyTargets.map(t=> `${t.bedNo}|${t.floor}`).join(',')}">${batchQtyRowsHtml(room, qtyTargets)}</div>
      </div>` : undefined;
  const roomText = roomLabel(srcRoom.name);   // 제목 아래 글: 작성 칸을 연 방 (세대진전 · 다시 심기는 수확한 방, 심을 방은 아래 '심을 위치'에서 고른다)
  // 수확 완료 목록의 [세대진전] · [다시 심기]로 열었는지: 같은 입력칸이고, 제목 · 위치 안내만 다르다
  const replant = !!(opts && opts.replant);
  const advance = replant && !!opts.advance;
  // 수확 완료 목록의 [N건 한번에 세대진전]: 공통 칸은 한 번, 심을 위치 · 개체수는 기록마다 (opts.bulk = { records, spots, diffKeys })
  const bulk = (advance && opts.bulk) ? opts.bulk : null;
  const replantName = replant ? (prefill.line_no || crossComboLabel(prefill) || prefill.name || '계통') : '';
  const locLabel = replant ? '심을 위치' : '복사할 위치';
  const heading = multiTargets ? workComposeHeading(room, multiTargets) : null;
  const title = bulk ? `세대진전 · ${bulk.records.length}건 한번에` : advance ? '세대진전' : replant ? '다시 심기' : prefill ? '이 정보를 다른 위치에 복사' : (heading ? heading.title : '집단 추가');
  const subtitle = bulk ? `${roomText} · 수확 완료한 ${bulk.records.length}건 (공통 내용은 한 번만 적어요)` : replant ? `${roomText} · 수확 완료한 ${replantName}` : heading ? heading.subtitle : (!prefill && defaultChecked) ? `${roomText} · ${workSpotLabel(room, defaultChecked)}` : roomText;
  panel.innerHTML = `
    <div class="batch-compose">
      <div class="panel-box-head"><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(subtitle)}</p></div></div>
      <div id="batchLocLocation" style="margin-bottom:11px;"></div>
      <div id="batchLocPlanRef"></div>
      <div id="batchLocFields"></div>
      <div class="batch-compose-actions">
        <button class="btn primary" onclick="submitBatchLocModal()">등록</button>
        ${multiTargets ? '<button class="btn" onclick="clearWorkMulti()">선택 해제</button>' : '<button class="btn" onclick="closeBatchLocModal()">취소</button>'}
      </div>
    </div>
  `;
  batchCompose = { sig: workSelectionSig(), replant, advance, auto: !!multiTargets, roomId: room.id, sourceId: (replant && !bulk) ? prefill.id : null, bulk };
  const defaultCropName = prefill?.name || null;

  if(bulk){
    document.getElementById('batchLocLocation').innerHTML = bulkAdvanceLocHtml(bulk.records, bulk.spots);
  } else if(multiTargets){
    document.getElementById('batchLocLocation').innerHTML = workMultiLocationHtml(room, multiTargets);
  } else if(defaultChecked){
    document.getElementById('batchLocLocation').innerHTML = `
      <input type="hidden" id="locTarget" value="${defaultChecked.bedNo}|${defaultChecked.floor}" />
      ${prefill ? '' : workSpotOccupancyHtml(room, [{ bedNo: Number(defaultChecked.bedNo), floor: defaultChecked.floor }])}
    `;
  } else if(bedCount > 0){
    const floorOptions = locFloorOptionsHtml(1, bedFloors);
    // [세대진전] · [다시 심기]는 맨 위에 '방' 칸이 더 붙는다 (한 줄에 방, 그 아래 줄에 베드 · 층)
    const roomSelHtml = replant ? `<select id="locRoomSel" style="flex:1 1 100%; min-width:0; margin-bottom:0;" onchange="syncLocRoom()">${plantRoomOptionsHtml(room.id)}</select>` : '';
    document.getElementById('batchLocLocation').innerHTML = `
      <label style="font-size:11px; color:var(--ink-faint); font-weight:700; display:block; margin-bottom:4px;">${locLabel}</label>
      <div style="display:flex; flex-wrap:wrap; gap:7px; margin-bottom:11px;">
        ${roomSelHtml}
        <select id="locBedNo" style="flex:1; min-width:0; margin-bottom:0;" onchange="syncLocFloorOptions()">${locBedOptionsHtml(room)}</select>
        <select id="locFloorSel" style="flex:1; min-width:0; margin-bottom:0;">${floorOptions}</select>
      </div>
    `;
    // [세대진전] · [다시 심기]: 미리 골라 둔 자리로 맞춘다 (층 칸은 베드를 고른 뒤에 채워진다).
    // 미리 골라 둔 자리(opts.spot)는 수확한 방 기준이라, 다른 방에서 시작할 때는 그 방의 첫 빈 자리를 쓴다
    const presel = replant ? ((opts.spot && room === srcRoom) ? opts.spot : firstEmptySpot(room)) : null;
    if(presel){
      const bedSel = document.getElementById('locBedNo'), floorSel = document.getElementById('locFloorSel');
      if([...bedSel.options].some(o=> o.value === String(presel.bedNo))){
        bedSel.value = String(presel.bedNo);
        syncLocFloorOptions();
        if([...floorSel.options].some(o=> o.value === presel.floor)) floorSel.value = presel.floor;
      }
    }
  } else {
    document.getElementById('batchLocLocation').innerHTML = `
      <label style="font-size:11px; color:var(--ink-faint); font-weight:700; display:block; margin-bottom:4px;">${locLabel}</label>
      <div style="font-size:12.5px; color:var(--ink-faint); padding:8px 0;">이 방엔 베드가 없어요</div>
    `;
  }

  // 사용 목적별 양식 (수요조사와 같은 구성). 복사할 때는 원래 계통의 목적 그대로, 새로 등록할 때는 세대단축으로 시작하고 분기별 계획을 누르면 그 계획의 목적으로 바뀐다
  const fieldsRoot = document.getElementById('batchLocFields');
  fieldsRoot.setAttribute('data-bf-root', '');
  fieldsRoot.dataset.bfMode = 'create';
  const formValues = prefill ? batchFormValues(prefill) : { use_purpose:'세대단축', name: defaultCropName };
  fieldsRoot.innerHTML = batchFormHtml(formValues, 'create', { qtyHtml: bulk ? '' : qtyHtml });   // 한번에 세대진전은 개체수를 위 '심을 위치' 줄마다 받는다
  if(bulk){
    // 기록마다 값이 다른 칸은 '(계통마다 원래 값 유지)'로 잠가 둔다 (저장할 때 기록마다 원래 값이 들어간다)
    fieldsRoot.querySelectorAll('input').forEach(inp=>{
      if(inp.value === BULK_KEEP_TEXT){ inp.readOnly = true; inp.classList.add('bf-bulk-keep'); inp.title = '계통마다 값이 달라서 원래 값을 그대로 써요'; }
    });
  }
  if(advance){
    // 입력칸 맨 위(제목)가 보이도록 올리고, 고쳐야 하는 칸(세대 · 파종일)과 바꿔도 되는 칸(심을 위치)을 강조한다
    panel.scrollIntoView({ behavior:'smooth', block:'start' });
    markFieldsForEdit(fieldsRoot, prefill);
  }

  // 새로 추가할 때만 그 베드·층의 분기별 계획을 보여준다 (다른 위치로 복사할 때는 보여주지 않는다)
  // (자리를 하나만 골랐을 때만. 여러 자리를 골랐으면 어느 자리의 계획인지 알 수 없어서 보여주지 않는다)
  renderBatchPlanRef(room, prefill ? null : multiTargets ? (multiTargets.length === 1 ? multiTargets[0] : null)
    : defaultChecked ? { bedNo: Number(defaultChecked.bedNo), floor: defaultChecked.floor } : null);
  // 화면이 좁아 작성 패널이 아래로 내려가 있으면 입력칸이 보이도록 스크롤해 준다
  // (자리를 눌러 저절로 열리는 칸은 베드 맵에서 계속 자리를 누를 수 있게 스크롤하지 않는다)
  if(!multiTargets && window.matchMedia('(max-width: 1150px)').matches) panel.scrollIntoView({ behavior:'smooth', block:'start' });
}

// 새로 등록할 때 자리마다 한 줄씩 나오는 '베드별 개체수' 칸 (수요조사의 베드별 예상 개체수와 같은 모양)
function batchQtyRowsHtml(room, targets){
  return targets.map(t=>{
    const n = workSpotBatches(room, Number(t.bedNo), t.floor).length;   // 이미 재료가 있는 자리는 '사용중 N' 뱃지
    return `<div class="bf-qty-row">
    <span>${escapeHtml(workSpotLabel(room, t))}</span>
    ${n ? `<em class="bf-qty-used" title="이 자리에 이미 계통 ${n}개가 있어요">사용중 ${n}</em>` : ''}
    <input type="number" min="0" inputmode="numeric" data-qty-key="${t.bedNo}|${t.floor}" placeholder="개체수" />
  </div>`;
  }).join('');
}

// 자리를 눌러 열린 작성 칸의 제목: 한 자리면 '집단 추가 · 방 · 베드 3 · 1층', 여러 자리면 '집단 추가 · N곳'
function workComposeHeading(room, targets){
  const roomText = roomLabel(room.name);
  return targets.length > 1 ? { title:`집단 추가 · ${targets.length}곳`, subtitle: roomText }
    : { title:'집단 추가', subtitle:`${roomText} · ${workSpotLabel(room, targets[0])}` };
}

// 작성 칸 위쪽의 '등록할 자리' 칸: 등록할 자리 목록(숨은 칸)과, 이미 계통이 있는 자리가 섞여 있을 때의 안내
function workMultiLocationHtml(room, targets){
  // 여러 자리를 골랐고 그 자리들에 심긴 계통이 있으면, 주황 '사용중' 상자 바로 아래에 [한번에 수확] 버튼을 둔다
  const harvestable = targets.length > 1 ? workBulkHarvestTargets(room, targets) : [];
  const bulkBtn = (canWriteMaterials() && harvestable.length)
    ? `<button type="button" class="bulk-harvest-btn" onclick="bulkHarvestSelected()">선택한 자리 계통 ${harvestable.length}개 한번에 수확</button>` : '';
  return `
    <input type="hidden" id="locTargets" value="${targets.map(t=> `${t.bedNo}|${t.floor}`).join(',')}" />
    ${workSpotOccupancyHtml(room, targets)}
    ${bulkBtn}`;
}

// 고른 자리들에 지금 심겨 있는(수확 안 한) 계통 중 수확할 수 있는 것 (계통 카드에 [수확] 버튼이 나오는 것과 같은 기준: 작물이나 계통번호가 적혀 있음)
function workBulkHarvestTargets(room, targets){
  const seen = new Set(), out = [];
  targets.forEach(t=> workSpotBatches(room, Number(t.bedNo), t.floor).forEach(m=>{
    if((m.name || m.line_no) && !seen.has(m.id)){ seen.add(m.id); out.push(m); }
  }));
  return out;
}

// [한번에 수확]: 고른 자리들의 계통을 한꺼번에 수확(고온검정은 검정완료, 인공교배는 사용완료 · 기타는 실험완료) 처리한다.
// 하나씩 누르는 [수확] · [검정완료]와 똑같이 harvested_at · harvest_confirmed_at만 기록한다 (세대 이력 등 다른 기록은 건드리지 않는다)
async function bulkHarvestSelected(){
  if(tourBlockWrite()) return;
  if(!canWriteMaterials()) return;
  const room = rooms.find(r=> r.id===workActiveRoomId);
  if(!room) return;
  const list = workBulkHarvestTargets(room, workMultiTargets());
  if(!list.length){ showToast('수확할 계통이 없어요'); return; }
  const line = (m)=>{
    const title = m.line_no || (batchPurposeOf(m)==='인공교배' ? crossComboLabel(m) : '') || m.name || '(계통번호 없음)';
    const done =m.record_type==='heat_test' ? '검정완료' : batchDoneLabel(m);
    return `· ${spotText(m.structure_no, m.floor)} — ${title}${m.generation ? ` (${m.generation})` : ''} → ${done}`;
  };
  const MAX = 12;
  const lines = list.slice(0, MAX).map(line).join('\n') + (list.length > MAX ? `\n… 외 ${list.length - MAX}개` : '');
  if(!confirm(`선택한 자리의 계통 ${list.length}개를 한번에 수확 처리할까요?\n이 자리들이 비워져요. (나중에 "수확 완료 목록"에서 이어서 심을 수 있어요)\n\n${lines}`)) return;
  const now = new Date().toISOString();
  const { error } = await sb.from('materials').update({ harvested_at: now, harvest_confirmed_at: now }).in('id', list.map(m=> m.id));
  if(error){ alert('처리 실패!\n\n' + (error.message||JSON.stringify(error))); return; }
  batchCompose = null;
  workMultiSpots = new Set();   // 수확을 마쳤으니 선택을 푼다
  showToast(`계통 ${list.length}개를 한번에 수확 처리했어요, 자리가 비워졌어요`);
  await loadAll();
}

// 고른 자리에 이미 재료가 있는지 한눈에 보여 주는 안내 (저장을 막지는 않는다)
//  · 재료가 있는 자리가 하나라도 있으면: 주황 상자 + 자리별로 지금 심겨 있는 계통(작물 · 계통번호 · 세대 · 파종일 · 개체수)
//  · 모두 비어 있으면: 아무것도 보여 주지 않는다
//  opts.actions: 자리를 하나만 고른 화면용. 계통 카드 대신 이 상자에서 바로 [수확] · [편집] 등을 누르고, 수확까지 남은 날도 보여 준다
function workSpotOccupancyHtml(room, targets, opts = {}){
  if(!room || !targets || !targets.length) return '';
  const used = targets.map(t=> ({ t, list: workSpotBatches(room, Number(t.bedNo), t.floor) })).filter(x=> x.list.length);
  if(!used.length) return '';
  const e = escapeHtml;
  const itemHtml = (m)=>{
    const kind = batchPurposeOf(m);
    const title = m.line_no || (kind==='인공교배' ? crossComboLabel(m) : '') || m.name || '(계통번호 없음)';
    const meta = [
      (m.name && m.name !== title) ? m.name : '',
      kind !== '세대단축' ? kind : '',
      m.generation || '',
      m.sowing_date ? `파종 ${m.sowing_date}` : '',
      m.quantity != null ? `${Number(m.quantity).toLocaleString()}개체` : ''
    ].filter(Boolean).map(e).join(' · ');
    // 한 자리 화면: 수확예정일 · 남은 날 + 계통 카드에 있던 버튼 (같은 함수를 부른다)
    let extra = '', btns = '';
    if(opts.actions){
      if(m.harvest_date){
        const st = workRowStatus(m.harvest_date);
        extra = `<span class="mt">수확예정 ${e(m.harvest_date)}</span><span class="wbed-chip" style="${st.style}" title="${e(daysLeftLabel(m.harvest_date))}">${st.label}</span>`;
      }
      const b = (text, handler, style)=> `<button type="button" class="btn small" onclick="${handler}('${m.id}')" style="padding:3px 8px; font-size:11px;${style || ''}">${text}</button>`;
      const amber = ' color:var(--amber); border-color:var(--amber);';
      if(historySummary(m.id)) btns += b('세대 이력', 'openHistoryModal', amber);
      if(canWriteMaterials() && (m.name || m.line_no)){
        btns += m.record_type==='heat_test' ? b('검정완료', 'completeHeatTest', amber) : b(batchDoneLabel(m), 'harvestAndReplant', amber);
        btns += b(expandedBatchIds.has(m.id) ? '접기' : '편집', 'toggleBatchExpand');
        btns += b('삭제', 'deleteMaterial', ' color:var(--danger); border-color:var(--danger);');
      }
    }
    return `<div class="spot-occupied-item">
      <span class="crop-dot" style="background:${cropColor(m.name)}; width:8px; height:8px;"></span>
      <span class="nm" style="color:${cropColor(m.name)};">${e(title)}</span>
      ${meta ? `<span class="mt">${meta}</span>` : ''}
      ${extra}
      ${btns ? `<span class="spot-occupied-btns">${btns}</span>` : ''}
    </div>`;
  };
  return `
    <div class="spot-occupied">
      <div class="spot-occupied-head"><span class="ico">!</span>사용중</div>
      ${used.map(x=> `<div class="spot-occupied-spot"><b>${e(workSpotLabel(room, x.t))}</b>${x.list.map(itemHtml).join('')}</div>`).join('')}
    </div>`;
}

// 자리를 눌러 열린 작성 칸에서 자리를 더 누르거나 뺄 때: 입력하던 내용은 그대로 두고, 자리 안내와 베드별 개체수 칸만 새로 맞춘다
// (이미 적은 개체수는 남아 있는 자리에 그대로 둔다)
function refreshWorkMultiCompose(room){
  const targets = workMultiTargets();
  const loc = document.getElementById('batchLocLocation');
  const list = document.querySelector('#batchLocFields .bf-qty-list');
  if(!loc || !list) return;
  loc.innerHTML = workMultiLocationHtml(room, targets);
  const keys = targets.map(t=> `${t.bedNo}|${t.floor}`).join(',');
  if(list.dataset.keys !== keys){   // 자리가 그대로면(다른 사람이 저장해서 다시 그려진 경우) 칸을 건드리지 않아서 입력 중인 커서가 유지된다
    const kept = {};
    list.querySelectorAll('[data-qty-key]').forEach(i=>{ kept[i.dataset.qtyKey] = i.value; });
    list.innerHTML = batchQtyRowsHtml(room, targets);
    list.dataset.keys = keys;
    list.querySelectorAll('[data-qty-key]').forEach(i=>{ if(kept[i.dataset.qtyKey]) i.value = kept[i.dataset.qtyKey]; });
    renderBatchPlanRef(room, targets.length === 1 ? targets[0] : null);   // 한 자리만 남았으면 그 자리의 분기별 계획을 보여준다
  }
  const head = workComposeHeading(room, targets);
  const h3 = document.querySelector('#workRoomDetail .batch-compose .panel-box-head h3');
  const sub = document.querySelector('#workRoomDetail .batch-compose .panel-box-head p');
  if(h3) h3.textContent = head.title;
  if(sub) sub.textContent = head.subtitle;
}

// 복사할 위치의 층 칸: 통로를 고르면 '통로' 하나, 베드를 고르면 그 방의 층들
function locFloorOptionsHtml(bedNo, bedFloors){
  if(isAisleSpot(bedNo)) return `<option value="${AISLE_FLOOR}">${AISLE_FLOOR}</option>`;
  return bedFloors===2 ? `<option value="1층">1층</option><option value="2층">2층</option>` : `<option value="1층">1층</option>`;
}

// 복사 · 세대진전 · 다시 심기할 위치의 베드 칸: 그 방의 베드 번호들 (인공교배실은 통로도). selectedBedNo가 있으면 그 베드를 골라 둔다
function locBedOptionsHtml(room, selectedBedNo){
  const info = workRoomInfo(room);
  let html = '';
  for(let i = 1; i <= info.bedCount; i++) html += `<option value="${i}"${i===selectedBedNo ? ' selected' : ''}>베드 ${i}</option>`;
  if(AISLE_ROOMS.has(room.name)) html += `<option value="${AISLE_BED_NO}"${selectedBedNo===AISLE_BED_NO ? ' selected' : ''}>통로</option>`;   // 인공교배실은 통로로도 심을 수 있다
  return html;
}

// 지금 고른 심을 방의 층 수 (심을 방 칸이 없으면 작성 칸을 연 방)
function locBedFloors(){
  const room = rooms.find(r=> r.id===batchLocModalRoomId);
  return room ? workRoomInfo(room).bedFloors : 2;
}

function syncLocFloorOptions(){
  const bedSel = document.getElementById('locBedNo'), floorSel = document.getElementById('locFloorSel');
  if(!bedSel || !floorSel) return;
  const keep = floorSel.value;
  floorSel.innerHTML = locFloorOptionsHtml(parseInt(bedSel.value), locBedFloors());
  if([...floorSel.options].some(o=> o.value===keep)) floorSel.value = keep;
}

// [세대진전] · [다시 심기]에서 심을 방을 바꿨을 때: 베드 · 층 칸을 그 방 것으로 바꾸고, 그 방의 첫 빈 자리를 골라 둔다
function syncLocRoom(){
  const roomSel = document.getElementById('locRoomSel'), bedSel = document.getElementById('locBedNo'), floorSel = document.getElementById('locFloorSel');
  const room = roomSel && rooms.find(r=> r.id===roomSel.value);
  if(!room || !bedSel || !floorSel) return;
  batchLocModalRoomId = room.id;
  const info = workRoomInfo(room);
  const spot = firstEmptySpot(room) || { bedNo: 1, floor: info.floors.slice(-1)[0] };
  bedSel.innerHTML = locBedOptionsHtml(room, spot.bedNo);
  floorSel.innerHTML = locFloorOptionsHtml(spot.bedNo, info.bedFloors);
  if([...floorSel.options].some(o=> o.value===spot.floor)) floorSel.value = spot.floor;
}

// ── 계통작성 입력 양식: 수요조사와 같은 모양이고, 사용 목적(세대단축 · 인공교배 · 고온검정 · 기타)마다 받는 칸이 다르다 ─────────
// 집단 추가 · 복사 입력칸과 계통 카드의 편집 칸이 같은 양식(batchFormHtml)을 쓰고, 읽는 곳도 하나(readBatchForm)다.
//  · 세대단축: 담당자 · 작물 · 계통번호 · 교배조합 · 교배목적 · 세대 · 생육일수 · 시작일 · 종료일 · 개체수
//  · 인공교배: 계통번호 없음 · 교배조합 · 교배목적 · 사용기간 · 개체수
//  · 고온검정: 계통/품종 · 검정 목적 · 처리 온도 · 처리 단계 · 일장 · 사용기간 · 개체수
//  · 기타: 계통/품종 · 실험 내용 · 처리 요인 · 처리 구간(적용 시기 + 조건) · 사용기간 · 개체수
// 저장 칸: 사용 목적은 record_type(고온검정만) + use_purpose(인공교배 · 기타, 새 컬럼)에, 온도 · 일장 · 처리 조건은 test_condition에 글로 담는다.
// 담당자는 manager에, 사용기간(시작일 ~ 종료일)은 sowing_date ~ harvest_date에 담는다.
const BATCH_PURPOSES = ['세대단축','인공교배','고온검정','기타'];

const MATERIAL_PURPOSE_SQL = 'alter table materials add column if not exists use_purpose text;';

// 수확 완료한 계통을 세대진전 · 다시 심기로 등록한 시각 (값이 있으면 수확 완료 목록에서 뺀다)
const MATERIAL_REPLANT_SQL = 'alter table materials add column if not exists replanted_at timestamptz;';

// ── 인공교배: 대표 교배조합 + '외 N조합' ──
// cross_extra = 대표 조합 말고 더 있는 조합 수 (비우면 null = 조합 1개). 계통(materials) · 수요조사(demand_survey) · 계획(bed_plans)에 같은 뜻으로 담는다
const CROSS_EXTRA_SQL = 'alter table materials add column if not exists cross_extra integer;\nalter table demand_survey add column if not exists cross_extra integer;\nalter table bed_plans add column if not exists cross_extra integer;';

function crossExtraOf(x){ const n = parseInt(x && x.cross_extra); return n > 0 ? n : 0; }

// '선풍/남천 외 3조합' (외 N이 없으면 교배조합 그대로, 교배조합이 없으면 '')
function crossComboLabel(x){
  const c = String((x && x.cross_combo) ?? '').trim();
  if(!c) return '';
  const n = crossExtraOf(x);
  return n ? `${c} 외 ${n}조합` : c;
}

// 계통 이름(카드 · 베드 맵 칸): 계통번호 → (인공교배면) '교배조합 외 N조합' → 작물
function batchTitleOf(b){
  return (b && (b.line_no || (batchPurposeOf(b)==='인공교배' ? crossComboLabel(b) : '') || b.name)) || '(계통번호 없음)';
}

// 칸 값 → 저장 값 (비었거나 0 이하면 null)
function parseCrossExtra(v){ const n = parseInt(String(v ?? '').trim()); return n > 0 ? n : null; }

// 저장할 줄에서 cross_extra를 정리: 값이 없고 원래도 없던 줄이면 아예 빼서, 컬럼이 아직 없는 DB에서도 평소 저장이 막히지 않게 한다
function tidyCrossExtra(row, original){
  if(row.cross_extra == null && !(original && original.cross_extra != null)) delete row.cross_extra;
  return row;
}

function isCrossExtraColError(error){ return !!error && /cross_extra/.test(error.message || ''); }

function stripCrossExtra(rows){ return rows.map(r=>{ const c = { ...r }; delete c.cross_extra; return c; }); }

function crossExtraDroppedAlert(){
  alert("저장은 됐지만, '외 N조합'은 해당 테이블에 컬럼이 없어 저장되지 않았어요.\n\n(관리자 확인 필요) Supabase SQL Editor에서 아래를 한 번 실행해주세요:\n\n" + CROSS_EXTRA_SQL);
}

// 저장된 계통의 사용 목적 (use_purpose 컬럼이 없던 예전 계통은 record_type으로 알아낸다)
function batchPurposeOf(b){
  if(b && b.record_type === 'heat_test') return '고온검정';
  const u = b && b.use_purpose;
  if(BATCH_PURPOSES.includes(u)) return u;
  // 사용 목적이 저장돼 있지 않은 계통(use_purpose 컬럼을 아직 안 만들었거나 예전에 등록한 것): 인공교배실에 있고
  // 세대도 계통번호도 없으면 인공교배로 본다 (인공교배는 계통번호 없이 교배조합으로 등록하는 목적이다)
  const room = b && typeof rooms !== 'undefined' ? rooms.find(r=> r.id===b.room_id) : null;
  if(room && AISLE_ROOMS.has(room.name) && !b.generation && !b.line_no) return '인공교배';
  return '세대단축';
}

// 분기별 계획의 사용 목적 → 계통 양식 (세대단축 · 인공교배 · 고온검정 · 직접 적은 실험 내용은 기타). 알 수 없으면 null
function planPurposeKind(p){
  const u = String(p.use_purpose || '').trim();
  if(['세대단축','인공교배','고온검정'].includes(u)) return u;
  if(u) return '기타';
  return p.generation ? '세대단축' : null;
}

// 수요조사의 '처리 조건'(온도 · 일장 · 구간별 조건)은 계획으로 옮겨질 때 요청사항 글에 합쳐져 있다. 그 줄에서 꺼낸다
function planCondText(p){ const m = /처리 조건:\s*([^\n]*)/.exec(p.notes || ''); return m ? m[1].trim() : ''; }

// '온도 25℃, 일장 10시간' ↔ { temp:'25℃', day:'10시간' }
function parseEnvCond(s){
  const t = /온도\s*([^,]+)/.exec(s || ''), d = /일장\s*([^,]+)/.exec(s || '');
  return { temp: t ? t[1].trim() : '', day: d ? d[1].trim() : '' };
}

function joinEnvCond(temp, day){ return [temp && `온도 ${temp}`, day && `일장 ${day}`].filter(Boolean).join(', '); }

function withUnit(v, unit){ return v && !String(v).endsWith(unit) ? v + unit : (v || ''); }

// ── 양식 그리기: 수요조사 양식과 같은 모양이다 (mode: 'create' 새로 등록 · 'edit' 계통 카드 편집) ──
//  사용 목적 · 작물 · 세대는 칩으로 하나만 고르고(칩 값은 숨은 칸 data-bf에 담긴다), 목적마다 받는 칸이 달라진다. 수요조사와 다른 점:
//  · 세대는 하나만 고른다 (계통 하나는 세대 하나) · 개체수는 '베드별 개체수' · 자유 요청사항은 없다 (저장할 칸이 없다)
const WORK_GEN_STAGES = SURVEY_GEN_STAGES;   // 세대 칩: 수요조사와 같은 F1~F6 (예전 계통에 다른 세대가 적혀 있으면 그 값은 칩이 하나 더 생겨서 그대로 보인다)

function bfLbl(text, req){ return `<div class="bf-lbl">${text}${req ? ' <span class="bf-req">*</span>' : ''}</div>`; }

function bfChipHtml(val, on){ return `<button type="button" class="task-bed-chip${on ? ' active' : ''}" data-val="${escapeHtml(val)}" onclick="bfChip(this)">${escapeHtml(val)}</button>`; }

// 하나만 고르는 칩 줄. 목록에 없는 값(예전에 적어 둔 작물 · 세대)은 칩을 하나 더 만들어 골라 둔다
function bfChipsHtml(field, options, selected){
  const list = (!selected || options.includes(selected)) ? options : [...options, selected];
  return `<div class="task-bed-chips" data-chips="${field}">${list.map(o=> bfChipHtml(o, o === selected)).join('')}</div>`;
}

// 작물의 기본 생육일수 (수요조사와 같은 기준: SURVEY_DEFAULT_DAYS가 우선, 없으면 작물별 기본 기간). 없으면 null
function bfDefaultDaysFor(crop){
  const n = crop ? Number(SURVEY_DEFAULT_DAYS[crop] ?? cropProfiles[crop]) : NaN;
  return n > 0 ? Math.floor(n) : null;
}

function bfDaysHint(crop){
  if(!crop) return '';
  return bfDefaultDaysFor(crop) != null ? '다르면 수정해주세요.' : '이 작물은 기본 생육일수가 없어요. 생육일수를 직접 쓰거나 종료일을 달력에서 골라주세요.';
}

// 고온검정의 처리 조건 글('45℃ · V1~V6 · 일장 10시간') ↔ 처리 온도 · 처리 단계 · 일장. 어떤 글이든 칸에 나눠 담았다가 같은 글로 돌아온다
function parseHeatCond(s){
  const parts = String(s || '').split(' · ').map(x=> x.trim()).filter(Boolean);
  let day = '';
  const rest = parts.filter(x=>{ const m = /^일장\s*(.+)$/.exec(x); if(m && !day){ day = m[1].trim(); return false; } return true; });
  const temp = rest.length && /℃|^[\d.\s~\-–,]+$/.test(rest[0]) ? rest.shift() : '';
  return { temp, stage: rest.join(' · '), day };
}

// 기타(실험)의 처리 조건 글 → 구간 목록 [{ when, 온도, 일장 }]. '발아 후 ~14일: 온도 25℃, 일장 10시간 → 개화기 이후: 온도 30℃'
// 온도 · 일장만 담긴 구간만 칸으로 나누고, 그 밖의 글이 섞여 있으면 구간 전체를 '적용 시기' 칸에 그대로 둔다 (저장할 때 같은 글로 돌아오도록)
function bfParsePhases(text){
  return String(text || '').split(' → ').map(s=> s.trim()).filter(Boolean).map(s=>{
    let when = s, condText = '';
    const m = /^(.*?):\s*((?:온도|일장)\s.*)$/.exec(s);
    if(m){ when = m[1].trim(); condText = m[2]; }
    else if(/^(?:온도|일장)\s/.test(s)){ when = ''; condText = s; }
    if(condText && !condText.split(/,\s*/).filter(Boolean).every(x=> /^(?:온도|일장)\s/.test(x))){ when = s; condText = ''; }
    const c = parseEnvCond(condText);
    return { when, '온도': c.temp, '일장': c.day };
  });
}

// 처리 구간 카드 한 장 (수요조사와 같은 모양): [적용 시기] + 고른 요인(온도 · 일장)의 조건 칸
function bfPhaseHtml(i, p, factorsOn, many){
  const conds = Object.entries(SURVEY_EXP_FACTORS).map(([f, { unit, ph }])=>`
        <label class="sexp-cond" data-f="${f}" style="display:${factorsOn.includes(f) ? 'flex' : 'none'};">
          ${f} 조건
          <input class="sexp-val" data-f="${f}" placeholder="${ph}" value="${escapeHtml(withUnit(p[f] || '', unit))}" onfocus="unitFocus(this,'${unit}')" oninput="unitInput(this,'${unit}')" onblur="unitBlur(this,'${unit}')" />
        </label>`).join('');
  return `
    <div class="sgen-card sexp-card">
      <div class="sgen-head"><span class="sexp-title">구간 ${i + 1}</span><button type="button" class="sexp-del" title="이 구간 삭제" style="display:${many ? '' : 'none'};" onclick="bfRemovePhase(this)">✕</button></div>
      <label>적용 시기
        <input class="sexp-when" placeholder="예: 발아 후 ~14일, 개화기(R1) 이후" value="${escapeHtml(p.when || '')}" />
      </label>
      <div class="sexp-conds">${conds}
      </div>
    </div>`;
}

// v: { use_purpose, manager, name, line_no, cross_combo, generation, purpose, quantity, sowing_date, expected_days, harvest_date, test_condition }
// extra.qtyHtml: '개체수' 한 칸 대신 넣을 칸 (새로 등록할 때의 '베드별 개체수') · extra.progressHtml / histHtml: 계통 카드 편집에서 덧붙이는 진행 막대 · 세대 이력
function batchFormHtml(v, mode, extra = {}){
  const e = escapeHtml, create = mode === 'create';
  const purpose = BATCH_PURPOSES.includes(v.use_purpose) ? v.use_purpose : '세대단축';
  const grow = purpose === '세대단축';
  // sec: 목적이 바뀔 때 보이고 숨길 구역 표시 · 지금 목적에서 안 쓰는 구역은 처음부터 숨긴다
  const sec = (list, cls = 'bf-sec', style = '')=> `class="${cls}" data-sec data-for="${list}" style="${list.split(' ').includes(purpose) ? '' : 'display:none;'}${style}"`;
  const req = create ? ' <span class="bf-req">*</span>' : '';
  const unitAttrs = (u)=> `onfocus="unitFocus(this,'${u}')" oninput="unitInput(this,'${u}')" onblur="unitBlur(this,'${u}')"`;
  const env = (grow || purpose === '인공교배') ? parseEnvCond(v.test_condition) : { temp:'', day:'' };
  const heat = purpose === '고온검정' ? parseHeatCond(v.test_condition) : { temp:'', stage:'', day:'' };
  const phases = purpose === '기타' ? bfParsePhases(v.test_condition) : [];
  const factorsOn = Object.keys(SURVEY_EXP_FACTORS).filter(f=> phases.some(p=> p[f]));
  if(!phases.length) phases.push({});
  // 세대단축: 생육일수 + 시작일 → 종료일 (시작일 + 생육일수). 새로 등록할 때 생육일수가 비어 있으면 작물의 기본값을 미리 넣는다
  const defDays = create && grow && v.expected_days == null ? bfDefaultDaysFor(v.name) : null;
  const days = grow ? (v.expected_days ?? defDays) : null;
  const sow = grow ? (v.sowing_date || '') : '';
  const harvest = grow ? (v.harvest_date || (sow && days != null ? addDays(sow, days) : '')) : '';
  const harvestManual = grow && !!v.harvest_date && !!sow && days != null && v.harvest_date !== addDays(sow, days);   // 직접 고른 종료일은 생육일수를 바꿔도 그대로 둔다
  const useStart = grow ? '' : (v.sowing_date || ''), useEnd = grow ? '' : (v.harvest_date || '');
  const lineWide = purpose === '고온검정' || purpose === '기타';
  return `
    <div class="bf-form${create ? '' : ' card-extra'}">
      <div class="bf-sec"><input data-bf="manager" placeholder="담당자(이름)${create ? ' *' : ''}" value="${e(v.manager || '')}" style="width:50%;" /></div>

      <div class="bf-sec">
        ${bfLbl('사용 목적', create)}
        <input type="hidden" data-bf="use_purpose" value="${purpose}" />
        <div class="task-bed-chips" data-chips="use_purpose">${BATCH_PURPOSES.map(p=> bfChipHtml(p, p === purpose)).join('')}</div>
        <input data-bf="purpose_etc" data-sec data-for="기타" style="margin-top:8px;${purpose === '기타' ? '' : ' display:none;'}" placeholder="실험 내용을 적어주세요 (예: 일장 반응 실험)" value="${e(v.purpose || '')}" />
        <input data-bf="purpose_heat" data-sec data-for="고온검정" style="margin-top:8px;${purpose === '고온검정' ? '' : ' display:none;'}" placeholder="검정 목적을 적어주세요 (예: 고온검정 조건 확립)" value="${e(v.purpose || '')}" />
      </div>

      <div class="bf-sec">
        ${bfLbl('작물', create)}
        <input type="hidden" data-bf="name" value="${e(v.name || '')}" />
        ${bfChipsHtml('name', SURVEY_CROP_OPTIONS, v.name || '')}
      </div>

      <label ${sec('세대단축 고온검정 기타', 'bf-sec bf-field', `width:${lineWide ? '100%' : '50%'};`)} data-line-wrap>
        <span data-lbl="line">${lineNoLabel(purpose)} (선택)</span>
        <input data-bf="line_no" placeholder="${e(lineNoPlaceholder(purpose))}" value="${e(v.line_no || '')}" />
      </label>

      <div ${sec('세대단축 인공교배', 'bf-sec bf-cols')}>
        <label class="bf-field"><span>교배조합${req}</span>
          <span class="cross-combo-row">
            <input data-bf="cross_combo" placeholder="예: 선풍/남천" value="${e(v.cross_combo || '')}" />
            <span class="cross-extra" data-sec data-for="인공교배" style="${purpose === '인공교배' ? '' : 'display:none;'}" title="대표 교배조합 말고 더 있는 조합 수 (없으면 비워 두세요)">외 <input data-bf="cross_extra" type="number" min="0" step="1" inputmode="numeric" value="${crossExtraOf(v) || ''}" /> 조합</span>
          </span>
        </label>
        <label class="bf-field"><span>교배목적<span data-sec data-for="인공교배" style="${purpose === '인공교배' ? '' : 'display:none;'}">(1개만 작성)</span>${req}</span><input data-bf="purpose_breed" placeholder="예: 내병성" value="${e(v.purpose || '')}" /></label>
      </div>

      <!-- 세대단축 · 인공교배는 온도 · 일장을 화면에서 받지 않는다. 이미 저장된 값이 있으면 고쳐 저장해도 지워지지 않게 숨은 칸에 그대로 둔다 -->
      <input type="hidden" data-bf="env_temp" value="${e(withUnit(env.temp, '℃'))}" />
      <input type="hidden" data-bf="env_day" value="${e(withUnit(env.day, '시간'))}" />

      ${create ? `<div ${sec('고온검정', 'bf-sec bf-guide')}>
        <b>반복 실험일경우</b>
        <ol>
          <li>품종은 <b>한 번만</b> 적어요. (반복 횟수는 안 적어요)</li>
          <li>반복 수만큼 <b>베드 칸을 눌러요.</b> 3반복이면 3칸이에요.</li>
          <li>칸마다 <b>개체수</b>를 적고 등록해요.</li>
        </ol>
        <div style="margin-top:4px;">품종이 다른 묶음은 따로 등록해요.</div>
      </div>` : ''}

      <div ${sec('고온검정')}>
        <div class="bf-cols" style="margin-bottom:10px;">
          <label class="bf-field">처리 온도<input data-bf="heat_temp" placeholder="예: 45℃" value="${e(heat.temp)}" ${TEMP_INPUT_ATTRS} /></label>
          <label class="bf-field" style="flex:1.6;">처리 단계<input data-bf="heat_stage" placeholder="예: V1~V6, 개화기(R1~R2), 성숙기(R7)" value="${e(heat.stage)}" /></label>
        </div>
        <label class="bf-field" style="width:50%;">일장<input data-bf="heat_day" placeholder="${SURVEY_EXP_FACTORS['일장'].ph}" value="${e(withUnit(heat.day, '시간'))}" ${unitAttrs('시간')} /></label>
      </div>

      <div ${sec('기타')}>
        <div style="margin-bottom:12px;">
          ${bfLbl('처리 요인 (복수 선택 가능)')}
          <div class="task-bed-chips" data-chips="factor">${Object.keys(SURVEY_EXP_FACTORS).map(f=> bfChipHtml(f, factorsOn.includes(f))).join('')}</div>
        </div>
        ${bfLbl('처리 구간 (중간에 조건이 바뀌면 구간을 추가해주세요)')}
        <div class="sgen-help" data-exp-hint style="margin:0 0 6px; display:${factorsOn.length ? 'none' : ''};">위에서 처리 요인을 고르면 구간마다 조건 칸이 나와요</div>
        <div class="sexp-list" data-phases>${phases.map((p, i)=> bfPhaseHtml(i, p, factorsOn, phases.length > 1)).join('')}</div>
        <button type="button" class="btn small" style="margin-top:8px;" onclick="bfAddPhase(this)">+ 구간 추가</button>
      </div>

      <div ${sec('인공교배 고온검정 기타')}>
        ${bfLbl('사용기간', create)}
        <div class="bf-range">
          <input data-bf="use_start" type="date" value="${useStart}" />
          <span>~</span>
          <input data-bf="use_end" type="date" value="${useEnd}" />
        </div>
      </div>

      <div ${sec('세대단축')}>
        ${bfLbl('세대 선택', create)}
        <div class="bf-chipbox" data-gen-box>
          <input type="hidden" data-bf="generation" value="${e(v.generation || '')}" />
          ${bfChipsHtml('generation', WORK_GEN_STAGES, v.generation || '')}
        </div>
        <div class="sgen-main">
          <label><span>생육일수</span>
            <span class="sgen-days"><input data-bf="expected_days" type="number" min="0" inputmode="numeric" placeholder="예: 60" value="${days ?? ''}" data-auto="${defDays != null ? '1' : ''}" oninput="bfDaysChanged(this)" /><i>일</i></span>
          </label>
          <div class="sgen-hint" data-days-hint>${e(create ? bfDaysHint(v.name) : '')}</div>
        </div>
        <div class="sgen-list">
          <div class="sgen-card">
            <div class="sgen-head" data-gen-head>${e(v.generation || '기간')}</div>
            <div class="sgen-grid">
              <label><span data-lbl="sow">시작일</span>
                <input data-bf="sowing_date" type="date" value="${sow}" onchange="bfStartChanged(this)" />
              </label>
              <label>종료일
                <input data-bf="harvest_date" type="date" value="${harvest}" data-manual="${harvestManual ? '1' : ''}" onchange="bfEndChanged(this)" />
              </label>
            </div>
          </div>
        </div>
      </div>

      ${extra.qtyHtml ?? `<div class="bf-sec">
        ${bfLbl('개체수')}
        <input data-bf="quantity" type="number" min="0" inputmode="numeric" placeholder="개체수" value="${v.quantity ?? ''}" style="width:50%;" />
      </div>`}
      ${extra.progressHtml ? `<div class="bf-sec">${extra.progressHtml}</div>` : ''}
      ${extra.histHtml ? `<div ${sec('세대단축')}>${extra.histHtml}</div>` : ''}
    </div>`;
}

// 계통(materials 한 줄) → 양식 값
function batchFormValues(b){
  return { use_purpose: batchPurposeOf(b), name: b.name, line_no: b.line_no, cross_combo: b.cross_combo, cross_extra: b.cross_extra, generation: b.generation, purpose: b.purpose,
    quantity: b.quantity, sowing_date: b.sowing_date, expected_days: b.expected_days, harvest_date: b.harvest_date, test_condition: b.test_condition, manager: b.manager };
}

// ── 양식 안의 동작 (칩 · 사용 목적 바꾸기 · 날짜 계산 · 처리 구간) ────────────────────────
// 칩 값을 정한다. field: use_purpose · name · generation (목록에 없는 값이면 칩을 하나 더 만든다). 값이 ''이면 모두 푼다
function bfPick(root, field, val){
  const box = root.querySelector(`[data-chips="${field}"]`), hidden = root.querySelector(`[data-bf="${field}"]`);
  if(!box || !hidden) return;
  let chip = [...box.children].find(c=> c.dataset.val === val);
  if(val && !chip){ box.insertAdjacentHTML('beforeend', bfChipHtml(val, false)); chip = box.lastElementChild; }
  box.querySelectorAll('.task-bed-chip').forEach(c=> c.classList.toggle('active', c === chip));
  hidden.value = chip ? val : '';
  if(field === 'use_purpose') onBatchPurposeChange(root);
  else if(field === 'name') bfApplyDefaultDays(root);
  else if(field === 'generation'){ const head = root.querySelector('[data-gen-head]'); if(head) head.textContent = hidden.value || '기간'; }
  hidden.dispatchEvent(new Event('input', { bubbles:true }));
}

function bfChip(el){
  const root = el.closest('[data-bf-root]');
  if(!root) return;
  const field = el.parentElement.dataset.chips;
  if(field === 'factor'){ el.classList.toggle('active'); bfApplyFactors(root); return; }
  // 사용 목적은 늘 하나가 골라져 있다. 작물 · 세대는 고른 칩을 다시 누르면 풀린다
  bfPick(root, field, (el.classList.contains('active') && field !== 'use_purpose') ? '' : el.dataset.val);
}

// 사용 목적을 바꿨을 때: 그 목적의 칸만 보이고, 계통번호 칸의 글자가 목적에 맞게 바뀐다
function onBatchPurposeChange(root){
  const el = (f)=> root.querySelector(`[data-bf="${f}"]`);
  const purpose = el('use_purpose').value;
  root.querySelectorAll('[data-sec]').forEach(s=>{ s.style.display = s.dataset.for.split(' ').includes(purpose) ? '' : 'none'; });
  const lineWrap = root.querySelector('[data-line-wrap]');
  if(lineWrap){
    lineWrap.style.width = (purpose === '고온검정' || purpose === '기타') ? '100%' : '50%';
    lineWrap.querySelector('[data-lbl="line"]').textContent = `${lineNoLabel(purpose)} (선택)`;
    el('line_no').placeholder = lineNoPlaceholder(purpose);
  }
  // 이미 고른 날짜는 목적을 바꿔도 사라지지 않게 옮겨 준다 (세대단축의 시작일 · 종료일 ↔ 사용기간)
  const grow = purpose === '세대단축';
  [['sowing_date', 'use_start'], ['harvest_date', 'use_end']].forEach(([g, u])=>{
    const ge = el(g), ue = el(u);
    if(!ge || !ue) return;
    if(grow){ if(!ge.value && ue.value){ ge.value = ue.value; if(g === 'harvest_date') ge.dataset.manual = '1'; } }
    else if(!ue.value && ge.value) ue.value = ge.value;
  });
  if(grow) bfApplyDefaultDays(root);
}

// 기타의 처리 요인 칩 상태에 맞춰 구간 카드의 조건 칸을 보이고 숨긴다
function bfFactorsOn(root){ return [...root.querySelectorAll('[data-chips="factor"] .active')].map(c=> c.dataset.val); }

function bfApplyFactors(root){
  const on = bfFactorsOn(root);
  root.querySelectorAll('.sexp-cond').forEach(l=>{ l.style.display = on.includes(l.dataset.f) ? 'flex' : 'none'; });
  const hint = root.querySelector('[data-exp-hint]');
  if(hint) hint.style.display = on.length ? 'none' : '';
}

// 구간 번호를 다시 매기고, 구간이 둘 이상일 때만 삭제(✕) 버튼을 보인다
function bfRenumberPhases(root){
  const cards = root.querySelectorAll('[data-phases] .sexp-card');
  cards.forEach((c, i)=>{
    c.querySelector('.sexp-title').textContent = `구간 ${i + 1}`;
    c.querySelector('.sexp-del').style.display = cards.length > 1 ? '' : 'none';
  });
}

function bfAddPhase(btn){
  const root = btn.closest('[data-bf-root]'), list = root && root.querySelector('[data-phases]');
  if(!list) return;
  list.insertAdjacentHTML('beforeend', bfPhaseHtml(list.children.length, {}, bfFactorsOn(root), true));
  bfRenumberPhases(root);
  list.lastElementChild.querySelector('.sexp-when').focus();
}

function bfRemovePhase(btn){
  const root = btn.closest('[data-bf-root]');
  btn.closest('.sexp-card').remove();
  if(root) bfRenumberPhases(root);
}

// 처리 구간 목록을 통째로 채운다 (분기별 계획에서 불러올 때)
function bfSetPhases(root, phases){
  const list = root.querySelector('[data-phases]');
  if(!list) return;
  const ps = phases.length ? phases : [{}];
  const factorsOn = Object.keys(SURVEY_EXP_FACTORS).filter(f=> ps.some(p=> p[f]));
  root.querySelectorAll('[data-chips="factor"] .task-bed-chip').forEach(c=> c.classList.toggle('active', factorsOn.includes(c.dataset.val)));
  list.innerHTML = ps.map((p, i)=> bfPhaseHtml(i, p, factorsOn, ps.length > 1)).join('');
  bfApplyFactors(root);
}

// 칸에 적힌 조건을 '온도 25℃' 꼴로 (비었거나 단위만 남아 있으면 '')
function bfCondVal(input, f){
  const v = input ? input.value.trim() : '';
  return v && v !== SURVEY_EXP_FACTORS[f].unit ? `${f} ${v}` : '';
}

// 구간마다 { i, card, when, conds } (아무것도 안 적은 구간은 뺀다) · 구간을 화살표로 이어 한 줄로
function bfReadPhases(root){
  const picked = bfFactorsOn(root);
  return [...root.querySelectorAll('[data-phases] .sexp-card')].map((card, i)=>({
    i, card,
    when: card.querySelector('.sexp-when').value.trim(),
    conds: picked.map(f=> bfCondVal(card.querySelector(`.sexp-val[data-f="${f}"]`), f)).filter(Boolean).join(', ')
  })).filter(p=> p.when || p.conds);
}

function bfPhasesText(phases){ return phases.map(p=> p.when && p.conds ? `${p.when}: ${p.conds}` : (p.when || p.conds)).join(' → '); }

// 세대단축의 날짜: 생육일수는 한 번만 쓰고, 시작일을 고르면 종료일이 시작일 + 생육일수로 채워진다 (수요조사 세대별 희망 기간과 같다)
function bfGrowDays(root){
  const el = root.querySelector('[data-bf="expected_days"]');
  const n = el && el.value !== '' ? Math.floor(Number(el.value)) : NaN;
  return n >= 0 ? n : null;
}

// 시작일 + 생육일수로 종료일을 다시 계산한다. force가 아니면 종료일을 달력에서 직접 고른 경우는 건드리지 않는다
function bfRecalcEnd(root, force){
  const s = root.querySelector('[data-bf="sowing_date"]'), e = root.querySelector('[data-bf="harvest_date"]'), n = bfGrowDays(root);
  if(!s || !e || !s.value || n === null) return;
  if(!force && e.dataset.manual === '1') return;
  e.value = addDays(s.value, n);
  e.dataset.manual = '';
}

function bfStartChanged(el){
  const root = el.closest('[data-bf-root]');
  if(!root) return;
  const e = root.querySelector('[data-bf="harvest_date"]');
  if(e) e.dataset.manual = '';
  bfRecalcEnd(root, true);
}

function bfEndChanged(el){ el.dataset.manual = el.value ? '1' : ''; }   // 직접 고른 종료일: 생육일수를 바꿔도 그대로 둔다

function bfDaysChanged(el){
  el.dataset.auto = '';   // 직접 쓴 값은 작물이 바뀌어도 덮어쓰지 않는다
  const root = el.closest('[data-bf-root]');
  if(root) bfRecalcEnd(root, false);
}

// 작물을 고르면 생육일수 칸을 그 작물의 기본값으로 채운다. 사용자가 직접 쓴 값은 그대로 둔다
function bfApplyDefaultDays(root){
  const d = root.querySelector('[data-bf="expected_days"]');
  if(!d) return;
  const crop = (root.querySelector('[data-bf="name"]') || {}).value || '';
  const def = bfDefaultDaysFor(crop);
  if(d.value === '' || d.dataset.auto === '1'){
    d.value = def == null ? '' : String(def);
    d.dataset.auto = def == null ? '' : '1';
    bfRecalcEnd(root, false);
  }
  const hint = root.querySelector('[data-days-hint]');
  if(hint && root.dataset.bfMode !== 'edit') hint.textContent = bfDaysHint(crop);
}

// 양식 읽기: 선택한 사용 목적에 맞는 칸만 읽어 materials에 저장할 값으로 만든다
function readBatchForm(root){
  const val = (f)=> { const el = root.querySelector(`[data-bf="${f}"]`); return el ? el.value.trim() : ''; };
  const unitVal = (f, u)=> { const x = val(f); return x === u ? '' : x; };
  const purpose = BATCH_PURPOSES.includes(val('use_purpose')) ? val('use_purpose') : '세대단축';
  const qty = val('quantity');
  const base = {
    name: val('name'), line_no: lineNoHidden(purpose) ? null : (val('line_no') || null),
    manager: val('manager') || null,
    quantity: qty === '' ? null : Number(qty),
    record_type: purpose==='고온검정' ? 'heat_test' : 'breeding',
    updated_at: new Date().toISOString()
  };
  // 날짜: 세대단축은 시작일 · 생육일수 · 종료일, 그 밖의 목적은 사용기간(시작일 ~ 종료일)이고 기간 일수는 거기서 센다
  const growth = purpose==='세대단축';
  let sowing_date, harvest_date, expected_days;
  if(growth){
    sowing_date = val('sowing_date') || null;
    harvest_date = val('harvest_date') || null;
    expected_days = val('expected_days') === '' ? null : parseInt(val('expected_days'));
    // 세대단축만 '작물별 기본 기간'(crop_profiles)을 쓰고 기억한다. 사용기간(인공교배 · 고온검정 · 기타)은 작물의 생육일수가 아니다
    if(expected_days == null && base.name && cropProfiles[base.name] != null) expected_days = cropProfiles[base.name];
    if(!harvest_date && sowing_date && expected_days != null) harvest_date = addDays(sowing_date, expected_days);
  } else {
    sowing_date = val('use_start') || null;
    harvest_date = val('use_end') || null;
    expected_days = (sowing_date && harvest_date) ? Math.max(0, daysBetween(sowing_date, harvest_date)) : null;
  }
  if(purpose==='고온검정'){
    const heatText = [normalizeTemp(val('heat_temp')), val('heat_stage'), unitVal('heat_day', '시간') ? `일장 ${unitVal('heat_day', '시간')}` : ''].filter(Boolean).join(' · ');
    return { purpose, rememberDays:false, payload: { ...base,
      purpose: val('purpose_heat') || null, test_condition: heatText || null,
      cross_combo: null, cross_extra: null, generation: null, sowing_date, expected_days, harvest_date } };
  }
  const etc = purpose==='기타';
  const daysEl = root.querySelector('[data-bf="expected_days"]');
  const daysFromPlan = !!daysEl && daysEl.dataset.fromPlan!==undefined && daysEl.dataset.fromPlan===daysEl.value;
  return { purpose, rememberDays: growth && expected_days != null && !!base.name && !daysFromPlan, payload: { ...base,
    cross_combo: etc ? null : (val('cross_combo') || null),
    // '외 N조합'은 인공교배에서만 받는다 (저장하는 곳에서 tidyCrossExtra로 정리한다)
    cross_extra: purpose==='인공교배' ? parseCrossExtra(val('cross_extra')) : null,
    // 세대는 세대단축에서만 받는다 (이미 있는 인공교배 계통을 고칠 때는 적혀 있던 세대를 그대로 둔다)
    generation: growth || (purpose==='인공교배' && root.dataset.bfMode==='edit') ? (val('generation') || null) : null,
    purpose: (etc ? val('purpose_etc') : val('purpose_breed')) || null,
    test_condition: etc ? (bfPhasesText(bfReadPhases(root)) || null) : (joinEnvCond(unitVal('env_temp','℃'), unitVal('env_day','시간')) || null),
    sowing_date, expected_days, harvest_date } };
}

// 새로 등록할 때 꼭 채워야 하는 칸 (수요조사와 같은 필수 항목). 문제가 있으면 { msg, el }, 없으면 null
function validateBatchForm(root){
  const q = (f)=> root.querySelector(`[data-bf="${f}"]`);
  const v = (f)=> { const el = q(f); return el ? el.value.trim() : ''; };
  const bad = (msg, el)=> ({ msg, el });
  const purpose = v('use_purpose');
  if(!v('manager')) return bad('담당자(이름)를 입력해주세요.', q('manager'));
  if(purpose === '기타' && !v('purpose_etc')) return bad('실험 내용을 적어주세요.', q('purpose_etc'));
  if(!v('name')) return bad('작물을 선택해주세요.', null);
  if(purpose === '세대단축' || purpose === '인공교배'){
    if(!v('cross_combo')) return bad('교배조합을 입력해주세요.', q('cross_combo'));
    if(!v('purpose_breed')) return bad('교배목적을 입력해주세요.', q('purpose_breed'));
  }
  if(purpose === '인공교배' && v('cross_extra') !== '' && !(Number.isInteger(Number(v('cross_extra'))) && Number(v('cross_extra')) >= 0)){
    return bad("'외 N조합'에는 0 이상의 정수를 적어주세요. (조합이 하나뿐이면 비워 두세요)", q('cross_extra'));
  }
  if(purpose === '기타'){
    // 구간이 둘 이상이면 언제 바뀌는지 알 수 있어야 해서, 구간마다 적용 시기를 받는다
    const phases = bfReadPhases(root), noWhen = phases.length > 1 && phases.find(p=> !p.when);
    if(noWhen) return bad(`구간 ${noWhen.i + 1}의 적용 시기를 적어주세요.\n(예: 발아 후 ~14일, 개화기 이후)`, noWhen.card.querySelector('.sexp-when'));
  }
  let s, e;
  if(purpose === '세대단축'){
    if(!v('generation')) return bad('세대(F1~F6)를 선택해주세요.', null);
    s = v('sowing_date'); e = v('harvest_date');
    if(!s || !e) return bad('시작일과 종료일을 입력해주세요.\n(시작일을 고르면 생육일수만큼 종료일이 자동으로 채워져요)', q(s ? 'harvest_date' : 'sowing_date'));
    if(e < s) return bad('종료일이 시작일보다 빠를 수 없어요.', q('harvest_date'));
  } else {
    s = v('use_start'); e = v('use_end');
    if(!s || !e) return bad('사용기간의 시작일과 종료일을 모두 입력해주세요.', q(s ? 'use_end' : 'use_start'));
    if(e < s) return bad('사용기간의 종료일이 시작일보다 빠를 수 없어요.', q('use_end'));
  }
  // 고른 자리마다 개체수가 있어야 한다 (0 이하는 안 된다)
  for(const inp of root.querySelectorAll('[data-qty-key]')){
    if(inp.value === '' || !(Number(inp.value) > 0)) return bad(`${inp.previousElementSibling.textContent}의 개체수를 입력해주세요.`, inp);
  }
  return null;
}

// 분기별 계획 한 건 → 양식 칸 채우기. 계획의 사용 목적에 맞는 양식으로 바뀌고, 계획에 적힌 만큼 채워진다
function fillBatchFormFromPlan(root, p){
  const el = (f)=> root.querySelector(`[data-bf="${f}"]`);
  const set = (f, v)=>{ const x = el(f); if(x) x.value = v ?? ''; };
  const kind = planPurposeKind(p);
  if(kind) bfPick(root, 'use_purpose', kind);   // 계획의 사용 목적(세대단축 · 인공교배 · 고온검정 · 기타)에 맞는 양식으로 바뀐다
  const purpose = el('use_purpose').value;
  bfPick(root, 'name', p.crop_name || '');
  if(p.line_no) set('line_no', p.line_no);   // 계획에 계통번호가 없으면 이미 입력해 둔 값을 그대로 둔다
  if(p.submitted_by && !el('manager').value) set('manager', p.submitted_by);
  const scale = p.expected_scale!=null ? String(p.expected_scale) : '';
  const cond = planCondText(p);
  set('quantity', scale);
  // 새로 등록하는 칸에서는 '개체수' 대신 베드별 개체수 칸이 있다. 한 자리에 대한 계획이면 그 자리 칸에 넣는다
  const qtyInputs = root.querySelectorAll('[data-qty-key]');
  if(qtyInputs.length === 1 && scale) qtyInputs[0].value = scale;
  const start = p.planned_start, end = p.planned_end || p.planned_start;
  if(purpose==='고온검정'){
    set('purpose_heat', p.purpose);   // 수요조사에서 적은 검정 목적이 그대로 들어온다
    let temp = p.heat_temp || '', stage = p.heat_stage || '', day = parseEnvCond(cond).day;
    if(!temp && !stage && !day && cond){ const h = parseHeatCond(cond); temp = h.temp; stage = h.stage; day = h.day; }
    set('heat_temp', normalizeTemp(temp)); set('heat_stage', stage); set('heat_day', withUnit(day, '시간'));
    set('use_start', start); set('use_end', end);
    return;
  }
  if(purpose==='기타'){
    set('purpose_etc', kind==='기타' ? String(p.use_purpose).trim() : '');
    bfSetPhases(root, bfParsePhases(cond));
    set('use_start', start); set('use_end', end);
    return;
  }
  set('cross_combo', p.cross_combo); set('purpose_breed', p.purpose);   // 세대단축 · 인공교배의 온도 · 일장은 계통작성에서 받지 않는다
  if(purpose==='인공교배'){ set('cross_extra', crossExtraOf(p) || ''); set('use_start', start); set('use_end', end); return; }
  bfPick(root, 'generation', p.generation || '');
  const days = p.planned_days!=null && p.planned_days!=='' ? p.planned_days : daysBetween(p.planned_start, p.planned_end || p.planned_start);
  const daysEl = el('expected_days');
  set('expected_days', days);
  // 계획에서 가져온 기간은 '작물별 기본 기간'(crop_profiles)으로 기억하지 않는다 (직접 입력/수정한 값만 기억)
  daysEl.dataset.fromPlan = String(days); daysEl.dataset.auto = '';
  set('sowing_date', start);
  el('harvest_date').dataset.manual = '';
  bfRecalcEnd(root, true);
}

// 입력칸을 닫고 작성 패널을 원래 내용(고른 자리의 계통 카드 · 여러 자리 목록)으로 되돌린다
function closeBatchLocModal(){
  batchCompose = null;
  renderWorkWritePanel(rooms.find(r=> r.id===workActiveRoomId) || null);
}

function openCopyModal(batchId){
  const b = materials.find(m=>m.id===batchId);
  if(!b) return;
  openBatchLocationModal(b.room_id, b, null);
}

async function submitBatchLocModal(){
  if(tourPreview){ closeBatchLocModal(); showToast('이렇게 등록돼요! 투어 중이라 실제로 저장되진 않았어요'); return; }
  if(batchCompose && batchCompose.bulk){ await submitBulkAdvance(); return; }   // 수확 완료 목록의 [N건 한번에 세대진전] (심을 방은 줄마다 달라서 거기서 확인한다)
  // [세대진전] · [다시 심기]는 '심을 위치'에서 고른 방에 심는다
  const roomSelEl = document.getElementById('locRoomSel');
  if(roomSelEl && roomSelEl.value) batchLocModalRoomId = roomSelEl.value;
  // 입력하는 사이에 관리자가 방을 사용 중지했으면 등록하지 않는다
  const composeRoom = rooms.find(r=> r.id===batchLocModalRoomId);
  if(composeRoom && blockInactiveRoom(composeRoom)) return;
  const wasReplant = !!(batchCompose && batchCompose.replant);   // 수확 완료 목록의 [세대진전] · [다시 심기]로 연 입력칸인지
  const wasAdvance = !!(batchCompose && batchCompose.advance);
  const replantSourceId = wasReplant ? batchCompose.sourceId : null;   // 다시 심은 원래(수확 완료) 계통 — 등록되면 수확 완료 목록에서 뺀다
  // 등록할 자리들: 여러 자리(locTargets) · 한 자리(locTarget) · 복사할 위치를 고른 한 자리
  const multiEl = document.getElementById('locTargets');
  const hiddenTargetEl = document.getElementById('locTarget');
  let targets;
  if(multiEl){
    targets = multiEl.value.split(',').filter(Boolean).map(k=>{ const [b, f] = k.split('|'); return { bedNo: parseInt(b), floor: f }; });
    if(!targets.length){ alert('위치를 선택해주세요.'); return; }
  } else if(hiddenTargetEl){
    if(!hiddenTargetEl.value){ alert('위치를 선택해주세요.'); return; }
    const [b, f] = hiddenTargetEl.value.split('|');
    targets = [{ bedNo: parseInt(b), floor: f }];
  } else {
    const bedSel = document.getElementById('locBedNo');
    const floorSel = document.getElementById('locFloorSel');
    if(!bedSel || !bedSel.value || !floorSel || !floorSel.value){ alert('위치를 선택해주세요.'); return; }
    targets = [{ bedNo: parseInt(bedSel.value), floor: floorSel.value }];
  }

  // 꼭 채워야 하는 칸 (수요조사와 같다): 하나라도 비어 있으면 등록하지 않고 그 칸으로 보내 준다
  const fieldsRoot = document.getElementById('batchLocFields');
  const problem = validateBatchForm(fieldsRoot);
  if(problem){
    alert(problem.msg);
    if(problem.el){ problem.el.focus(); if(problem.el.scrollIntoView) problem.el.scrollIntoView({ block:'center', behavior:'smooth' }); }
    return;
  }
  // 선택한 사용 목적(세대단축 · 인공교배 · 고온검정 · 기타)의 칸만 읽는다
  const form = readBatchForm(fieldsRoot);
  const payload = form.payload, name = payload.name;
  if(!name){ alert('작물을 선택해주세요.'); return; }

  const occupied = targets.filter(t=> materials.some(m=> m.room_id===batchLocModalRoomId && m.structure_no===t.bedNo && m.floor===t.floor && !m.harvest_confirmed_at));
  if(occupied.length){
    const roomPrefix = (wasReplant && composeRoom && composeRoom.id !== workActiveRoomId) ? `${roomLabel(composeRoom.name)} ` : '';   // 보던 방이 아닌 다른 방이면 방 이름도
    const where = occupied.map(t=> roomPrefix + spotText(t.bedNo, t.floor)).join(', ');
    if(!confirm(`${where}에는 이미 등록된 작물이 있어요.\n그래도 ${targets.length>1 ? '모두 ' : ''}새로 추가할까요?`)) return;
  }

  // 사용 목적(인공교배 · 기타)은 새 컬럼 use_purpose에 담는다. 세대단축 · 고온검정은 예전 그대로(컬럼 없이도 저장된다)
  const needsPurposeCol = form.purpose==='인공교배' || form.purpose==='기타';
  if(needsPurposeCol) payload.use_purpose = form.purpose;

  // 고른 자리마다 같은 내용으로 한 줄씩 (여러 자리여도 한 번에 저장한다). 개체수만은 자리마다 따로 적은 값이다 (비워 두면 비운 채로 저장)
  const qtyInputs = [...document.querySelectorAll('#batchLocFields [data-qty-key]')];
  const qtyByKey = {};
  qtyInputs.forEach(i=>{ qtyByKey[i.dataset.qtyKey] = i.value.trim() === '' ? null : Number(i.value); });
  let rows = targets.map(t=> tidyCrossExtra({ room_id: batchLocModalRoomId, structure_no: t.bedNo, floor: t.floor, ...payload,
    ...(qtyInputs.length ? { quantity: qtyByKey[`${t.bedNo}|${t.floor}`] ?? null } : {}) }));
  // 저장되는 동안 입력칸이 화면에 남아 있으니, 버튼을 한 번 더 눌러 같은 내용이 두 번 등록되지 않게 막아 둔다
  const submitBtn = document.querySelector('#workRoomDetail .batch-compose-actions .primary');
  if(submitBtn){ submitBtn.disabled = true; submitBtn.textContent = '등록 중…'; }
  let { error } = await sb.from('materials').insert(rows);
  let purposeDropped = false, crossDropped = false;
  // 컬럼이 아직 없으면(use_purpose · cross_extra), 그 항목만 빼고 다시 저장해서 계통 자체는 잃지 않게 한다
  for(let tries = 0; error && tries < 2; tries++){
    if(needsPurposeCol && !purposeDropped && /use_purpose/.test(error.message||'')){
      rows = rows.map(r=>{ const c = { ...r }; delete c.use_purpose; return c; });
      purposeDropped = true;
    } else if(!crossDropped && isCrossExtraColError(error)){
      rows = stripCrossExtra(rows);
      crossDropped = true;
    } else break;
    ({ error } = await sb.from('materials').insert(rows));
  }
  if(error){
    if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = '등록'; }
    alert('등록 실패!\n\n' + (error.message||JSON.stringify(error)));
    return;
  }
  if(crossDropped) crossExtraDroppedAlert();
  batchCompose = null;   // 저장됐으니 입력칸은 이제 닫아도 된다 (아래 loadAll이 최신 내용으로 패널을 다시 그린다)
  // 세대단축의 예상기간만 작물별 기본 기간으로 기억한다 (계획에서 불러온 기간을 그대로 등록한 경우 · 인공교배 · 기타의 사용기간은 제외)
  if(form.rememberDays){
    await sb.from('crop_profiles').upsert({ name, typical_days: payload.expected_days, updated_at: new Date().toISOString() });
  }
  if(purposeDropped) alert('등록은 됐지만, 사용 목적(' + form.purpose + ')은 materials 테이블에 해당 컬럼이 없어 저장되지 않았어요.\n\n(관리자 확인 필요) Supabase SQL Editor에서 아래를 한 번 실행해주세요:\n\n' + MATERIAL_PURPOSE_SQL);
  // 세대진전 · 다시 심기로 등록했으면 원래 계통에 '다시 심음' 표시를 남겨 수확 완료 목록에서 뺀다 (수확 기록 자체는 세대 이력 · 통계에 쓰이므로 지우지 않는다)
  if(replantSourceId){
    const { error: rpErr } = await sb.from('materials').update({ replanted_at: new Date().toISOString() }).eq('id', replantSourceId);
    if(rpErr) alert('등록은 됐지만, 수확 완료 목록에서 자동으로 빼지 못했어요.\n\n(관리자 확인 필요) Supabase SQL Editor에서 아래를 한 번 실행해주세요:\n\n' + MATERIAL_REPLANT_SQL + '\n\n' + (rpErr.message||''));
  }
  // 보고 있는 방이 아닌 다른 방에 심었으면 어느 방인지 알려 준다 (자리 이름 앞에 방 이름)
  const plantedElsewhere = wasReplant && composeRoom && composeRoom.id !== workActiveRoomId;
  const plantedAt = (plantedElsewhere ? `${roomLabel(composeRoom.name)} ` : '') + spotText(targets[0].bedNo, targets[0].floor);
  showToast(wasAdvance ? `세대진전으로 심었어요 · ${plantedAt}${payload.generation ? ` · ${payload.generation}` : ''}` : wasReplant ? `다시 심었어요 · ${plantedAt}` : targets.length>1 ? `${targets.length}곳에 등록됐어요` : '등록됐어요');
  if(plantedElsewhere){
    // 다른 방에 심었으면 보던 방(수확 완료 목록이 있는 방)에 그대로 머물고 선택만 푼다 — 이어서 다른 계통도 세대진전할 수 있게
    resetWorkMulti();
  } else if(multiEl || wasReplant){
    // 여러 자리 등록 · 다시 심기를 마쳤으면 (첫 번째) 자리만 열어서 방금 등록한 계통을 바로 보여준다
    setWorkOnlySpot(targets[0].bedNo, targets[0].floor);
  }
  await loadAll();
  // 데이터를 못 불러와 패널이 다시 그려지지 않았다면 입력칸만이라도 닫는다
  if(document.querySelector('#workRoomDetail .batch-compose')) closeBatchLocModal();
}
