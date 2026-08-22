-- ---------- 후기 순서를 원장님이 정한다 ----------
-- 지금까지 후기는 쓴 날짜순(최신 글이 위)으로만 보였다. 홈 화면은 이 목록에서
-- 앞쪽 6개만 가져다 쓰기 때문에, 어떤 후기를 앞에 둘지는 원장님이 정할 수 있어야 한다.
--
-- 기본값 0 이라 지금 있는 글은 전부 값이 같고, 값이 같으면 날짜순으로 밀리므로
-- 마이그레이션만 돌린 직후의 순서는 예전과 똑같다.
-- 한 번 끌어서 옮기면 그때 0, 1, 2 … 로 다시 매겨진다.
-- 새로 들어오는 글은 (지금 가장 작은 값 - 1) 을 받아서 맨 위로 온다.
ALTER TABLE reviews ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_reviews_order ON reviews(sort_order, created_at DESC);
