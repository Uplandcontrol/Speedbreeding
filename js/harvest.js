/* harvest.js — [계통작성] 수확 완료 목록, 세대진전, 다시 심기 */

// ── 수확 완료 목록 ────────────────────────────────────────────────────────────
// 수확 · 사용 · 실험 · 검정을 마치고 자리를 비운 계통의 기록이다. 날짜별로 묶어서 보여 주고,
// [세대진전](세대단축) 또는 [다시 심기](고온검정 · 기타 실험)를 누르면 같은 내용으로 새 자리에 심는 입력칸이 열린다. 인공교배는 '사용 완료'로 끝난다.
const HARVEST_LIST_LIMIT = 8;      // 처음에 보여 주는 기록 수 (나머지는 '더 보기')

let harvestShowAll = false;

const WEEKDAYS_KO = ['일','월','화','수','목','금','토'];

// 'YYYY-MM-DD' → 날짜 묶음 제목: { main:'오늘' | '어제' | '10월 1일 (수)', sub:'10월 5일 (일)' | '4일 전' }
function harvestDateParts(ymd){
  const [y, m, d] = ymd.split('-').map(Number);
  const text = `${m}월 ${d}일 (${WEEKDAYS_KO[new Date(y, m-1, d).getDay()]})`;
  const ago = daysBetween(ymd, todayKST());
  if(ago <= 0) return { main:'오늘', sub:text };
  if(ago === 1) return { main:'어제', sub:text };
  return { main:text, sub: ago < 31 ? `${ago}일 전` : `${Math.floor(ago/30)}개월 전` };
}

// 수확 완료한 계통의 다음 행동: 세대단축은 [세대진전], 인공교배는 '사용 완료'로 끝(이어서 심지 않는다), 고온검정 · 기타 실험은 [다시 심기]
function harvestActionOf(m){ const k = batchPurposeOf(m); return k==='세대단축' ? 'advance' : k==='인공교배' ? 'end' : 'replant'; }

// 기록 한 줄: 계통번호(크게) · 작물 · 목적 뱃지 / 자리 · 세대 · 교배조합 · 목적 · 규모. 적혀 있는 것만 보여 준다 (inert면 눌러지지 않는 예시)
function harvestRowHtml(m, inert){
  const e = escapeHtml, kind = batchPurposeOf(m), cross = kind==='인공교배';
  const color = cropColor(m.name);
  // 인공교배는 계통번호가 없어서 교배조합이 이름이다
  const title = m.line_no || (cross ? crossComboLabel(m) : '') || m.name || '(계통번호 없음)';
  const cropText = (m.name && m.name !== title) ? m.name : '';
  const badge = { '인공교배':['cross','인공교배'], '고온검정':['heat','고온검정'], '기타':['etc','기타 실험'] }[kind];
  const loc = isAisleSpot(m.structure_no) ? '통로' : `베드 ${m.structure_no ?? '-'} · ${m.floor || '-'}`;
  const meta = [];
  if(kind==='고온검정' || kind==='기타'){
    if(m.purpose) meta.push(m.purpose);
    if(m.test_condition) meta.push(m.test_condition);
  } else {
    if(m.generation) meta.push(m.generation);
    if(m.cross_combo && !(cross && title===crossComboLabel(m))) meta.push(crossComboLabel(m));
    if(m.purpose) meta.push(m.purpose);
  }
  if(m.quantity != null) meta.push(`${Number(m.quantity).toLocaleString()}개체`);
  const btn = (cls, text, handler, tip)=> inert
    ? `<button type="button" class="${cls}" disabled>${text}</button>`
    : `<button type="button" class="${cls}" onclick="${handler}('${m.id}')"${tip ? ` title="${tip}"` : ''}>${text}</button>`;
  const act = harvestActionOf(m);
  const mainAction = act === 'advance' ? btn('hv-replant', '세대진전', 'advanceHarvested', '다음 세대로 새 자리에 심어요 (세대 칸을 고쳐주세요)')
    : act === 'end' ? '<span class="hv-done">✓ 사용 완료</span>'   // 인공교배는 사용 완료로 끝난다 (이어서 심는 버튼이 없다)
    : btn('hv-replant', '다시 심기', 'replantHarvested', '이 계통과 같은 내용으로 새 자리에 심어요');
  return `
    <div class="hv-row">
      <div class="hv-main">
        <div class="hv-title"><span class="crop-dot" style="background:${color}; width:9px; height:9px;"></span><b style="color:${color};">${e(title)}</b>${cropText ? `<span class="hv-crop">${e(cropText)}</span>` : ''}${badge ? `<span class="wbed-chip ${badge[0]}">${badge[1]}</span>` : ''}</div>
        <div class="hv-meta"><span class="hv-loc">${e(loc)}</span>${meta.map(x=> `<span>${e(x)}</span>`).join('')}</div>
      </div>
      <div class="hv-act">
        ${mainAction}
        ${btn('hv-del', '삭제', 'deleteHarvestRecord', '이 기록을 목록에서 지워요')}
      </div>
    </div>`;
}

