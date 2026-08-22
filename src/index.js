/**
 * 쥴리 잉글리쉬 홈페이지 — Cloudflare Worker (API 전용)
 *
 * 정적 파일(public/)은 wrangler.jsonc 의 assets 바인딩이 알아서 서빙한다.
 * 여기서는 /api/* 로 들어오는 요청만 처리하고, 나머지는 env.ASSETS 로 넘긴다.
 *
 * 데이터는 D1(바인딩 DB), 사진·동영상 원본은 R2(바인딩 MEDIA)에 둔다.
 */

const SESSION_COOKIE = "je_session";
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100000;

// 업로드 한 장/한 편의 최대 크기. Workers 요청 본문 한도(100MB)보다 조금 낮게 잡았다.
const MAX_UPLOAD_BYTES = 95 * 1024 * 1024;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      const res = await route(request, env, url);
      return res || json({ error: "찾을 수 없는 주소입니다." }, 404);
    } catch (err) {
      // 실패해도 원인은 남겨두되, 사용자에게는 짧은 메시지만 보낸다.
      console.error("API error", err && err.stack ? err.stack : err);
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      return json({ error: "서버에서 문제가 생겼습니다. 잠시 후 다시 시도해 주세요." }, 500);
    }
  },
};

/* ============================================================
   라우팅
   ============================================================ */

async function route(request, env, url) {
  const method = request.method.toUpperCase();
  // /api/ 를 떼고 조각으로 나눈다 -> ["auth", "login"]
  const seg = url.pathname.replace(/^\/api\/?/, "").replace(/\/+$/, "").split("/").filter(Boolean);
  const [a, b, c, d] = seg;

  if (method === "OPTIONS") return new Response(null, { status: 204 });

  /* ---------- 업로드된 파일 내려주기 (누구나) ---------- */
  if (a === "media" && b === "file" && method === "GET") {
    const key = decodeURIComponent(seg.slice(2).join("/"));
    return serveR2(env, key, request);
  }

  /* ---------- 로그인 / 회원가입 ---------- */
  if (a === "auth") {
    if (b === "login" && method === "POST") return login(request, env);
    if (b === "logout" && method === "POST") return logout(request, env);
    if (b === "me" && method === "GET") return whoami(request, env);
    if (b === "signup" && method === "POST") return signup(request, env);
    if (b === "check-id" && method === "GET") return checkId(env, url);
  }

  /* ---------- 내 정보 ---------- */
  if (a === "me") {
    const me = await requireUser(request, env);
    if (method === "GET") return json({ user: publicUser(me) });
    if (method === "PATCH") return updateMe(request, env, me);
  }

  if (a === "my" && b === "classes" && method === "GET") {
    const me = await requireUser(request, env);
    return myClasses(env, me);
  }

  /* ---------- 상담신청 · 문의 접수 (로그인 없이) ---------- */
  if (a === "inquiries" && !b && method === "POST") {
    return createInquiry(request, env);
  }

  /* ---------- 졸업생·학부모 후기 (누구나 쓰고, 본인 비밀번호로 고친다) ---------- */
  if (a === "reviews") {
    if (!b && method === "GET") return listReviews(env);
    if (!b && method === "POST") return createReview(request, env);
    if (b && c === "delete" && method === "POST") return deleteReview(request, env, b);
    if (b && !c && method === "POST") return updateReview(request, env, b);
  }

  /* ---------- 공개 데이터 ---------- */
  if (a === "public") {
    if (b === "settings" && method === "GET") return publicSettings(env);
    if (b === "classes" && method === "GET") return publicClasses(env);
    if (b === "alumni" && method === "GET") return publicAlumni(env);
    if (b === "media" && method === "GET") return publicMedia(env);
  }

  /* ---------- 관리자 ---------- */
  if (a === "admin") {
    const admin = await requireAdmin(request, env);

    // 회원
    if (b === "users" && !c) {
      if (method === "GET") return adminListUsers(env, url);
      if (method === "POST") return adminCreateUser(request, env);
    }
    if (b === "users" && c && !d) {
      if (method === "GET") return adminGetUser(env, c);
      if (method === "PATCH") return adminUpdateUser(request, env, c);
      if (method === "DELETE") return adminDeleteUser(env, c, admin);
    }
    if (b === "users" && c && d === "counsel") {
      if (method === "GET") return listCounsel(env, c);
      if (method === "POST") return createCounsel(request, env, c, admin);
    }
    if (b === "counsel" && c) {
      if (method === "PATCH") return updateCounsel(request, env, c);
      if (method === "DELETE") return del(env, "counsel_logs", c);
    }

    // 클래스
    if (b === "classes" && !c) {
      if (method === "GET") return adminListClasses(env);
      if (method === "POST") return adminCreateClass(request, env);
    }
    if (b === "classes" && c && !d) {
      if (method === "PATCH") return adminUpdateClass(request, env, c);
      if (method === "DELETE") return del(env, "classes", c);
    }
    if (b === "classes" && c && d === "students" && method === "GET") {
      return classStudents(env, c);
    }

    // 수강 연결
    if (b === "enrollments" && !c && method === "POST") return addEnrollment(request, env);
    if (b === "enrollments" && c && method === "DELETE") return del(env, "enrollments", c);

    // 사진·동영상
    if (b === "media" && !c) {
      if (method === "GET") return adminListMedia(env);
      if (method === "POST") return createMedia(request, env);
    }
    if (b === "media" && c) {
      if (method === "PATCH") return updateMedia(request, env, c);
      if (method === "DELETE") return deleteMedia(env, c);
    }

    // 졸업생
    if (b === "alumni" && !c) {
      if (method === "GET") return adminListAlumni(env);
      if (method === "POST") return createAlumni(request, env);
    }
    if (b === "alumni" && c) {
      if (method === "PATCH") return updateAlumni(request, env, c);
      if (method === "DELETE") return del(env, "alumni", c);
    }

    // 상담신청 · 문의
    if (b === "inquiries" && !c && method === "GET") return adminListInquiries(env, url);
    if (b === "inquiries" && c) {
      if (method === "PATCH") return adminUpdateInquiry(request, env, c);
      if (method === "DELETE") return del(env, "inquiries", c);
    }

    // 설정
    if (b === "settings" && method === "PUT") return saveSettings(request, env);
  }

  return null;
}

