/**
 * 로그인 없이 볼 수 있는 화면들
 *   학원소개(홈) · 학원 소식·사진
 *   (시간표·졸업생 소개 화면은 걷어냈고, 졸업생 명단은 홈 Result 섹션에 남아 있다)
 */
import {
  $, $$, html, esc, apiGet, kstDate, openModal,
} from "./core.js";

/* 여러 화면이 같이 쓰는 값들은 한 번만 받아서 들고 있는다. */
let cache = { settings: null, updated: null, classes: null };

/* 찾아오시는 길에 다는 지도 링크.
   화면에 적는 주소는 아파트 이름이라 지도에서 바로 검색되지 않는다.
   지도는 도로명 주소(상가동 204호가 있는 건물)로 열고,
   설정에 map_url 을 넣어 두면 그 주소를 대신 쓴다. */
const MAP_ADDRESS = "용인시 기흥구 동백1로 8";
const DEFAULT_MAP_URL = `https://map.naver.com/p/search/${encodeURIComponent(MAP_ADDRESS)}`;
const mapUrl = (s) => ((s && s.map_url) || "").trim() || DEFAULT_MAP_URL;

export async function getSettings() {
  if (!cache.settings) {
    const { settings, updated } = await apiGet("public/settings");
    cache.settings = settings || {};
    cache.updated = updated || {};
  }
  return cache.settings;
}

/** 홈 배너 문구가 마지막으로 바뀐 시각 (D1 이 주는 'YYYY-MM-DD HH:MM:SS' UTC) */
function bannerUpdatedAt() {
  return (cache.updated && cache.updated.notice_banner) || null;
}

/** 그 시각이 지금으로부터 days 일 안쪽인지 */
function withinDays(sqlDateTime, days) {
  if (!sqlDateTime) return false;
  const t = Date.parse(String(sqlDateTime).replace(" ", "T") + "Z");
  if (Number.isNaN(t)) return false;
  return Date.now() - t < days * 24 * 60 * 60 * 1000;
}
export async function getClasses(force = false) {
  if (!cache.classes || force) {
    const { classes } = await apiGet("public/classes");
    cache.classes = classes || [];
  }
  return cache.classes;
}
export function clearCache() {
  cache = { settings: null, updated: null, classes: null };
}

/* ============================================================
   학원소개 (홈)
   ============================================================ */

