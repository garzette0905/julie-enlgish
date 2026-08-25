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

/* ------------------------------------------------------------
   브라우저가 <video> 로 못 여는 동영상은 아예 받지 않는다.

   예전에 Xvid 로 만든 AVI 가 올라간 적이 있는데, 목록에는 잘 등록되고
   썸네일 자리까지 잡히지만 누르면 아무 일도 일어나지 않았다
   (Chrome: DEMUXER_ERROR_COULD_NOT_OPEN). 올린 사람은 잘 올라간 줄 알고
   넘어가기 때문에, 올리는 그 자리에서 막고 이유를 알려 주는 편이 낫다.

   MP4(H.264) · WebM · Ogg 만 통과시킨다. MOV 는 안에 든 코덱에 따라
   되기도 하고 안 되기도 해서 통과시키되, 안 되면 MP4 로 바꾸라고 안내한다.
   ------------------------------------------------------------ */
const BLOCKED_VIDEO_EXT = new Set([
  "avi", "wmv", "mkv", "flv", "mpg", "mpeg", "vob", "asf", "rm", "rmvb", "divx", "3gp", "ts", "m2ts",
]);

/** 확장자·mime 이 브라우저에서 못 여는 동영상이면 그 이유를 돌려준다. */
function unplayableVideoReason(name, mime) {
  const ext = String(name || "").split(".").pop().toLowerCase();
  const m = String(mime || "").toLowerCase();
  const looksBlocked =
    BLOCKED_VIDEO_EXT.has(ext) ||
    m === "video/avi" ||
    m === "video/x-msvideo" ||
    m === "video/x-ms-wmv" ||
    m === "video/x-matroska" ||
    m === "video/x-flv";
  if (!looksBlocked) return null;
  return (
    `${ext ? "." + ext + " " : ""}형식은 웹 브라우저에서 재생되지 않습니다. ` +
    `MP4(H.264) 로 바꿔서 올려 주세요. 긴 영상은 유튜브 링크로 등록하는 방법도 있습니다.`
  );
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return servePage(request, env, url);
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
   화면 서빙 — 검색엔진이 주소마다 다른 페이지로 인식하게 만든다

   이 사이트는 자바스크립트가 화면을 그리는 구조라, 아무것도 안 하면
   어느 주소로 들어와도 검색로봇에게는 똑같은 빈 껍데기로 보인다.
   네이버(Yeti)·다음(Daumoa) 로봇은 자바스크립트를 제대로 돌리지 않으므로,
   Worker 가 index.html 을 내려주기 전에 주소에 맞는 제목·설명·본문을
   HTMLRewriter 로 갈아 끼운다.
   ============================================================ */

const SITE_ORIGIN = "https://www.julieenglish.co.kr";
const SITE_IMAGE = `${SITE_ORIGIN}/assets/logo-512.png`;

/** 주소별 제목·설명, 그리고 로봇이 읽어 갈 본문 */
const PAGES = {
  "/": {
    title: "쥴리 잉글리쉬 · 용인 동백 영어학원 (초등·중등 영어교습소)",
    description:
      "용인 동백 초당마을 영어교습소. 2007년부터 이어온 파닉스·초등·중등 영어. 원장 직강, 내신 선행. 상담문의 031-8005-9439",
    body: `
      <h1>쥴리 잉글리쉬 영어교습소 · 용인 동백</h1>
      <p>경기도 용인시 기흥구 초당마을에 있는 영어교습소입니다.
         2007년부터 동백에서 파닉스·초등 영어·중등 내신 선행을 가르쳐 왔습니다.
         원장이 직접 모든 수업을 진행합니다.</p>
      <h2>수업 안내</h2>
      <ul>
        <li>월·수·금 60분 수업 / 화·목 90분 수업</li>
        <li>오프라인 중심 원장 직강 수업</li>
        <li>주 5일 과제 부여</li>
        <li>English Speaking 병행 수업</li>
      </ul>
      <h2>과정</h2>
      <ul>
        <li>파닉스 과정 — 알파벳 소리에서 시작해 스스로 읽어내는 단계까지</li>
        <li>초등 과정 — 읽기·듣기·쓰기를 고르게</li>
        <li>선행 중등 과정 — 중등 문법과 독해, 내신 대비</li>
        <li>선행 고등 과정 — 고등 문법·독해와 내신 대비</li>
      </ul>
      <h2>선생님</h2>
      <ul>
        <li>한국외국어대학교 학사 / 석사 졸업</li>
        <li>중고등 내신대비 지도 (청솔학원)</li>
        <li>캐나다 TESOL 수료 · 캐나다 공립 초등학교 파닉스 수업지도</li>
        <li>미국 공립도서관의 이민자를 위한 회화 클래스 지도</li>
        <li>영어유치원 · 어학원 16년 경력</li>
      </ul>
      <h2>상담 문의</h2>
      <p>전화 031-8005-9439 · 휴대폰 010-3323-9439</p>
      <p>위치: 경기도 용인시 기흥구 초당마을 삼부르네상스아파트 상가동 204호 (<a href="https://map.naver.com/p/search/%EC%9A%A9%EC%9D%B8%EC%8B%9C%20%EA%B8%B0%ED%9D%A5%EA%B5%AC%20%EB%8F%99%EB%B0%B11%EB%A1%9C%208" target="_blank" rel="noopener noreferrer">지도보기</a>)</p>`,
  },

  "/about": {
    title: "학원 소식·사진 · 쥴리 잉글리쉬 (용인 동백 영어학원)",
    description:
      "쥴리 잉글리쉬의 수업 모습과 학원 공간을 사진·영상으로 소개합니다. 용인 동백 초당마을 영어교습소.",
    body: `
      <h1>학원 소식·사진</h1>
      <p>쥴리 잉글리쉬의 수업 모습과 학원 공간을 사진·영상으로 소개합니다.</p>
      <h2>찾아오시는 길</h2>
      <p>경기도 용인시 기흥구 초당마을 삼부르네상스아파트 상가동 204호 (<a href="https://map.naver.com/p/search/%EC%9A%A9%EC%9D%B8%EC%8B%9C%20%EA%B8%B0%ED%9D%A5%EA%B5%AC%20%EB%8F%99%EB%B0%B11%EB%A1%9C%208" target="_blank" rel="noopener noreferrer">지도보기</a>)</p>
      <p>상담 문의 031-8005-9439</p>`,
  },

  "/reviews": {
    title: "재원생 · 졸업생 · 학부모 후기 · 쥴리 잉글리쉬 (용인 동백 영어학원)",
    description:
      "쥴리 잉글리쉬에 다니고 있는 학생과 졸업생, 학부모님이 남긴 후기입니다. 용인 동백 초당마을 영어교습소.",
    body: `
      <h1>재원생 · 졸업생 · 학부모 후기</h1>
      <p>쥴리 잉글리쉬와 함께한 이야기를 남겨 주세요. 사진도 함께 올릴 수 있습니다.</p>
      <p>최소 5년에서 최대 9년까지 꾸준히 함께한 학생들이 명문고·명문대에 진학했습니다.</p>`,
  },

  "/contact": {
    title: "상담신청 · 문의 · 쥴리 잉글리쉬 (용인 동백 영어학원)",
    description:
      "용인 동백 쥴리 잉글리쉬 수업 상담을 신청하세요. 전화 031-8005-9439 또는 온라인으로 남겨 주시면 원장이 직접 연락드립니다.",
    body: `
      <h1>상담신청 · 문의</h1>
      <p>남겨주신 연락처로 원장이 직접 연락드립니다.</p>
      <p>전화 031-8005-9439 · 휴대폰 010-3323-9439</p>
      <p>위치: 경기도 용인시 기흥구 초당마을 삼부르네상스아파트 상가동 204호 (<a href="https://map.naver.com/p/search/%EC%9A%A9%EC%9D%B8%EC%8B%9C%20%EA%B8%B0%ED%9D%A5%EA%B5%AC%20%EB%8F%99%EB%B0%B11%EB%A1%9C%208" target="_blank" rel="noopener noreferrer">지도보기</a>)</p>`,
  },
};

// 로그인해야 보이는 화면은 검색에 잡힐 이유가 없다.
const PRIVATE_PAGES = {
  "/login": "로그인 · 쥴리 잉글리쉬",
  "/signup": "회원가입 · 쥴리 잉글리쉬",
  "/my": "나의 수업 · 쥴리 잉글리쉬",
  "/me": "내 정보 · 쥴리 잉글리쉬",
  "/admin": "관리자 · 쥴리 잉글리쉬",
};

/** 검색엔진 소유확인 코드는 자주 바뀌지 않으니 잠깐 들고 있는다. */
let verifyCache = { at: 0, value: null };

async function getVerifyTags(env) {
  const now = Date.now();
  if (verifyCache.value && now - verifyCache.at < 60_000) return verifyCache.value;
  try {
    const { results } = await env.DB.prepare(
      `SELECT key, value FROM settings WHERE key IN ('verify_naver', 'verify_google')`
    ).all();
    const out = {};
    for (const r of results || []) if (r.value) out[r.key] = r.value;
    verifyCache = { at: now, value: out };
    return out;
  } catch {
    return {};
  }
}

function pageInfoFor(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (PAGES[path]) return { path, ...PAGES[path], index: true };

  // /admin/tuition 처럼 뒤에 더 붙는 주소도 비공개로 본다.
  for (const p of Object.keys(PRIVATE_PAGES)) {
    if (path === p || path.startsWith(p + "/")) {
      return { path, title: PRIVATE_PAGES[p], description: "", body: "", index: false };
    }
  }
  return null;
}

async function servePage(request, env, url) {
  let info = pageInfoFor(url.pathname);
  let status = 200;

  // 아는 화면 주소가 아니면 파일 그대로 (styles.css, robots.txt, /assets/... 등)
  if (!info) {
    const asset = await env.ASSETS.fetch(request);
    const type = asset.headers.get("content-type") || "";

    // 없는 파일을 부르면 Cloudflare 가 index.html 을 대신 돌려준다(SPA 처리).
    // 그대로 두면 존재하지 않는 주소가 200 으로 응답해서 검색엔진이
    // "가짜 404" 로 보고 색인을 어지럽힌다. 진짜 404 로 돌려준다.
    if (!type.includes("text/html")) return asset;

    info = {
      path: url.pathname,
      title: "찾을 수 없는 페이지 · 쥴리 잉글리쉬",
      description: "",
      body: `<h1>찾을 수 없는 페이지입니다</h1>
             <p><a href="/">쥴리 잉글리쉬 홈으로 가기</a></p>`,
      index: false,
    };
    status = 404;
  }

  // 어느 화면이든 내용은 같은 index.html 이다. 그 위에 주소별 정보를 덧씌운다.
  const res = await env.ASSETS.fetch(new Request(`${url.origin}/index.html`, { headers: request.headers }));
  if (!res.ok) return res;

  const verify = await getVerifyTags(env);
  const canonical = info.path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${info.path}`;

  const out = new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(info.title);
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        if (info.description) el.setAttribute("content", info.description);
      },
    })
    .on('meta[name="robots"]', {
      element(el) {
        el.setAttribute("content", info.index ? "index, follow" : "noindex, nofollow");
      },
    })
    .on('link[rel="canonical"]', {
      element(el) {
        el.setAttribute("href", canonical);
      },
    })
    .on('meta[property="og:title"]', {
      element(el) {
        el.setAttribute("content", info.title);
      },
    })
    .on('meta[property="og:description"]', {
      element(el) {
        if (info.description) el.setAttribute("content", info.description);
      },
    })
    .on('meta[property="og:url"]', {
      element(el) {
        el.setAttribute("content", canonical);
      },
    })
    .on("head", {
      element(el) {
        // 네이버 서치어드바이저 / 구글 서치콘솔 소유확인 태그.
        // 관리자 화면 → 사이트 설정에서 코드를 넣으면 여기에 붙는다.
        if (verify.verify_naver) {
          el.append(`<meta name="naver-site-verification" content="${escAttr(verify.verify_naver)}">`, { html: true });
        }
        if (verify.verify_google) {
          el.append(`<meta name="google-site-verification" content="${escAttr(verify.verify_google)}">`, { html: true });
        }
      },
    })
    .on("main#view", {
      element(el) {
        // 로봇이 읽어 갈 본문. 브라우저에서는 JS 가 곧바로 갈아 끼운다.
        el.setInnerContent(
          info.body ? `<div class="section"><div class="wrap">${info.body}</div></div>` : "",
          { html: true }
        );
      },
    })
    .transform(res);

  const headers = new Headers(out.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  // 화면마다 내용이 다르므로 중간 캐시가 뒤섞지 않도록 짧게만 캐시한다.
  headers.set("cache-control", "public, max-age=0, must-revalidate");
  return new Response(out.body, { status, headers });
}

const escAttr = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

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

  /* ---------- 재원생·졸업생·학부모 후기 (누구나 쓰고, 본인 비밀번호로 고친다) ---------- */
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
    // 끌어서 바꾼 순서를 한 번에 저장한다. id 를 받는 갈래보다 먼저 걸러야 한다.
    if (b === "media" && c === "reorder" && method === "PUT") return reorderMedia(request, env);
    if (b === "reviews" && c === "reorder" && method === "PUT") return reorderReviews(request, env);
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

    // 학부모 알림 — 클래스별로 묶은 원생 명단 (그 학생의 학부모 번호로 보낸다)
    if (b === "roster" && !c && method === "GET") return adminRoster(env);

    // 원비 관리
    if (b === "tuition" && !c) {
      if (method === "GET") return adminTuition(env, url);
      if (method === "PUT") return adminSaveTuition(request, env);
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
    parent_phone: u.parent_phone,
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

/** 전화번호는 형식을 강하게 묶지 않는다. 숫자가 몇 개 들어 있는지만 본다. */
function validatePhone(phone, label) {
  const digits = String(phone || "").replace(/[^0-9]/g, "");
  if (digits.length < 9) return `${label}를 정확히 입력해 주세요.`;
  if (digits.length > 15) return `${label}가 너무 깁니다.`;
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

  // 학부모 연락처는 반드시 받는다 — 승인·상담·알림이 모두 이 번호로 간다.
  const parentPhone = norm(body.parent_phone);
  if (!parentPhone) throw bad("학부모 연락처를 입력해 주세요.");
  const parentProblem = validatePhone(parentPhone, "학부모 연락처");
  if (parentProblem) throw bad(parentProblem);

  // 학생 연락처는 있으면 받고, 없으면 넘어간다.
  const studentPhone = norm(body.phone);
  if (studentPhone) {
    const studentProblem = validatePhone(studentPhone, "학생 연락처");
    if (studentProblem) throw bad(studentProblem);
  }

  const dup = await env.DB.prepare(`SELECT id FROM users WHERE login_id = ?1`).bind(loginId).first();
  if (dup) throw bad("이미 사용 중인 아이디입니다.");

  await env.DB.prepare(
    `INSERT INTO users (login_id, password_hash, name, role, status, school, grade, class_no, phone, parent_phone, email)
     VALUES (?1, ?2, ?3, 'student', 'pending', ?4, ?5, ?6, ?7, ?8, ?9)`
  )
    .bind(
      loginId,
      await hashPassword(password),
      name,
      norm(body.school),
      norm(body.grade),
      norm(body.class_no),
      studentPhone,
      parentPhone,
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
  for (const col of ["school", "grade", "class_no", "phone", "parent_phone", "email"]) {
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
    `INSERT INTO users (login_id, password_hash, name, role, status, school, grade, class_no, phone, parent_phone, email, note)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
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
      norm(body.parent_phone),
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
  for (const col of ["school", "grade", "class_no", "phone", "parent_phone", "email", "note"]) {
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
    `SELECT e.id AS enrollment_id, u.id, u.name, u.school, u.grade, u.class_no, u.phone, u.parent_phone, u.status
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

/**
 * 오늘 날짜(한국 기준) "YYYY-MM-DD".
 * Worker 와 D1 은 UTC 로 도는데, 상담일지에 찍히는 날짜는 한국 날짜여야 한다.
 * 그냥 toISOString() 을 쓰면 한국시간 밤 9시부터 자정까지 하루 전 날짜가 찍힌다.
 */
function todayISO() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/* ============================================================
   관리자 — 사진·동영상 (R2)
   ============================================================ */

async function adminListMedia(env) {
  const { results } = await env.DB.prepare(`SELECT * FROM media ORDER BY sort_order, id DESC`).all();
  return json({ media: results || [] });
}

/** 새 항목이 들어갈 자리 — 지금 목록의 맨 뒤. */
async function nextMediaSort(env) {
  const row = await env.DB.prepare(`SELECT MAX(sort_order) AS m FROM media`).first();
  const max = row && row.m !== null && row.m !== undefined ? Number(row.m) : -1;
  return (Number.isFinite(max) ? max : -1) + 1;
}

/** 끌어서 바꾼 순서를 받아 0, 1, 2 … 로 다시 매긴다. */
async function reorderMedia(request, env) {
  const b = await readJson(request);
  const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Number.isInteger);
  if (!ids.length) throw bad("바뀐 순서를 받지 못했습니다.");
  await env.DB.batch(
    ids.map((id, i) =>
      env.DB.prepare(`UPDATE media SET sort_order = ?1 WHERE id = ?2`).bind(i, id)
    )
  );
  return json({ ok: true, saved: ids.length });
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
      .bind(
        norm(b.kind) || "youtube",
        norm(b.title),
        norm(b.description),
        url,
        b.sort_order !== undefined ? Number(b.sort_order) || 0 : await nextMediaSort(env)
      )
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

  // 올라간 뒤에야 "재생이 안 된다" 를 알게 되는 일을 막는다.
  if (kind === "video") {
    const why = unplayableVideoReason(file.name, mime);
    if (why) throw bad(why);
  }
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
      form.get("sort_order") !== null
        ? Number(form.get("sort_order")) || 0
        : await nextMediaSort(env)
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
   재원생 · 졸업생 · 학부모 후기
   ============================================================ */

const MAX_REVIEW_PHOTOS = 5;
const MAX_REVIEW_PHOTO_BYTES = 10 * 1024 * 1024; // 사진 한 장 10MB

/** 후기가 새로 들어갈 자리 — 지금 목록의 맨 위. */
async function nextReviewSort(env) {
  const row = await env.DB.prepare(`SELECT MIN(sort_order) AS m FROM reviews`).first();
  const min = row && row.m !== null && row.m !== undefined ? Number(row.m) : 0;
  return (Number.isFinite(min) ? min : 0) - 1;
}

/** 끌어서 바꾼 후기 순서를 받아 0, 1, 2 … 로 다시 매긴다. */
async function reorderReviews(request, env) {
  const b = await readJson(request);
  const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Number.isInteger);
  if (!ids.length) throw bad("바뀐 순서를 받지 못했습니다.");
  await env.DB.batch(
    ids.map((id, i) =>
      env.DB.prepare(`UPDATE reviews SET sort_order = ?1 WHERE id = ?2`).bind(i, id)
    )
  );
  return json({ ok: true, saved: ids.length });
}

/** 후기 목록 — 사진까지 붙여서 한 번에 내려준다. */
async function listReviews(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, author_role, author_name, title, body, created_at, updated_at
       FROM reviews ORDER BY sort_order, created_at DESC, id DESC`
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

/**
 * 올라간 후기를 고치거나 지우는 일은 원장님(관리자)만 한다.
 * 화면에서도 원장님일 때만 단추가 붙지만, 주소를 직접 두드리는 경우가 있어 여기서 다시 막는다.
 */
async function assertCanEditReview(request, env) {
  const me = await currentUser(request, env);
  if (me && me.role === "admin") return true;
  throw new HttpError(403, "후기 수정·삭제는 원장님만 할 수 있습니다.");
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

  if (!authorName) throw bad("이름을 입력해 주세요.");
  if (authorName.length > 30) throw bad("이름이 너무 깁니다.");
  if (!body) throw bad("내용을 입력해 주세요.");
  if (body.length > 4000) throw bad("내용이 너무 깁니다. 4000자 안으로 줄여 주세요.");

  // 수정·삭제는 원장님만 하므로 글쓴이 비밀번호는 더 받지 않는다.
  // (password_hash 칸은 예전에 쓴 글 때문에 남겨 두고, 새 글은 비워 둔다)
  const res = await env.DB.prepare(
    `INSERT INTO reviews (author_role, author_name, title, body, password_hash, sort_order)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
  )
    .bind(
      isAdmin ? "admin" : "guest",
      authorName,
      title,
      body,
      null,
      await nextReviewSort(env)
    )
    .run();

  const id = res.meta.last_row_id;
  const photoCount = await saveReviewPhotos(env, form, id);
  await notifyReview(env, "작성", { id, author_name: authorName, title, body, photoCount });
  return json({ ok: true, id });
}

async function updateReview(request, env, id) {
  const form = await request.formData();
  const row = await env.DB.prepare(`SELECT * FROM reviews WHERE id = ?1`).bind(id).first();
  if (!row) throw new HttpError(404, "글을 찾을 수 없습니다.");

  await assertCanEditReview(request, env);

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

  await notifyReview(env, "수정", { id, author_name: row.author_name, title, body });
  return json({ ok: true });
}

async function deleteReview(request, env, id) {
  const row = await env.DB.prepare(`SELECT * FROM reviews WHERE id = ?1`).bind(id).first();
  if (!row) throw new HttpError(404, "글을 찾을 수 없습니다.");

  await assertCanEditReview(request, env);

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
  await notifyReview(env, "삭제", {
    id, author_name: row.author_name, title: row.title, body: row.body,
  });
  return json({ ok: true });
}

/**
 * 후기에 변화가 생기면 원장님에게 알린다.
 * 알림이 실패해도 글 작성/수정/삭제 자체는 이미 끝난 뒤이므로 그대로 둔다.
 */
async function notifyReview(env, action, r) {
  const preview = String(r.body || "").slice(0, 200);
  const lines = [
    `<b>[쥴리 잉글리쉬] 후기 ${action}</b>`,
    "",
    `글쓴이: <b>${tgEsc(r.author_name)}</b>`,
  ];
  if (r.title) lines.push(`제목: ${tgEsc(r.title)}`);
  if (preview) {
    lines.push("", tgEsc(preview) + (String(r.body || "").length > 200 ? "…" : ""));
  }
  if (r.photoCount) lines.push("", `사진 ${r.photoCount}장`);
  lines.push("", `글번호 #${r.id}`);

  await sendTelegram(env, lines.join("\n"));
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

/** 원장님 휴대폰으로 알림을 보낸다. 실패해도 예외를 밖으로 던지지 않는다. */
async function sendTelegram(env, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error("알림 설정이 없어 건너뜀 (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)");
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
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

/** 새 상담신청/문의를 원장님에게 바로 알린다. */
async function notifyNewInquiry(env, q) {
  const rows = [
    ["학생 이름", q.student_name],
    ["학교", q.school],
    ["학년", q.grade],
    ["영어 학습 수준", q.english_level],
    ["학생 연락처", q.student_phone],
    ["부모님 연락처", q.parent_phone],
  ].filter(([, v]) => v);

  const lines = [
    `<b>[쥴리 잉글리쉬] 새 ${INQUIRY_KIND_KR[q.kind]}</b>`,
    "",
    ...rows.map(([k, v]) => `${k}: <b>${tgEsc(v)}</b>`),
  ];
  if (q.message) {
    lines.push("", `${q.kind === "consult" ? "기타 의견" : "문의 내용"}:`, tgEsc(q.message));
  }
  lines.push("", `접수번호 #${q.id}`);

  return sendTelegram(env, lines.join("\n"));
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
   관리자 — 학부모 알림 (클래스별 명단)
   ============================================================ */

/**
 * 알림 보낼 대상을 고르기 쉽도록 원생을 클래스별로 묶어서 준다.
 * 실제로 알림이 가는 곳은 학생 본인이 아니라 그 학생의 학부모 번호(parent_phone)다.
 * 어느 클래스에도 연결되지 않은 원생은 맨 끝에 따로 모아 둔다.
 */
async function adminRoster(env) {
  const cls = await env.DB.prepare(
    `SELECT id, name, days, start_time, duration_min, level, color, active
       FROM classes ORDER BY active DESC, start_time, name`
  ).all();

  const rows = await env.DB.prepare(
    `SELECT u.id, u.name, u.school, u.grade, u.class_no, u.phone, u.parent_phone, u.status, e.class_id
       FROM users u
       LEFT JOIN enrollments e ON e.user_id = u.id
      WHERE u.role != 'admin'
      ORDER BY u.name`
  ).all();

  const byClass = {};
  const seen = new Set();
  const unassigned = [];

  for (const r of rows.results || []) {
    const student = {
      id: r.id, name: r.name, school: r.school, grade: r.grade,
      class_no: r.class_no, phone: r.phone, parent_phone: r.parent_phone, status: r.status,
    };
    if (r.class_id) {
      (byClass[r.class_id] = byClass[r.class_id] || []).push(student);
      seen.add(r.id);
    }
  }
  // 한 명이 여러 클래스를 들으면 위에서 여러 줄로 나오므로, 미배정은 따로 걸러낸다.
  for (const r of rows.results || []) {
    if (!seen.has(r.id) && !unassigned.some((u) => u.id === r.id)) {
      unassigned.push({
        id: r.id, name: r.name, school: r.school, grade: r.grade,
        class_no: r.class_no, phone: r.phone, parent_phone: r.parent_phone, status: r.status,
      });
    }
  }

  const classes = (cls.results || []).map((c) => ({ ...c, students: byClass[c.id] || [] }));
  return json({ classes, unassigned });
}

/* ============================================================
   관리자 — 원비 관리
   ============================================================ */

const MONTH_RE = /^\d{4}-\d{2}$/;

/** ?month=YYYY-MM 한 달치. 원생 전체를 주고, 그 달 기록이 있으면 붙여 준다. */
async function adminTuition(env, url) {
  const month = norm(url.searchParams.get("month"));
  if (!month || !MONTH_RE.test(month)) throw bad("조회할 달을 골라 주세요.");

  const { results } = await env.DB.prepare(
    `SELECT u.id, u.name, u.school, u.grade, u.class_no, u.phone, u.parent_phone, u.status,
            (SELECT group_concat(c.name, ', ')
               FROM enrollments e JOIN classes c ON c.id = e.class_id
              WHERE e.user_id = u.id) AS class_names,
            t.id AS tuition_id, t.amount, t.paid, t.paid_at, t.memo
       FROM users u
       LEFT JOIN tuition t ON t.user_id = u.id AND t.month = ?1
      WHERE u.role != 'admin'
      ORDER BY u.name`
  )
    .bind(month)
    .all();

  const students = (results || []).map((r) => ({
    ...r,
    amount: r.amount === null || r.amount === undefined ? null : Number(r.amount),
    paid: !!r.paid,
  }));

  const total = students.reduce((sum, s) => sum + (s.amount || 0), 0);
  const paidTotal = students.reduce((sum, s) => sum + (s.paid ? s.amount || 0 : 0), 0);
  const unpaid = students.filter((s) => (s.amount || 0) > 0 && !s.paid).length;

  return json({ month, students, summary: { total, paidTotal, unpaid, count: students.length } });
}

/** 바뀐 줄만 골라서 한 번에 저장한다. */
async function adminSaveTuition(request, env) {
  const b = await readJson(request);
  const month = norm(b.month);
  if (!month || !MONTH_RE.test(month)) throw bad("저장할 달이 올바르지 않습니다.");

  const rows = Array.isArray(b.rows) ? b.rows : [];
  let saved = 0;

  for (const r of rows) {
    const userId = Number(r.user_id);
    if (!userId) continue;

    const amount = Math.max(0, Math.round(Number(r.amount) || 0));
    const paid = r.paid ? 1 : 0;
    const memo = norm(r.memo);

    await env.DB.prepare(
      `INSERT INTO tuition (user_id, month, amount, paid, paid_at, memo)
       VALUES (?1, ?2, ?3, ?4, CASE WHEN ?4 = 1 THEN datetime('now') ELSE NULL END, ?5)
       ON CONFLICT(user_id, month) DO UPDATE SET
         amount = excluded.amount,
         -- 미납 -> 납부로 바뀌는 순간에만 납부 시각을 새로 찍는다
         paid_at = CASE
                     WHEN excluded.paid = 1 AND tuition.paid = 0 THEN datetime('now')
                     WHEN excluded.paid = 0 THEN NULL
                     ELSE tuition.paid_at
                   END,
         paid = excluded.paid,
         memo = excluded.memo,
         updated_at = datetime('now')`
    )
      .bind(userId, month, amount, paid, memo)
      .run();
    saved++;
  }

  return json({ ok: true, saved });
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