function recentHarvestedHtml(roomId){
  if(!canWriteMaterials()) return '';
  const all = materials
    .filter(m=> m.room_id===roomId && m.harvest_confirmed_at && !m.replanted_at)   // 세대진전 · 다시 심기로 이미 등록한 계통은 뺀다
    .sort((a,b)=> (b.harvest_confirmed_at||'').localeCompare(a.harvest_confirmed_at||''));
  const head = `<div class="work-section-title">수확 완료 목록 <span class="hv-count">${all.length}건</span></div>`;
  if(!all.length){
    return `
    <div class="work-section hv-section">
      ${head}
      <div class="hv-empty">아직 수확 완료한 계통이 없어요.<br>계통 카드의 <b>수확</b>을 누르면 여기에 기록돼요.</div>
    </div>`;
  }
  // 한번에 세대진전할 수 있게 묶인 기록은 위 묶음 칸에만 보여 준다 ([자세히 보기]를 눌러야 하나씩 나온다)
  const bulkGroups = harvestAdvanceGroups(all);
  const groupedIds = new Set(bulkGroups.flat().map(m=> m.id));
  const singles = all.filter(m=> !groupedIds.has(m.id));
  // 날짜(한국 시간)별로 묶는다
  const shown = harvestShowAll ? singles : singles.slice(0, HARVEST_LIST_LIMIT);
  const groups = [];
  shown.forEach(m=>{
    const date = kstDateOfTimestamp(m.harvest_confirmed_at);
    let g = groups[groups.length - 1];
    if(!g || g.date !== date){ g = { date, items: [] }; groups.push(g); }
    g.items.push(m);
  });
  const rest = singles.length - HARVEST_LIST_LIMIT;
  const actions = new Set(all.map(harvestActionOf));
  const hintHtml = [
    actions.has('advance') ? '<b>세대진전</b>을 누르면 다음 세대로 새 자리에 심어요.' : '',
    actions.has('replant') ? '<b>다시 심기</b>는 같은 내용으로 새 자리에 심어요.' : ''
  ].filter(Boolean).join(' ');
  return `
    <div class="work-section hv-section">
      ${head}
      ${hintHtml ? `<p class="hv-hint">${hintHtml}</p>` : ''}
      ${harvestBulkAdvanceHtml(bulkGroups)}
      ${groups.map(g=>{
        const d = harvestDateParts(g.date);
        return `
        <div class="hv-date"><b>${d.main}</b><span>${d.sub}</span><i>${g.items.length}건</i></div>
        ${g.items.map(m=> harvestRowHtml(m)).join('')}`;
      }).join('')}
      ${rest > 0 ? `<button type="button" class="hv-more" onclick="toggleHarvestMore()">${harvestShowAll ? '접기' : `이전 기록 ${rest}건 더 보기`}</button>` : ''}
    </div>`;
}

// ── 수확 완료 목록 → 한번에 세대진전 ──
// 묶는 기준: 세대단축 기록 중 작물 · 세대가 같고, 계통번호가 같거나 교배목적이 같은 것끼리 (A-B 계통번호 같음, B-C 교배목적 같음이면 A·B·C 한 묶음)
function harvestAdvanceGroups(list){
  const items = list.filter(m=> harvestActionOf(m)==='advance' && !m.replanted_at);
  const t = (v)=> String(v ?? '').trim();
  const parent = items.map((_, i)=> i);
  const find = (i)=> parent[i]===i ? i : (parent[i] = find(parent[i]));
  for(let i = 0; i < items.length; i++){
    for(let j = i + 1; j < items.length; j++){
      const a = items[i], b = items[j];
      if(t(a.name) !== t(b.name) || t(a.generation) !== t(b.generation)) continue;
      const sameLine = t(a.line_no) && t(a.line_no) === t(b.line_no);
      const samePurpose = t(a.purpose) && t(a.purpose) === t(b.purpose);
      if(sameLine || samePurpose) parent[find(i)] = find(j);
    }
  }
  const map = new Map();
  items.forEach((m, i)=>{ const r = find(i); if(!map.has(r)) map.set(r, []); map.get(r).push(m); });
  return [...map.values()].filter(g=> g.length > 1);   // 1건짜리는 각 줄의 [세대진전]만 쓴다
}

