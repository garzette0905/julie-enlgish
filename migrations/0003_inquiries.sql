-- ---------- 상담신청 · 문의 ----------
-- 홈페이지 방문자가 남긴 상담신청/문의를 그대로 쌓아 둔다.
-- 접수되면 원장님 휴대폰으로 알림이 곧바로 가고, 내용은 여기에 남아
-- 관리자 화면의 "상담 요청"에서 다시 볼 수 있다.
--
-- kind   : consult(상담신청) / question(문의)
-- status : new(신규) / doing(연락중) / done(완료)
CREATE TABLE inquiries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT    NOT NULL DEFAULT 'consult',
  status        TEXT    NOT NULL DEFAULT 'new',

  student_name  TEXT    NOT NULL,          -- 학생 이름 (필수)
  school        TEXT,                      -- 학교      (상담신청)
  grade         TEXT,                      -- 학년      (상담신청)
  english_level TEXT,                      -- 영어 학습 수준 (상담신청)
  student_phone TEXT,                      -- 학생 연락처   (문의)
  parent_phone  TEXT    NOT NULL,          -- 부모님 연락처 (필수)
  message       TEXT,                      -- 기타 의견 / 문의 내용

  -- 접수 당시의 흔적. 장난 신청이 들어왔을 때 구분하는 용도로만 쓴다.
  user_agent    TEXT,
  notified      INTEGER NOT NULL DEFAULT 0,  -- 알림 전송 성공 여부
  admin_memo    TEXT,                        -- 원장님이 남기는 처리 메모
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_inquiries_new ON inquiries(status, created_at DESC);
CREATE INDEX idx_inquiries_date ON inquiries(created_at DESC);

-- 카카오 채널 자리를 상담신청이 대신한다. 남겨 두면 홈 연락처에 계속 나오므로 지운다.
DELETE FROM settings WHERE key IN ('kakao', 'kakao_url');
