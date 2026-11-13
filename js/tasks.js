/* tasks.js — [작업계획] 화면: 작업 달력, 작업 요청 추가·수정, 작업 기록 */

function groupTasksByBatch(tasksArr){
  const groups = {};
  const order = [];
  tasksArr.forEach(t=>{
    const key = [t.room_name||'', t.note||'', t.task_date||'', t.requester_name||'', t.floor||'', t.source||'', t.task_type||''].join('|||');
    if(!groups[key]){ groups[key] = { ids:[], sample:t, bedNos:[], completedCount:0 }; order.push(key); }
    groups[key].ids.push(t.id);
    if(t.bed_no!=null) groups[key].bedNos.push(t.bed_no);
    if(t.completed_at) groups[key].completedCount++;
  });
  return order.map(key=>{
    const g = groups[key];
    g.bedNos.sort((a,b)=>a-b);
    g.allCompleted = g.completedCount === g.ids.length;
    return g;
  });
}

function batchGroupLocLabel(g){
  const room = g.sample.room_name;
  if(!room) return '시설 전체';
  if(!g.bedNos.length) return room;
  const cfg = roomBedConfig(room);
  if(cfg && g.bedNos.length === cfg.bed_count && g.bedNos.every((b,i)=> b===i+1)){
    return `${room} 전체`;
  }
  return `${room} 베드${g.bedNos.join(',')}`;
}

async function toggleTaskGroupDone(idsCsv, checked){
  if(tourBlockWrite()) return;
  const ids = idsCsv.split(',');
  const val = checked ? new Date().toISOString() : null;
  const { error } = await sb.from('daily_tasks').update({ completed_at: val }).in('id', ids);
  if(error){ alert('처리 실패!\n\n'+error.message); return; }
  await loadAll();
}

async function cancelTaskGroup(idsCsv){
  if(tourBlockWrite()) return;
  const ids = idsCsv.split(',');
  const t = dailyTasks.find(x=> ids.includes(x.id));
  const isWorkerItem = t && t.source==='worker';
  const requiredLabel = isWorkerItem ? '작업담당자' : '작물담당자';
  const hasAuth = isWorkerItem ? workerAuth : materialAuth;
  if(!hasAuth){
    const pw = prompt(`${requiredLabel} 비밀번호를 입력하세요`);
    if(pw === null) return;
    if(isWorkerItem){
      if(pw !== '0000'){ alert('비밀번호가 틀렸어요!'); return; }
      workerAuth = true;
    } else {
      if(pw !== '7942'){ alert('비밀번호가 틀렸어요!'); return; }
      materialAuth = true;
    }
  }
  if(!confirm(ids.length>1 ? `이 항목(베드 ${ids.length}개)을 한 번에 취소할까요?` : '이 항목을 취소(삭제)할까요?')) return;
  const { error } = await sb.from('daily_tasks').delete().in('id', ids);
  if(error){ alert('취소 실패!\n\n'+error.message); return; }
  showToast('취소됐어요');
  await loadAll();
}

