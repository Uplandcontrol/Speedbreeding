/* tour.js — 사용법 투어: 투어 설정(TOUR_STEPS)과 투어 동작 */

/* ╔══════════════════════════════════════════════════════════════════════╗
   ║  ★ 온보딩 투어 설정 — 내용을 고치려면 이 블록만 수정하세요 ★          ║
   ╚══════════════════════════════════════════════════════════════════════╝

   아래 TOUR_STEPS 안의 중괄호 { } 하나가 투어 화면 하나입니다.
   ─ 순서를 바꾸려면  : { } 덩어리를 통째로 잘라서 옮기세요
   ─ 단계를 빼려면    : 그 { } 덩어리를 지우세요 (뒤의 쉼표까지)
   ─ 단계를 추가하려면 : 기존 덩어리를 복사해서 붙여넣고 내용만 바꾸세요

   ┌─ 각 단계에 쓸 수 있는 항목 ────────────────────────────────────────┐
   │ section        이 단계가 속한 항목: 소개 · 계통작성 · 작업계획 ·   │
   │                수요조사 ('소개'는 전체 보기에서만 나와요)            │
   │ title          말풍선 제목                              (필수)      │
   │ body           설명 내용. HTML을 쓸 수 있어요            (필수)      │
   │ el             강조할 화면 요소를 찾아오는 함수                      │
   │                → 생략하면 화면 한가운데에 크게 떠요                  │
   │ before         그 단계로 갈 때 화면을 먼저 이동시키는 함수           │
   │                → tourGoSpace / tourGoWork / tourGoTasks 중 선택      │
   │ pad            강조 테두리와 요소 사이 여백(px). 기본값 6            │
   │ skipIfMissing  그 요소가 화면에 없으면 이 단계를 자동으로 건너뜀     │
   │ advanceOnClick 사용자가 그 요소를 실제로 클릭하면 다음 단계로 넘어감 │
   │ keepModal      집단추가 입력칸을 닫지 않고 유지 (등록 설명용)        │
   │ shots          상황별 예시 스크린샷 [{ tab:'탭 이름', img:'그림 이름', │
   │                cap:'설명' }]. 그림은 tour-shots.js 에 있어요       │
   │ wide           큰 그림이 들어가는 단계: true = 넓은 말풍선,          │
   │                'xl' = 화면 전체가 들어가는 가장 큰 말풍선              │
   │ last           마지막 단계 표시 (버튼이 '시작하기'로 바뀜)           │
   └────────────────────────────────────────────────────────────────────┘

   ┌─ body 안에서 쓸 수 있는 꾸미기 ────────────────────────────────────┐
   │ <b>굵은 글씨</b>                                                    │
   │ <span class="t-key">버튼이름</span>      → 키보드 키 모양 상자      │
   │ <div class="t-tip">주의사항</div>        → 노란 상자                │
   │ <div class="t-do">직접 해보세요 안내</div> → 초록 상자              │
   │ <ul><li>첫째</li><li>둘째</li></ul>      → 점 목록                  │
   └────────────────────────────────────────────────────────────────────┘

   ┌─ el 에 자주 쓰는 화면 요소 ────────────────────────────────────────┐
   │ document.getElementById('facility')          시설 배치도            │
   │ document.getElementById('detail')            종합현황 오른쪽 패널   │
   │ document.getElementById('workMapPanel')      계통작성 시설 배치도   │
   │ document.getElementById('workBedPanel')      계통작성 베드 맵       │
   │ document.getElementById('workRoomDetail')    계통작성 작성 패널     │
   │ document.getElementById('navBtnWork')        상단 '계통작성' 버튼   │
   │ document.getElementById('adminToggleBtn')    상단 🌱 아이콘(권한전환)│
   │ document.querySelector('.tasks-cal-col')     작업계획 달력          │
   │ document.querySelector('.tasks-list-col')    작업계획 목록          │
   │ document.querySelector('.batch-compose')     자리를 누르면 열리는 작성 칸│
   │ document.querySelector('.batch-card')        등록된 계통 카드       │
   └────────────────────────────────────────────────────────────────────┘ */

// ── 사용법 보이기 / 숨기기 ──────────────────────────────────────────
// false: 화면에서 '? 사용법' 버튼과 처음 방문자 자동 안내를 숨겨요 (아래 사용법 코드는 그대로 남아 있어요)
// true : 다시 화면에 나타나요 — 필요할 때 이 값만 true로 바꾸면 돼요
const GUIDE_ENABLED = true;

