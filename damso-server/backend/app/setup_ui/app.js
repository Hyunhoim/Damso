const $ = id => document.getElementById(id);
const token = document.querySelector('meta[name="damso-setup"]').content;
const errors = {
  AUTH_FAILED: 'API 키 인증에 실패했어요. 해당 서비스에서 발급한 키인지 확인해주세요.',
  ACCESS_DENIED: 'API 키의 서비스 이용 권한을 확인해주세요.',
  RATE_LIMITED: 'API 호출 한도에 도달했어요. 잠시 후 다시 시도해주세요.',
  PROVIDER_TIMEOUT: '응답 시간이 길어 테스트를 중단했어요.',
  PROVIDER_UNAVAILABLE: 'API 서버에 연결하지 못했어요.',
  INVALID_PROVIDER_OUTPUT: '응답이 정해진 요약·꼬리질문 형식과 달라요.',
  INCOMPLETE_OUTPUT: '응답이 끝까지 생성되지 않았어요.',
  REQUEST_REJECTED: 'API 서버가 요청을 거절했어요. 이용 권한과 요청 설정을 확인해주세요.',
  RESPONSE_LIMIT: '응답이 안전한 수신 범위를 초과했어요.',
  NO_SPEECH: '음성에서 인식된 말이 없어요. 다른 녹음으로 다시 시도해주세요.',
  INVALID_AUDIO: '읽을 수 있는 음성 파일을 선택해주세요.',
  AUDIO_TOO_LONG: '녹음은 10분 이내로 선택해주세요.',
  AUDIO_DECODE_TIMEOUT: '음성 파일을 변환하는 데 시간이 오래 걸려 중단했어요.',
};
let cases = [], configured = false, speechConfigured = false, busy = false;

