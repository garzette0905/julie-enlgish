-- 검색엔진 소유확인 코드를 관리자 화면에서 직접 넣을 수 있게 자리를 만들어 둔다.
-- 네이버 서치어드바이저 / 구글 서치콘솔이 주는 코드 값만 넣으면
-- Worker 가 페이지 head 에 확인용 태그를 붙여 준다.
INSERT INTO settings (key, value) VALUES ('verify_naver', NULL)
  ON CONFLICT(key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('verify_google', NULL)
  ON CONFLICT(key) DO NOTHING;