// ── 투어 기본 동작 ──────────────────────────────────────────────────
const TOUR_AUTO_START = false;  // 처음 방문한 사람에게 자동으로 시작할까요? (false: '? 사용법' 버튼을 눌러 보고 싶은 항목을 고를 때만 열려요)

const TOUR_AUTO_DELAY = 1800;   // 자동 시작까지 기다리는 시간(밀리초). 데이터 불러오는 시간을 감안한 값이에요

// ── 사용법 항목 (? 사용법을 누르면 이 목록에서 골라요) ──────────────────
// key는 TOUR_STEPS의 section과 같아야 해요. '전체'는 모든 항목을 차례대로 보여줘요.
// 지금은 계통작성 · 작업계획만 보여줘요. 수요조사 설명(아래 TOUR_STEPS에 그대로 있어요)을 다시 열려면
// { key:'수요조사', name:'수요조사', desc:'공간 사용 신청' } 한 줄을 아래에 추가하세요 ('전체 보기'도 원하면 { key:'전체', name:'전체 보기', desc:'처음부터 끝까지' }도)
const TOUR_SECTIONS = [
  { key:'계통작성', name:'계통작성',   desc:'계획 채우기 · 수확 · 세대진전' },
  { key:'작업계획', name:'작업계획',   desc:'작업 요청 · 완료 체크' }
];

const TOUR_KEY = 'sb_tour_seen_v3'; // 이 값을 바꾸면 이미 본 사람들에게도 투어가 다시 한 번 뜹니다