/* ============================================================
   응답 / 오류 도우미
   ============================================================ */

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => new HttpError(400, msg);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

async function readJson(request) {
  try {
    return (await request.json()) || {};
  } catch {
    throw bad("요청 형식이 올바르지 않습니다.");
  }
}

// 빈 문자열은 null 로 통일해서 넣는다 (DB에 "" 가 쌓이는 걸 막는다).
const norm = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

/* ============================================================
   비밀번호 / 세션
   ============================================================ */

const enc = new TextEncoder();

function b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function unb64(str) {
  return Uint8Array.from(atob(str), (ch) => ch.charCodeAt(0));
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256
  );
  return new Uint8Array(bits);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

async function verifyPassword(password, stored) {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = parseInt(parts[1], 10);
  const salt = unb64(parts[2]);
  const expected = unb64(parts[3]);
  const actual = await pbkdf2(password, salt, iterations);
  if (actual.length !== expected.length) return false;
  // 타이밍 공격을 피하려고 길이만큼 전부 비교한다.
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

function newToken() {
  return b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, "");
}

function getCookie(request, name) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function sessionCookie(token, maxAgeSec) {
  const bits = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ];
  return bits.join("; ");
}

async function currentUser(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ?1 AND s.expires_at > datetime('now')`
  )
    .bind(token)
    .first();
  if (!row) return null;
  if (row.status !== "active") return null;
  return row;
}

async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw new HttpError(401, "로그인이 필요합니다.");
  return user;
}

async function requireAdmin(request, env) {
  const user = await requireUser(request, env);
  if (user.role !== "admin") throw new HttpError(403, "관리자만 사용할 수 있습니다.");
  return user;
}

function publicUser(u) {
  return {
    id: u.id,
    login_id: u.login_id,
    name: u.name,
    role: u.role,
    status: u.status,
    school: u.school,
    grade: u.grade,
    class_no: u.class_no,
    phone: u.phone,
    email: u.email,
    note: u.role === "admin" ? u.note : undefined,
  };
}

/* ============================================================
   로그인 / 회원가입
   ============================================================ */

async function login(request, env) {
  const body = await readJson(request);
  const loginId = norm(body.login_id);
  const password = body.password || "";
  if (!loginId || !password) throw bad("아이디와 비밀번호를 입력해 주세요.");

  const user = await env.DB.prepare(`SELECT * FROM users WHERE login_id = ?1`).bind(loginId).first();
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new HttpError(401, "아이디 또는 비밀번호가 맞지 않습니다.");
  }
  if (user.status === "pending") {
    throw new HttpError(403, "아직 승인 대기 중인 계정입니다. 원장님 승인 후 이용할 수 있습니다.");
  }
  if (user.status !== "active") {
    throw new HttpError(403, "사용이 중지된 계정입니다. 학원으로 문의해 주세요.");
  }

  const token = newToken();
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  await env.DB.prepare(
    `INSERT INTO sessions (token, user_id, expires_at)
     VALUES (?1, ?2, datetime('now', '+${SESSION_DAYS} days'))`
  )
    .bind(token, user.id)
    .run();

  // 오래된 세션은 이때 같이 치운다.
  await env.DB.prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now')`).run();

  return json({ user: publicUser(user) }, 200, { "set-cookie": sessionCookie(token, maxAge) });
}

async function logout(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare(`DELETE FROM sessions WHERE token = ?1`).bind(token).run();
  return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
}

async function whoami(request, env) {
  const user = await currentUser(request, env);
  return json({ user: user ? publicUser(user) : null });
}

async function checkId(env, url) {
  const loginId = norm(url.searchParams.get("login_id"));
  if (!loginId) throw bad("아이디를 입력해 주세요.");
  const problem = validateLoginId(loginId);
  if (problem) return json({ available: false, reason: problem });
  const row = await env.DB.prepare(`SELECT id FROM users WHERE login_id = ?1`).bind(loginId).first();
  return json({
    available: !row,
    reason: row ? "이미 사용 중인 아이디입니다." : "사용할 수 있는 아이디입니다.",
  });
}

function validateLoginId(loginId) {
  if (loginId.length < 4) return "아이디는 4자 이상이어야 합니다.";
  if (loginId.length > 60) return "아이디가 너무 깁니다.";
  // 영문·숫자·. _ - @ 까지 허용 (이메일 형태의 아이디도 쓸 수 있게)
  if (!/^[A-Za-z0-9._@-]+$/.test(loginId)) return "아이디는 영문, 숫자, . _ - @ 만 쓸 수 있습니다.";
  return null;
}

function validatePassword(password) {
  if (!password || password.length < 4) return "비밀번호는 4자 이상이어야 합니다.";
  if (password.length > 100) return "비밀번호가 너무 깁니다.";
  return null;
}

async function signup(request, env) {
  const body = await readJson(request);
  const loginId = norm(body.login_id);
  const name = norm(body.name);
  const password = body.password || "";

  if (!loginId) throw bad("아이디를 입력해 주세요.");
  if (!name) throw bad("이름을 입력해 주세요.");
  const idProblem = validateLoginId(loginId);
  if (idProblem) throw bad(idProblem);
  const pwProblem = validatePassword(password);
  if (pwProblem) throw bad(pwProblem);

  const dup = await env.DB.prepare(`SELECT id FROM users WHERE login_id = ?1`).bind(loginId).first();
  if (dup) throw bad("이미 사용 중인 아이디입니다.");

  await env.DB.prepare(
    `INSERT INTO users (login_id, password_hash, name, role, status, school, grade, class_no, phone, email)
     VALUES (?1, ?2, ?3, 'student', 'pending', ?4, ?5, ?6, ?7, ?8)`
  )
    .bind(
      loginId,
      await hashPassword(password),
      name,
      norm(body.school),
      norm(body.grade),
      norm(body.class_no),
      norm(body.phone),
      norm(body.email)
    )
    .run();

  return json({
    ok: true,
    message: "가입 신청이 접수되었습니다. 원장님 승인 후 로그인할 수 있습니다.",
  });
}

