-- ---------- 원비 관리 ----------
-- 원생 한 명의 한 달치 원비. 매월 납부하므로 (학생, 해당월) 한 쌍이 한 줄이다.
-- month 는 'YYYY-MM' 형식으로 둔다.
CREATE TABLE tuition (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month      TEXT    NOT NULL,
  amount     INTEGER NOT NULL DEFAULT 0,   -- 원 단위
  paid       INTEGER NOT NULL DEFAULT 0,   -- 납부 여부
  paid_at    TEXT,                          -- 납부로 표시한 시각
  memo       TEXT,                          -- 특기사항
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, month)
);
CREATE INDEX idx_tuition_month ON tuition(month);
CREATE INDEX idx_tuition_user  ON tuition(user_id, month DESC);
