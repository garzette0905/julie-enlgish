-- ---------- 졸업생 · 학부모 후기 ----------
-- 원장님도 쓰고, 로그인하지 않은 방문자도 쓸 수 있는 게시판.
-- 익명으로 쓴 글은 본인이 정한 비밀번호로만 고치거나 지울 수 있다.
-- (원장님은 비밀번호 없이 모든 글을 고치고 지울 수 있다)
--
-- author_role : admin(원장) / guest(익명)
CREATE TABLE reviews (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  author_role   TEXT    NOT NULL DEFAULT 'guest',
  author_name   TEXT    NOT NULL,
  title         TEXT,
  body          TEXT    NOT NULL,

  -- 익명 글에만 채워진다. 관리자 글은 NULL.
  -- 회원 비밀번호와 똑같은 PBKDF2 방식으로 해시해서 넣는다.
  password_hash TEXT,

  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_reviews_date ON reviews(created_at DESC);

-- 후기에 붙는 사진. 한 글에 여러 장 붙을 수 있어 따로 표로 뺐다.
-- 실제 파일은 R2 에 들어가고 여기에는 키만 남는다.
CREATE TABLE review_photos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id  INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  r2_key     TEXT    NOT NULL,
  mime       TEXT,
  size       INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_review_photos ON review_photos(review_id, sort_order);

-- 시간표의 날짜별 일정(휴강·보강·시험) 기능을 걷어낸다.
-- 매주 반복되는 수업은 classes 표가 그대로 들고 있다.
DROP TABLE IF EXISTS schedule_events;
