/* core.js — 기본 설정 · 공통 도구: 데이터베이스 연결, 한국 시간 날짜 계산, 시설(방·베드) 구조, 화면 상태값, 관리자 모드, 작물 색, 전체 데이터 불러오기(loadAll) */

const SUPABASE_URL = "https://yfnssmflmzebrfdykbme.supabase.co";

const SUPABASE_KEY = "sb_publishable_L3ZYs61PsP_Mn1iRnA89PA_-LbEWBbW";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ── 한국 시간(KST, Asia/Seoul) 기준 날짜·시간 도구 ──────────────────────
   접속한 컴퓨터의 시간대와 상관없이 항상 한국 시간으로 "오늘"과 날짜를 계산해요.
   · DB에는 시각(updated_at, harvest_confirmed_at 등)을 UTC(ISO)로 저장해요. 세계 표준이라 그대로 두고,
     화면에 날짜로 보여줄 때만 한국 시간으로 바꿔요.
   · 'YYYY-MM-DD' 날짜(파종일·수확일·희망기간 등)는 시간대 없는 달력 날짜로만 다뤄요. */
const KST_TZ = 'Asia/Seoul';

// Date → 'YYYY-MM-DD' (한국 날짜)
function kstDateStr(d){
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: KST_TZ, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(d || new Date());
  const p = {}; parts.forEach(x=>{ p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day}`;
}

function todayKST(){ return kstDateStr(new Date()); }

// getFullYear/getMonth/getDate/getDay 가 한국의 "오늘"을 가리키는 Date (달력·주간 계산용)
function kstTodayDate(){ const [y,m,d] = todayKST().split('-').map(Number); return new Date(y, m-1, d); }

// DB에서 온 시각 문자열 → Date (시간대 표시가 없으면 UTC로 간주)
function parseTimestamp(ts){ const s = String(ts); return new Date(/[zZ]$|[+-]\d{2}(:?\d{2})?$/.test(s) ? s : s.replace(' ','T') + 'Z'); }

// DB 시각 → 한국 날짜 'YYYY-MM-DD'
function kstDateOfTimestamp(ts){ if(!ts) return ''; const d = parseTimestamp(ts); return isNaN(d) ? String(ts).slice(0,10) : kstDateStr(d); }

// 'YYYY-MM-DD' 의 한국 시간 자정 (밀리초)
function kstMidnightMs(dateStr){ return Date.parse(dateStr + 'T00:00:00+09:00'); }

// 두 'YYYY-MM-DD' 날짜 사이의 일수 (end - start)
function daysBetween(startStr, endStr){
  const [sy,sm,sd] = startStr.split('-').map(Number), [ey,em,ed] = endStr.split('-').map(Number);
  return Math.round((Date.UTC(ey,em-1,ed) - Date.UTC(sy,sm-1,sd)) / 86400000);
}

/* ╚═══════════ 투어 설정 끝 · 아래부터는 건드리지 않아도 됩니다 ═══════════╝ */


// 고정 배치도 구조 (참고 도면과 동일)
const ROW1 = ['세대단축실 1','세대단축실 2','세대단축실 3','세대단축실 4','고온검정실'];

const ROW1_INFO = '조사실';

const ROW2 = ['창고','인공교배실 2','인공교배실 1','조사실','조사실'];

const FIXED_NAMES = new Set([...ROW1, ...ROW2]);

const DEFAULT_ROOM_CONFIG = {
  '세대단축실 1': { bed_count:4, bed_floors:2, tray_capacity:6 },
  '세대단축실 2': { bed_count:4, bed_floors:2, tray_capacity:6 },
  '세대단축실 3': { bed_count:4, bed_floors:2, tray_capacity:6 },
  '고온검정실':   { bed_count:6, bed_floors:2, tray_capacity:3 },
  '인공교배실 1': { bed_count:10, bed_floors:2, tray_capacity:3 },
  '인공교배실 2': { bed_count:4, bed_floors:1, tray_capacity:null }
};

const ROOM_COLS_PER_ROW = {
  '세대단축실 1': 2, '세대단축실 2': 2, '세대단축실 3': 2,
  '고온검정실': 3,
  '인공교배실 1': 5,
  '인공교배실 2': 2
};

const MUTED_ROOMS = new Set(['창고','조사실','세대단축실 4']);

// 기본은 쓰지 않는 칸이지만, 관리자가 방 상태 설정에서 '사용 가능'을 켜면 다른 방처럼 쓰는 칸 (rooms.open_for_use = true). 창고는 재배 공간이 아니라 제외
const OPENABLE_MUTED_ROOMS = new Set(['조사실','세대단축실 4']);

// 지금 '쓰지 않는 칸'(흐리게 · 클릭 안 됨 · 계통작성 · 수요조사 · 계획 대상 아님)인지. 예전 MUTED_ROOMS.has(name) 자리를 대신한다
function isMutedRoom(name){
  if(!MUTED_ROOMS.has(name)) return false;
  if(!OPENABLE_MUTED_ROOMS.has(name)) return true;
  const r = (typeof rooms !== 'undefined' && rooms) ? rooms.find(x=> x.name===name) : null;
  return !(r && r.open_for_use === true);
}

// 방의 베드 구성: 도면 기준 고정값(DEFAULT_ROOM_CONFIG)이 있으면 그것, 없으면(조사실 등 관리자가 열어 쓰는 칸) 관리자가 정한 rooms 값. 베드가 없으면 undefined
function roomBedConfig(name){
  if(DEFAULT_ROOM_CONFIG[name]) return DEFAULT_ROOM_CONFIG[name];
  if(isMutedRoom(name)) return undefined;
  const r = (typeof rooms !== 'undefined' && rooms) ? rooms.find(x=> x.name===name) : null;
  if(!r || !(r.structure_count > 0)) return undefined;
  return { bed_count: r.structure_count, bed_floors: r.bed_floors===1 ? 1 : 2, tray_capacity: r.tray_capacity ?? null };
}

const ROOM_DISPLAY_LABELS = { '세대단축실 4': '세대단축실4번(조사실)' };

// 화면에 보이는 방 이름: 관리자가 정한 표시 이름(rooms.display_label) → 기본 표시 이름 → 방 이름 순
// (방 이름(name)은 배치도 · 계획이 묶는 기준이라 바꾸지 않고, 보이는 글자만 바꾼다)
const ROOM_LABEL_SQL = 'alter table rooms add column if not exists display_label text;';

function roomLabel(name){
  const r = rooms.find(x=> x.name===name);
  const custom = r && String(r.display_label || '').trim();
  return custom || ROOM_DISPLAY_LABELS[name] || name;
}

// PPT 도면과 동일한 실제 베드 번호 배치 (통로 기준 위/아래 순서)
const ROOM_BED_LAYOUT = {
  '세대단축실 1': { top:[1,2], bottom:[4,3] },
  '세대단축실 2': { top:[1,2], bottom:[4,3] },
  '세대단축실 3': { top:[1,2], bottom:[4,3] },
  '고온검정실':   { top:[1,2,3], bottom:[6,5,4] },
  '인공교배실 1': { top:[6,7,8,9,10], bottom:[1,2,3,4,5] }
};

// 인공교배실 1·2는 베드 사이 통로에도 식물을 둔다 → 수요조사에서 통로를 하나의 자리로 받는다.
// 통로는 베드 번호 0 · 층 '통로'로 저장돼서, 수요조사 → 분기별 계획 흐름이 다른 자리와 똑같이 이어진다.
const AISLE_ROOMS = new Set(['인공교배실 1','인공교배실 2']);

const AISLE_BED_NO = 0, AISLE_FLOOR = '통로';

const AISLE_KEY = `${AISLE_BED_NO}|${AISLE_FLOOR}`;   // 수요조사 베드 선택에서 쓰는 키 (베드번호|층)

function isAisleSpot(bedNo){ return bedNo != null && bedNo !== '' && Number(bedNo) === AISLE_BED_NO; }

function bedOrder(bedNo){ return isAisleSpot(bedNo) ? 1e9 : Number(bedNo); }   // 정렬용: 통로는 베드들 뒤로

// 사람이 읽는 자리 이름: '베드 3 · 1층' (tight면 '베드3·1층'). 통로는 그냥 '통로'
function spotText(bedNo, floor, tight){
  if(isAisleSpot(bedNo)) return '통로';
  return tight ? `베드${bedNo}·${floor}` : `베드 ${bedNo} · ${floor}`;
}

let rooms = [];

let materials = [];

let dailyTasks = [];

let demandSurveys = [];

let demandCopies = [];             // 관리자가 일정표에서 복사 · 붙여넣기로 만든 요청 (copy_of가 있는 행). 수요 집계 · 응답 목록에는 세지 않고, 분기별 계획에서만 일반 요청처럼 쓴다

let bedPlans = [];

let planEntries = [];              // 계획 제출 창의 항목들 (수요조사 입력 항목과 같은 구성)

let currentPlanSurveyGroups = [];  // 계획 제출 창에서 보여주는 수요조사 응답 묶음

let planPeriod = null;

let planPeriodEditing = false;

let planEditPrefill = null;

let currentPlanGroups = [];

let currentPlanBarItems = [];      // 일정표 막대(클릭하면 팝업으로 내용을 보여줌)에 대응하는 계획들

let planShowDemand = true;         // 일정표에 아직 계획에 넣지 않은 수요조사 요청(점선 막대)을 함께 보여줄지 (관리자)

let planDemandBusy = false;        // 요청을 계획에 반영하는 동안 중복 클릭 방지

// 일정표에 보여줄 베드 ('사용중인 베드만' · '남은 베드만' 체크, 둘 중 하나만 켜진다): 'all' = 전체 (계획도 요청도 없는 빈 베드까지 모두),
// 'used' = 사용중인 베드 (일정표 기간에 확정된 계획이 있는 베드 · 층만), 'free' = 남은 베드 (일정표 기간에 확정된 계획이 없는 베드 · 층만).
// 고른 모드는 브라우저에 기억하고, 처음엔 '사용중인 베드만'. 저장 키를 새로 잡은 건 예전 키에 남은 'all'(전엔 기본값)이 새 기본값을 덮어쓰지 않게 하려는 것
let planBedView = (()=>{ try{ const v = localStorage.getItem('sb_plan_bed_view_v2'); return (v === 'free' || v === 'all') ? v : 'used'; }catch(e){ return 'used'; } })();

let planDrag = null;               // 일정표에서 요청 막대를 끌고 있는 동안의 상태 (끌고 있지 않으면 null)

// '날짜 고정': 켜 두면 요청 막대를 끌 때 위아래(방 · 베드 · 층)로만 움직이고 날짜는 지금 그대로(수요조사로 받은 날짜), 끄면 좌우로 끌어 날짜도 옮길 수 있다. 기본은 켜짐이고, 브라우저에 기억해 둔다
let planLockDates = (()=>{ try{ return localStorage.getItem('sb_plan_lock_dates') !== '0'; }catch(e){ return true; } })();

const planClip = [];               // 일정표에서 복사해 둔 요청들 (메모리에만 있음): { id, srcGid, family, label, rows }. 붙여넣을 때마다 응답 행으로 저장된다

let planClipActive = null;         // 붙여넣기 버튼이 붙여넣는 복사본 (planClip 안의 id)

let planClipSeq = 0;

const planDraft = new Map();       // 저장 전 조율: gid → { room, bedNo, floor, days } (저장된 값 기준으로 옮긴 자리와 밀린 일수). DB에는 없고 메모리에만 있어서, [저장]을 안 하고 새로고침하면 사라져 원래대로 돌아간다

let surveySelectedPurposes = new Set();

let surveySelectedCrops = new Set();

let surveySelectedRoomName = null;

let surveySelectedBeds = new Set();

let surveySelectedGenerations = new Set();

let surveySelectedFactors = new Set();   // 기타(실험) 목적의 처리 요인 (온도·일장 …)

let surveyDemandExpandedRoom = null;

let surveyResultRoomFilter = '';   // 응답 결과 목록의 방 필터 ('' = 전체 · '__none__' = 방 미지정 · 그 밖에는 방 이름)

let taskViewDate = todayKST();

let taskFilterRoom = '';

function setTaskFilterRoom(val){
  taskFilterRoom = val;
  renderTasksView();
}

let taskCalendarMonth = kstTodayDate();

let generationHistory = [];

let cropProfiles = {};

let activeRoomId = null;

let modalRoomId = null;

let workActiveRoomId = null;

let workMultiSpots = new Set(); // 계통작성에서 고른 자리들 ('베드번호|층'). 수요조사처럼 눌러서 바로 여러 자리를 고른다.

                                // 한 자리만 고르면 오른쪽에 그 자리의 계통 카드가, 여러 자리를 고르면 자리마다 개체수를 적는 작성 칸이 바로 나온다
let batchCompose = null;       // 오른쪽 작성 패널에 열려 있는 '집단 추가 · 복사' 입력칸 { sig, auto, roomId } — 없으면 null

                               // (sig: 열 때의 방·자리 선택 상태 · auto: 여러 자리를 골라서 저절로 열린 입력칸 — 자리를 더 누르면 같은 칸에서 자리 목록만 바뀐다)
let userRole = 'viewer';

let viewMode = 'space'; // 'space' | 'work' | 'tasks' | 'survey' | 'plan'

let isAdmin = false;       // 전체 관리자 여부 (베드/작물/방 편집 가능)

let expandedBatchIds = new Set(); // 계통작성에서 이미 작성된 베드 중 펼쳐서 수정 중인 것들

let materialAuth = false;  // 작업계획에서 작물담당자 비밀번호로 얻는 '작업 요청' 권한 (계통작성은 비밀번호가 없다)

let workerAuth = false;    // 작업담당자 비밀번호로 얻는 "오늘 한 일 기록" 권한

let tourPreview = false;   // 투어 체험 모드 (저장은 막히고 화면만 보여줘요)

// 계통작성의 재료 등록 · 수정 · 수확 · 복사: 비밀번호 없이 누구나 할 수 있다 (방 삭제 같은 관리 기능은 관리자만)
function canWriteMaterials(){ return true; }

const NOTE_PASSWORD = "note1234";   // 작업기록 전용 비밀번호 - 원하는 걸로 바꾸세요

const ADMIN_PASSWORD = "admin1234"; // 전체 관리자 비밀번호 - 원하는 걸로 바꾸세요

function toggleAdmin(){
  if(userRole !== 'viewer'){
    userRole = 'viewer';
    isAdmin = false;
    planDraft.clear();   // 관리자 모드를 나가면 저장하지 않은 조율은 버린다
    materialAuth = false;
    workerAuth = false;
    showToast('보기 전용 모드로 전환됐어요');
  } else {
    const pw = prompt('비밀번호를 입력하세요\n(작업기록 전용 비밀번호 또는 전체 관리자 비밀번호)');
    if(pw === null) return;
    if(pw === ADMIN_PASSWORD){
      userRole = 'admin'; isAdmin = true;
      materialAuth = true; workerAuth = true;
      showToast('전체 관리자 모드로 전환됐어요 · 공간 뷰로 이동해요');
      switchView('space');
    } else if(pw === NOTE_PASSWORD){
      userRole = 'note'; isAdmin = false;
      showToast('작업기록 작성 모드로 전환됐어요 · 계통작성으로 이동해요');
      switchView('work');
    } else {
      alert('비밀번호가 틀렸어요');
      return;
    }
  }
  updateAdminUI();
  renderFacility();
  renderDetail();
  if(workActiveRoomId || viewMode==='work') renderDetail('work');
  if(viewMode==='plan') renderPlanView();
}

function updateAdminUI(){
  const btn = document.getElementById('adminToggleBtn');
  const labels = {
    viewer: '보기 전용 (누르면 비밀번호로 편집 모드)',
    note: '작업기록 작성 모드 (누르면 보기 전용으로)',
    admin: '전체 관리자 모드 (누르면 보기 전용으로)'
  };
  btn.title = labels[userRole];
  btn.classList.toggle('mode-admin', userRole==='admin');
  btn.classList.toggle('mode-note', userRole==='note');
  document.getElementById('addExtraRoomBtn').style.display = isAdmin ? '' : 'none';
  document.getElementById('excelSampleBtn').style.display = isAdmin ? '' : 'none';
  document.getElementById('excelUploadBtn').style.display = isAdmin ? '' : 'none';
  const delMatBtn = document.getElementById('deleteAllMaterialsBtn');
  if(delMatBtn) delMatBtn.style.display = isAdmin ? '' : 'none';
}

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1800);
}

function renderHeaderStats(){
  // 가동중 N/M실: 관리자가 사용 중지한 방은 분자 · 분모에서 모두 뺀다 (쓸 수 없는 방이 '놀고 있는 방'으로 보이지 않게)
  const allFixedRoomNames = [...new Set([...ROW1, ...ROW2])].filter(name=> !isMutedRoom(name) && roomIsActive(roomByName(name)));
  const activeRooms = allFixedRoomNames.filter(name=>{
    const room = rooms.find(r=>r.name===name);
    return room && materials.some(m=>m.room_id===room.id && (m.name||m.line_no) && !m.harvest_confirmed_at);
  });
  const cropSet = new Set();
  let totalQty = 0;
  materials.forEach(m=>{
    if(!m.name || m.harvest_confirmed_at) return;
    cropSet.add(m.name);
    totalQty += Number(m.quantity)||0;
  });
  // 집단 수: 세대단축만 센다 (인공교배 · 고온검정 · 기타 실험은 집단이 아니라 작물 카드에서 각자의 단위로 보여 준다).
  //   계통번호가 같으면 베드가 달라도 한 집단. 계통번호가 없으면 같은 작물 · 같은 목표끼리 한 집단 (작물 카드와 같은 기준)
  const groupSet = new Set();
  materials.forEach(m=>{
    if(!(m.name || m.line_no) || m.harvest_confirmed_at || batchPurposeOf(m) !== '세대단축') return;
    const line = String(m.line_no ?? '').trim(), purpose = String(m.purpose ?? '').trim() || '목표 미설정';
    groupSet.add(line ? `L|${line}` : `P|${m.name || ''}|${purpose}`);
  });
  const elGroups = document.getElementById('hv2StatGroups');
  if(elGroups) elGroups.textContent = `${groupSet.size}개`;
  const elRooms = document.getElementById('hv2StatRooms');
  const elCrops = document.getElementById('hv2StatCrops');
  const elQty = document.getElementById('hv2StatQty');
  if(elRooms) elRooms.textContent = `${activeRooms.length}/${allFixedRoomNames.length}실`;
  if(elCrops) elCrops.textContent = `${cropSet.size}종`;
  if(elQty) elQty.textContent = `${totalQty.toLocaleString()}개체`;
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

const CROP_OPTIONS = ['콩','녹두','참깨','들깨'];

const SURVEY_PURPOSE_OPTIONS = ['세대단축','인공교배','고온검정','기타'];

const SURVEY_CROP_OPTIONS = [...CROP_OPTIONS];

const SURVEY_GEN_STAGES = ['F1','F2','F3','F4','F5','F6'];

const SURVEY_EXP_FACTORS = { '온도':{ unit:'℃', ph:'예: 30℃' }, '일장':{ unit:'시간', ph:'예: 10시간' } };   // 기타(실험) 목적에서 고르는 처리 요인 → 고르면 나오는 조건 칸 (unit은 칸에 자동으로 붙고, ph는 안내 문구)

const SURVEY_DEFAULT_DAYS = { '콩':90, '참깨':70, '들깨':80 };   // 수요조사 생육일수 기본값 (여기 있는 작물은 계통작성의 작물별 기본 기간보다 우선한다)

const CROP_COLORS = { '콩':'#5B7FA6', '녹두':'#8B6BA6', '참깨':'#C1854A', '들깨':'#5A9182' };

const CROP_PALETTE = ['#1F8A76','#C97A2B','#3B6FB6','#8A4FB0','#B5453B','#4C8C3C','#A6763B','#5D6B7A','#5A4FCF','#C0587A'];

function cropColor(name){
  if(!name) return '#9AA6A0';
  if(CROP_COLORS[name]) return CROP_COLORS[name];
  let h = 0;
  for(let i=0;i<name.length;i++){ h = (h*31 + name.charCodeAt(i)) % 997; }
  return CROP_PALETTE[h % CROP_PALETTE.length];
}

// 분기별 계획의 색: 고온검정은 작물 색에 붉은 기를 살짝 섞는다. 빨강을 20% 섞어서 색조(hue)만 가져오고 채도 · 밝기는 작물 색 그대로 둔다
//   (그냥 섞으면 파랑 · 초록 계열이 탁한 회색이 된다). 예: 콩 파랑 → 남보라, 참깨 주황 → 붉은 주황, 들깨 → 노란 기 도는 초록
function heatTint(hex){
  const RED = [214, 58, 47], A = 0.2;
  const rgb = [1, 3, 5].map(i=> parseInt(hex.slice(i, i + 2), 16));
  const hsl = ([r, g, b])=>{
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
    let h = 0;
    if(d){ h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; }
    return [h, d ? d / (1 - Math.abs(2 * l - 1)) : 0, l];
  };
  const [, s, l] = hsl(rgb), h =hsl(rgb.map((v, i)=> v * (1 - A) + RED[i] * A))[0];
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6];
  return '#' + [r, g, b].map(v=> Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

// 계획 · 요청의 사용 목적(세대단축 · 인공교배 · 고온검정 · 기타)에 맞는 막대 · 점 색
function planColorOf(cropName, kind){ const c = cropColor(cropName); return kind === '고온검정' ? heatTint(c) : c; }

function addDays(dateStr, days){
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + Number(days));
  // toISOString()은 UTC 기준이라 한국(UTC+9)에서 하루 일찍 나오므로, 로컬 날짜로 직접 만든다
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function growthProgress(sowing, harvest){
  if(!sowing || !harvest) return null;
  const start = kstMidnightMs(sowing);
  const end = kstMidnightMs(harvest);
  const now = Date.now();
  if(end <= start) return null;
  return Math.max(0, Math.min(100, (now - start) / (end - start) * 100));
}

function daysLeftLabel(harvest){
  if(!harvest) return '';
  const diff = daysBetween(todayKST(), harvest);
  if(diff > 0) return `수확까지 ${diff}일`;
  if(diff === 0) return '수확 예정일';
  return `수확일 ${Math.abs(diff)}일 지남`;
}

// 분기별 계획 막대가 한국 시간 기준으로 지난 만큼 차오르게 한다 (0% = 시작 전, 100% = 끝남).
// 시각은 절대 시간(Date.now())과 한국 시간 자정(kstMidnightMs)끼리 비교하므로 접속한 컴퓨터의 시간대와 무관하다.
function planFillPct(nowMs, startMs, endMs){
  if(!(endMs > startMs)) return nowMs >= endMs ? 100 : 0;
  return Math.round(Math.max(0, Math.min(100, (nowMs - startMs) / (endMs - startMs) * 100)) * 100) / 100;
}

function tickPlanProgress(){
  const now = Date.now();
  document.querySelectorAll('.plan-bar[data-vs]').forEach(el=>{
    el.style.setProperty('--plan-p', planFillPct(now, Number(el.dataset.vs), Number(el.dataset.ve)) + '%');
  });
}

function captureScrollPositions(){
  return Array.from(document.querySelectorAll('.struct-cols.scrollable')).map(el=> el.scrollLeft);
}

function restoreScrollPositions(positions){
  const els = document.querySelectorAll('.struct-cols.scrollable');
  els.forEach((el, i)=>{ if(positions[i]!=null) el.scrollLeft = positions[i]; });
}

async function loadAll(){
  const { data: roomData, error: e1 } = await sb.from('rooms').select('*').order('updated_at', {ascending:false});
  const { data: matData, error: e2 } = await sb.from('materials').select('*').order('updated_at', {ascending:false});
  const { data: profileData, error: e3 } = await sb.from('crop_profiles').select('*');
  const { data: histData, error: e5 } = await sb.from('generation_history').select('*');
  const { data: taskData, error: e8 } = await sb.from('daily_tasks').select('*').order('created_at', {ascending:false});
  const { data: surveyData, error: e9 } = await sb.from('demand_survey').select('*').order('created_at', {ascending:false});
  if(e9) console.error('demand_survey load error', e9);
  const { data: planData, error: e10 } = await sb.from('bed_plans').select('*').order('planned_start', {ascending:true});
  if(e10) console.error('bed_plans load error', e10);
  const { data: periodData, error: e11 } = await sb.from('plan_period').select('*').eq('id', 'default').maybeSingle();
  if(e11) console.error('plan_period load error', e11);
  if(e1 || e2){
    console.error(e1, e2, e3, e5, e8);
    if(!window._loadErrorShown){
      window._loadErrorShown = true;
      alert('데이터를 불러오지 못했어요!\n\n' + (e1?.message || e2?.message || JSON.stringify(e1||e2)));
    }
    return;
  }
  rooms = roomData || [];
  materials = matData || [];
  generationHistory = histData || [];
  dailyTasks = taskData || [];
  demandSurveys = (surveyData || []).filter(s=> !s.copy_of);
  demandCopies = (surveyData || []).filter(s=> s.copy_of);
  bedPlans = planData || [];
  planPeriod = periodData || null;
  cropProfiles = {};
  (profileData||[]).forEach(p=>{ cropProfiles[p.name] = p.typical_days; });
  renderHeaderStats();
  renderFacility();
  renderDetail();
  if(workActiveRoomId || viewMode==='work') renderDetail('work');
  if(modalRoomId) renderDetail('modal');
  if(viewMode==='tasks') renderTasksView();
  if(viewMode==='survey') renderSurveyView();
  if(viewMode==='plan') renderPlanView();
}
