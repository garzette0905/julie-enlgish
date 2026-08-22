// 비밀번호 해시 생성기 (마이그레이션에 넣을 관리자 초기 비밀번호를 만들 때 쓴다).
// Worker 쪽(src/index.js)의 hashPassword() 와 완전히 같은 방식이어야 한다.
//   형식: pbkdf2$<반복횟수>$<salt(base64)>$<해시(base64)>
// 사용법: node scripts/hash-password.mjs 1234
import { pbkdf2Sync, randomBytes } from "node:crypto";

const ITERATIONS = 100000;
const password = process.argv[2];
if (!password) {
  console.error("사용법: node scripts/hash-password.mjs <비밀번호>");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
console.log(`pbkdf2$${ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`);
