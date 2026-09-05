-- ---------- 방문 통계 ----------
-- 홈페이지에 누가 얼마나 들어오는지, 어느 메뉴를 주로 보는지 세어 둔다.
--
-- 동의를 받아야 하는 정보(쿠키로 사람을 따라다니기, IP 원본 저장, 이름·연락처)는
-- 하나도 남기지 않는다. 남기는 것은 아래가 전부다.
--   · 언제(한국 날짜·시각)   · 어느 화면
--   · 휴대폰인지 PC인지, 어떤 브라우저인지 (브라우저가 스스로 밝히는 값)
--   · 어디를 거쳐 들어왔는지 (네이버·구글 같은 "출처 주소"의 도메인만)
--   · 나라·도시 (Cloudflare 가 알려주는 대략의 위치, 번지수가 아니라 도시 단위)
--
-- visitor 는 "같은 사람이 오늘 몇 번 들어왔나"만 세기 위한 값이다.
-- 그날치 무작위 소금(visit_salts)을 섞어 해시로 만들기 때문에
-- 되돌려서 누구인지 알아낼 수 없고, 날이 바뀌면 값이 완전히 달라져서
-- 어제 온 사람과 오늘 온 사람을 이어 붙일 수도 없다.
CREATE TABLE visits (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,

  day        TEXT    NOT NULL,          -- 한국 날짜 'YYYY-MM-DD'
  hour       INTEGER NOT NULL,          -- 한국 시각 0~23
  path       TEXT    NOT NULL,          -- 화면 주소 ('/', '/reviews' …)

  visitor    TEXT    NOT NULL,          -- 그날 하루만 유효한 익명 구분값
  is_admin   INTEGER NOT NULL DEFAULT 0,-- 원장님 본인 접속 (셀 때 빼준다)
  is_member  INTEGER NOT NULL DEFAULT 0,-- 로그인한 회원 접속

  device     TEXT,                      -- mobile / tablet / desktop
  browser    TEXT,                      -- Chrome / Safari / 카카오톡 …
  os         TEXT,                      -- Android / iOS / Windows …
  referrer   TEXT,                      -- 거쳐 들어온 곳의 도메인 (없으면 NULL = 직접 방문)
  country    TEXT,                      -- 'KR'
  city       TEXT,                      -- 'Yongin'

  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 기간으로 자르고 → 화면별·사람별로 묶는 조회가 전부라 이 두 개면 충분하다.
CREATE INDEX idx_visits_day  ON visits(day, path);
CREATE INDEX idx_visits_who  ON visits(day, visitor);

-- 그날치 소금. 사흘이 지난 것은 지운다(지우고 나면 옛 해시는 영영 못 되돌린다).
CREATE TABLE visit_salts (
  day  TEXT PRIMARY KEY,
  salt TEXT NOT NULL
);