// ── 투어 단계 ───────────────────────────────────────────────────────
const TOUR_STEPS = [

  {
    el:()=> document.querySelector('.hv2-right'),
    before: tourGoSpace,
    pad:7,
    section:'소개',
    title:'메뉴는 이렇게 나뉘어요',
    body:`<b>종합현황</b> 보기 · <b>계통작성</b> 재료 등록 · <b>작업계획</b> 요청·기록 · <b>수요조사</b> 공간 신청
      <div class="t-tip">헷갈리면 맨 위 <span class="t-key">제목</span>을 누르세요.</div>`
  },

  /* ───────── 계통작성 ───────── */
  {
    el:()=> { const c = document.querySelector('#workBedPanel .wbed-chip.plan'); return c ? c.closest('.wbed-slot') : null; },
    before: tourShowPlanChip,
    pad:6,
    wide:true,
    section:'계통작성',
    title:'계획이 있는 자리는',
    body:`분기별 계획이 있는 빈 자리에는 <span class="t-key">📅 계획</span> 표시가 떠요. 그 자리를 눌러요.`,
    shots:[
      { tab:'계획 표시', img:'plan_chip', cap:'빨간 테두리가 <b>📅 계획</b> 표시예요. 계획이 있는 빈 자리마다 떠요.' }
    ]
  },

  {
    el:()=> document.querySelector('#workRoomDetail .bp-go'),
    before: ()=> tourOpenDemoBatchModal(tourSpotHasPlan),
    keepModal:true,
    pad:6,
    wide:true,
    section:'계통작성',
    title:'분기별 계획이 있으면',
    body:`누르면 그 자리의 <b>분기별 계획</b>이 떠요. <span class="t-key">이 계획으로 채우기</span>만 누르면 돼요.`,
    shots:[
      { tab:'① 누르기', img:'plan_fill', cap:'<b>집단 추가</b> 화면 위쪽에 그 자리의 <b>분기별 계획</b>이 떠요. 빨간 버튼만 누르세요.' },
      { tab:'② 채워진 모습', img:'plan_filled', cap:'누르면 아래 <b>계통작성 칸</b>이 <b>자동으로 채워져요</b>.' }
    ]
  },

  {
    el:()=> document.querySelector('#workRoomDetail button[onclick^="harvestAndReplant"], #workRoomDetail button[onclick^="completeHeatTest"]'),
    before: tourCollapseDemoBatchCard,
    pad:5,
    wide:'xl',
    section:'계통작성',
    title:'수확했으면 직접 확인하고',
    body:`수확을 했으면 <b>직접 확인</b>한 다음, 계통 카드의 <span class="t-key">수확</span> 버튼을 눌러 주세요.`,
    shots:[
      { tab:'수확', img:'harvest_map', cap:'가운데 <b>베드 맵</b>에서 자리를 누르면 오른쪽에 그 자리의 <b>계통 카드</b>가 떠요. 빨간 <b>수확</b> 버튼을 눌러요.' }
    ]
  },

  {
    el:()=> document.querySelector('#tourHarvestDemo .hv-replant'),
    before: tourShowHarvestDemo,
    pad:5,
    wide:'xl',
    section:'계통작성',
    title:'다음 세대는 세대진전',
    body:`수확하면 <b>수확 완료 목록</b>에 남아요. 다음 세대로 이어서 심을 때는 <span class="t-key">세대진전</span>을 눌러요.
      <div class="t-tip">열리는 입력칸에서 <b>세대</b>를 꼭 확인해 주세요! 지난 세대가 그대로 들어 있어요.</div>`,
    shots:[
      { tab:'① 누르기', img:'advance_map', cap:'수확하면 그 자리는 비워지고, 오른쪽 아래 <b>수확 완료 목록</b>에 남아요. 빨간 <b>세대진전</b> 버튼을 누르세요. 줄 왼쪽 색은 <b>담당자</b>마다 달라요.' },
      { tab:'② 세대 확인', img:'advance_form', cap:'누르면 입력칸이 열려요. 빨간 테두리가 <b>세대</b> 칸이에요. 지난 세대가 그대로 들어 있으니 <b>다음 세대로 확인 · 수정</b>해 주세요. <b>심을 위치</b>(방 · 베드 · 층)는 필요하면 바꿀 수 있어요.' }
    ]
  },

  /* ───────── 작업계획 ───────── */
  {
    el:()=> document.querySelector('#tasksViewWrap [onclick="openAddTaskModal()"]'),
    before: tourGoTasks,
    pad:5,
    section:'작업계획',
    title:'요청할 사항이 있으면',
    body:`<span class="t-key">+ 작업 추가</span>를 누르고 비밀번호 <b>7942</b>를 입력해요.`
  },

  {
    el:()=> document.querySelector('.tasks-list-col .task-row input[type="checkbox"]:not(:checked)') || document.querySelector('.tasks-list-col .task-row input[type="checkbox"]') || document.querySelector('.tasks-list-col'),
    before: tourShowTaskListExample,
    pad:6,
    section:'작업계획',
    title:'끝났는지 확인하고 체크',
    body:`작업이 끝났는지 <b>직접 확인</b>한 다음, 요청 왼쪽의 <b>체크 버튼</b>을 눌러요.`,
    shots:[
      { tab:'체크', img:'task_check', cap:'빨간 테두리 칸에 체크해요.' }
    ]
  },

  /* ───────── 수요조사 ───────── */
  {
    el:()=> document.getElementById('navBtnSurvey'),
    before: tourGoSpace,
    pad:5,
    section:'수요조사',
    title:'수요조사',
    body:`쓰고 싶은 <b>방 · 기간 · 개체수</b>를 신청하는 화면이에요. 누구나 쓸 수 있어요.`
  },

  {
    el:()=> document.querySelector('#surveyViewWrap .survey-facility-panel'),
    before: tourGoSurvey,
    pad:6,
    skipIfMissing:true,
    section:'수요조사',
    title:'① 방을 골라요',
    body:`왼쪽에서 방을 눌러요.`
  },

  {
    el:()=> document.querySelector('#surveyViewWrap .survey-bed-panel'),
    before: tourSurveyPickRoom,
    pad:6,
    skipIfMissing:true,
    section:'수요조사',
    title:'② 베드와 층을 골라요',
    body:`칸을 눌러 <b>✓ 표시</b>를 해요. 여러 개도 돼요. 베드 이름을 누르면 <b>두 층이 함께</b> 선택돼요. 인공교배실은 <b>통로</b>도 고를 수 있어요.`
  },

  {
    el:()=> document.querySelector('#surveyViewWrap .survey-form-panel .task-bed-chips'),
    before: tourSurveyPickBed,
    pad:6,
    skipIfMissing:true,
    section:'수요조사',
    title:'③ 사용 목적을 골라요',
    body:`세대단축 · 인공교배 · 고온검정 · 기타 중 하나를 고르면 <b>필요한 칸만</b> 나와요.`
  },

  {
    el:()=> document.getElementById('surveyGenWrap'),
    before: ()=> tourSurveyPickPurpose('세대단축'),
    pad:6,
    skipIfMissing:true,
    section:'수요조사',
    title:'세대단축',
    body:`<b>시작일</b>만 고르면 종료일이 자동으로 계산돼요.`
  },

  {
    el:()=> document.getElementById('surveyEtcWrap'),
    before: ()=> tourSurveyPickPurpose('기타'),
    pad:6,
    skipIfMissing:true,
    section:'수요조사',
    title:'기타 실험',
    body:`<b>온도 · 일장</b>을 누르면 조건 칸이 나와요. 조건이 바뀌면 <span class="t-key">+ 구간 추가</span>.`
  },

  {
    el:()=> document.querySelector('#surveyViewWrap [onclick="submitDemandSurvey()"]'),
    before: tourSurveyPickBed,
    pad:6,
    skipIfMissing:true,
    section:'수요조사',
    title:'④ 개체수를 적고 제출',
    body:`베드마다 개체수를 적고 <span class="t-key">제출하기</span>. 관리자가 계획에 반영해요.`
  },

  {
    el:()=> document.getElementById('guideBtn'),
    pad:5,
    section:'소개',
    title:'이제 시작해볼까요',
    body:`헷갈리면 <span class="t-key">? 사용법</span>을 눌러요.
      <div class="t-tip">여러 사람이 함께 쓰는 기록이에요. 지우기 전에 담당자에게 먼저 물어봐 주세요.</div>`,
    last:true
  }

];