function renderTasksView(){
  const wrap = document.getElementById('tasksViewWrap');
  if(!wrap) return;

  const tasksForDate = dailyTasks.filter(t=> t.task_date===taskViewDate);

  const ROOM_ORDER = [...new Set([...ROW1, ...ROW2])];
  const sortByRoomBed = (a,b)=>{
    const ra = ROOM_ORDER.indexOf(a.room_name), rb = ROOM_ORDER.indexOf(b.room_name);
    if(ra!==rb) return (ra<0?999:ra) - (rb<0?999:rb);
    return (a.bed_no ?? 999) - (b.bed_no ?? 999);
  };
  const requestItemsAllRaw = tasksForDate.filter(t=> t.source!=='worker').sort(sortByRoomBed);
  const requestItemsAll = groupTasksByBatch(requestItemsAllRaw);
  const requestItems = taskFilterRoom ? requestItemsAll.filter(g=> g.sample.room_name===taskFilterRoom) : requestItemsAll;
  const requestFilterHtml = `
    <select onchange="setTaskFilterRoom(this.value)" style="font-size:11px; padding:5px 8px; border:1.6px solid var(--line); border-radius:7px; font-family:inherit; font-weight:600;">
      <option value="">전체 장소</option>
      ${[...new Set([...ROW1, ...ROW2])].filter(n=>!isMutedRoom(n)).map(n=>`<option value="${escapeHtml(n)}" ${taskFilterRoom===n?'selected':''}>${escapeHtml(n)}</option>`).join('')}
    </select>
  `;
  const sectionsHtml = requestItemsAll.length ? taskSectionHtml('요청사항', requestItems.length ? requestItems.map(g=>{
    const t = g.sample;
    const loc = batchGroupLocLabel(g);
    const idsCsv = g.ids.join(',');
    return `
      <div class="task-row-wrap">
        <label class="task-row ${g.allCompleted?'done':''}" style="flex:1;">
          <input type="checkbox" ${g.allCompleted?'checked':''} onchange="toggleTaskGroupDone('${idsCsv}', this.checked)" />
          <div class="task-row-body">
            <span class="task-row-loc">${escapeHtml(loc)}</span>
            ${t.note ? `<span class="task-row-note">${escapeHtml(t.note)}</span>` : ''}
            ${t.requester_name ? `<span class="task-requester-tag">담당자: ${escapeHtml(t.requester_name)}</span>` : ''}
          </div>
        </label>
        <button class="task-cancel-btn" onclick="editTaskItem('${idsCsv}')" title="요청 수정" style="width:auto; padding:0 10px; font-size:11px; font-weight:700;">✏️ 수정</button>
        <button class="task-cancel-btn" onclick="cancelTaskGroup('${idsCsv}')" title="요청 취소">✕</button>
      </div>
    `;
  }).join('') : `<div class="empty-materials" style="padding:10px 0;">이 장소엔 요청이 없어요</div>`, requestFilterHtml) : '';

  const workerLogItemsAllRaw = tasksForDate.filter(t=> t.source==='worker').sort(sortByRoomBed);
  const workerLogItemsAll = groupTasksByBatch(workerLogItemsAllRaw);
  const workerLogItems = taskFilterRoom ? workerLogItemsAll.filter(g=> g.sample.room_name===taskFilterRoom) : workerLogItemsAll;
  const workerLogHtml = workerLogItems.length ? taskSectionHtml('작업자 기록', workerLogItems.map(g=>{
    const t = g.sample;
    const loc = batchGroupLocLabel(g);
    const idsCsv = g.ids.join(',');
    return `
      <div class="task-row-wrap">
        <div class="task-row worker-log" style="flex:1;">
          <div class="task-row-body">
            <span class="task-row-loc">${escapeHtml(loc)}</span>
            ${t.note ? `<span class="task-row-note worker-note">${escapeHtml(t.note)}</span>` : ''}
          </div>
        </div>
        <button class="task-cancel-btn" onclick="editTaskItem('${idsCsv}')" title="기록 수정" style="width:auto; padding:0 10px; font-size:11px; font-weight:700;">✏️ 수정</button>
        <button class="task-cancel-btn" onclick="cancelTaskGroup('${idsCsv}')" title="기록 취소">✕</button>
      </div>
    `;
  }).join('')) : '';

  const allEmpty = requestItemsAll.length===0 && workerLogItems.length===0;

  wrap.innerHTML = `
    <div class="tasks-split">
      <div class="panel-box tasks-cal-col">
        <div class="panel-box-head">
          <div>
            <h3>작업계획</h3>
            <p>달력에서 날짜를 고르면 오른쪽에서 확인·체크할 수 있어요.</p>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn small primary" onclick="openAddTaskModal()">+ 작업 추가</button>
            ${isAdmin ? `<button class="btn small danger-text" onclick="deleteAllTasks()">작업계획 전체 삭제</button>` : ''}
          </div>
        </div>
        ${taskCalendarHtml()}
      </div>

      <div class="panel-box tasks-list-col">
        <div class="panel-box-head" style="border-bottom:none; margin-bottom:12px; padding-bottom:0;">
          <div>
            <h3 style="font-size:14px;">${taskViewDate}${taskViewDate===todayKST()?' (오늘)':''}</h3>
          </div>
        </div>
        ${sectionsHtml}
        ${workerLogHtml}
        ${allEmpty ? `<div class="empty-materials" style="padding:16px 0;">${taskFilterRoom?`"${escapeHtml(taskFilterRoom)}"에 등록된 작업이 없어요`:'이 날짜엔 별도로 등록된 작업(청소·파종 등)이 없어요. "+ 작업 추가"로 등록해보세요.'}</div>` : ''}
      </div>
    </div>
  `;
}

