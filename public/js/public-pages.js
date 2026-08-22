/**
 * 로그인 없이 볼 수 있는 화면들
 *   학원소개(홈) · 학원 소식
 *   (시간표·졸업생 소개 화면은 걷어냈고, 졸업생 명단은 홈 Result 섹션에 남아 있다)
 */
import {
  $, $$, html, esc, apiGet,
} from "./core.js";

/* 여러 화면이 같이 쓰는 값들은 한 번만 받아서 들고 있는다. */
let cache = { settings: null, updated: null, classes: null };

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
            <a class="btn outline" href="/reviews">후기 보기</a>
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
    view.append(html(`<div class="notice-strip">
      ${isNew ? `<span class="new-badge">NEW</span>` : ""}${esc(banner)}
    </div>`));
  }

  // PC 로 보는 중이면 휴대폰으로 옮겨 갈 수 있게 QR 을 오른쪽에 작게 둔다.
  // (이미 휴대폰으로 보고 있다면 쓸모가 없어 CSS 에서 감춘다)
  view.append(html(`<div class="wrap qr-row">
    <div class="qr-box">
      <img src="/assets/qr-site.png" alt="www.julieenglish.co.kr 접속 QR 코드" width="72" height="72">
      <span>휴대폰으로<br>보기</span>
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
            <p>소리부터 차근차근. 읽기의 성취감도 느끼고, 재미있는 수업방식</p>
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
            <p>수업이 없는 날에도 과제로 이어집니다. 매일 조금씩이 결국 실력이 됩니다.</p>
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
              <li>캐나다 영어 교사</li>
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
      </div>
    </section>

    <div class="star-band red"></div>

    <section class="section">
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">Contact</span>
          <h2>상담 문의</h2>
          <p>전화로 바로 문의하시거나, 편한 시간에 온라인으로 상담신청을 남겨 주세요.</p>
        </div>
        <div class="contact-grid" id="home-contact"></div>
      </div>
    </section>
  `));

  renderContactGrid($("#home-contact", view), settings);

  // 졸업생 명단은 이 Result 섹션에만 남아 있다(별도 메뉴는 후기로 바뀌었다).
  loadAlumniInto($("#home-alumni", view));
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

function renderContactGrid(root, s) {
  if (!root) return;
  const items = [
    ["Office", s.phone, `tel:${(s.phone || "").replace(/-/g, "")}`],
    ["Mobile", s.mobile, `tel:${(s.mobile || "").replace(/-/g, "")}`],
    // 이메일은 링크로 걸지 않는다(메일 앱이 열리는 대신 그대로 보이게).
    ["E-mail", s.email, null],
    ["위치", s.address, null],
  ].filter(([, v]) => v);

  root.innerHTML =
    items
      .map(
        ([k, v, href]) => `<div class="contact-item">
          <div class="k">${esc(k)}</div>
          <div class="v">${href ? `<a href="${esc(href)}">${esc(v)}</a>` : esc(v)}</div>
        </div>`
      )
      .join("") +
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
    ["위치", s.address],
  ].filter(([, v]) => v);

  el.innerHTML =
    rows.map(([k, v]) => `<div><span>${esc(k)}</span> ${esc(v)}</div>`).join("") +
    `<div><span>상담</span> <a class="footer-cta" href="/contact">상담신청 · 문의 &rarr;</a></div>`;
}

/* ============================================================
   학원 소식 — 사진 / 동영상
   ============================================================ */

export async function renderAbout(view) {
  view.innerHTML = "";
  view.append(html(`
    <div class="page-head"><div class="wrap">
      <h1>학원 소식</h1>
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
  const inner =
    kind === "video"
      ? `<video src="${esc(src)}" controls autoplay playsinline></video>`
      : `<img src="${esc(src)}" alt="">`;
  const box = html(`<div class="lightbox"><button class="close" type="button" aria-label="닫기">&times;</button>${inner}</div>`);
  const close = () => {
    box.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => e.key === "Escape" && close();
  box.addEventListener("click", (e) => {
    if (e.target === box) close();
  });
  $(".close", box).addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  document.body.append(box);
}