/* ========== 온보딩 투어 엔진 (수정 불필요) ========== */
let tourIdx = 0;

let tourActive = false;

let tourScale = 1;

let tourScrollTimer = null;

function measureTourScale(){
  const p = document.createElement('div');
  p.style.cssText = 'position:fixed;left:0;top:0;width:100px;height:100px;visibility:hidden;pointer-events:none;';
  document.body.appendChild(p);
  const w = p.getBoundingClientRect().width;
  p.remove();
  tourScale = (w > 0 ? w / 100 : 1);
}

/* ── 투어 중 화면 이동용 (TOUR_STEPS의 before 에서 씁니다) ── */
function tourRoomByName(name){ return rooms.find(r=> r.name === name) || null; }

function tourPickRoom(){
  return tourRoomByName('세대단축실 1') || rooms.find(r=> !MUTED_ROOMS.has(r.name)) || null;
}

function tourGoSpace(){ if(viewMode !== 'space') switchView('space'); }

function tourGoWork(){
  if(viewMode !== 'work') switchView('work');
  const r = tourPickRoom();
  if(r && workActiveRoomId !== r.id) openWorkRoomDetail(r.id);
}

function tourGoTasks(){ if(viewMode !== 'tasks') switchView('tasks'); }

// 수요조사 체험: 방 · 베드 · 사용 목적을 투어가 대신 골라서 폼이 어떻게 바뀌는지 보여준다. 투어가 끝나면 선택을 되돌린다
let tourSurveyTouched = false;

function tourGoSurvey(){ if(viewMode !== 'survey') switchView('survey'); }

function tourSurveyPickRoom(){
  tourGoSurvey();
  tourSurveyTouched = true;
  if(surveySelectedRoomName !== '인공교배실 1') selectSurveyRoom('인공교배실 1');
}

function tourSurveyPickBed(){
  tourSurveyPickRoom();
  if(!surveySelectedBeds.size) selectSurveyBed(8, '1층');
}

function tourSurveyPickPurpose(p){
  tourSurveyPickBed();
  if(surveySelectedPurposes.has(p)) return;
  const chip = [...document.querySelectorAll('#surveyViewWrap .survey-form-panel .task-bed-chip')]
    .find(c=> c.textContent.trim() === p && /toggleSurveyPurpose/.test(c.getAttribute('onclick') || ''));
  if(chip) toggleSurveyPurpose(p, chip);
}

function tourResetSurvey(){
  if(!tourSurveyTouched) return;
  tourSurveyTouched = false;
  surveySelectedRoomName = null;
  surveySelectedBeds = new Set();
  surveySelectedPurposes = new Set();
  surveySelectedCrops = new Set();
  surveySelectedGenerations = new Set();
  surveySelectedFactors = new Set();
  if(viewMode === 'survey') renderSurveyView();
}

