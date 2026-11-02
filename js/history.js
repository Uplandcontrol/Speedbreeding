/* history.js — 세대 이력: 계통 이력 검색, 세대 이력 창 */

function extractGenStage(genStr){
  if(!genStr) return null;
  if(genStr.includes('포장')) return '포장';
  const m = genStr.match(/F\s*(\d+)/i);
  if(m){
    const num = parseInt(m[1]);
    if(num>=1 && num<=6) return 'F'+num;
  }
  return null;
}

function openLineHistoryModal(){
  lineHistoryFocusedLineNo = null;
  document.getElementById('lineHistorySearchInput').value = '';
  document.getElementById('lineHistoryResults').innerHTML = `<div class="empty-materials" style="padding:20px 0;">계통번호를 입력하고 검색해보세요.</div>`;
  document.getElementById('lineHistoryModalOverlay').classList.add('open');
  setTimeout(()=> document.getElementById('lineHistorySearchInput').focus(), 50);
}

function runNewLineSearch(){
  lineHistoryFocusedLineNo = null;
  searchLineHistory();
}

function closeLineHistoryModal(){
  document.getElementById('lineHistoryModalOverlay').classList.remove('open');
}

function searchLineHistory(){
  const q = document.getElementById('lineHistorySearchInput').value.trim();
  const resultsEl = document.getElementById('lineHistoryResults');
  if(!q){ resultsEl.innerHTML = `<div class="empty-materials" style="padding:20px 0;">계통번호를 입력해주세요.</div>`; return; }

  const allMatches = materials.filter(m=> (m.line_no||'').toLowerCase().includes(q.toLowerCase()));

  if(!allMatches.length){
    resultsEl.innerHTML = `<div class="empty-materials" style="padding:20px 0;">"${escapeHtml(q)}" 계통번호로 등록된 이력이 없어요.</div>`;
    return;
  }

  // 검색어와 일치하는 실제 계통번호별로 나눠서 각각 이력을 만듦
  const byLineNo = {};
  allMatches.forEach(m=>{
    const key = m.line_no || '(계통번호 없음)';
    if(!byLineNo[key]) byLineNo[key] = [];
    byLineNo[key].push(m);
  });
  const lineNoKeys = Object.keys(byLineNo).sort();

  const GEN_STAGES = ['F1','F2','F3','F4','F5','F6','포장'];
  const stageSortKey = (stage)=>{
    const idx = GEN_STAGES.indexOf(stage);
    return idx>=0 ? idx : 999;
  };

  // 검색 결과가 여러 계통이고 아직 하나를 선택 안 했으면: 클릭 가능한 요약 목록만 보여줌
  if(lineNoKeys.length > 1 && !lineHistoryFocusedLineNo){
    const summaryHtml = lineNoKeys.map(lineNoKey=>{
      const lineMatches = byLineNo[lineNoKey];
      const color = cropColor(lineMatches[0].name);
      const totalQty = lineMatches.reduce((s,m)=> s + (Number(m.quantity)||0), 0);
      const purposes = [...new Set(lineMatches.map(m=>m.purpose).filter(Boolean))];
      return `
        <div class="task-row" onclick="focusLineHistory('${escapeHtml(lineNoKey).replace(/'/g,"\\'")}')">
          <div class="task-row-body">
            <span class="task-row-loc"><b style="color:${color};">${escapeHtml(lineNoKey)}</b> <span style="color:var(--ink-faint); font-weight:600;">(${escapeHtml(lineMatches[0].name||'-')})</span></span>
            <span class="task-row-note">${purposes.length ? purposes.map(p=>''+escapeHtml(p)).join(', ') : '목표 미설정'} · ${totalQty.toLocaleString()}개체</span>
          </div>
          <span style="color:var(--ink-faint); font-size:13px;">›</span>
        </div>
      `;
    }).join('');
    resultsEl.innerHTML = `
      <div style="font-size:11px; color:var(--ink-faint); margin-bottom:12px;">"${escapeHtml(q)}"로 검색된 계통 ${lineNoKeys.length}개 · 하나를 클릭하면 상세 이력을 볼 수 있어요</div>
      <div class="task-rows">${summaryHtml}</div>
    `;
    return;
  }

  const targetKeys = lineHistoryFocusedLineNo ? [lineHistoryFocusedLineNo] : lineNoKeys;
  const sectionsHtml = targetKeys.map(lineNoKey=>{
    const matches = byLineNo[lineNoKey].sort((a,b)=> (a.sowing_date||'9999').localeCompare(b.sowing_date||'9999'));
    const color = cropColor(matches[0].name);

    const stageInfo = {};
    const stageQty = {};
    matches.forEach(m=>{
      const stage = extractGenStage(m.generation);
      if(!stage) return;
      stageInfo[stage] = true;
      stageQty[stage] = (stageQty[stage] || 0) + (Number(m.quantity)||0);
    });

    const timelineHtml = `
      <div class="gen-timeline" style="margin-bottom:6px; align-items:flex-start;">
        ${GEN_STAGES.map((g,i)=>{
          const active = !!stageInfo[g];
          return `
          <div class="gen-step ${active?'active':'inactive'}" style="${active?`--dot-glow:${color};`:''}">
            <div class="gen-dot" style="${active ? `background:${color}; border-color:${color}; color:#fff;` : `border-color:var(--line); color:var(--ink-faint);`} ${g.length>2?'font-size:7.5px; line-height:1; white-space:normal;':''}">${g.length>2 ? escapeHtml(g.slice(0,2))+'<br>'+escapeHtml(g.slice(2)) : escapeHtml(g)}</div>
            <div style="font-size:9.5px; font-weight:800; color:${active?color:'var(--ink-faint)'}; margin-top:3px; white-space:nowrap;">${active && stageQty[g] ? stageQty[g].toLocaleString()+'개체' : ''}</div>
          </div>
          ${i<GEN_STAGES.length-1 ? `<div class="gen-line" style="background:${active?color:'var(--line)'}; margin-top:15px;"></div>` : ''}
        `;}).join('')}
      </div>
    `;

    const groups = {};
    matches.forEach(m=>{
      const stage = extractGenStage(m.generation) || (m.generation ? m.generation : '세대 미기재');
      const purpose = m.purpose || '목표 미설정';
      const key = stage + '|||' + purpose;
      if(!groups[key]) groups[key] = { stage, purpose, qty:0, starts:[], ends:[], rooms:new Set(), ongoing:false };
      groups[key].qty += Number(m.quantity)||0;
      if(m.sowing_date) groups[key].starts.push(m.sowing_date);
      const endDate = m.harvest_confirmed_at ? kstDateOfTimestamp(m.harvest_confirmed_at) : null;
      if(endDate) groups[key].ends.push(endDate);
      if(!m.harvest_confirmed_at) groups[key].ongoing = true;
      const room = rooms.find(r=>r.id===m.room_id);
      if(room) groups[key].rooms.add(room.name);
    });
    const groupList = Object.values(groups).sort((a,b)=> stageSortKey(a.stage) - stageSortKey(b.stage) || (a.starts[0]||'9999').localeCompare(b.starts[0]||'9999'));

    const listHtml = groupList.map(g=>{
      const start = g.starts.length ? g.starts.sort()[0] : null;
      const end = g.ongoing ? '진행중' : (g.ends.length ? g.ends.sort().slice(-1)[0]+' (수확)' : null);
      const period = start ? `${start} ~ ${end||'-'}` : '파종일 미기재';
      const roomsText = [...g.rooms].join(', ') || '-';
      return `
        <div class="task-row" style="cursor:default;">
          <div class="task-row-body">
            <span class="task-row-loc"><b style="color:${color};">${escapeHtml(String(g.stage))}</b> · ${period}</span>
            <span class="task-row-note">${escapeHtml(roomsText)}${g.purpose!=='목표 미설정'?(' · '+escapeHtml(g.purpose)):''} · ${g.qty.toLocaleString()}개</span>
          </div>
        </div>
      `;
    }).join('');

    const allPurposes = [...new Set(matches.map(m=>m.purpose).filter(Boolean))];

    return `
      <div class="panel-box" style="margin-bottom:16px; padding:18px;">
        <div style="font-size:13px; font-weight:800; color:var(--ink); margin-bottom:2px;">${escapeHtml(lineNoKey)} <span style="font-weight:600; color:var(--ink-faint);">(${escapeHtml(matches[0].name||'-')})</span></div>
        <div style="font-size:11px; color:var(--ink-faint); margin-bottom:14px;">${allPurposes.length ? allPurposes.map(p=>`${escapeHtml(p)}`).join(', ') : '등록된 목표 없음'}</div>
        ${timelineHtml}
        <div class="task-rows" style="margin-top:16px;">${listHtml}</div>
      </div>
    `;
  }).join('');

  resultsEl.innerHTML = `
    ${lineHistoryFocusedLineNo && lineNoKeys.length>1 ? `<button class="btn small" onclick="unfocusLineHistory()" style="margin-bottom:12px;">← 전체 목록으로</button>` : ''}
    ${sectionsHtml}
  `;
}