/* ============================================================
   내 정보 수정 (아이디·비밀번호 포함)
   ============================================================ */

async function updateMe(request, env, me) {
  const body = await readJson(request);
  const sets = [];
  const vals = [];
  let n = 1;

  const put = (col, val) => {
    sets.push(`${col} = ?${n++}`);
    vals.push(val);
  };

  if (body.login_id !== undefined) {
    const loginId = norm(body.login_id);
    if (!loginId) throw bad("아이디를 비울 수 없습니다.");
    if (loginId !== me.login_id) {
      const problem = validateLoginId(loginId);
      if (problem) throw bad(problem);
      const dup = await env.DB.prepare(`SELECT id FROM users WHERE login_id = ?1`).bind(loginId).first();
      if (dup) throw bad("이미 사용 중인 아이디입니다.");
      put("login_id", loginId);
    }
  }

  if (body.name !== undefined) {
    const name = norm(body.name);
    if (!name) throw bad("이름을 비울 수 없습니다.");
    put("name", name);
  }
  for (const col of ["school", "grade", "class_no", "phone", "email"]) {
    if (body[col] !== undefined) put(col, norm(body[col]));
  }

  // 비밀번호를 바꿀 때는 현재 비밀번호를 반드시 확인한다.
  if (body.new_password) {
    const problem = validatePassword(body.new_password);
    if (problem) throw bad(problem);
    if (!(await verifyPassword(body.current_password || "", me.password_hash))) {
      throw bad("현재 비밀번호가 맞지 않습니다.");
    }
    put("password_hash", await hashPassword(body.new_password));
  }

  if (!sets.length) return json({ ok: true, user: publicUser(me) });

  vals.push(me.id);
  await env.DB.prepare(`UPDATE users SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?${n}`)
    .bind(...vals)
    .run();

  const fresh = await env.DB.prepare(`SELECT * FROM users WHERE id = ?1`).bind(me.id).first();
  return json({ ok: true, user: publicUser(fresh) });
}

/* ============================================================
   나의 수업
   ============================================================ */

async function myClasses(env, me) {
  const { results } = await env.DB.prepare(
    `SELECT c.*, e.joined_at
       FROM enrollments e JOIN classes c ON c.id = e.class_id
      WHERE e.user_id = ?1
      ORDER BY c.start_time, c.name`
  )
    .bind(me.id)
    .all();

  return json({ classes: results || [] });
}

/* ============================================================
   공개 데이터
   ============================================================ */

async function publicSettings(env) {
  const { results } = await env.DB.prepare(`SELECT key, value, updated_at FROM settings`).all();
  const out = {};
  const updated = {};
  for (const r of results || []) {
    out[r.key] = r.value;
    updated[r.key] = r.updated_at;
  }
  // updated 는 홈 배너의 "NEW" 표시(바뀐 지 14일)를 계산하는 데 쓴다.
  return json({ settings: out, updated });
}

async function publicClasses(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, name, days, start_time, duration_min, level, teacher, room, color, memo
       FROM classes WHERE active = 1 ORDER BY start_time, name`
  ).all();
  return json({ classes: results || [] });
}

async function publicAlumni(env) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM alumni ORDER BY sort_order, id`
  ).all();
  return json({ alumni: results || [] });
}

async function publicMedia(env) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM media ORDER BY sort_order, id DESC`
  ).all();
  return json({ media: results || [] });
}

/* ============================================================
   관리자 — 회원
   ============================================================ */

async function adminListUsers(env, url) {
  const q = norm(url.searchParams.get("q"));
  const status = norm(url.searchParams.get("status"));

  let sql = `SELECT u.*,
                    (SELECT group_concat(c.name, ', ')
                       FROM enrollments e JOIN classes c ON c.id = e.class_id
                      WHERE e.user_id = u.id) AS class_names,
                    (SELECT COUNT(*) FROM counsel_logs cl WHERE cl.user_id = u.id) AS counsel_count
               FROM users u WHERE 1 = 1`;
  const binds = [];
  if (status) {
    binds.push(status);
    sql += ` AND u.status = ?${binds.length}`;
  }
  if (q) {
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
    sql += ` AND (u.name LIKE ?${binds.length - 2} OR u.login_id LIKE ?${binds.length - 1} OR u.school LIKE ?${binds.length})`;
  }
  sql += ` ORDER BY CASE u.status WHEN 'pending' THEN 0 ELSE 1 END, u.name`;

  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json({
    users: (results || []).map((u) => ({
      ...publicUser(u),
      note: u.note,
      class_names: u.class_names,
      counsel_count: u.counsel_count,
      created_at: u.created_at,
    })),
  });
}

async function adminGetUser(env, id) {
  const u = await env.DB.prepare(`SELECT * FROM users WHERE id = ?1`).bind(id).first();
  if (!u) throw new HttpError(404, "회원을 찾을 수 없습니다.");
  const { results } = await env.DB.prepare(
    `SELECT e.id AS enrollment_id, c.*
       FROM enrollments e JOIN classes c ON c.id = e.class_id
      WHERE e.user_id = ?1 ORDER BY c.start_time`
  )
    .bind(id)
    .all();
  return json({ user: { ...publicUser(u), note: u.note, created_at: u.created_at }, classes: results || [] });
}

async function adminCreateUser(request, env) {
  const body = await readJson(request);
  const loginId = norm(body.login_id);
  const name = norm(body.name);
  const password = body.password || "";

  if (!loginId) throw bad("아이디를 입력해 주세요.");
  if (!name) throw bad("이름을 입력해 주세요.");
  const idProblem = validateLoginId(loginId);
  if (idProblem) throw bad(idProblem);
  const pwProblem = validatePassword(password);
  if (pwProblem) throw bad(pwProblem);

  const dup = await env.DB.prepare(`SELECT id FROM users WHERE login_id = ?1`).bind(loginId).first();
  if (dup) throw bad("이미 사용 중인 아이디입니다.");

  const res = await env.DB.prepare(
    `INSERT INTO users (login_id, password_hash, name, role, status, school, grade, class_no, phone, email, note)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
  )
    .bind(
      loginId,
      await hashPassword(password),
      name,
      body.role === "admin" ? "admin" : "student",
      body.status || "active",
      norm(body.school),
      norm(body.grade),
      norm(body.class_no),
      norm(body.phone),
      norm(body.email),
      norm(body.note)
    )
    .run();

  const newId = res.meta.last_row_id;
  if (Array.isArray(body.class_ids)) await syncEnrollments(env, newId, body.class_ids);
  return json({ ok: true, id: newId });
}