// 작업계획 체험: 체크할 요청이 있는 날(오늘, 없으면 오늘과 가장 가까운 날)을 보여준다. 투어가 끝나면 보던 날짜로 되돌린다 (endTour)
let tourTaskSaved = null;

function tourShowTaskListExample(){
  tourGoTasks();
  if(!tourTaskSaved) tourTaskSaved = { date: taskViewDate, month: taskCalendarMonth };
  const today = todayKST();
  const gap = (d)=> Math.abs(new Date(d+'T00:00:00') - new Date(today+'T00:00:00'));
  const days = [...new Set(dailyTasks.filter(t=> t.source!=='worker' && t.task_date).map(t=> t.task_date))].sort((a,b)=> gap(a) - gap(b));
  const pick = days[0];
  if(!pick) return;
  taskCalendarMonth = new Date(Number(pick.slice(0,4)), Number(pick.slice(5,7)) - 1, 1);   // 달력도 그 달로
  setTaskViewDate(pick);
}

// 투어용: 투어 방에서 비어 있는(kind='empty') 또는 계통이 있는(kind='filled') 첫 자리를 골라 작성 패널에 띄운다. 없으면 null
function tourSelectWorkSpot(kind, accept){
  tourGoWork();
  const r = tourPickRoom();
  if(!r) return null;
  const info = workRoomInfo(r);
  for(let bedNo=1; bedNo<=info.bedCount; bedNo++){
    for(const floor of info.floors){
      const filled = workSpotBatches(r, bedNo, floor).length > 0;
      if(filled !== (kind==='filled')) continue;
      if(accept && !accept(r, bedNo, floor)) continue;   // 조건(예: 분기별 계획이 있는 자리)에 맞는 자리만
      const only = workOnlySpot();
      if(!only || only.bedNo!==bedNo || only.floor!==floor){
        setWorkOnlySpot(bedNo, floor);
        renderDetail('work');
      }
      return { bedNo, floor };
    }
  }
  return null;
}

// 베드 맵의 '📅 계획' 표시 단계용: 골라 둔 자리가 있으면 풀어서 지도를 깨끗하게 보여 준다
function tourShowPlanChip(){
  tourGoWork();
  if(workMultiSpots.size){ workMultiSpots = new Set(); renderDetail('work'); }
}

function tourOpenDemoBatchModal(accept){
  const r = tourPickRoom();
  if(!r) return;
  const spot = (accept && tourSelectWorkSpot('empty', accept)) || tourSelectWorkSpot('empty') || { bedNo: 1, floor: '1층' };
  if(batchCompose) return;
  openBatchLocationModal(r.id, null, spot);
}

// 분기별 계획 카드가 뜨는 빈 자리인지 (계통작성 계획 목록과 같은 기간: 오늘 앞뒤 한 달)
function tourSpotHasPlan(r, bedNo, floor){
  const today = todayKST(), lo = addMonthsYmd(today, -BATCH_PLAN_WINDOW_MONTHS), hi = addMonthsYmd(today, BATCH_PLAN_WINDOW_MONTHS);
  return bedPlansAt(r.name, bedNo, floor).some(({ p })=> p.planned_start <= hi && (p.planned_end || p.planned_start) >= lo);
}

function tourGetDemoBatchId(){
  const expandedEl = document.querySelector('#workRoomDetail [data-batch-id]');
  if(expandedEl) return expandedEl.getAttribute('data-batch-id');
  // 한 자리 화면에서는 접힌 카드 대신 주황 상자(.spot-occupied)의 [편집] 버튼에 계통 id가 있다
  const btn = document.querySelector('#workRoomDetail .batch-card button[onclick^="toggleBatchExpand"], #workRoomDetail .spot-occupied button[onclick^="toggleBatchExpand"]');
  if(btn){
    const m = (btn.getAttribute('onclick') || '').match(/toggleBatchExpand\('([^']+)'\)/);
    if(m) return m[1];
  }
  return null;
}

function tourCollapseDemoBatchCard(){
  tourSelectWorkSpot('filled');
  const id = tourGetDemoBatchId();
  if(id && expandedBatchIds.has(id)){ expandedBatchIds.delete(id); renderDetail('work'); }
}

