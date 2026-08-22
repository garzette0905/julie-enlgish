-- 카카오 채널 주소를 설정에 추가한다 (채널 이름과 별개로 링크를 따로 둔다).
INSERT INTO settings (key, value) VALUES ('kakao_url', 'https://pf.kakao.com/_xgxgvaj')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now');

-- 홈 배너는 바뀐 지 14일 동안 NEW 로 강조한다. 그 기준이 되는 시각을
-- 지금으로 맞춰 둔다(이번 개편 시점부터 세도록).
UPDATE settings SET updated_at = datetime('now') WHERE key = 'notice_banner';