// 묶음마다 한 줄 + [자세히 보기]를 누르면 묶인 기록이 하나씩 펼쳐진다 (펼친 묶음은 다시 그려도 펼친 채로 둔다)
const harvestOpenGroups = new Set();

function harvestBulkAdvanceHtml(groups){
  if(!groups.length) return '';
  const e = escapeHtml, t = (v)=> String(v ?? '').trim();
  const rows = groups.map(g=>{
    const f = g[0];
    const same = (k)=> g.every(m=> t(m[k]) === t(f[k])) ? t(f[k]) : '';
    const key = same('line_no') ? `계통번호 ${same('line_no')}` : same('purpose') ? `교배목적 ${same('purpose')}` : '계통번호 · 교배목적 일부 같음';
    // 계통번호가 모두 같으면 위 줄(계통번호 ○○)에 이미 나오므로 이름 목록은 생략하고, 다르면 겹치지 않게 한 번씩만
    const names = same('line_no') ? [] : [...new Set(g.map(m=> m.line_no || crossComboLabel(m) || m.name || '(계통번호 없음)'))];
    const gid = g.map(m=> m.id).sort().join(',');
    const open = harvestOpenGroups.has(gid);
    return `<div class="hv-bulk-group">
      <div class="hv-bulk-row">
        <div class="hv-bulk-text"><b style="color:${cropColor(f.name)};">${e(f.name || '')}</b> · ${e(f.generation || '세대 없음')} · ${e(key)} · <b>${g.reduce((s, m)=> s + (Number(m.quantity)||0), 0).toLocaleString()}개체</b>
          ${names.length ? `<span title="${e(names.join(', '))}">${e(names.join(', '))}</span>` : ''}</div>
        <button type="button" class="hv-bulk-toggle" onclick="toggleHarvestGroup(this, '${gid}')">${open ? '접기 ▲' : '자세히 보기 ▼'}</button>
        <button type="button" class="hv-replant" onclick="advanceHarvestedBulk('${g.map(m=> m.id).join(',')}')">${g.length}건 한번에 세대진전</button>
      </div>
      <div class="hv-bulk-detail"${open ? '' : ' hidden'}>${g.map(m=> harvestRowHtml(m)).join('')}</div>
    </div>`;
  }).join('');
  return `<div class="hv-bulk">${rows}</div>`;
}

function toggleHarvestGroup(btn, gid){
  const detail = btn.closest('.hv-bulk-group').querySelector('.hv-bulk-detail');
  const open = detail.hidden;
  detail.hidden = !open;
  btn.textContent = open ? '접기 ▲' : '자세히 보기 ▼';
  if(open) harvestOpenGroups.add(gid); else harvestOpenGroups.delete(gid);
}

// [N건 한번에 세대진전]: 세대진전 작성 칸 하나를 열어 공통 내용(세대 · 시작일 등)은 한 번만 적고, 심을 위치 · 개체수는 기록마다 따로 받는다.
// 심을 자리는 미리 골라 둔다: 원래 자리가 비어 있으면 원래 자리, 아니면 방의 빈 자리를 차례로 (이미 다른 기록에 배정한 자리는 건너뛴다)
const BULK_KEEP_TEXT = '(계통마다 원래 값 유지)';