async function adminUpdateUser(request, env, id) {
  const body = await readJson(request);
  const target = await env.DB.prepare(`SELECT * FROM users WHERE id = ?1`).bind(id).first();
  if (!target) throw new HttpError(404, "회원을 찾을 수 없습니다.");

  const sets = [];
  const vals = [];
  let n = 1;
  const put = (col, val) => {
    sets.push(`${col} = ?${n++}`);
    vals.push(val);
  };

  if (body.login_id !== undefined) {
    const loginId = norm(body.login_id);
    if (!loginId) throw bad("아이디를 비울 수 없습니다.");
    if (loginId !== target.login_id) {
      const problem = validateLoginId(loginId);
      if (problem) throw bad(problem);
      const dup = await env.DB.prepare(`SELECT id FROM users WHERE login_id = ?1`).bind(loginId).first();
      if (dup) throw bad("이미 사용 중인 아이디입니다.");
      put("login_id", loginId);
    }
  }
  if (body.name !== undefined) {
    const name = norm(body.name);
    if (!name) throw bad("이름을 비울 수 없습니다.");
    put("name", name);
  }
  for (const col of ["school", "grade", "class_no", "phone", "email", "note"]) {
    if (body[col] !== undefined) put(col, norm(body[col]));
  }
  if (body.status !== undefined) put("status", body.status);
  if (body.role !== undefined) put("role", body.role === "admin" ? "admin" : "student");

  // 관리자가 비밀번호를 초기화해 줄 때는 현재 비밀번호를 묻지 않는다.
  if (body.password) {
    const problem = validatePassword(body.password);
    if (problem) throw bad(problem);
    put("password_hash", await hashPassword(body.password));
    // 비밀번호가 바뀌면 기존 로그인 세션은 모두 끊는다.
    await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?1`).bind(id).run();
  }

  if (sets.length) {
    vals.push(id);
    await env.DB.prepare(`UPDATE users SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?${n}`)
      .bind(...vals)
      .run();
  }
  if (Array.isArray(body.class_ids)) await syncEnrollments(env, id, body.class_ids);

  return json({ ok: true });
}

async function adminDeleteUser(env, id, admin) {
  if (String(admin.id) === String(id)) throw bad("자기 계정은 삭제할 수 없습니다.");
  await env.DB.prepare(`DELETE FROM users WHERE id = ?1`).bind(id).run();
  return json({ ok: true });
}

// 회원이 들을 클래스 목록을 통째로 맞춘다 (없어진 건 지우고 새로 생긴 건 넣는다).
async function syncEnrollments(env, userId, classIds) {
  const wanted = classIds.map(String).filter(Boolean);
  const { results } = await env.DB.prepare(`SELECT class_id FROM enrollments WHERE user_id = ?1`)
    .bind(userId)
    .all();
  const current = (results || []).map((r) => String(r.class_id));

  const toAdd = wanted.filter((x) => !current.includes(x));
  const toRemove = current.filter((x) => !wanted.includes(x));

  for (const cid of toAdd) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO enrollments (class_id, user_id) VALUES (?1, ?2)`
    )
      .bind(cid, userId)
      .run();
  }
  for (const cid of toRemove) {
    await env.DB.prepare(`DELETE FROM enrollments WHERE user_id = ?1 AND class_id = ?2`)
      .bind(userId, cid)
      .run();
  }
}

/* ============================================================
   관리자 — 클래스
   ============================================================ */

async function adminListClasses(env) {
  const { results } = await env.DB.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id) AS student_count
       FROM classes c ORDER BY c.active DESC, c.start_time, c.name`
  ).all();
  return json({ classes: results || [] });
}

const DAY_CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function cleanDays(days) {
  const list = String(days || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => DAY_CODES.includes(s));
  if (!list.length) throw bad("요일을 하나 이상 선택해 주세요.");
  // 항상 월→일 순서로 정렬해 저장한다.
  return DAY_CODES.filter((d) => list.includes(d)).join(",");
}

function cleanTime(t) {
  const s = String(t || "").trim();
  if (!/^\d{1,2}:\d{2}$/.test(s)) throw bad("시간은 14:00 형식으로 입력해 주세요.");
  const [h, m] = s.split(":").map(Number);
  if (h > 23 || m > 59) throw bad("시간 값이 올바르지 않습니다.");
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

async function adminCreateClass(request, env) {
  const b = await readJson(request);
  const name = norm(b.name);
  if (!name) throw bad("클래스 이름을 입력해 주세요.");
  const res = await env.DB.prepare(
    `INSERT INTO classes (name, days, start_time, duration_min, level, teacher, room, color, memo, active)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
  )
    .bind(
      name,
      cleanDays(b.days),
      cleanTime(b.start_time),
      Number(b.duration_min) || 60,
      norm(b.level),
      norm(b.teacher) || "Julie",
      norm(b.room),
      norm(b.color) || "#0C3190",
      norm(b.memo),
      b.active === false ? 0 : 1
    )
    .run();
  return json({ ok: true, id: res.meta.last_row_id });
}

