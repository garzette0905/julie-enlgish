-- ============================================================
-- 쥴리 잉글리쉬 홈페이지 초기 스키마
-- ============================================================

-- ---------- 회원 (관리자 + 학원생) ----------
-- login_id 는 사용자가 정하는 아이디. 이메일 형태여도 되고(관리자가 그렇다) 영문 아이디여도 된다.
-- status: pending(승인대기) / active(사용중) / inactive(정지·퇴원)
-- role  : admin(원장) / student(학원생·학부모)
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'student',
  status        TEXT    NOT NULL DEFAULT 'pending',
  school        TEXT,                 -- 학교
  grade         TEXT,                 -- 학년
  class_no      TEXT,                 -- 반
  phone         TEXT,                 -- 전화번호
  email         TEXT,                 -- 이메일
  note          TEXT,                 -- 특기사항 (관리자만 보고 쓴다)
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_name   ON users(name);

-- ---------- 로그인 세션 ----------
CREATE TABLE sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- ---------- 클래스 ----------
-- days 는 MON,WED,FRI / TUE,THU 처럼 쉼표로 이어 붙인 요일 코드.
-- 월·수·금은 60분, 화·목은 90분이 기본이지만 관리자가 자유롭게 바꿀 수 있다.
CREATE TABLE classes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  days         TEXT    NOT NULL,
  start_time   TEXT    NOT NULL,            -- HH:MM
  duration_min INTEGER NOT NULL DEFAULT 60,
  level        TEXT,                        -- 파닉스 / 초등 / 선행중등 ...
  teacher      TEXT    DEFAULT 'Julie',
  room         TEXT,
  color        TEXT    DEFAULT '#0C3190',   -- 시간표에서 쓰는 색
  memo         TEXT,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------- 클래스 - 학원생 연결 ----------
CREATE TABLE enrollments (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id  INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(class_id, user_id)
);
CREATE INDEX idx_enroll_user  ON enrollments(user_id);
CREATE INDEX idx_enroll_class ON enrollments(class_id);

-- ---------- 상담일지 ----------
-- 학원생 한 명당 여러 건. 원장님만 읽고 쓴다(학생 화면에는 나오지 않는다).
CREATE TABLE counsel_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  log_date   TEXT    NOT NULL,
  title      TEXT,
  content    TEXT    NOT NULL,
  author     TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_counsel_user ON counsel_logs(user_id, log_date DESC);

-- ---------- 시간표의 개별 일정 ----------
-- 매주 반복되는 클래스와 별개로, 특정 날짜에만 있는 일(휴강·보강·시험·행사)을 적는다.
-- kind: holiday(휴강) / makeup(보강) / exam(시험) / event(행사) / notice(안내)
CREATE TABLE schedule_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_date TEXT    NOT NULL,               -- YYYY-MM-DD
  class_id   INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  kind       TEXT    NOT NULL DEFAULT 'notice',
  title      TEXT    NOT NULL,
  start_time TEXT,
  end_time   TEXT,
  memo       TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_events_date ON schedule_events(event_date);

-- ---------- 학원 안내 사진·동영상 ----------
-- kind: photo(R2 업로드) / video(R2 업로드) / youtube(유튜브 링크)
-- r2_key 가 있으면 /api/media/file/<key> 로 내려받고, 없으면 url 을 그대로 쓴다.
CREATE TABLE media (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT    NOT NULL DEFAULT 'photo',
  title       TEXT,
  description TEXT,
  r2_key      TEXT,
  url         TEXT,
  mime        TEXT,
  size        INTEGER,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_media_sort ON media(sort_order, id DESC);

-- ---------- 졸업생 소개 ----------
CREATE TABLE alumni (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,               -- 김O수
  year       TEXT,                           -- 26학년도
  dest       TEXT,                           -- 진학처 (고려대 사범대)
  years      TEXT,                           -- 수강 기간 (6년 수업)
  note       TEXT,
  photo_key  TEXT,                           -- R2 키 (선택)
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------- 사이트 설정 (관리자가 고치는 문구들) ----------
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 초기 데이터
-- ============================================================

-- 관리자 계정: garzetta@hanmail.net / 1234
-- (로그인 후 내 정보 화면에서 비밀번호를 바꿀 수 있다)
INSERT INTO users (login_id, password_hash, name, role, status, email)
VALUES (
  'garzetta@hanmail.net',
  'pbkdf2$100000$fhhLtHeFFUhuIE0snpZkYQ==$ucGzfF8wg1D1E5ZzsrT1So4xiLzckvDV7WSmjoiXChA=',
  '박영임 (Julie)',
  'admin',
  'active',
  'garzetta@hanmail.net'
);

-- 예시 클래스 — 월·수·금 60분 / 화·목 90분. 관리자 화면에서 자유롭게 고치면 된다.
INSERT INTO classes (name, days, start_time, duration_min, level, color) VALUES
  ('파닉스 A',    'MON,WED,FRI', '14:00', 60, '파닉스',   '#E60013'),
  ('파닉스 B',    'MON,WED,FRI', '15:10', 60, '파닉스',   '#E60013'),
  ('초등 심화 A', 'MON,WED,FRI', '16:20', 60, '초등',     '#0C3190'),
  ('초등 심화 B', 'MON,WED,FRI', '17:30', 60, '초등',     '#0C3190'),
  ('선행 중등 A', 'TUE,THU',     '16:00', 90, '선행중등', '#7A1FA2'),
  ('선행 중등 B', 'TUE,THU',     '17:40', 90, '선행중등', '#7A1FA2'),
  ('중등 내신',   'TUE,THU',     '19:20', 90, '선행중등', '#1F7A4B');

-- 졸업생 — 전단지 명단 기준
INSERT INTO alumni (name, year, dest, years, sort_order) VALUES
  ('김 O 수', '26학년도', '고려대학교 사범대학',       NULL,       1),
  ('김 도 O', NULL,       '연세대 경영 · 고려대 국제', '6년 수업', 2),
  ('김 O 성', NULL,       '고려대 경영',               '5년 수업', 3),
  ('임 O 슬', NULL,       '뉴질랜드 오클랜드 대학교',  '6년 수업', 4),
  ('김 다 O', NULL,       '동탄국제고',                '6년 수업', 5),
  ('유 O 은', NULL,       '이화여대',                  '3년 수업', 6),
  ('김 O 연', NULL,       '북일고',                    '9년 수업', 7),
  ('이 O 웅', NULL,       '계원예고',                  '7년 수업', 8);

-- 홈 화면 상단 배너 등, 원장님이 자주 바꾸는 문구
INSERT INTO settings (key, value) VALUES
  ('notice_banner', '개강 3월 첫 주 · 신규 파닉스반 모집 중 (5명 선착순)'),
  ('phone',         '031-8005-9439'),
  ('mobile',        '010-3323-9439'),
  ('email',         'garzetta@hanmail.net'),
  ('address',       '초당마을 삼부르네상스아파트 상가동 204호'),
  ('kakao',         'Julie English');
