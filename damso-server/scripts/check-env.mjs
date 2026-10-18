import { readLocalEnv, registrationStatus } from '../src/env.mjs';

try {
  const status = registrationStatus(readLocalEnv());
  for (const item of status) console.log(`${item.name}: ${item.ok ? '입력 확인' : '입력 또는 설정 확인 필요'}`);
  console.log('키 값은 출력하지 않습니다. 이 검사는 로컬 입력만 확인하며 API 인증·잔액·모델 권한은 확인하지 않습니다.');
  process.exitCode = status.every(item => item.ok) ? 0 : 1;
} catch {
  console.error('damso-server/.env.local 파일을 읽지 못했습니다. .env.example을 복사해 작성해주세요.');
  process.exitCode = 1;
}