async function adminUpdateClass(request, env, id) {
  const b = await readJson(request);
  const sets = [];
  const vals = [];
  let n = 1;
  const put = (col, val) => {
    sets.push(`${col} = ?${n++}`);
    vals.push(val);
  };

  if (b.name !== undefined) {
    const name = norm(b.name);
    if (!name) throw bad("클래스 이름을 비울 수 없습니다.");
    put("name", name);
  }
  if (b.days !== undefined) put("days", cleanDays(b.days));
  if (b.start_time !== undefined) put("start_time", cleanTime(b.start_time));
  if (b.duration_min !== undefined) put("duration_min", Number(b.duration_min) || 60);
  for (const col of ["level", "teacher", "room", "color", "memo"]) {
    if (b[col] !== undefined) put(col, norm(b[col]));
  }
  if (b.active !== undefined) put("active", b.active ? 1 : 0);

  if (!sets.length) return json({ ok: true });
  vals.push(id);
  await env.DB.prepare(`UPDATE classes SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?${n}`)
    .bind(...vals)
    .run();
  return json({ ok: true });
}

async function classStudents(env, classId) {
  const { results } = await env.DB.prepare(
    `SELECT e.id AS enrollment_id, u.id, u.name, u.school, u.grade, u.class_no, u.phone, u.status
       FROM enrollments e JOIN users u ON u.id = e.user_id
      WHERE e.class_id = ?1 ORDER BY u.name`
  )
    .bind(classId)
    .all();
  return json({ students: results || [] });
}

async function addEnrollment(request, env) {
  const b = await readJson(request);
  if (!b.class_id || !b.user_id) throw bad("클래스와 학원생을 모두 골라 주세요.");
  await env.DB.prepare(`INSERT OR IGNORE INTO enrollments (class_id, user_id) VALUES (?1, ?2)`)
    .bind(b.class_id, b.user_id)
    .run();
  return json({ ok: true });
}

/* ============================================================
   관리자 — 상담일지
   ============================================================ */

async function listCounsel(env, userId) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM counsel_logs WHERE user_id = ?1 ORDER BY log_date DESC, id DESC`
  )
    .bind(userId)
    .all();
  return json({ logs: results || [] });
}

async function createCounsel(request, env, userId, admin) {
  const b = await readJson(request);
  const content = norm(b.content);
  if (!content) throw bad("상담 내용을 입력해 주세요.");
  const res = await env.DB.prepare(
    `INSERT INTO counsel_logs (user_id, log_date, title, content, author)
     VALUES (?1, ?2, ?3, ?4, ?5)`
  )
    .bind(userId, norm(b.log_date) || todayISO(), norm(b.title), content, admin.name)
    .run();
  return json({ ok: true, id: res.meta.last_row_id });
}

async function updateCounsel(request, env, id) {
  const b = await readJson(request);
  const sets = [];
  const vals = [];
  let n = 1;
  for (const col of ["log_date", "title", "content"]) {
    if (b[col] !== undefined) {
      sets.push(`${col} = ?${n++}`);
      vals.push(norm(b[col]));
    }
  }
  if (!sets.length) return json({ ok: true });
  vals.push(id);
  await env.DB.prepare(
    `UPDATE counsel_logs SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?${n}`
  )
    .bind(...vals)
    .run();
  return json({ ok: true });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/* ============================================================
   관리자 — 사진·동영상 (R2)
   ============================================================ */

async function adminListMedia(env) {
  const { results } = await env.DB.prepare(`SELECT * FROM media ORDER BY sort_order, id DESC`).all();
  return json({ media: results || [] });
}

async function createMedia(request, env) {
  const type = request.headers.get("content-type") || "";

  // (1) 유튜브 링크 등록 — JSON 으로 들어온다
  if (type.includes("application/json")) {
    const b = await readJson(request);
    const url = norm(b.url);
    if (!url) throw bad("주소를 입력해 주세요.");
    const res = await env.DB.prepare(
      `INSERT INTO media (kind, title, description, url, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)`
    )
      .bind(norm(b.kind) || "youtube", norm(b.title), norm(b.description), url, Number(b.sort_order) || 0)
      .run();
    return json({ ok: true, id: res.meta.last_row_id });
  }

  // (2) 실제 파일 업로드 — multipart/form-data
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") throw bad("파일을 골라 주세요.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw bad("파일이 너무 큽니다. 95MB 이하로 올리거나, 동영상은 유튜브 링크로 등록해 주세요.");
  }

  const mime = file.type || "application/octet-stream";
  const kind = mime.startsWith("video/") ? "video" : "photo";
  const ext = (file.name || "").split(".").pop();
  const key = `media/${Date.now()}-${newToken().slice(0, 10)}${ext ? "." + ext.toLowerCase() : ""}`;

  await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: mime } });

  const res = await env.DB.prepare(
    `INSERT INTO media (kind, title, description, r2_key, mime, size, sort_order)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
  )
    .bind(
      kind,
      norm(form.get("title")) || file.name || null,
      norm(form.get("description")),
      key,
      mime,
      file.size,
      Number(form.get("sort_order")) || 0
    )
    .run();

  return json({ ok: true, id: res.meta.last_row_id, key });
}

