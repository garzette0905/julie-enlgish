-- ---------- 학부모 연락처를 따로 받는다 ----------
-- 지금까지는 users.phone 한 칸뿐이었고, "학부모 알림" 화면은 그 번호를
-- 학부모 번호로 간주해 보여 주고 있었다.
-- 이제 학생 번호와 학부모 번호를 나눠 받는다.
--   phone        = 학생 연락처 (선택)
--   parent_phone = 학부모 연락처 (회원가입 시 필수)
ALTER TABLE users ADD COLUMN parent_phone TEXT;

-- 이미 들어와 있는 번호는 학부모 번호로 옮긴다.
-- (원래 화면에서 학부모 번호로 쓰이고 있었으므로 그 쪽이 맞다)
-- phone 은 지우지 않고 그대로 둔다 — 학생 번호였을 가능성도 있어서,
-- 어느 쪽인지는 원장님이 학원생 관리에서 보고 정리하시면 된다.
UPDATE users
   SET parent_phone = phone
 WHERE role != 'admin'
   AND parent_phone IS NULL
   AND phone IS NOT NULL
   AND trim(phone) != '';

CREATE INDEX idx_users_parent_phone ON users(parent_phone);