function taskCalendarHtml(){
  if(!taskCalendarMonth) taskCalendarMonth = kstTodayDate();
  const year = taskCalendarMonth.getFullYear();
  const month = taskCalendarMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const todayStr = todayKST();

  let cells = '';
  for(let i=0;i<startWeekday;i++){ cells += `<div class="tcal-cell empty"></div>`; }
  for(let d=1; d<=daysInMonth; d++){
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = dateStr===todayStr;
    const isSelected = dateStr===taskViewDate;
    const dayTasks = dailyTasks.filter(t=> t.task_date===dateStr);
    const dayGroups = groupTasksByBatch(dayTasks);
    const MAX_CHIPS = 3;
    const chipsHtml = dayGroups.slice(0, MAX_CHIPS).map(g=>{
      const t = g.sample;
      const isWorker = t.source==='worker';
      const label = (t.note || t.task_type || '작업').slice(0, 14);
      const chipClass = isWorker ? 'worker' : (g.allCompleted ? 'done' : 'request');
      return `<div class="tcal-chip ${chipClass}">${escapeHtml(label)}</div>`;
    }).join('');
    const moreCount = dayGroups.length - MAX_CHIPS;
    const hasAnyRequest = dayGroups.some(g=> g.sample.source!=='worker');
    const dotClass = dayGroups.length ? (hasAnyRequest ? 'has-request' : 'has-task') : '';
    cells += `
      <div class="tcal-cell ${isToday?'today':''} ${isSelected?'selected':''} ${dotClass}" onclick="setTaskViewDate('${dateStr}')">
        <span class="tcal-daynum">${d}</span>
        <div class="tcal-chips">
          ${chipsHtml}
          ${moreCount>0 ? `<div class="tcal-chip more">+${moreCount}건 더보기</div>` : ''}
        </div>
      </div>
    `;
  }

  return `
    <div class="task-calendar">
      <div class="tcal-header">
        <button type="button" onclick="shiftTaskCalendarMonth(-1)">‹</button>
        <span>${year}년 ${month+1}월</span>
        <button type="button" onclick="shiftTaskCalendarMonth(1)">›</button>
      </div>
      <div class="tcal-weekdays">${['일','월','화','수','목','금','토'].map(w=>`<div>${w}</div>`).join('')}</div>
      <div class="tcal-grid">${cells}</div>
      <div class="tcal-legend">
        <span><span class="tcal-dot request"></span> 요청사항</span>
        <span><span class="tcal-dot worker"></span> 작업자 기록</span>
        <span><span class="tcal-dot done"></span> 완료</span>
      </div>
    </div>
  `;
}

function shiftTaskCalendarMonth(delta){
  taskCalendarMonth = new Date(taskCalendarMonth.getFullYear(), taskCalendarMonth.getMonth()+delta, 1);
  renderTasksView();
}

function taskSectionHtml(type, rowsHtml, extraHtml){
  return `
    <div class="task-section">
      <div class="task-section-title" style="display:flex; justify-content:space-between; align-items:center;">
        <span>${escapeHtml(type)}</span>
        ${extraHtml||''}
      </div>
      <div class="task-rows">${rowsHtml}</div>
    </div>
  `;
}

function setTaskViewDate(v){
  taskViewDate = v;
  renderTasksView();
}

let editingTaskGroup = null;      // 지금 고치는 묶음의 id 목록 (같은 요청을 베드 여러 개에 건 것도 한 묶음)
let editSelectedBeds = new Set(); // 수정 창에서 고른 베드

// 수정 창의 장소 목록. 지금은 쓰지 않는 방이어도 원래 장소가 사라져 '시설 전체'로 바뀌지 않게 끼워 넣는다
function editRoomOptionsHtml(selected){
  const names = [...new Set([...ROW1, ...ROW2])].filter(n=>!isMutedRoom(n));
  if(selected && !names.includes(selected)) names.push(selected);
  return `<option value="">시설 전체</option>${names.map(n=>`<option value="${escapeHtml(n)}" ${selected===n?'selected':''}>${escapeHtml(n)}</option>`).join('')}`;
}

