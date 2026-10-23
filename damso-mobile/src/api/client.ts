type Tokens = { access_token: string; refresh_token: string; expires_in: number };
type Storage = { read: () => Promise<string | null>; write: (token: string | null) => Promise<void> };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

const messages: Record<string, string> = {
  'Incorrect email or password': '이메일과 비밀번호를 확인해주세요.',
  'Incorrect password': '현재 비밀번호를 확인해주세요.',
  'The user with this email already exists in the system': '이미 가입한 이메일이에요. 로그인해주세요.',
  'Connect your family first': '먼저 가족을 연결해주세요.',
  'Family connection has ended': '가족 연결이 종료됐어요. 연결 상태를 확인해주세요.',
  'Code is invalid, expired or already used': '사용할 수 없는 코드예요. 가족에게 새 코드를 받아주세요.',
  'A family must contain one parent and one child': '부모 한 분과 자녀 한 분을 연결할 수 있어요. 역할과 코드를 확인해주세요.',
  'Leave the current connection before joining another family': '기존 연결 또는 대기 중인 연결을 해제한 뒤 입력해주세요.',
  'Family is already connected': '이미 가족과 연결돼 있어요.',
  'Daily question limit reached': '해당 날짜의 질문이 가득 찼어요. 하루 최대 3개까지 받을 수 있어요.',
  'A question with an answer cannot be canceled': '이미 답변한 질문은 취소할 수 없어요.',
  'Disconnect family before changing role': '가족 연결을 해제한 뒤 역할을 바꿀 수 있어요.',
};

export function createApiClient(base: string, storage: Storage, expired: () => void, send: typeof fetch = fetch) {
  let tokens: Tokens | null = null;
  let expiresAt = 0;
  let generation = 0;
  let refreshTask: Promise<void> | null = null;
  let writeTask = Promise.resolve();
  const changed = () => new Error('계정 연결이 변경됐어요. 다시 확인해주세요.');
  function persist(value: string | null, version: number) {
    writeTask = writeTask.catch(() => {}).then(() => { if (version === generation) return storage.write(value); });
    return writeTask;
  }
  async function clear() {
    generation += 1; tokens = null; expiresAt = 0; refreshTask = null; expired();
    await persist(null, generation);
  }
  async function checked(response: Response, path: string) {
    if (response.ok) return response;
    const result = await response.json().catch(() => ({}));
    const detail = typeof result.detail === 'string' ? result.detail : '';
    const message = response.status === 401 ? '로그인이 만료됐어요. 다시 로그인해주세요.'
      : response.status === 429 ? '요청이 많아요. 잠시 후 다시 시도해주세요.'
      : path.endsWith('/follow-up') && response.status === 409 ? '내일의 추가 질문이 이미 예약돼 있거나 질문 수가 가득 찼어요.'
      : response.status === 413 ? '파일이 너무 커요. 사진은 10MB, 음성은 25MB 이내로 선택해주세요.'
      : response.status === 422 ? '입력 형식이나 파일을 확인해주세요.'
      : messages[detail] || (response.status === 409 ? '이미 처리됐거나 현재 상태에서 진행할 수 없어요. 새로고침 후 확인해주세요.'
      : response.status === 404 ? '자료를 찾을 수 없어요. 공유 또는 연결 상태를 확인해주세요.'
      : '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.');
    throw new ApiError(response.status, message);
  }
  async function publicRequest<T>(path: string, body: unknown, form = false): Promise<T> {
    const response = await send(base + path, { method: 'POST', headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' }, body: form ? String(body) : JSON.stringify(body), signal: AbortSignal.timeout(25000) });
    return (await checked(response, path)).json();
  }
  async function accept(next: Tokens, version: number) {
    if (version !== generation) throw changed();
    if (typeof next.access_token !== 'string' || !next.access_token || typeof next.refresh_token !== 'string' || !next.refresh_token || !Number.isFinite(next.expires_in) || next.expires_in < 0) throw new Error('로그인 응답을 확인하지 못했어요.');
    tokens = next; expiresAt = Date.now() + next.expires_in * 1000;
    try { await persist(next.refresh_token, version); }
    catch { await clear(); throw new Error('로그인 정보를 안전하게 저장하지 못했어요. 다시 로그인해주세요.'); }
    if (version !== generation) throw changed();
  }
  async function renew() {
    if (refreshTask) return refreshTask;
    const version = generation; const refresh = tokens?.refresh_token;
    if (!refresh) throw new ApiError(401, '먼저 로그인해주세요.');
    const task = (async () => {
      try { await accept(await publicRequest<Tokens>('/login/refresh', { refresh_token: refresh }), version); }
      catch (error) { if (error instanceof ApiError && error.status === 401 && version === generation) await clear(); throw error; }
    })();
    refreshTask = task;
    try { await task; } finally { if (refreshTask === task) refreshTask = null; }
  }
  async function headers() {
    if (tokens && Date.now() >= expiresAt - 30000) await renew();
    if (!tokens) throw new ApiError(401, '먼저 로그인해주세요.');
    return { Authorization: `Bearer ${tokens.access_token}` };
  }
  async function request(path: string, init: RequestInit = {}) {
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('잘못된 API 경로예요.');
    const version = generation;
    const auth = await headers(); const access = tokens?.access_token;
    if (version !== generation) throw changed();
    const run = (authorization: Record<string, string>) => send(base + path, { ...init, headers: { ...init.headers, ...authorization }, signal: AbortSignal.timeout(25000) });
    let response = await run(auth);
    if (version !== generation) throw changed();
    if (response.status === 401) {
      if (access === tokens?.access_token) await renew();
      if (version !== generation) throw changed();
      const nextAuth = await headers();
      if (version !== generation) throw changed();
      response = await run(nextAuth);
      if (version !== generation) throw changed();
      if (response.status === 401) await clear();
    }
    return checked(response, path);
  }
  async function api<T>(path: string, body?: unknown, method?: string): Promise<T> {
    const version = generation;
    const form = body instanceof FormData;
    const response = await request(path, { method: method || (body === undefined ? 'GET' : 'POST'), headers: !form && body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body === undefined ? undefined : form ? body : JSON.stringify(body) });
    const result = response.status === 204 ? undefined : await response.json();
    if (version !== generation) throw changed();
    return result as T;
  }
  async function login(email: string, password: string) {
    if (tokens) await logout();
    const version = ++generation;
    const next = await publicRequest<Tokens>('/login/access-token', new URLSearchParams({ username: email, password }).toString(), true);
    await accept(next, version);
  }
  async function restore() {
    const version = generation; const refresh = await storage.read();
    if (version !== generation || !refresh) return false;
    tokens = { access_token: '', refresh_token: refresh, expires_in: 0 };
    await renew(); return true;
  }
  async function logout() {
    // Revoke before removing the local refresh token; offline failures stay visible.
    if (tokens) await api('/login/logout', {});
    await clear();
  }
  return { api, request, headers, login, restore, logout, clear, publicRequest, version: () => generation };
}