async function updateMedia(request, env, id) {
  const b = await readJson(request);
  const sets = [];
  const vals = [];
  let n = 1;
  for (const col of ["title", "description", "url"]) {
    if (b[col] !== undefined) {
      sets.push(`${col} = ?${n++}`);
      vals.push(norm(b[col]));
    }
  }
  if (b.sort_order !== undefined) {
    sets.push(`sort_order = ?${n++}`);
    vals.push(Number(b.sort_order) || 0);
  }
  if (!sets.length) return json({ ok: true });
  vals.push(id);
  await env.DB.prepare(`UPDATE media SET ${sets.join(", ")} WHERE id = ?${n}`).bind(...vals).run();
  return json({ ok: true });
}

async function deleteMedia(env, id) {
  const row = await env.DB.prepare(`SELECT * FROM media WHERE id = ?1`).bind(id).first();
  if (row && row.r2_key) {
    // R2 삭제가 실패해도 목록에서는 지운다 (고아 파일은 나중에 정리).
    try {
      await env.MEDIA.delete(row.r2_key);
    } catch (e) {
      console.error("R2 delete failed", row.r2_key, e);
    }
  }
  await env.DB.prepare(`DELETE FROM media WHERE id = ?1`).bind(id).run();
  return json({ ok: true });
}

// R2 에 있는 파일을 그대로 흘려보낸다. 동영상은 Range 요청을 받아야 스크럽이 된다.
async function serveR2(env, key, request) {
  const range = request.headers.get("range");
  let obj;

  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m) {
      const start = m[1] === "" ? undefined : Number(m[1]);
      const end = m[2] === "" ? undefined : Number(m[2]);
      const spec =
        start === undefined ? { suffix: end } : end === undefined ? { offset: start } : { offset: start, length: end - start + 1 };
      obj = await env.MEDIA.get(key, { range: spec });
    }
  }
  if (!obj) obj = await env.MEDIA.get(key);
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("accept-ranges", "bytes");

  if (obj.range && obj.size !== undefined) {
    const offset = obj.range.offset || 0;
    const length = obj.range.length !== undefined ? obj.range.length : obj.size - offset;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    return new Response(obj.body, { status: 206, headers });
  }
  return new Response(obj.body, { headers });
}

/* ============================================================
   관리자 — 졸업생
   ============================================================ */

async function adminListAlumni(env) {
  const { results } = await env.DB.prepare(`SELECT * FROM alumni ORDER BY sort_order, id`).all();
  return json({ alumni: results || [] });
}

async function createAlumni(request, env) {
  const b = await readJson(request);
  const name = norm(b.name);
  if (!name) throw bad("이름을 입력해 주세요.");
  const res = await env.DB.prepare(
    `INSERT INTO alumni (name, year, dest, years, note, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
  )
    .bind(name, norm(b.year), norm(b.dest), norm(b.years), norm(b.note), Number(b.sort_order) || 0)
    .run();
  return json({ ok: true, id: res.meta.last_row_id });
}

async function updateAlumni(request, env, id) {
  const b = await readJson(request);
  const sets = [];
  const vals = [];
  let n = 1;
  for (const col of ["name", "year", "dest", "years", "note"]) {
    if (b[col] !== undefined) {
      sets.push(`${col} = ?${n++}`);
      vals.push(norm(b[col]));
    }
  }
  if (b.sort_order !== undefined) {
    sets.push(`sort_order = ?${n++}`);
    vals.push(Number(b.sort_order) || 0);
  }
  if (!sets.length) return json({ ok: true });
  vals.push(id);
  await env.DB.prepare(`UPDATE alumni SET ${sets.join(", ")} WHERE id = ?${n}`).bind(...vals).run();
  return json({ ok: true });
}

/* ============================================================
   졸업생 · 학부모 후기
   ============================================================ */

const MAX_REVIEW_PHOTOS = 5;
const MAX_REVIEW_PHOTO_BYTES = 10 * 1024 * 1024; // 사진 한 장 10MB

/** 후기 목록 — 사진까지 붙여서 한 번에 내려준다. */
async function listReviews(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, author_role, author_name, title, body, created_at, updated_at
       FROM reviews ORDER BY created_at DESC, id DESC`
  ).all();
  const reviews = results || [];
  if (!reviews.length) return json({ reviews: [] });

  const photos = await env.DB.prepare(
    `SELECT id, review_id, r2_key FROM review_photos ORDER BY review_id, sort_order, id`
  ).all();

  const byReview = {};
  for (const p of photos.results || []) {
    (byReview[p.review_id] = byReview[p.review_id] || []).push({ id: p.id, r2_key: p.r2_key });
  }
  for (const r of reviews) r.photos = byReview[r.id] || [];

  return json({ reviews });
}

/** 원장님이면 비밀번호 없이 통과, 아니면 글에 저장된 비밀번호와 맞는지 본다. */
async function assertCanEditReview(request, env, row, password) {
  const me = await currentUser(request, env);
  if (me && me.role === "admin") return true;
  if (row.author_role === "admin") {
    throw new HttpError(403, "원장님이 쓴 글은 수정하거나 삭제할 수 없습니다.");
  }
  if (!password) throw bad("비밀번호를 입력해 주세요.");
  if (!(await verifyPassword(password, row.password_hash))) throw bad("비밀번호가 맞지 않습니다.");
  return true;
}

/** 폼에서 사진 파일만 골라내 R2 에 넣고 review_photos 에 기록한다. */
async function saveReviewPhotos(env, form, reviewId, startOrder = 0) {
  const files = form.getAll("photos").filter((f) => f && typeof f !== "string" && f.size > 0);
  if (!files.length) return 0;
  if (files.length > MAX_REVIEW_PHOTOS) {
    throw bad(`사진은 한 번에 ${MAX_REVIEW_PHOTOS}장까지 올릴 수 있습니다.`);
  }

  let order = startOrder;
  for (const f of files) {
    if (!String(f.type || "").startsWith("image/")) throw bad("사진 파일만 올릴 수 있습니다.");
    if (f.size > MAX_REVIEW_PHOTO_BYTES) throw bad("사진 한 장은 10MB 이하만 올릴 수 있습니다.");

    const ext = (f.name || "").split(".").pop();
    const key = `reviews/${Date.now()}-${newToken().slice(0, 10)}${ext ? "." + ext.toLowerCase() : ""}`;
    await env.MEDIA.put(key, f.stream(), { httpMetadata: { contentType: f.type } });
    await env.DB.prepare(
      `INSERT INTO review_photos (review_id, r2_key, mime, size, sort_order)
       VALUES (?1, ?2, ?3, ?4, ?5)`
    )
      .bind(reviewId, key, f.type, f.size, order++)
      .run();
  }
  return files.length;
}