async function editTaskItem(idsCsv){
  const ids = String(idsCsv).split(',');
  const rows = dailyTasks.filter(x=> ids.includes(x.id));
  if(!rows.length) return;
  const t = rows[0];
  const isWorkerItem = t.source==='worker';
  const requiredLabel = isWorkerItem ? '작업담당자' : '작물담당자';
  const hasAuth = isWorkerItem ? workerAuth : materialAuth;

  if(!hasAuth){
    const pw = prompt(`${requiredLabel} 비밀번호를 입력하세요`);
    if(pw === null) return;
    if(isWorkerItem){
      if(pw !== '0000'){ alert('비밀번호가 틀렸어요! (이건 작업담당자 기록이라 작업담당자 비밀번호가 필요해요)'); return; }
      workerAuth = true;
    } else {
      if(pw !== '7942'){ alert('비밀번호가 틀렸어요! (이건 작물담당자 요청이라 작물담당자 비밀번호가 필요해요)'); return; }
      materialAuth = true;
    }
  }

  editingTaskGroup = { ids: rows.map(r=>r.id) };
  editSelectedBeds = new Set(rows.map(r=>r.bed_no).filter(b=>b!=null));
  const textareaStyle = 'width:100%; box-sizing:border-box; padding:10px 12px; border:1.2px solid var(--line); border-radius:9px; font-family:inherit; font-size:13px; resize:vertical;';
  document.getElementById('editTaskModalTitle').textContent = isWorkerItem ? '작업 기록 수정' : '요청사항 수정';
  document.getElementById('editTaskModalBody').innerHTML = `
    <select id="editTaskRoomInput" onchange="renderEditBedChips()">${editRoomOptionsHtml(t.room_name)}</select>
    <div id="editTaskBedChipWrap"></div>
    <select id="editTaskFloorInput">
      <option value="전체" ${(!t.floor||t.floor==='전체')?'selected':''}>층 전체</option>
      <option value="1층" ${t.floor==='1층'?'selected':''}>1층</option>
      <option value="2층" ${t.floor==='2층'?'selected':''}>2층</option>
    </select>
    <textarea id="editTaskNoteInput" rows="5" style="${textareaStyle}">${escapeHtml(t.note||'')}</textarea>
    ${!isWorkerItem ? `<input id="editTaskRequesterInput" placeholder="요청자 이름" value="${escapeHtml(t.requester_name||'')}" />` : ''}
    <div>
      <div style="font-size:11px; font-weight:700; color:var(--ink-faint); margin-bottom:6px;">날짜</div>
      <input id="editTaskDateInput" type="date" value="${escapeHtml(t.task_date||taskViewDate)}" />
    </div>
  `;
  renderEditBedChips(true);
  document.getElementById('editTaskModalOverlay').classList.add('open');
}

// keep=true면 원래 고른 베드를 그대로 두고(창을 처음 열 때), 아니면 비운다(장소를 바꿨을 때)
function renderEditBedChips(keep){
  if(!keep) editSelectedBeds = new Set();
  const wrap = document.getElementById('editTaskBedChipWrap');
  if(!wrap) return;
  const roomName = document.getElementById('editTaskRoomInput').value;
  const cfg = roomBedConfig(roomName);
  const maxSel = Math.max(0, ...editSelectedBeds);
  if(!roomName || (!cfg && !maxSel)){
    const msg = roomName ? '이 장소는 베드 지정이 없어요' : '시설 전체예요 (베드 지정 없음)';
    wrap.innerHTML = `<div style="font-size:11.5px; color:var(--ink-faint); padding:4px 0;">${msg}</div>`;
    return;
  }
  const count = Math.max(cfg ? cfg.bed_count : 0, maxSel);
  const beds = Array.from({length: count}, (_,i)=> i+1);
  wrap.innerHTML = `
    <div style="font-size:11px; font-weight:700; color:var(--ink-faint); margin-bottom:6px;">베드 선택 (여러 개 가능, 안 고르면 방 전체)</div>
    <div class="task-bed-chips">
      ${beds.map(b=>`<button type="button" class="task-bed-chip ${editSelectedBeds.has(b)?'active':''}" data-bed="${b}" onclick="toggleEditBedChip(${b}, this)">베드 ${b}</button>`).join('')}
      <button type="button" class="task-bed-chip all" onclick="selectAllEditBedChips()">전체</button>
    </div>
  `;
}