function tourShowHarvestDemo(){
  tourCollapseDemoBatchCard();
  const id = tourGetDemoBatchId();
  const b = materials.find(m=>m.id===id);
  if(!b || document.getElementById('tourHarvestDemo')) return;
  const btn = document.querySelector('#workRoomDetail .batch-card button[onclick^="toggleBatchExpand"], #workRoomDetail .spot-occupied button[onclick^="toggleBatchExpand"]');
  const card = btn ? btn.closest('.batch-card, .spot-occupied') : null;
  if(!card) return;
  const d = harvestDateParts(todayKST());
  card.insertAdjacentHTML('afterend', `
    <div class="work-section hv-section" id="tourHarvestDemo" style="margin-top:10px; border:1.8px dashed var(--teal);">
      <div class="work-section-title">수확 완료 목록 <span class="hv-count">(수확을 누르면 이렇게 남아요 · 예시)</span></div>
      <div class="hv-date"><b>${d.main}</b><span>${d.sub}</span></div>
      ${harvestRowHtml(b, true)}
    </div>
  `);
}

/* ── 체험 모드: 실제 저장을 막습니다 ── */
function tourBlockWrite(){
  if(!tourPreview) return false;
  showToast('투어 체험 모드예요 · 실제로 저장되지 않아요');
  return true;
}

/* ── 스포트라이트 그리기 ── */
function tourEls(){
  return {
    veil: document.getElementById('tourVeil'),
    ring: document.getElementById('tourRing'),
    pop:  document.getElementById('tourPop'),
    arrow:document.getElementById('tourArrow'),
    bT:   document.getElementById('tourBlockT'),
    bB:   document.getElementById('tourBlockB'),
    bL:   document.getElementById('tourBlockL'),
    bR:   document.getElementById('tourBlockR')
  };
}

function setBlock(el, l, t, w, h){
  el.classList.add('on');
  el.style.left = Math.max(0, l) + 'px';
  el.style.top = Math.max(0, t) + 'px';
  el.style.width = Math.max(0, w) + 'px';
  el.style.height = Math.max(0, h) + 'px';
}

function repositionTour(){
  if(!tourActive) return;
  const step = tourSteps[tourIdx];
  const E = tourEls();
  const S = tourScale || 1;
  const VW = window.innerWidth / S;
  const VH = window.innerHeight / S;

  let el = null;
  if(step.el){ try{ el = step.el(); }catch(e){ el = null; } }
  if(el && !document.body.contains(el)) el = null;

  E.pop.classList.toggle('centered', !el);
  const popW = E.pop.offsetWidth;
  const popH = E.pop.offsetHeight;

  if(!el){
    E.veil.classList.add('on');
    E.ring.classList.remove('on');
    E.arrow.classList.remove('on');
    setBlock(E.bT, 0, 0, VW, VH);
    [E.bB, E.bL, E.bR].forEach(b=> b.classList.remove('on'));
    E.pop.style.left = Math.max(8, (VW - popW) / 2) + 'px';
    E.pop.style.top  = Math.max(8, (VH - popH) / 2) + 'px';
    return;
  }

  E.veil.classList.remove('on');
  E.ring.classList.add('on');

  const r = el.getBoundingClientRect();
  const pad = step.pad != null ? step.pad : 6;
  const rl = r.left / S - pad;
  const rt = r.top / S - pad;
  const rw = r.width / S + pad * 2;
  const rh = r.height / S + pad * 2;

  E.ring.style.left = rl + 'px';
  E.ring.style.top = rt + 'px';
  E.ring.style.width = rw + 'px';
  E.ring.style.height = rh + 'px';
  E.ring.style.pointerEvents = step.advanceOnClick ? 'none' : 'auto';

  setBlock(E.bT, 0, 0, VW, rt);
  setBlock(E.bB, 0, rt + rh, VW, VH - (rt + rh));
  setBlock(E.bL, 0, rt, rl, rh);
  setBlock(E.bR, rl + rw, rt, VW - (rl + rw), rh);

  const GAP = 14;
  let top, place;
  if(rt + rh + GAP + popH <= VH - 8){ top = rt + rh + GAP; place = 'below'; }
  else if(rt - GAP - popH >= 8){ top = rt - GAP - popH; place = 'above'; }
  else { top = Math.min(Math.max(8, rt), Math.max(8, VH - popH - 8)); place = 'side'; }

  let left;
  if(place === 'side'){
    left = (rl + rw + GAP + popW <= VW - 8) ? rl + rw + GAP
         : (rl - GAP - popW >= 8) ? rl - GAP - popW
         : Math.max(8, (VW - popW) / 2);
  } else {
    left = rl + rw / 2 - popW / 2;
    left = Math.min(Math.max(8, left), Math.max(8, VW - popW - 8));
  }

  E.pop.style.left = left + 'px';
  E.pop.style.top = top + 'px';

  if(place === 'side'){
    E.arrow.classList.remove('on');
  } else {
    E.arrow.classList.add('on');
    const ax = Math.min(Math.max(14, rl + rw / 2 - left - 6.5), Math.max(14, popW - 27));
    E.arrow.style.left = ax + 'px';
    if(place === 'below'){ E.arrow.style.top = '-6.5px'; E.arrow.style.bottom = 'auto'; }
    else { E.arrow.style.bottom = '-6.5px'; E.arrow.style.top = 'auto'; }
  }
}

