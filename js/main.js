/* main.js — 화면 전환(메뉴 버튼)과 앱 시작: 이벤트 등록, 실시간 동기화, 처음 데이터 불러오기. 반드시 맨 마지막에 불러와야 해요. */

setInterval(tickPlanProgress, 60000);   // 화면을 켜둔 채로도 1분마다 갱신

document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) tickPlanProgress(); });   // 탭을 다시 열면 바로 갱신

function enterWorkView(){
  switchView('work');   // 계통작성은 비밀번호 없이 누구나 들어와서 등록 · 수정할 수 있다
}

function switchView(mode){
  viewMode = mode;
  document.getElementById('spaceViewWrap').style.display = mode==='space' ? '' : 'none';
  document.getElementById('workViewWrap').style.display = mode==='work' ? '' : 'none';
  document.getElementById('tasksViewWrap').style.display = mode==='tasks' ? '' : 'none';
  document.getElementById('surveyViewWrap').style.display = mode==='survey' ? '' : 'none';
  document.getElementById('planViewWrap').style.display = mode==='plan' ? '' : 'none';
  document.getElementById('facilitySectionHead').style.display = mode==='space' ? '' : 'none';
  const navSpace = document.getElementById('navBtnSpace'), navWork = document.getElementById('navBtnWork'), navTasks = document.getElementById('navBtnTasks'), navSurvey = document.getElementById('navBtnSurvey'), navPlan = document.getElementById('navBtnPlan');
  if(navSpace) navSpace.classList.toggle('active', mode==='space');
  if(navWork) navWork.classList.toggle('active', mode==='work');
  if(navTasks) navTasks.classList.toggle('active', mode==='tasks');
  if(navSurvey) navSurvey.classList.toggle('active', mode==='survey');
  if(navPlan) navPlan.classList.toggle('active', mode==='plan');
  if(mode==='work'){
    renderDetail('work');
  }
  if(mode==='tasks'){
    renderTasksView();
  }
  if(mode==='survey'){
    renderSurveyView();
  }
  if(mode==='plan'){
    renderPlanView();
  }
}

window.addEventListener('beforeunload', (e)=>{ if(planDraft.size){ e.preventDefault(); e.returnValue = ''; } });   // 저장 안 한 조율이 있으면 페이지를 떠나기 전에 한 번 물어본다

window.addEventListener('resize', updatePlanStickyTop);

sb.channel('facility-changes')
  .on('postgres_changes', { event:'*', schema:'public', table:'rooms' }, loadAll)
  .on('postgres_changes', { event:'*', schema:'public', table:'materials' }, loadAll)
  .subscribe();

document.addEventListener('keydown', (e)=>{
  if(e.key !== 'Escape') return;
  const roomModal = document.getElementById('roomModalOverlay');
  const historyModal = document.getElementById('historyModalOverlay');
  const roomDetailModal = document.getElementById('roomDetailModalOverlay');
  const addTaskModal = document.getElementById('addTaskModalOverlay');
  const editTaskModal = document.getElementById('editTaskModalOverlay');
  const lineHistoryModal = document.getElementById('lineHistoryModalOverlay');
  const planModal = document.getElementById('planModalOverlay');
  const planBarModal = document.getElementById('planBarModalOverlay');
  const guideMenu = document.getElementById('guideMenuOverlay');
  if(guideMenu && guideMenu.classList.contains('open')) closeGuideMenu();
  else if(planBarModal.classList.contains('open')) closePlanBarPopup();
  else if(batchCompose && !batchCompose.auto) closeBatchLocModal();   // 여러 자리를 골라 저절로 열린 칸은 Escape로 닫지 않는다 (선택 해제로 닫는다)
  else if(roomModal.classList.contains('open')) closeRoomModal();
  else if(historyModal.classList.contains('open')) closeHistoryModal();
  else if(roomDetailModal.classList.contains('open')) closeRoomDetailModal();
  else if(addTaskModal.classList.contains('open')) closeAddTaskModal();
  else if(editTaskModal.classList.contains('open')) closeEditTaskModal();
  else if(lineHistoryModal.classList.contains('open')) closeLineHistoryModal();
  else if(planModal.classList.contains('open')) closePlanModal();
});

window.addEventListener('resize', ()=>{ if(tourActive){ measureTourScale(); repositionTour(); } });

window.addEventListener('scroll', ()=>{ if(tourActive) repositionTour(); }, true);

document.addEventListener('keydown', (e)=>{
  if(!tourActive) return;
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
  if(e.key === 'ArrowRight' && !typing){ e.preventDefault(); moveTour(1); }
  else if(e.key === 'ArrowLeft' && !typing){ e.preventDefault(); moveTour(-1); }
  else if(e.key === 'Escape'){ e.stopImmediatePropagation(); endTour(); }
}, true);

(function(){
  const gb = document.getElementById('guideBtn');
  if(gb && GUIDE_ENABLED) gb.style.display = '';   // 스위치가 켜져 있을 때만 '? 사용법' 버튼을 보인다
  if(!GUIDE_ENABLED || !TOUR_AUTO_START) return;
  let seen = null;
  try{ seen = localStorage.getItem(TOUR_KEY); }catch(e){ seen = '1'; }
  if(!seen) setTimeout(()=>{ if(!tourActive) startTour(); }, TOUR_AUTO_DELAY);
})();

updateAdminUI();

loadAll();