let lineHistoryFocusedLineNo = null;

function focusLineHistory(lineNoKey){
  lineHistoryFocusedLineNo = lineNoKey;
  searchLineHistory();
}

function unfocusLineHistory(){
  lineHistoryFocusedLineNo = null;
  searchLineHistory();
}

function openHistoryModal(materialId){
  const hist = generationHistory.filter(h=>h.material_id===materialId)
    .sort((a,b)=> (b.end_date||'').localeCompare(a.end_date||''));
  document.getElementById('historyModalList').innerHTML = hist.length ? hist.map((h,i)=>`
    <div style="border:2px solid var(--line); border-radius:5px; padding:10px 12px; margin-bottom:8px;">
      <div style="font-size:12.5px; color:var(--ink-soft); margin-bottom:3px;">교배목적: ${h.purpose ? escapeHtml(h.purpose) : '-'}</div>
      <div style="font-size:12.5px; color:var(--ink-soft); margin-bottom:3px;">교배조합: ${h.cross_combo ? escapeHtml(crossComboLabel(h)) : '-'}</div>
      <div style="font-size:12.5px; color:var(--ink-soft);">세대: ${h.generation ? escapeHtml(h.generation) : '-'}</div>
      <div style="display:flex; gap:6px; margin-top:6px;">
        ${(i===0 && canWriteMaterials()) ? `<button class="btn small" onclick="undoGenerationCompletion('${h.id}', '${materialId}')" style="padding:6px 10px;">↩️ 되돌리기</button>` : ''}
        ${isAdmin ? `<button class="btn danger-text small" onclick="deleteHistoryEntry('${h.id}', '${materialId}')" style="padding:6px 10px;">취소(삭제)</button>` : ''}
      </div>
    </div>
  `).join('') : `<div class="empty-chip">이력이 없어요</div>`;
  document.getElementById('historyModalOverlay').classList.add('open');
}