function advanceHarvestedBulk(idsCsv){
  const records = String(idsCsv).split(',').map(id=> materials.find(m=> m.id===id)).filter(m=> m && !m.replanted_at);
  if(records.length < 2){ if(records[0]) advanceHarvested(records[0].id); return; }
  const room = rooms.find(r=> r.id===records[0].room_id);
  if(!room) return;
  const info = workRoomInfo(room);
  const taken = new Set();
  const free = (s)=> !!s && s.bedNo != null && !taken.has(workSpotKey(s.bedNo, s.floor)) && workSpotBatches(room, s.bedNo, s.floor).length === 0;
  const spots = records.map(r=>{
    const original = r.structure_no != null ? { bedNo: r.structure_no, floor: r.floor } : null;
    let spot = free(original) ? original : null;
    for(let bedNo = 1; bedNo <= info.bedCount && !spot; bedNo++){
      for(const floor of [...info.floors].reverse()){ if(free({ bedNo, floor })){ spot = { bedNo, floor }; break; } }
    }
    spot = spot || original || { bedNo: 1, floor: info.floors[info.floors.length - 1] };
    taken.add(workSpotKey(spot.bedNo, spot.floor));
    return spot;
  });
  // 기록마다 값이 다른 칸(계통번호 · 교배조합 · 교배목적 · 담당자)은 공통 칸에서 고치지 않고, 저장할 때 기록마다 원래 값을 그대로 쓴다
  const t = (v)=> String(v ?? '').trim();
  const diffKeys = ['line_no', 'cross_combo', 'cross_extra', 'purpose', 'manager', 'test_condition'].filter(k=> records.some(r=> t(r[k]) !== t(records[0][k])));
  const prefill = { ...records[0], sowing_date: todayKST(), harvest_date: null, quantity: null };
  diffKeys.filter(k=> k !== 'test_condition' && k !== 'cross_extra').forEach(k=>{ prefill[k] = BULK_KEEP_TEXT; });
  if(diffKeys.includes('cross_extra')) prefill.cross_extra = null;   // 숫자 칸은 비워 두고, 저장할 때 기록마다 원래 값을 쓴다
  openBatchLocationModal(room.id, prefill, null, { replant: true, advance: true, bulk: { records, spots, diffKeys } });
}