function toggleEditBedChip(bed, el){
  if(editSelectedBeds.has(bed)){ editSelectedBeds.delete(bed); el.classList.remove('active'); }
  else{ editSelectedBeds.add(bed); el.classList.add('active'); }
}

function selectAllEditBedChips(){
  const chips = document.querySelectorAll('#editTaskBedChipWrap .task-bed-chip[data-bed]');
  const allSelected = editSelectedBeds.size === chips.length;
  editSelectedBeds = new Set();
  chips.forEach(el=>{
    if(!allSelected){ editSelectedBeds.add(parseInt(el.dataset.bed)); el.classList.add('active'); }
    else{ el.classList.remove('active'); }
  });
}

function closeEditTaskModal(){
  document.getElementById('editTaskModalOverlay').classList.remove('open');
  editingTaskGroup = null;
}

async function saveEditedTask(){
  if(tourBlockWrite()) return;
  const grp = editingTaskGroup;
  if(!grp) return;
  const rows = dailyTasks.filter(x=> grp.ids.includes(x.id));
  if(!rows.length){
    alert('이미 지워졌거나 바뀐 항목이에요. 화면을 새로 불러올게요.');
    closeEditTaskModal();
    await loadAll();
    return;
  }
  const sample = rows[0];
  const room_name = document.getElementById('editTaskRoomInput').value || null;
  const floor = document.getElementById('editTaskFloorInput').value;
  const note = document.getElementById('editTaskNoteInput').value.trim();
  const task_date = document.getElementById('editTaskDateInput').value;
  const requesterEl = document.getElementById('editTaskRequesterInput');
  if(!note){ alert('내용을 꼭 적어주세요!'); return; }
  if(!task_date){ alert('날짜를 골라주세요!'); return; }

  const common = { room_name, floor, note, task_date };
  if(requesterEl){
    const name = requesterEl.value.trim();
    if(!name){ alert('요청자 이름을 적어주세요!'); return; }
    common.requester_name = name;
  }

  // 고른 베드 목록에 맞춰: 그대로인 베드는 고치고, 새로 고른 베드는 추가하고, 뺀 베드는 지운다
  const bedNos = (room_name && editSelectedBeds.size) ? Array.from(editSelectedBeds).sort((a,b)=>a-b) : [null];
  const keepIds = [], dropIds = [];
  rows.forEach(r=> (bedNos.includes(r.bed_no ?? null) ? keepIds : dropIds).push(r.id));
  const have = new Set(rows.map(r=> r.bed_no ?? null));
  const allDone = rows.every(r=> r.completed_at);
  const inserts = bedNos.filter(b=> !have.has(b)).map(bed_no => ({
    task_type: sample.task_type, source: sample.source ?? null, requester_name: sample.requester_name ?? null,
    completed_at: allDone ? sample.completed_at : null,
    bed_no, ...common
  }));

  const fail = async (what, error)=>{
    alert(`${what} 실패!\n\n${error.message||JSON.stringify(error)}\n\n일부만 바뀌었을 수 있어요. 화면을 새로 불러올게요.`);
    await loadAll();
  };
  if(keepIds.length){
    const { error } = await sb.from('daily_tasks').update(common).in('id', keepIds);
    if(error){ alert('수정 실패!\n\n'+(error.message||JSON.stringify(error))); return; }
  }
  if(inserts.length){
    const { error } = await sb.from('daily_tasks').insert(inserts);
    if(error){ await fail('베드 추가', error); return; }
  }
  if(dropIds.length){
    const { error } = await sb.from('daily_tasks').delete().in('id', dropIds);
    if(error){ await fail('베드 빼기', error); return; }
  }

  closeEditTaskModal();
  let msg = '수정됐어요';
  if(task_date !== sample.task_date){
    // 날짜를 옮겼으면 고친 항목이 화면에서 사라지지 않게 그 날짜로 따라간다
    const [y, m, d] = task_date.split('-').map(Number);
    taskViewDate = task_date;
    taskCalendarMonth = new Date(y, m-1, 1);
    msg = `수정됐어요 (${m}월 ${d}일로 옮겼어요)`;
  }
  if(taskFilterRoom && room_name !== taskFilterRoom) taskFilterRoom = '';
  showToast(msg);
  await loadAll();
}

