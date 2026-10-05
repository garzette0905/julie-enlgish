-- 상담신청의 선택 항목: 학원을 알게 된 경로와 기타 직접 입력.
ALTER TABLE inquiries ADD COLUMN referral_source TEXT NOT NULL DEFAULT '';
ALTER TABLE inquiries ADD COLUMN referral_detail TEXT NOT NULL DEFAULT '';