async function undoGenerationCompletion(historyId, materialId){
  if(tourBlockWrite()) return;
  const h = generationHistory.find(x=>x.id===historyId);
  if(!h){ alert('이력을 찾을 수 없어요.'); return; }
  const m = materials.find(x=>x.id===materialId);
  if(!confirm(`"${h.generation||'-'}" 세대완료 처리를 되돌릴까요?\n현재 입력된 세대 정보(${m&&m.generation? m.generation : '없음'})는 덮어씌워져요.`)) return;

  const { error: e1 } = await sb.from('materials').update({
    generation: h.generation, sowing_date: h.start_date, expected_days: h.expected_days, harvest_date: h.harvest_date,
    updated_at: new Date().toISOString()
  }).eq('id', materialId);
  if(e1){ alert('되돌리기 실패!\n\n' + (e1.message||JSON.stringify(e1))); return; }

  const { error: e2 } = await sb.from('generation_history').delete().eq('id', historyId);
  if(e2){ alert('이력 삭제 실패!\n\n' + (e2.message||JSON.stringify(e2))); return; }

  closeHistoryModal();
  showToast('세대완료가 되돌려졌어요');
  await loadAll();
}

function closeHistoryModal(){
  document.getElementById('historyModalOverlay').classList.remove('open');
}

async function deleteHistoryEntry(historyId, materialId){
  if(tourBlockWrite()) return;
  if(!confirm('이 세대 이력을 삭제할까요?')) return;
  const { error } = await sb.from('generation_history').delete().eq('id', historyId);
  if(error){ alert('삭제 실패!\n\n' + (error.message||JSON.stringify(error))); return; }
  showToast('이력이 삭제됐어요');
  await loadAll();
  openHistoryModal(materialId);
}

function historySummary(materialId){
  const hist = generationHistory.filter(h=>h.material_id===materialId)
    .sort((a,b)=> (b.end_date||'').localeCompare(a.end_date||''));
  if(!hist.length) return '';
  const fmt = (d)=> d ? d.slice(5).replace('-','/') : '?';
  return hist.map(h=> `${escapeHtml(h.generation||'-')}(${fmt(h.start_date)}~${fmt(h.end_date)})`).join(' · ');
}