async function request(path, body) {
  const form = body instanceof FormData;
  const response = await fetch(`/dev/llm/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : form ? {'X-Damso-Setup':token} : {'Content-Type':'application/json', 'X-Damso-Setup':token},
    body: body === undefined ? undefined : form ? body : JSON.stringify(body), cache:'no-store',
  });
  const data = await response.json();
  if (!response.ok) {
    const detail = data.detail;
    throw new Error(typeof detail === 'object' ? (errors[detail.code] || '모델 호출을 완료하지 못했어요.') : detail || '요청을 완료하지 못했어요.');
  }
  return data;
}
function message(text, failed = false) { $('message').textContent=text; $('message').classList.toggle('error',failed); }
function setBusy(value) {
  busy=value;
  $('save-key').disabled=value; $('run-all').disabled=value || !configured;
  $('custom-run').disabled=value || !configured;
  $('save-speech-key').disabled=value;
  $('run-speech-test').disabled=value || !configured || !speechConfigured;
  $('save-key').textContent=value ? '확인 중…' : '등록하고 테스트 시작';
}
function renderCases() {
  $('case-list').replaceChildren();
  for (const item of cases) {
    const row=document.createElement('article');row.className='case';row.id=`case-${item.id}`;
    const heading=document.createElement('div');heading.className='case-head';
    const title=document.createElement('span');title.className='case-title';title.textContent=item.label;
    const state=document.createElement('span');state.className='case-state';state.textContent='대기';
    heading.append(title,state);row.append(heading);$('case-list').append(row);
  }
}
function output(container, item, result) {
  const body=document.createElement('div');body.className='case-body';
  for (const [label,text] of [['작성자',item.author_name || '이름 미등록'],['원문',item.original_text],['정리 상태',result.status],['이야기 제목',result.title || '제목 없음'],['요약 · 서재에 남길 초안',result.summary || '저장할 이야기 없음'],['꼬리질문',result.follow_up_question || '추가 질문 없음']]) {
    const block=document.createElement('div'),caption=document.createElement('div'),value=document.createElement('div');
    caption.className='output-label';caption.textContent=label;value.className='output-text';value.textContent=text;block.append(caption,value);body.append(block);
  }
  if(item.review){const note=document.createElement('p');note.className='case-review';note.textContent=`내용 검토: ${item.review}`;body.append(note);}
  container.append(body);
}
async function runCases() {
  renderCases();setBusy(true);
  let completed=0;
  try {
    for(const item of cases){
      const row=$(`case-${item.id}`),state=row.querySelector('.case-state');
      state.textContent='호출 중…';state.dataset.state='running';
      message(`${completed+1} / ${cases.length} · ${item.label.slice(5)} 확인 중`);
      try{
        const result=await request('test',{case_id:item.id});
        output(row,item,result.output);state.textContent='형식 확인 · 내용 검토 필요';state.dataset.state='done';completed++;
      }catch(error){state.textContent='호출 실패';state.dataset.state='failed';message(error.message,true);return;}
    }
    message(`${completed}건의 입출력을 확인했어요. 원문과 요약의 의미가 같은지도 살펴봐주세요.`);
  }finally{setBusy(false);}
}
$('key-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;setBusy(true);
  try{
    await request('key',{api_key:$('api-key').value});configured=true;
    $('key-status').textContent='키 등록됨';$('api-key').value='';$('api-key').type='password';$('show-key').textContent='보기';$('show-key').setAttribute('aria-pressed','false');
    message('키를 저장했어요. HCX-007 입출력을 순서대로 확인합니다.');
    await runCases();
  }catch(error){message(error.message,true);setBusy(false);}
});
$('show-key').addEventListener('click',()=>{const show=$('api-key').type==='password';$('api-key').type=show?'text':'password';$('show-key').textContent=show?'숨기기':'보기';$('show-key').setAttribute('aria-pressed',String(show));});
$('speech-key-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;setBusy(true);
  const status=$('speech-message');status.classList.remove('error');
  try{
    await request('speech/key',{secret_key:$('speech-key').value,invoke_url:$('invoke-url').value});
    speechConfigured=true;$('speech-key').value='';$('invoke-url').value='';$('speech-status').textContent='STT 설정됨';
    status.textContent='설정을 저장했어요. 음성 파일로 연결을 확인할 수 있어요. 아직 API를 호출하지 않았습니다.';
  }catch(error){status.textContent=error.message;status.classList.add('error');}finally{setBusy(false);}
});
$('speech-test-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  const file=$('speech-audio').files[0],status=$('speech-message');
  status.classList.remove('error');
  if(!file || file.size>25*1024*1024){status.textContent='25 MiB 이내의 음성 파일을 선택해주세요.';status.classList.add('error');return;}
  setBusy(true);$('speech-output').replaceChildren();status.textContent='음성을 전사한 뒤 이야기를 정리하고 있어요…';
  try{
    const form=new FormData($('speech-test-form'));
    const result=await request('speech/test',form);
    output($('speech-output'),{original_text:result.transcript},result.output);
    status.textContent='전사문과 요약·꼬리질문을 확인했어요. 서재에는 저장하지 않았습니다.';
  }catch(error){status.textContent=error.message;status.classList.add('error');}finally{setBusy(false);}
});
$('run-all').addEventListener('click',()=>{if(!busy)runCases();});
$('custom-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;setBusy(true);$('custom-output').replaceChildren();
  try{
    const item={summary_style:$('summary-style').value,author_name:$('author-name').value,question:$('question').value,original_text:$('source').value};
    const result=await request('test',item);output($('custom-output'),item,result.output);message('입출력을 확인했어요. 테스트 내용은 서재에 저장하지 않았습니다.');
  }catch(error){message(error.message,true);}finally{setBusy(false);}
});
(async()=>{
  try{
    const status=await request('status');cases=status.cases;configured=status.configured;speechConfigured=status.stt==='configured';renderCases();setBusy(false);
    $('speech-status').textContent=speechConfigured?'STT 설정됨':'STT 설정 필요';
    $('run-all').textContent=`${cases.length}건 다시 테스트`;
    $('key-status').textContent=configured?'키 등록됨':'키 미등록';
    if(configured)message('등록된 키가 있어요. 다시 테스트하거나 새 키로 교체할 수 있습니다.');
    const response=await fetch('/dev/llm/prompt',{cache:'no-store'});$('prompt-text').textContent=await response.text();
  }catch(error){message(error.message,true);}
})();