// 단계의 상황별 예시 스크린샷 (step.shots = [{ tab, img, cap }]). 그림 데이터는 파일 맨 아래 TOUR_SHOTS에 있다. 상황이 둘 이상이면 탭으로 고른다
let tourShotIdx = 0;

function renderTourShots(){
  const box = document.getElementById('tourShots');
  const step = tourSteps[tourIdx];
  const list = ((step && step.shots) || []).filter(s=> typeof TOUR_SHOTS !== 'undefined' && TOUR_SHOTS[s.img]);
  if(!list.length){ box.style.display = 'none'; box.innerHTML = ''; return; }
  const cur = list[Math.min(tourShotIdx, list.length - 1)], img = TOUR_SHOTS[cur.img];
  box.style.display = '';
  box.innerHTML = `
    ${list.length > 1 ? `<div class="tour-shot-tabs">${list.map((s, i)=> `<button type="button" class="tour-shot-tab ${s === cur ? 'on' : ''}" onclick="pickTourShot(${i})">${escapeHtml(s.tab)}</button>`).join('')}</div>` : ''}
    <div class="tour-shot-box"><img src="${img.src}" alt="${escapeHtml(cur.tab)} 예시" width="${img.w}" height="${img.h}" /></div>
    <div class="tour-shot-cap">${cur.cap}</div>`;
  const imgEl = box.querySelector('img');
  if(imgEl && !imgEl.complete) imgEl.addEventListener('load', ()=> repositionTour());
  const boxEl = box.querySelector('.tour-shot-box');
  if(boxEl && !step.wide && img.h / img.w * 320 > 260) box.insertAdjacentHTML('beforeend', '<div class="tour-shot-scroll">↕ 그림 안에서 스크롤하면 아래도 보여요</div>');   // wide 단계의 그림은 상자에 맞춰 줄어들어 스크롤이 없다
}

function pickTourShot(i){ tourShotIdx = i; renderTourShots(); repositionTour(); }

function renderTourPop(){
  const step = tourSteps[tourIdx];
  document.getElementById('tourStepNo').textContent = `${tourSection !== '전체' ? tourSection + ' · ' : ''}${tourIdx + 1} / ${tourSteps.length}`;
  document.getElementById('tourTitle').textContent = step.title;
  document.getElementById('tourBody').innerHTML = step.body;
  document.getElementById('tourPop').classList.toggle('wide', !!step.wide);
  document.getElementById('tourPop').classList.toggle('xl', step.wide === 'xl');
  tourShotIdx = 0;
  renderTourShots();
  document.getElementById('tourSkipRow').style.display = step.skippable ? '' : 'none';
  document.getElementById('tourDots').innerHTML =
    tourSteps.map((_, i)=> `<i class="${i === tourIdx ? 'on' : ''}" onclick="jumpTour(${i})"></i>`).join('');
  document.getElementById('tourPrevBtn').disabled = tourIdx === 0;
  document.getElementById('tourNextBtn').textContent = step.last ? '시작하기' : (tourIdx === tourSteps.length - 1 ? '끝내기' : '다음');
}

function isFullyVisible(r){
  return r.top >= 70 && r.bottom <= window.innerHeight - 10 && r.height > 0;
}