async function createReview(request, env) {
  const form = await request.formData();
  const me = await currentUser(request, env);
  const isAdmin = !!me && me.role === "admin";

  const authorName = norm(form.get("author_name")) || (isAdmin ? me.name : null);
  const title = norm(form.get("title"));
  const body = norm(form.get("body"));
  const password = form.get("password") || "";

  if (!authorName) throw bad("이름을 입력해 주세요.");
  if (authorName.length > 30) throw bad("이름이 너무 깁니다.");
  if (!body) throw bad("내용을 입력해 주세요.");
  if (body.length > 4000) throw bad("내용이 너무 깁니다. 4000자 안으로 줄여 주세요.");

  // 익명 글은 나중에 본인이 고칠 수 있도록 비밀번호를 반드시 받는다.
  let hash = null;
  if (!isAdmin) {
    if (!password || password.length < 4) throw bad("비밀번호를 4자 이상 입력해 주세요.");
    hash = await hashPassword(password);
  }

  const res = await env.DB.prepare(
    `INSERT INTO reviews (author_role, author_name, title, body, password_hash)
     VALUES (?1, ?2, ?3, ?4, ?5)`
  )
    .bind(isAdmin ? "admin" : "guest", authorName, title, body, hash)
    .run();

  const id = res.meta.last_row_id;
  await saveReviewPhotos(env, form, id);
  return json({ ok: true, id });
}

async function updateReview(request, env, id) {
  const form = await request.formData();
  const row = await env.DB.prepare(`SELECT * FROM reviews WHERE id = ?1`).bind(id).first();
  if (!row) throw new HttpError(404, "글을 찾을 수 없습니다.");

  await assertCanEditReview(request, env, row, form.get("password") || "");

  const title = norm(form.get("title"));
  const body = norm(form.get("body"));
  if (!body) throw bad("내용을 입력해 주세요.");
  if (body.length > 4000) throw bad("내용이 너무 깁니다. 4000자 안으로 줄여 주세요.");

  await env.DB.prepare(
    `UPDATE reviews SET title = ?1, body = ?2, updated_at = datetime('now') WHERE id = ?3`
  )
    .bind(title, body, id)
    .run();

  // 지울 사진 (id 를 쉼표로 이어 보낸다)
  const removeIds = String(form.get("remove_photos") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const pid of removeIds) {
    const p = await env.DB.prepare(
      `SELECT * FROM review_photos WHERE id = ?1 AND review_id = ?2`
    )
      .bind(pid, id)
      .first();
    if (!p) continue;
    try {
      await env.MEDIA.delete(p.r2_key);
    } catch (e) {
      console.error("R2 delete failed", p.r2_key, e);
    }
    await env.DB.prepare(`DELETE FROM review_photos WHERE id = ?1`).bind(pid).run();
  }

  const left = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM review_photos WHERE review_id = ?1`
  )
    .bind(id)
    .first();
  await saveReviewPhotos(env, form, id, left ? left.n : 0);

  return json({ ok: true });
}

async function deleteReview(request, env, id) {
  const b = await readJson(request);
  const row = await env.DB.prepare(`SELECT * FROM reviews WHERE id = ?1`).bind(id).first();
  if (!row) throw new HttpError(404, "글을 찾을 수 없습니다.");

  await assertCanEditReview(request, env, row, b.password || "");

  // 붙어 있던 사진 파일도 같이 치운다 (DB 행은 ON DELETE CASCADE 로 사라진다).
  const photos = await env.DB.prepare(
    `SELECT r2_key FROM review_photos WHERE review_id = ?1`
  )
    .bind(id)
    .all();
  for (const p of photos.results || []) {
    try {
      await env.MEDIA.delete(p.r2_key);
    } catch (e) {
      console.error("R2 delete failed", p.r2_key, e);
    }
  }

  await env.DB.prepare(`DELETE FROM reviews WHERE id = ?1`).bind(id).run();
  return json({ ok: true });
}

/* ============================================================
   상담신청 · 문의
   ============================================================ */

const INQUIRY_KIND_KR = { consult: "상담신청", question: "문의" };
const ENGLISH_LEVELS = ["없음", "1~2년", "3~4년", "5년 이상"];
const INQUIRY_STATUS = new Set(["new", "doing", "done"]);

/**
 * 방문자가 남긴 상담신청/문의를 받는다.
 * 순서가 중요하다 — 먼저 DB에 남기고, 그다음 알림을 보낸다.
 * 알림이 실패해도 접수 자체는 살아 있어야 문의가 사라지지 않는다.
 */
async function createInquiry(request, env) {
  const b = await readJson(request);

  const kind = b.kind === "question" ? "question" : "consult";
  const studentName = norm(b.student_name);
  const parentPhone = norm(b.parent_phone);

  if (!studentName) throw bad("학생 이름을 입력해 주세요.");
  if (!parentPhone) throw bad("부모님 연락처를 입력해 주세요.");
  if (studentName.length > 40) throw bad("학생 이름이 너무 깁니다.");
  if (!/[0-9]/.test(parentPhone)) throw bad("부모님 연락처를 숫자로 입력해 주세요.");

  const level = norm(b.english_level);
  if (level && !ENGLISH_LEVELS.includes(level)) throw bad("영어 학습 수준을 다시 골라 주세요.");

  const message = norm(b.message);
  if (message && message.length > 2000) throw bad("내용이 너무 깁니다. 2000자 안으로 줄여 주세요.");

  // 같은 번호로 1분 안에 또 들어오면 실수로 두 번 누른 것으로 본다.
  const recent = await env.DB.prepare(
    `SELECT id FROM inquiries
      WHERE parent_phone = ?1 AND created_at > datetime('now', '-1 minute') LIMIT 1`
  )
    .bind(parentPhone)
    .first();
  if (recent) throw bad("방금 접수된 내용이 있습니다. 잠시 후 다시 시도해 주세요.");

  const res = await env.DB.prepare(
    `INSERT INTO inquiries
       (kind, student_name, school, grade, english_level, student_phone, parent_phone, message, user_agent)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
  )
    .bind(
      kind,
      studentName,
      norm(b.school),
      norm(b.grade),
      level,
      norm(b.student_phone),
      parentPhone,
      message,
      (request.headers.get("user-agent") || "").slice(0, 200)
    )
    .run();

  const id = res.meta.last_row_id;

  const sent = await notifyNewInquiry(env, {
    id,
    kind,
    student_name: studentName,
    school: norm(b.school),
    grade: norm(b.grade),
    english_level: level,
    student_phone: norm(b.student_phone),
    parent_phone: parentPhone,
    message,
  });
  if (sent) {
    await env.DB.prepare(`UPDATE inquiries SET notified = 1 WHERE id = ?1`).bind(id).run();
  }

  // 알림이 갔는지 여부는 방문자에게 알릴 이유가 없다. 접수됐다는 사실만 알려 준다.
  return json({
    ok: true,
    message:
      kind === "consult"
        ? "상담신청이 접수되었습니다. 확인 후 남겨주신 연락처로 연락드리겠습니다."
        : "문의가 접수되었습니다. 확인 후 남겨주신 연락처로 답변드리겠습니다.",
  });
}