// 한번에 세대진전 작성 칸의 '심을 위치' 줄들
function bulkAdvanceLocHtml(room, records, spots){
  const info = workRoomInfo(room), e = escapeHtml;
  let bedOptions = '';
  for(let i = 1; i <= info.bedCount; i++) bedOptions += `<option value="${i}">베드 ${i}</option>`;
  if(AISLE_ROOMS.has(room.name)) bedOptions += `<option value="${AISLE_BED_NO}">통로</option>`;
  return `
    <label style="font-size:11px; color:var(--ink-faint); font-weight:700; display:block; margin-bottom:6px;">심을 위치 · 개체수 (계통마다)</label>
    <div class="bulk-adv-list">
      ${records.map((r, i)=>{
        const s = spots[i];
        const title = r.line_no || crossComboLabel(r) || r.name || '(계통번호 없음)';
        const from = r.structure_no != null ? `원래 ${spotText(r.structure_no, r.floor)}` : '';
        return `<div class="bulk-adv-row" data-src="${r.id}">
          <div class="bulk-adv-top">
            <div class="bulk-adv-name"><span class="crop-dot" style="background:${cropColor(r.name)}; width:8px; height:8px;"></span><span style="color:${cropColor(r.name)};">${e(title)}</span>${from ? `<small>${e(from)}</small>` : ''}</div>
            <input type="number" min="0" inputmode="numeric" data-bulk-qty placeholder="개체수" value="${r.quantity ?? ''}" />
          </div>
          <div class="bulk-adv-loc">
            <select data-bulk-bed onchange="syncBulkLocFloor(this, ${info.bedFloors})">${bedOptions.replace(`value="${s.bedNo}"`, `value="${s.bedNo}" selected`)}</select>
            <select data-bulk-floor>${locFloorOptionsHtml(s.bedNo, info.bedFloors).replace(`value="${s.floor}"`, `value="${s.floor}" selected`)}</select>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

function syncBulkLocFloor(bedSel, bedFloors){
  const floorSel = bedSel.parentElement.querySelector('[data-bulk-floor]');
  if(!floorSel) return;
  const keep = floorSel.value;
  floorSel.innerHTML = locFloorOptionsHtml(parseInt(bedSel.value), bedFloors);
  if([...floorSel.options].some(o=> o.value===keep)) floorSel.value = keep;
}

// 한번에 세대진전 저장: 공통 칸은 한 번 읽고, 기록마다 새 계통 한 줄씩 만든다. 저장되면 묶인 원래 기록 모두에 replanted_at을 남긴다
async function submitBulkAdvance(){
  const bulk = batchCompose && batchCompose.bulk;
  if(!bulk) return;
  const fieldsRoot = document.getElementById('batchLocFields');
  const problem = validateBatchForm(fieldsRoot);
  if(problem){
    alert(problem.msg);
    if(problem.el){ problem.el.focus(); if(problem.el.scrollIntoView) problem.el.scrollIntoView({ block:'center', behavior:'smooth' }); }
    return;
  }
  const rowsEl = [...document.querySelectorAll('#batchLocLocation .bulk-adv-row')];
  const items = [];
  for(const el of rowsEl){
    const rec = bulk.records.find(r=> r.id===el.dataset.src);
    if(!rec) continue;
    const bedNo = parseInt(el.querySelector('[data-bulk-bed]').value), floor = el.querySelector('[data-bulk-floor]').value;
    const qtyEl = el.querySelector('[data-bulk-qty]');
    if(qtyEl.value === '' || !(Number(qtyEl.value) > 0)){
      alert(`${rec.line_no || crossComboLabel(rec) || rec.name || '계통'}의 개체수를 입력해주세요.`);
      qtyEl.focus(); return;
    }
    items.push({ rec, bedNo, floor, qty: Number(qtyEl.value) });
  }
  if(!items.length) return;
  const form = readBatchForm(fieldsRoot);
  const payload = form.payload;
  if(!payload.name){ alert('작물을 선택해주세요.'); return; }
  const occupied = items.filter(x=> materials.some(m=> m.room_id===batchLocModalRoomId && m.structure_no===x.bedNo && m.floor===x.floor && !m.harvest_confirmed_at));
  if(occupied.length && !confirm(`${occupied.map(x=> spotText(x.bedNo, x.floor)).join(', ')}에는 이미 등록된 작물이 있어요.\n그래도 새로 추가할까요?`)) return;
  const keys = items.map(x=> workSpotKey(x.bedNo, x.floor));
  if(new Set(keys).size !== keys.length && !confirm('같은 자리에 두 계통 이상을 심게 돼요. 그래도 등록할까요?')) return;
  const needsPurposeCol = form.purpose==='인공교배' || form.purpose==='기타';
  if(needsPurposeCol) payload.use_purpose = form.purpose;
  // 기록마다 다른 칸: 공통 칸에 '(계통마다 원래 값 유지)'가 그대로 있으면 기록의 원래 값을 쓴다
  //  (온도 · 일장 같은 숨은 조건(test_condition)은 사용 목적을 세대단축 그대로 둘 때만 기록마다 원래 값을 쓴다)
  //  ('외 N조합'(cross_extra)은 숫자 칸이라 잠가 둘 수 없어서, 기록마다 다르면 사용 목적이 인공교배일 때 기록마다 원래 값을 쓴다)
  const keepVal = (k, rec)=> (k==='test_condition' ? form.purpose==='세대단축' : k==='cross_extra' ? form.purpose==='인공교배' : payload[k] === BULK_KEEP_TEXT) ? (rec[k] ?? null) : payload[k];
  let rows = items.map(x=>{
    const row = { room_id: batchLocModalRoomId, structure_no: x.bedNo, floor: x.floor, ...payload, quantity: x.qty };
    bulk.diffKeys.forEach(k=>{ if(k in row || k==='test_condition') row[k] = keepVal(k, x.rec); });
    return tidyCrossExtra(row);
  });
  const submitBtn = document.querySelector('#workRoomDetail .batch-compose-actions .primary');
  if(submitBtn){ submitBtn.disabled = true; submitBtn.textContent = '등록 중…'; }
  let { error } = await sb.from('materials').insert(rows);
  let purposeDropped = false, crossDropped = false;
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
  batchCompose = null;
  if(form.rememberDays){
    await sb.from('crop_profiles').upsert({ name: payload.name, typical_days: payload.expected_days, updated_at: new Date().toISOString() });
  }
  if(purposeDropped) alert('등록은 됐지만, 사용 목적(' + form.purpose + ')은 materials 테이블에 해당 컬럼이 없어 저장되지 않았어요.\n\n(관리자 확인 필요) Supabase SQL Editor에서 아래를 한 번 실행해주세요:\n\n' + MATERIAL_PURPOSE_SQL);
  const { error: rpErr } = await sb.from('materials').update({ replanted_at: new Date().toISOString() }).in('id', items.map(x=> x.rec.id));
  if(rpErr) alert('등록은 됐지만, 수확 완료 목록에서 자동으로 빼지 못했어요.\n\n(관리자 확인 필요) Supabase SQL Editor에서 아래를 한 번 실행해주세요:\n\n' + MATERIAL_REPLANT_SQL + '\n\n' + (rpErr.message||''));
  showToast(`세대진전으로 ${items.length}건 심었어요${payload.generation ? ` · ${payload.generation}` : ''}`);
  setWorkOnlySpot(items[0].bedNo, items[0].floor);
  await loadAll();
  if(document.querySelector('#workRoomDetail .batch-compose')) closeBatchLocModal();
}

function toggleHarvestMore(){
  harvestShowAll = !harvestShowAll;
  renderDetail('work');
}

// [다시 심기] · [세대진전]: 수확 완료한 계통과 같은 내용으로 새 자리에 심는 입력칸을 연다. 세대진전이면 세대 칸을 강조하고 '수정 필요'를 알린다.
// 심을 자리는 미리 골라 둔다: 지금 열어 둔 자리가 비어 있으면 그 자리 → 원래 있던 자리가 비어 있으면 그 자리 → 방의 첫 빈 자리.
// 시작일(파종일 · 사용 시작일)은 오늘로 채워 둔다. 기록에 남아 있는 예전 날짜는 새로 심을 때 맞지 않기 때문이다.
function advanceHarvested(id){ replantHarvested(id, true); }

function replantHarvested(id, advance){
  const b = materials.find(m=> m.id===id);
  const room = b && rooms.find(r=> r.id===b.room_id);
  if(!room) return;
  const info = workRoomInfo(room);
  const isEmpty = (s)=> !!s && workSpotBatches(room, s.bedNo, s.floor).length === 0;
  const original = b.structure_no != null ? { bedNo: b.structure_no, floor: b.floor } : null;
  const openedSpot = workOnlySpot();
  let spot = [openedSpot, original].find(isEmpty);
  if(!spot){
    for(let bedNo = 1; bedNo <= info.bedCount && !spot; bedNo++){
      for(const floor of [...info.floors].reverse()){ if(isEmpty({ bedNo, floor })){ spot = { bedNo, floor }; break; } }
    }
  }
  spot = spot || openedSpot || original;
  openBatchLocationModal(b.room_id, { ...b, sowing_date: todayKST(), harvest_date: null }, null, { replant: true, advance: !!advance, spot });
}

// [세대진전]: 고쳐야 하는 칸(세대 · 파종일)을 눈에 띄게 하고 '수정(필수)'를 알린다.
//  · 세대 · 파종일(오늘 날짜로 채워 둠): 처음 값과 다르게 고치면 초록 '✓', 그대로면 계속 '수정(필수)'
// 칸마다 위쪽 테두리에 태그(수정(필수) · 수정(선택) · ✓)를 걸어 둔다. 사용 목적을 바꿔서 숨겨진 칸은 빠진다.
function markFieldsForEdit(root, prefill){
  const trim = (v)=> String(v ?? '').trim();
  const genOrig = trim(prefill.generation);
  const sowOrig = trim(prefill.sowing_date);
  // 심을 위치(선택): 미리 골라 둔 자리를 그대로 써도 되고, 바꾸고 싶으면 바꾼다
  const bedSel = document.getElementById('locBedNo'), floorSel = document.getElementById('locFloorSel');
  const locText = ()=> bedSel && bedSel.value ? spotText(parseInt(bedSel.value), floorSel ? floorSel.value : '') : '';
  const locOrig = locText();
  // input: 값을 읽는 칸 · box: 강조 표시를 입히는 칸 (세대는 값이 숨은 칸에 있어서 칩 줄을 감싼 틀이 box다)
  // optional: 고치지 않아도 되는 칸 ('수정(선택)'), 나머지는 꼭 고쳐야 하는 칸 ('수정(필수)')
  // 한번에 세대진전: 계통마다 있는 심을 위치 줄도 같은 '수정(선택)' 칸으로 다룬다
  const bulkLocFields = [...document.querySelectorAll('#batchLocLocation .bulk-adv-loc')].map(box=>{
    const b = box.querySelector('[data-bulk-bed]'), f = box.querySelector('[data-bulk-floor]');
    const value = ()=> b && b.value ? spotText(parseInt(b.value), f ? f.value : '') : '';
    return { key:'loc', optional:true, input: b, box, orig: value(), value };
  });
  const fields = [
    ...(bedSel ? [{ key:'loc', optional:true, input: bedSel, box: bedSel.parentElement, orig: locOrig, value: locText }] : []),
    ...bulkLocFields,
    { key:'gen', input: root.querySelector('[data-bf="generation"]'), box: root.querySelector('[data-gen-box]'), orig: genOrig },
    { key:'sow', input: root.querySelector('[data-bf="sowing_date"]'), orig: sowOrig }
  ].filter(f=> f.input);
  if(!fields.length) return;
  fields.forEach(f=>{
    f.box = f.box || f.input;
    f.flag = document.createElement('span');
    f.flag.className = 'bf-flag';
    f.box.parentElement.classList.add('bf-attn-row');
    f.box.parentElement.appendChild(f.flag);
  });
  // todo: 아직 수정 필요 / opt: 고치지 않아도 되는 칸(아직 그대로) / changed: 처음 값과 다르게 고침 (값이 그대로면 계속 수정 필요)
  const valueOf = (f)=> f.value ? f.value() : trim(f.input.value);
  const stateOf = (f)=>{
    const now = valueOf(f);
    if(now && now !== f.orig) return 'changed';
    return f.optional ? 'opt' : 'todo';
  };
  const TAG = { todo:'수정(필수)', opt:'수정(선택)', changed:'✓' };
  const isOk = (s)=> s === 'changed';
  const update = ()=>{
    const live = fields.filter(f=> f.box.offsetParent !== null);   // 사용 목적을 바꿔서 숨겨진 칸은 뺀다
    fields.forEach(f=>{
      const on = live.includes(f), s = on ? stateOf(f) : 'todo';
      f.flag.hidden = !on;
      f.box.classList.toggle('bf-attn', on && s === 'todo');
      f.box.classList.toggle('bf-opt', on && s === 'opt');
      f.box.classList.toggle('bf-ok', on && isOk(s));
      f.flag.classList.toggle('ok', isOk(s));
      f.flag.classList.toggle('opt', s === 'opt');
      f.flag.textContent = TAG[s];
      if(on) f.flag.style.top = (f.box.offsetTop - 10) + 'px';   // 칸의 윗줄에 걸쳐 놓는다
    });
  };
  fields.forEach(f=> f.input.addEventListener('input', update));
  root.addEventListener('change', update);
  if(bedSel) bedSel.parentElement.addEventListener('change', update);   // 심을 위치는 입력 양식(root) 밖에 있다
  bulkLocFields.forEach(f=> f.box.addEventListener('change', update));
  update();
  const first = fields.find(f=> !f.optional && f.box.offsetParent !== null);   // 포커스는 꼭 고쳐야 하는 첫 칸에 준다
  if(first){
    // 날짜 칸은 바로 쓸 수 있게 포커스를 주고, 세대는 지금 고른 칩에 포커스를 둔다
    const target = first.input.type === 'hidden' ? (first.box.querySelector('.task-bed-chip.active') || first.box.querySelector('.task-bed-chip')) : first.input;
    if(target){ target.focus({ preventScroll: true }); if(target.select) target.select(); }
  }
}

// 수확 완료 기록 하나를 목록에서 지운다 (지금 심겨 있는 계통에는 영향이 없다)
async function deleteHarvestRecord(id){
  if(tourBlockWrite()) return;
  const m = materials.find(x=> x.id===id);
  const label = m ? (m.line_no || crossComboLabel(m) || m.name || '이 계통') : '이 계통';
  const hasHistory = generationHistory.some(h=> h.material_id===id);
  if(!confirm(`'${label}'의 수확 완료 기록을 목록에서 지울까요?\n지금 심겨 있는 계통에는 영향이 없어요.${hasHistory ? '\n(이 기록의 세대 이력도 함께 지워져요)' : ''}`)) return;
  const { error } = await sb.from('materials').delete().eq('id', id);
  if(error){ alert('삭제 실패!\n\n' + (error.message||JSON.stringify(error))); return; }
  showToast('기록을 지웠어요');
  await loadAll();
}