function showTourStep(dir){
  const step = tourSteps[tourIdx];

  if(!step.keepModal && batchCompose) closeBatchLocModal();
  if(step.before){ try{ step.before(); }catch(e){} }

  setTimeout(()=>{
    let el = null;
    if(step.el){ try{ el = step.el(); }catch(e){ el = null; } }

    if(!el && step.el && step.skipIfMissing && dir !== 0){
      const next = tourIdx + dir;
      if(next >= 0 && next < tourSteps.length){ tourIdx = next; showTourStep(dir); return; }
    }

    renderTourPop();
    document.getElementById('tourPop').classList.add('on');

    if(el && step.advanceOnClick){
      el.addEventListener('click', ()=>{
        setTimeout(()=>{ if(tourActive && tourSteps[tourIdx] === step) moveTour(1); }, 220);
      }, { once:true });
    }

    if(el && !isFullyVisible(el.getBoundingClientRect())){
      try{ el.scrollIntoView({ block:'center', behavior:'smooth' }); }catch(e){}
      setTimeout(repositionTour, 380);
      setTimeout(repositionTour, 720);
    }
    repositionTour();
    requestAnimationFrame(repositionTour);
  }, 90);
}

// 지금 보고 있는 사용법의 항목('전체'면 모든 단계)과 그 단계들
let tourSection = '전체';

let tourSteps = TOUR_STEPS;

function startTour(section){
  tourSection = (section && TOUR_SECTIONS.some(s=> s.key === section)) ? section : '전체';
  tourSteps = tourSection === '전체' ? TOUR_STEPS : TOUR_STEPS.filter(s=> s.section === tourSection);
  if(!tourSteps.length){ tourSection = '전체'; tourSteps = TOUR_STEPS; }
  measureTourScale();
  tourIdx = 0;
  tourActive = true;
  tourPreview = true;
  try{
    renderFacility();
    renderDetail();
    if(workActiveRoomId) renderDetail('work');
  }catch(e){}
  showTourStep(0);
  if(tourScrollTimer) clearInterval(tourScrollTimer);
  tourScrollTimer = setInterval(repositionTour, 260);
}

// '? 사용법': 먼저 보고 싶은 항목을 고른다
function openGuide(){
  document.getElementById('guideMenuList').innerHTML = TOUR_SECTIONS.map(s=>{
    const n = s.key === '전체' ? TOUR_STEPS.length : TOUR_STEPS.filter(x=> x.section === s.key).length;
    return `<button type="button" class="guide-item" onclick="pickGuideSection('${s.key}')"><b>${escapeHtml(s.name)} <i>${n}단계</i></b><span>${escapeHtml(s.desc)}</span></button>`;
  }).join('');
  document.getElementById('guideMenuOverlay').classList.add('open');
}

function closeGuideMenu(){ document.getElementById('guideMenuOverlay').classList.remove('open'); }

function pickGuideSection(key){ closeGuideMenu(); startTour(key); }

function moveTour(d){
  if(d > 0 && tourIdx === tourSteps.length - 1){ endTour(); return; }
  const next = tourIdx + d;
  if(next < 0 || next >= tourSteps.length) return;
  tourIdx = next;
  showTourStep(d);
}

function jumpTour(i){
  const d = i > tourIdx ? 1 : -1;
  tourIdx = i;
  showTourStep(d);
}

function endTour(){
  tourActive = false;
  tourPreview = false;
  if(tourScrollTimer){ clearInterval(tourScrollTimer); tourScrollTimer = null; }
  const E = tourEls();
  E.veil.classList.remove('on');
  E.ring.classList.remove('on');
  E.pop.classList.remove('on');
  E.arrow.classList.remove('on');
  [E.bT, E.bB, E.bL, E.bR].forEach(b=> b.classList.remove('on'));
  if(batchCompose) closeBatchLocModal();
  tourResetSurvey();
  if(tourTaskSaved){ taskViewDate = tourTaskSaved.date; taskCalendarMonth = tourTaskSaved.month; tourTaskSaved = null; }
  try{ localStorage.setItem(TOUR_KEY, '1'); }catch(e){}
  try{
    goHome();
    if(workActiveRoomId) renderDetail('work');
  }catch(e){}
}

function dontShowTourAgain(){
  try{ localStorage.setItem(TOUR_KEY, '1'); }catch(e){}
  endTour();
  showToast('사용법은 헤더의 "? 사용법"에서 다시 볼 수 있어요');
}