let pendingTaskMode = null; // '작업추가' 클릭시 입력한 비밀번호에 따라 'material_manager' | 'worker'

function openAddTaskModal(){
  let mode;
  if(materialAuth || workerAuth){
    mode = materialAuth ? 'material_manager' : 'worker';
  } else {
    const pw = prompt('비밀번호를 입력하세요');
    if(pw === null) return;
    if(pw === '7942') mode = 'material_manager';
    else if(pw === '0000') mode = 'worker';
    else { alert('비밀번호가 틀렸어요!'); return; }
    if(mode==='material_manager') materialAuth = true;
    if(mode==='worker') workerAuth = true;
  }
  pendingTaskMode = mode;

  const roomSelectHtml = `<option value="">시설 전체</option>${[...new Set([...ROW1, ...ROW2])].filter(n=>!isMutedRoom(n)).map(n=>`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('')}`;
  document.getElementById('addTaskModalTitle').textContent = mode==='worker' ? '오늘 한 일 기록' : '+ 작업 요청';
  document.getElementById('addTaskModalBody').innerHTML = mode==='worker' ? `
    <select id="taskRoomInput" onchange="renderTaskBedChips()">${roomSelectHtml}</select>
    <div id="taskBedChipWrap"></div>
    <textarea id="taskNoteInput" placeholder="예: 세대단축실 1번 1층베드 청소" rows="5" style="width:100%; box-sizing:border-box; padding:10px 12px; border:1.2px solid var(--line); border-radius:9px; font-family:inherit; font-size:13px; resize:vertical;"></textarea>
    <input id="taskTypeInput" type="hidden" value="요청사항" />
    <input id="taskFloorInput" type="hidden" value="전체" />
    <input id="taskDateInput" type="hidden" value="${taskViewDate}" />
  ` : `
    <select id="taskRoomInput" onchange="renderTaskBedChips()">${roomSelectHtml}</select>
    <div id="taskBedChipWrap"></div>
    <div>
      <div style="font-size:11px; font-weight:700; color:var(--ink-faint); margin-bottom:6px;">층</div>
      <div class="task-bed-chips">
        ${['전체','1층','2층'].map(f=>`<button type="button" class="task-bed-chip ${f==='전체'?'active':''}" data-floor="${f}" onclick="selectTaskFloorChip('${f}', this)">${f}</button>`).join('')}
      </div>
      <input id="taskFloorInput" type="hidden" value="전체" />
    </div>
    <textarea id="taskNoteInput" placeholder="요청 내용/메모 (예: 3번 베드 수확해주세요)" rows="5" style="width:100%; box-sizing:border-box; padding:10px 12px; border:1.2px solid var(--line); border-radius:9px; font-family:inherit; font-size:13px; resize:vertical;"></textarea>
    <input id="taskRequesterInput" placeholder="요청자 이름" />
    <input id="taskDateInput" type="date" value="${taskViewDate}" />
    <input id="taskTypeInput" type="hidden" value="요청사항" />
  `;
  document.getElementById('addTaskModalOverlay').classList.add('open');
  renderTaskBedChips();
}

function selectTaskFloorChip(floor, el){
  document.getElementById('taskFloorInput').value = floor;
  el.parentElement.querySelectorAll('.task-bed-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
}

let selectedTaskBeds = new Set();

function renderTaskBedChips(){
  selectedTaskBeds = new Set();
  const wrap = document.getElementById('taskBedChipWrap');
  if(!wrap) return;
  const roomName = document.getElementById('taskRoomInput').value;
  const cfg = roomBedConfig(roomName);
  if(!roomName || !cfg){
    const msg = pendingTaskMode==='worker' ? '작업을 추가해주세요' : '시설 전체 요청이에요 (베드 지정 없음)';
    wrap.innerHTML = `<div style="font-size:11.5px; color:var(--ink-faint); padding:4px 0;">${msg}</div>`;
    return;
  }
  const beds = Array.from({length: cfg.bed_count}, (_,i)=> i+1);
  wrap.innerHTML = `
    <div style="font-size:11px; font-weight:700; color:var(--ink-faint); margin-bottom:6px;">베드 선택 (여러 개 가능, 안 고르면 방 전체)</div>
    <div class="task-bed-chips">
      ${beds.map(b=>`<button type="button" class="task-bed-chip" data-bed="${b}" onclick="toggleTaskBedChip(${b}, this)">베드 ${b}</button>`).join('')}
      <button type="button" class="task-bed-chip all" onclick="selectAllTaskBedChips(${cfg.bed_count})">전체</button>
    </div>
  `;
}

function toggleTaskBedChip(bed, el){
  if(selectedTaskBeds.has(bed)){ selectedTaskBeds.delete(bed); el.classList.remove('active'); }
  else{ selectedTaskBeds.add(bed); el.classList.add('active'); }
}

function selectAllTaskBedChips(bedCount){
  const wrap = document.getElementById('taskBedChipWrap');
  const allSelected = selectedTaskBeds.size === bedCount;
  selectedTaskBeds = new Set();
  wrap.querySelectorAll('.task-bed-chip[data-bed]').forEach(el=>{
    if(!allSelected){ selectedTaskBeds.add(parseInt(el.dataset.bed)); el.classList.add('active'); }
    else{ el.classList.remove('active'); }
  });
}

function closeAddTaskModal(){
  document.getElementById('addTaskModalOverlay').classList.remove('open');
}

async function saveNewTask(){
  if(tourBlockWrite()) return;
  const task_type = document.getElementById('taskTypeInput').value;
  const room_name = document.getElementById('taskRoomInput').value || null;
  const floor = document.getElementById('taskFloorInput').value;
  const note = document.getElementById('taskNoteInput').value || null;
  const task_date = document.getElementById('taskDateInput').value || taskViewDate;
  const isWorkerLog = pendingTaskMode==='worker';
  const requesterEl = document.getElementById('taskRequesterInput');
  const requester_name = requesterEl ? (requesterEl.value || null) : null;
  if((task_type==='요청사항' || isWorkerLog) && !note){ alert('내용을 꼭 적어주세요!'); return; }
  if(!isWorkerLog && !requester_name){ alert('요청자 이름을 적어주세요!'); return; }

  const bedNos = selectedTaskBeds.size ? Array.from(selectedTaskBeds).sort((a,b)=>a-b) : [null];
  const rows = bedNos.map(bed_no => ({
    task_type, room_name, bed_no, floor, note, task_date, requester_name,
    source: isWorkerLog ? 'worker' : 'material_manager',
    completed_at: isWorkerLog ? new Date().toISOString() : null
  }));

  const { error } = await sb.from('daily_tasks').insert(rows);
  if(error){ alert('저장 실패!\n\n'+error.message); return; }
  closeAddTaskModal();
  showToast(isWorkerLog ? '기록됐어요' : `작업이 추가됐어요${bedNos.length>1?` (베드 ${bedNos.length}개)`:''}`);
  await loadAll();
}

async function deleteAllTasks(){
  if(tourBlockWrite()) return;
  if(!isAdmin){ alert('전체 관리자만 할 수 있어요.'); return; }
  if(!confirm(`정말로 작업계획의 모든 요청·기록을 전부 삭제할까요?\n(되돌릴 수 없어요)`)) return;
  const typed = prompt('되돌릴 수 없는 작업이에요. 계속하려면 "삭제확인"이라고 입력해주세요.');
  if(typed !== '삭제확인'){ alert('입력이 일치하지 않아 취소됐어요.'); return; }
  const { error } = await sb.from('daily_tasks').delete().gte('created_at', '1900-01-01');
  if(error){ alert('삭제 실패!\n\n' + (error.message||JSON.stringify(error))); return; }
  showToast('작업계획 데이터가 모두 삭제됐어요');
  await loadAll();
}