export async function renderHome(view) {
  const settings = await getSettings().catch(() => ({}));
  const banner = settings.notice_banner;

  view.innerHTML = "";
  view.append(html(`
    <section class="hero">
      <div class="hero-inner">
        <div>
          <div class="hero-eyebrow">미래를 준비하는 영어교육</div>
          <h1>Julie&rsquo;s English Academy<span class="kr">쥴리 잉글리쉬 영어교습소</span></h1>
          <p class="lead">
            재미있는 파닉스, 읽기가 되는 파닉스부터 초·중·고 내신 선행까지.
            동백에서 2007년부터 수업을 해오는 중이며, 학생 한명 한명을 내 자녀처럼 사랑으로 가르칩니다
          </p>
          <div class="hero-actions">
            <a class="btn" href="/contact">상담신청 하기</a>
            <a class="btn outline" href="#home-reviews" id="hero-reviews">졸업생 · 학부모 후기</a>
          </div>
        </div>
        <div class="hero-logo"><img src="/assets/logo-512.png" alt="쥴리 잉글리쉬 로고"></div>
      </div>
    </section>
    <div class="star-band"></div>
  `));

  if (banner) {
    // 배너 문구가 바뀐 지 14일 안이면 NEW 를 붙여 눈에 띄게 한다.
    const isNew = withinDays(bannerUpdatedAt(), 14);
    // 언제 올린 소식인지 문구 옆에 같이 적어 준다.
    const posted = kstDate(bannerUpdatedAt());
    view.append(html(`<div class="notice-strip">
      ${isNew ? `<span class="new-badge">NEW</span>` : ""}${esc(banner)}${posted ? `<span class="notice-date">${esc(posted)}</span>` : ""}
    </div>`));
  }

  // PC 로 보는 중이면 휴대폰으로 옮겨 갈 수 있게 QR 을 오른쪽에 작게 둔다.
  // (이미 휴대폰으로 보고 있다면 쓸모가 없어 CSS 에서 감춘다)
  // 전단지·현수막에 쓸 수 있게 큰 그림 파일을 내려받는 링크도 같이 둔다.
  view.append(html(`<div class="wrap qr-row">
    <div class="qr-box">
      <img src="/assets/qr-site.png" alt="www.julieenglish.co.kr 접속 QR 코드" width="96" height="96">
      <span class="qr-text">휴대폰으로<br>보기
        <a class="qr-save" href="/assets/qr-julie-english.png"
           download="julie-english-qr.png">QR 이미지 저장</a>
      </span>
    </div>
  </div>`));

  view.append(html(`
    <section class="section">
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">Why Julie&rsquo;s</span>
          <h2>2007년부터 시작된 동백의 영어 전문가</h2>
          <p>2007년부터 동백에서 이어온 지도 경험, 그리고 분당 정자동 영어유치원·어학원 티칭 경력.</p>
        </div>
        <div class="feature-grid">
          <div class="feature">
            <span class="num">01</span>
            <h3>재미있는 파닉스</h3>
            <p>소리부터 차근차근. 읽기의 성취감도 느끼고, 재미있는 수업방식으로 진행됩니다</p>
          </div>
          <div class="feature">
            <span class="num">02</span>
            <h3>초·중·고 내신 선행</h3>
            <p>학교 진도를 앞서가는 선행과 시험 기간 집중 내신 대비를 함께 합니다.</p>
          </div>
          <div class="feature">
            <span class="num">03</span>
            <h3>English 수업</h3>
            <p>수업 시간에 영어와 병행해서 수업을 진행합니다. 영어 말하는 감각을 유지합니다.</p>
          </div>
          <div class="feature">
            <span class="num">04</span>
            <h3>주 5일 과제</h3>
            <p>수업이 없는 날에도 과제로 이어집니다. 매일 매일의 공부가 영어 실력이 됩니다</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section soft">
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">Class &amp; Teacher</span>
          <h2>수업과 선생님</h2>
        </div>
        <div class="info-cols">
          <div class="info-col">
            <h3>Julie English</h3>
            <ul>
              <li>월·수·금 &mdash; 60분 수업</li>
              <li>화·목 &mdash; 90분 수업</li>
              <li>오프라인 중심 원장 직강 수업</li>
              <li>주 5일 과제 부여</li>
              <li class="hi">English Speaking 병행 수업</li>
            </ul>
          </div>
          <div class="info-col red">
            <h3>Julie Teacher</h3>
            <ul>
              <li>한국외국어대학교 학사 / 석사 졸업</li>
              <li>중고등 내신대비 지도 (청솔학원)</li>
              <li>캐나다 TESOL 수료</li>
              <li>캐나다 공립 초등학교 파닉스 수업지도</li>
              <li>미국 공립도서관 이민자(히스패닉) 대상 회화지도</li>
              <li>영어유치원 · 어학원 16년 경력</li>
              <li class="hi">동백 Julie&rsquo;s English 19년차 (&rsquo;07년~)</li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">Curriculum</span>
          <h2>4개 과정 제공</h2>
          <p>학생의 현재 수준을 업그레이드하여 다음 단계로 발전하는 모습을 볼 수 있습니다.</p>
        </div>
        <div class="course-grid">
          <div class="course">
            <h3>파닉스 과정</h3>
            <p>알파벳 소리에서 시작해 스스로 단어와 문장을 읽어내는 단계까지.</p>
          </div>
          <div class="course">
            <h3>초등 과정</h3>
            <p>읽기·듣기·쓰기를 고르게. 학교 영어와 실력을 동시에 챙깁니다.</p>
          </div>
          <div class="course">
            <h3>선행 중등 과정</h3>
            <p>중등 문법과 독해를 미리. 내신 시험 대비까지 이어집니다.</p>
          </div>
          <div class="course">
            <h3>선행 고등 과정</h3>
            <p>고등 문법·독해와 내신 대비까지. 고등 진학 전에 흐름을 잡습니다.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section soft">
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">Result</span>
          <h2>매년 명문고, 명문대 합격생 배출<br><span class="h2-sub">(동탄국제고, 화성고, 계원예고, 북일고, 세마고 등)</span></h2>
        </div>
        <h3 class="sub-head">졸업생 소개</h3>
        <p class="sub-lead">최소 5년에서 최대 9년까지 꾸준히 함께한 학생들이 만들어낸 결과입니다.</p>
        <div class="alumni-grid" id="home-alumni"><div class="loading">불러오는 중…</div></div>

        <h3 class="sub-head" id="home-reviews">졸업생 · 학부모 후기</h3>
        <p class="sub-lead">쥴리 잉글리쉬와 함께한 학생·학부모님이 남겨 주신 이야기입니다.<br>
          저희 원에서 졸업생은 정규선행 프로그램을 6~8년 이상 모두 마치고 학원 차원에서 졸업을 시킨 학생들을 의미합니다.</p>
        <div class="rv-mini-grid" id="home-reviews-grid"><div class="loading">불러오는 중…</div></div>
        <div class="sub-more"><a class="btn ghost sm" href="/reviews">후기 전체 보기 · 후기 쓰기 &rarr;</a></div>
      </div>
    </section>

    <div class="star-band red"></div>

    <section class="section">
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">Contact</span>
          <h2>상담 문의</h2>
          <p>편한 시간에 온라인으로 상담 신청을 남겨 주세요. (전화로 문의하셔도 됩니다)</p>
        </div>
        <div class="contact-grid" id="home-contact"></div>
      </div>
    </section>
  `));

  renderContactGrid($("#home-contact", view), settings);

  // 졸업생 명단은 이 Result 섹션에만 남아 있다(별도 메뉴는 후기로 바뀌었다).
  loadAlumniInto($("#home-alumni", view));

  // 후기는 홈에서 읽기만 한다. 쓰기·수정·삭제는 /reviews 화면 몫이다.
  loadHomeReviewsInto($("#home-reviews-grid", view));

  // 첫 화면의 "졸업생 · 학부모 후기" 버튼은 페이지를 옮기지 않고 아래 카드로 내려간다.
  const heroBtn = $("#hero-reviews", view);
  if (heroBtn) {
    heroBtn.addEventListener("click", (e) => {
      const target = $("#home-reviews", view);
      if (!target) return; // 못 찾으면 브라우저 기본 동작(#이동)에 맡긴다
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

/* 졸업생 카드 — 홈 Result 섹션에서 쓴다. */
function alumniCardHtml(a) {
  return `<div class="alumni-card">
    ${a.year ? `<div class="yr">${esc(a.year)}</div>` : ""}
    <div class="nm">${esc(a.name)}</div>
    <div class="dest">${esc(a.dest || "")}</div>
    ${a.years ? `<div class="yrs">${esc(a.years)}</div>` : ""}
    ${a.note ? `<div class="note">${esc(a.note)}</div>` : ""}
  </div>`;
}

async function loadAlumniInto(root) {
  if (!root) return;
  try {
    const { alumni } = await apiGet("public/alumni");
    root.innerHTML =
      alumni && alumni.length
        ? alumni.map(alumniCardHtml).join("")
        : `<div class="empty">아직 등록된 졸업생이 없습니다.</div>`;
  } catch (e) {
    root.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

/* ============================================================
   홈에 얹는 후기 카드 (조회 전용)
   글을 쓰거나 고치는 일은 /reviews 화면에서만 한다. 여기서는 최근 것만 보여준다.
   ============================================================ */

const HOME_REVIEW_COUNT = 6;

const reviewPhotoUrl = (key) => `/api/media/file/${key.split("/").map(encodeURIComponent).join("/")}`;

function reviewMiniCardHtml(r) {
  const cover = (r.photos || [])[0];
  return `<button type="button" class="rv-mini" data-id="${r.id}">
    ${cover ? `<span class="thumb"><img src="${esc(reviewPhotoUrl(cover.r2_key))}" alt="" loading="lazy"></span>` : ""}
    <span class="head">
      <span class="who">${esc(r.author_name)}${r.author_role === "admin" ? ` <span class="badge red">원장</span>` : ""}</span>
      <span class="date">${esc(kstDate(r.created_at))}</span>
    </span>
    ${r.title ? `<span class="ttl">${esc(r.title)}</span>` : ""}
    <span class="txt">${esc(r.body)}</span>
    <span class="more">자세히 보기 &rarr;</span>
  </button>`;
}

/** 카드를 누르면 글 전체와 사진을 창으로 띄운다 (읽기만 된다). */
function openReviewView(r) {
  const photos = r.photos || [];
  const body = html(`<div class="rv-view">
    <div class="rv-view-meta">
      <span class="who"><b>${esc(r.author_name)}</b>${r.author_role === "admin" ? ` <span class="badge red">원장</span>` : ""}</span>
      <span class="date">${esc(kstDate(r.created_at))}</span>
    </div>
    ${r.title ? `<h4 class="rv-view-title">${esc(r.title)}</h4>` : ""}
    ${r.body ? `<div class="rv-body">${esc(r.body)}</div>` : ""}
    ${photos.length
      ? `<div class="rv-view-hint">사진을 누르면 크게 볼 수 있습니다.</div>
         <div class="rv-view-photos">${photos
           .map(
             (p) => `<button type="button" class="rv-view-photo" data-src="${esc(reviewPhotoUrl(p.r2_key))}">
               <img src="${esc(reviewPhotoUrl(p.r2_key))}" alt="후기 사진" loading="lazy">
             </button>`
           )
           .join("")}</div>`
      : ""}
  </div>`);

  // 손편지처럼 글씨가 작은 사진은 창 안에서 다 읽히지 않는다.
  // 눌러서 화면 전체로 키워 볼 수 있게 한다.
  for (const b of $$(".rv-view-photo[data-src]", body)) {
    b.addEventListener("click", () => openLightbox(b.dataset.src, "photo"));
  }

  openModal({ title: "졸업생 · 학부모 후기", body, wide: true });
}

async function loadHomeReviewsInto(root) {
  if (!root) return;
  try {
    const { reviews } = await apiGet("reviews");
    const list = (reviews || []).slice(0, HOME_REVIEW_COUNT);
    if (!list.length) {
      root.innerHTML = `<div class="empty">아직 등록된 후기가 없습니다.<br>첫 번째 후기를 남겨 주세요.</div>`;
      return;
    }
    root.innerHTML = list.map(reviewMiniCardHtml).join("");
    for (const card of $$(".rv-mini[data-id]", root)) {
      const r = list.find((x) => String(x.id) === card.dataset.id);
      card.addEventListener("click", () => openReviewView(r));
    }
  } catch (e) {
    root.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

function renderContactGrid(root, s) {
  if (!root) return;
  const items = [
    ["Office", s.phone, `tel:${(s.phone || "").replace(/-/g, "")}`],
    ["Mobile", s.mobile, `tel:${(s.mobile || "").replace(/-/g, "")}`],
    // 이메일은 링크로 걸지 않는다(메일 앱이 열리는 대신 그대로 보이게).
    ["E-mail", s.email, null],
  ].filter(([, v]) => v);

  // 위치는 주소만으로 찾아오기 어려워서, 옆에 지도로 바로 넘어가는 링크를 둔다.
  const addressItem = s.address
    ? `<div class="contact-item">
        <div class="k">위치</div>
        <div class="v">${esc(s.address)}
          <a class="map-link" href="${esc(mapUrl(s))}" target="_blank" rel="noopener noreferrer">(지도보기)</a>
        </div>
      </div>`
    : "";

  root.innerHTML =
    items
      .map(
        ([k, v, href]) => `<div class="contact-item">
          <div class="k">${esc(k)}</div>
          <div class="v">${href ? `<a href="${esc(href)}">${esc(v)}</a>` : esc(v)}</div>
        </div>`
      )
      .join("") +
    addressItem +
    // 전화가 어려운 시간에도 남길 수 있도록, 연락처 옆에 신청 창구를 같이 둔다.
    `<a class="contact-item cta" href="/contact">
      <div class="k">상담신청 · 문의</div>
      <div class="v">온라인으로 남기기 &rarr;</div>
    </a>`;
}

/* 푸터 연락처 */
export async function fillFooter() {
  const el = $("#footer-contact");
  if (!el) return;
  const s = await getSettings().catch(() => ({}));
  const rows = [
    ["전화", s.phone],
    ["휴대폰", s.mobile],
    ["이메일", s.email],
  ].filter(([, v]) => v);

  el.innerHTML =
    rows.map(([k, v]) => `<div><span>${esc(k)}</span> ${esc(v)}</div>`).join("") +
    (s.address
      ? `<div><span>위치</span> ${esc(s.address)}
          <a class="map-link" href="${esc(mapUrl(s))}" target="_blank" rel="noopener noreferrer">(지도보기)</a>
        </div>`
      : "") +
    `<div><span>상담</span> <a class="footer-cta" href="/contact">상담신청 · 문의 &rarr;</a></div>`;
}

/* ============================================================
   학원 소식·사진 — 사진 / 동영상
   ============================================================ */

export async function renderAbout(view) {
  view.innerHTML = "";
  view.append(html(`
    <div class="page-head"><div class="wrap">
      <h1>학원 소식·사진</h1>
      <p>수업 모습과 학원 공간을 사진·영상으로 소개합니다.</p>
    </div></div>
    <section class="section"><div class="wrap">
      <div id="media-root"><div class="loading">불러오는 중…</div></div>
    </div></section>
    <section class="section soft"><div class="wrap">
      <div class="section-head"><span class="eyebrow">Location</span><h2>찾아오시는 길</h2></div>
      <div class="contact-grid" id="about-contact"></div>
    </div></section>
  `));

  getSettings()
    .then((s) => renderContactGrid($("#about-contact", view), s))
    .catch(() => {});

  try {
    const { media } = await apiGet("public/media");
    const root = $("#media-root", view);
    if (!media || !media.length) {
      root.innerHTML = `<div class="empty">아직 등록된 사진·동영상이 없습니다.<br>관리자 화면에서 올릴 수 있습니다.</div>`;
      return;
    }
    root.innerHTML = `<div class="media-grid">${media.map(mediaCardHtml).join("")}</div>`;
    for (const btn of $$(".media-item .frame[data-src]", root)) {
      btn.addEventListener("click", () => openLightbox(btn.dataset.src, btn.dataset.kind));
    }
  } catch (e) {
    $("#media-root", view).innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

/** 업로드 파일이면 R2 경로로, 링크면 그대로 */
export function mediaSrc(m) {
  if (m.r2_key) return `/api/media/file/${m.r2_key.split("/").map(encodeURIComponent).join("/")}`;
  return m.url || "";
}

/** 유튜브 주소에서 영상 ID를 뽑는다 (watch?v= / youtu.be / shorts / embed 모두 지원) */
export function youtubeId(url) {
  const m = String(url || "").match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/
  );
  return m ? m[1] : null;
}

function mediaCardHtml(m) {
  const src = mediaSrc(m);
  const cap = `<div class="cap">
      <b>${esc(m.title || "")}</b>
      ${m.description ? `<span>${esc(m.description)}</span>` : ""}
    </div>`;

  if (m.kind === "youtube") {
    const id = youtubeId(m.url);
    if (id) {
      return `<div class="media-item">
        <div class="frame"><iframe src="https://www.youtube.com/embed/${esc(id)}"
          title="${esc(m.title || "동영상")}" loading="lazy" allowfullscreen
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe></div>
        ${cap}</div>`;
    }
    return `<div class="media-item"><div class="frame"></div>${cap}</div>`;
  }

  if (m.kind === "video") {
    return `<div class="media-item">
      <button type="button" class="frame" data-src="${esc(src)}" data-kind="video">
        <video src="${esc(src)}#t=0.5" preload="metadata" muted playsinline></video>
        <span class="play">&#9654;</span>
      </button>
      ${cap}</div>`;
  }

  return `<div class="media-item">
    <button type="button" class="frame" data-src="${esc(src)}" data-kind="photo">
      <img src="${esc(src)}" alt="${esc(m.title || "학원 사진")}" loading="lazy">
    </button>
    ${cap}</div>`;
}

function openLightbox(src, kind) {
  const isVideo = kind === "video";
  const inner = isVideo
    ? `<video src="${esc(src)}" controls autoplay playsinline></video>`
    : `<img src="${esc(src)}" alt="">
       <div class="lb-hint">사진을 누르면 더 크게 · 다시 누르면 원래대로</div>`;
  const box = html(`<div class="lightbox"><button class="close" type="button" aria-label="닫기">&times;</button>${inner}</div>`);

  // 손편지처럼 세로로 긴 사진은 화면에 맞추면 글씨가 작아 읽기 어렵다.
  // 사진을 누르면 폭을 꽉 채워 키우고, 넘치는 부분은 스크롤로 본다.
  if (!isVideo) {
    $("img", box).addEventListener("click", () => {
      box.classList.toggle("zoom");
      box.scrollTop = 0;
    });
  }
  const close = () => {
    box.remove();
    document.removeEventListener("keydown", onKey, true);
  };
  // 후기 창 위에 겹쳐 뜰 수 있어서, ESC 는 위에 있는 이 사진 창만 닫는다.
  // (내려가는 단계에서 먼저 가로채 아래쪽 창의 ESC 처리를 막는다)
  const onKey = (e) => {
    if (e.key !== "Escape") return;
    e.stopImmediatePropagation();
    close();
  };
  box.addEventListener("click", (e) => {
    if (e.target === box) close();
  });
  $(".close", box).addEventListener("click", close);
  document.addEventListener("keydown", onKey, true);
  document.body.append(box);
}
