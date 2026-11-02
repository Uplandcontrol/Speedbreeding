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
   │                cap:'설명' }]. 그림은 파일 맨 아래 TOUR_SHOTS에 있어요 │
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
  { key:'계통작성', name:'계통작성',   desc:'계통 등록 · 수확' },
  { key:'작업계획', name:'작업계획',   desc:'작업 요청과 기록' }
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
    el:()=> document.getElementById('navBtnWork'),
    before: tourGoSpace,
    pad:5,
    section:'계통작성',
    title:'계통작성',
    body:`재료를 등록하는 화면이에요. 누구나 쓸 수 있어요.`
  },

  {
    el:()=> document.getElementById('workMapPanel'),
    before: tourGoWork,
    pad:6,
    skipIfMissing:true,
    section:'계통작성',
    title:'① 방을 골라요',
    body:`왼쪽 배치도에서 방을 눌러요.`
  },

  {
    el:()=> document.getElementById('workBedPanel'),
    before: tourGoWork,
    pad:6,
    skipIfMissing:true,
    section:'계통작성',
    title:'② 자리를 골라요',
    body:`베드 칸을 눌러 <b>✓ 표시</b>를 해요. 빈 자리를 누르면 바로 <b>작성 칸</b>이, 계통이 있는 자리를 누르면 그 자리의 카드가 오른쪽에 나와요. 여러 자리를 고르면 자리마다 <b>개체수</b>를 적는 칸이 생겨요. 인공교배실은 <b>통로</b>도 한 자리예요.
      <div class="t-tip">같은 계통을 여러 곳에 심을 땐 칸을 여러 개 누르세요. 개체수는 <b>베드마다</b> 적어요.</div>`
  },

  {
    el:()=> document.querySelector('#workRoomDetail .batch-compose'),
    before: tourOpenDemoBatchModal,
    keepModal:true,
    pad:8,
    skipIfMissing:true,
    section:'계통작성',
    title:'③ 칸을 채워요',
    body:`<b>사용 목적</b>(세대단축 · 인공교배 · 고온검정 · 기타)을 먼저 고르면 아래 칸이 바뀌어요. 목적별로 이렇게 채워요.
      <div class="t-tip">계획이 있는 자리는 위의 <b>계획 카드</b>를 누르면 자동으로 채워져요.</div>`,
    shots:[
      { tab:'세대단축', img:'form_grow',  cap:'<b>작물 · 계통번호 · 교배조합 · 교배목적 · 세대</b>를 고르거나 적고, <b>시작일</b>을 고르면 종료일은 생육일수로 <b>자동 계산</b>돼요. 마지막에 베드별 개체수를 적어요.' },
      { tab:'인공교배', img:'form_cross', cap:'계통번호 없이 <b>교배조합</b>(대표 1개, 더 있으면 <b>외 N조합</b>)과 <b>교배목적</b>, <b>사용기간</b>, 개체수를 적어요.' },
      { tab:'고온검정', img:'form_heat',  cap:'<b>검정 목적 · 품종</b>, <b>처리 온도 · 처리 단계</b>, 사용기간, 개체수를 적어요. 반복 실험은 반복 수만큼 베드 칸을 눌러요.' },
      { tab:'기타 실험', img:'form_etc',  cap:'<b>실험 내용</b>을 적고 <b>처리 요인</b>(온도 · 일장)을 고르면 조건 칸이 나와요. 조건이 바뀌면 <b>+ 구간 추가</b>를 눌러요.' }
    ]
  },

  {
    el:()=> document.querySelector('#workRoomDetail .batch-compose [onclick="submitBatchLocModal()"]'),
    before: tourOpenDemoBatchModal,
    keepModal:true,
    pad:6,
    skipIfMissing:true,
    section:'계통작성',
    title:'④ 등록을 눌러요',
    body:`누르면 그 자리에 카드가 생겨요.`
  },

  {
    el:()=> document.querySelector('#workRoomDetail button[onclick^="harvestAndReplant"], #workRoomDetail button[onclick^="completeHeatTest"]'),
    before: tourCollapseDemoBatchCard,
    pad:5,
    skipIfMissing:true,
    section:'계통작성',
    title:'수확했으면 [수확]을 눌러요',
    body:`등록된 계통 카드의 <span class="t-key">수확</span> 버튼을 누르고, <b>"수확 처리할까요?"</b>가 뜨면 <b>확인</b>을 눌러요. 그 자리가 비워져요.
      <div class="t-tip">계통 종류에 따라 버튼 이름만 달라요. 누르는 방법은 같아요.</div>`,
    shots:[
      { tab:'세대단축', img:'card_grow',  cap:'빨간 테두리가 누를 버튼이에요. 세대단축 계통은 <b>수확</b>을 눌러요.' },
      { tab:'인공교배', img:'card_cross', cap:'인공교배 계통은 교배에 다 썼으면 <b>사용완료</b>를 눌러요.' },
      { tab:'고온검정', img:'card_heat',  cap:'고온검정 계통은 검정이 끝났으면 <b>검정완료</b>를 눌러요.' },
      { tab:'기타 실험', img:'card_etc',  cap:'기타 실험 계통은 실험이 끝났으면 <b>실험완료</b>를 눌러요.' }
    ]
  },

  {
    el:()=> document.getElementById('tourHarvestDemo'),
    before: tourShowHarvestDemo,
    pad:6,
    skipIfMissing:true,
    section:'계통작성',
    title:'수확하면 이렇게 남아요',
    body:`기록은 아래 <b>수확 완료 목록</b>에 남아요. 세대단축 계통은 거기서 <span class="t-key">세대진전</span>을 누르면 다음 세대로 새 자리에 심을 수 있어요. (고온검정 · 기타 실험은 <span class="t-key">다시 심기</span>)`,
    shots:[
      { tab:'수확 완료 목록', img:'list', cap:'목적에 따라 이어서 하는 일이 달라요. 세대단축은 <b>세대진전</b>, 고온검정 · 기타 실험은 <b>다시 심기</b>, 인공교배는 <b>✓ 사용 완료</b>로 끝나요.' }
    ]
  },

  /* ───────── 작업계획 ───────── */
  {
    el:()=> document.getElementById('navBtnTasks'),
    pad:5,
    section:'작업계획',
    title:'작업계획',
    body:`날짜별 작업 요청과 기록을 보는 화면이에요.`
  },

  {
    el:()=> document.querySelector('.tasks-cal-col'),
    before: tourGoTasks,
    pad:6,
    skipIfMissing:true,
    section:'작업계획',
    title:'날짜를 눌러요',
    body:`점이 있는 날은 작업이 있어요. 누르면 오른쪽에 나와요.`
  },

  {
    el:()=> document.querySelector('#tasksViewWrap [onclick="openAddTaskModal()"]'),
    before: tourGoTasks,
    pad:5,
    skipIfMissing:true,
    section:'작업계획',
    title:'추가 버튼',
    body:`<b>작물담당자</b>는 작업 <b>요청</b>, <b>작업담당자</b>는 한 일 <b>기록</b>을 적어요.`
  },

  {
    el:()=> document.querySelector('.tasks-list-col .task-row-wrap') || document.querySelector('.tasks-list-col'),
    before: tourShowTaskListExample,
    pad:6,
    skipIfMissing:true,
    section:'작업계획',
    title:'끝냈으면 체크',
    body:`끝낸 요청은 왼쪽 <b>체크박스</b>에 체크해요.`
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
function tourSelectWorkSpot(kind){
  tourGoWork();
  const r = tourPickRoom();
  if(!r) return null;
  const info = workRoomInfo(r);
  for(let bedNo=1; bedNo<=info.bedCount; bedNo++){
    for(const floor of info.floors){
      const filled = workSpotBatches(r, bedNo, floor).length > 0;
      if(filled !== (kind==='filled')) continue;
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

function tourOpenDemoBatchModal(){
  const r = tourPickRoom();
  if(!r) return;
  const spot = tourSelectWorkSpot('empty') || { bedNo: 1, floor: '1층' };
  if(batchCompose) return;
  openBatchLocationModal(r.id, null, spot);
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
  if(boxEl && img.h / img.w * 320 > 260) box.insertAdjacentHTML('beforeend', '<div class="tour-shot-scroll">↕ 그림 안에서 스크롤하면 아래도 보여요</div>');
}

function pickTourShot(i){ tourShotIdx = i; renderTourShots(); repositionTour(); }

function renderTourPop(){
  const step = tourSteps[tourIdx];
  document.getElementById('tourStepNo').textContent = `${tourSection !== '전체' ? tourSection + ' · ' : ''}${tourIdx + 1} / ${tourSteps.length}`;
  document.getElementById('tourTitle').textContent = step.title;
  document.getElementById('tourBody').innerHTML = step.body;
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