const tgEsc = (v) =>
  String(v === null || v === undefined ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** 새 접수를 원장님에게 바로 알린다. 실패해도 예외를 밖으로 던지지 않는다. */
async function notifyNewInquiry(env, q) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error("알림 설정이 없어 건너뜀 (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)");
    return false;
  }

  const rows = [
    ["학생 이름", q.student_name],
    ["학교", q.school],
    ["학년", q.grade],
    ["영어 학습 수준", q.english_level],
    ["학생 연락처", q.student_phone],
    ["부모님 연락처", q.parent_phone],
  ].filter(([, v]) => v);

  const body =
    `<b>[쥴리 잉글리쉬] 새 ${INQUIRY_KIND_KR[q.kind]}</b>\n\n` +
    rows.map(([k, v]) => `${k}: <b>${tgEsc(v)}</b>`).join("\n") +
    (q.message ? `\n\n${q.kind === "consult" ? "기타 의견" : "문의 내용"}:\n${tgEsc(q.message)}` : "") +
    `\n\n접수번호 #${q.id}`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: body,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.error("알림 전송 실패", res.status, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.error("알림 전송 중 오류", e);
    return false;
  }
}

async function adminListInquiries(env, url) {
  const status = norm(url.searchParams.get("status"));
  const kind = norm(url.searchParams.get("kind"));

  let sql = `SELECT * FROM inquiries WHERE 1 = 1`;
  const binds = [];
  if (status && INQUIRY_STATUS.has(status)) {
    binds.push(status);
    sql += ` AND status = ?${binds.length}`;
  }
  if (kind && INQUIRY_KIND_KR[kind]) {
    binds.push(kind);
    sql += ` AND kind = ?${binds.length}`;
  }
  // 아직 처리 안 한 건이 항상 위로 오게 한다.
  sql += ` ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'doing' THEN 1 ELSE 2 END, created_at DESC`;

  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  const counts = await env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM inquiries GROUP BY status`
  ).all();

  const byStatus = {};
  for (const r of counts.results || []) byStatus[r.status] = r.n;

  return json({ inquiries: results || [], counts: byStatus });
}

async function adminUpdateInquiry(request, env, id) {
  const b = await readJson(request);
  const sets = [];
  const vals = [];
  let n = 1;

  if (b.status !== undefined) {
    if (!INQUIRY_STATUS.has(b.status)) throw bad("상태 값이 올바르지 않습니다.");
    sets.push(`status = ?${n++}`);
    vals.push(b.status);
  }
  if (b.admin_memo !== undefined) {
    sets.push(`admin_memo = ?${n++}`);
    vals.push(norm(b.admin_memo));
  }
  if (!sets.length) return json({ ok: true });

  vals.push(id);
  await env.DB.prepare(
    `UPDATE inquiries SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?${n}`
  )
    .bind(...vals)
    .run();
  return json({ ok: true });
}

/* ============================================================
   관리자 — 설정
   ============================================================ */

async function saveSettings(request, env) {
  const b = await readJson(request);
  const entries = Object.entries(b.settings || {});
  for (const [key, value] of entries) {
    const next = value === null || value === undefined ? null : String(value);
    const cur = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first();

    // 값이 그대로면 아예 건드리지 않는다. updated_at 이 갱신되면 홈 배너의
    // "NEW" 표시가 내용도 안 바뀐 채 되살아나기 때문이다.
    if (cur && (cur.value === null ? null : String(cur.value)) === next) continue;

    await env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
      .bind(key, next)
      .run();
  }
  return json({ ok: true });
}

/* ---------- 공통 삭제 ---------- */
const DELETABLE = new Set([
  "counsel_logs", "classes", "enrollments", "alumni", "inquiries", "reviews",
]);

async function del(env, table, id) {
  if (!DELETABLE.has(table)) throw bad("삭제할 수 없는 항목입니다.");
  await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?1`).bind(id).run();
  return json({ ok: true });
}
