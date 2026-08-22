/**
 * 로그인 없이 볼 수 있는 화면들
 *   학원소개(홈) · 시간표 안내 · 졸업생 소개 · 학원 안내
 */
import {
  $, $$, html, esc, apiGet,
  DAY_KR, JS_DAY_TO_CODE, daysToKr, toISODate, timeRange,
  formatDateKr, EVENT_KIND_KR,
} from "./core.js";

/* 여러 화면이 같이 쓰는 값들은 한 번만 받아서 들고 있는다. */
let cache = { settings: null, classes: null };

export async function getSettings() {
  if (!cache.settings) {
    const { settings } = await apiGet("public/settings");
    cache.settings = settings || {};
  }
  return cache.settings;
}
export async function getClasses(force = false) {
  if (!cache.classes || force) {
    const { classes } = await apiGet("public/classes");
    cache.classes = classes || [];
  }
  return cache.classes;
}
export function clearCache() {
  cache = { settings: null, classes: null };
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
            동백에서 19년째, 한 아이를 오래 지켜보며 가르칩니다.
          </p>
          <div class="hero-actions">
            <a class="btn" href="#/timetable">시간표 보기</a>
            <a class="btn outline" href="#/login">나의 수업 확인</a>
          </div>
        </div>
        <div class="hero-logo"><img src="/assets/logo-512.png" alt="쥴리 잉글리쉬 로고"></div>
      </div>
    </section>
    <div class="star-band"></div>
  `));

  if (banner) {
    view.append(html(`<div class="notice-strip">${esc(banner)}</div>`));
  }

  view.append(html(`
    <section class="section">
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">Why Julie&rsquo;s</span>
          <h2>19년 전통의 검증된 영어 전문가</h2>
          <p>2007년부터 동백에서 이어온 지도 경험, 그리고 분당 정자동 영어유치원·어학원 티칭 경력.</p>
        </div>
        <div class="feature-grid">
          <div class="feature">
            <span class="num">01</span>
            <h3>재미있는 파닉스</h3>
            <p>소리부터 차근차근. &ldquo;읽기가 되는&rdquo; 파닉스로 아이가 스스로 문장을 읽어냅니다.</p>
          </div>
          <div class="feature">
            <span class="num">02</span>
            <h3>초·중·고 내신 선행</h3>
            <p>학교 진도를 앞서가는 선행과 시험 기간 집중 내신 대비를 함께 합니다.</p>
          </div>
          <div class="feature">
            <span class="num">03</span>
            <h3>English Only 수업</h3>
            <p>수업 시간에는 영어만 씁니다. 온라인·오프라인 수업을 연계해 감각을 유지합니다.</p>
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
              <li>온라인 / 오프라인 수업 연계</li>
              <li>주 5일 과제 부여</li>
              <li class="hi">English Only 수업</li>
            </ul>
          </div>
          <div class="info-col red">
            <h3>Julie Teacher</h3>
            <ul>
              <li>한국외국어대학교 학사 / 석사 졸업</li>
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
          <h2>세 가지 과정</h2>
          <p>아이의 지금 수준에서 시작해, 다음 단계로 자연스럽게 넘어갑니다.</p>
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
        </div>
      </div>
    </section>

    <section class="section soft">
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">Result</span>
          <h2>매년 명문대 / 명문고 합격생 배출</h2>
        </div>
        <div class="achieve">
          <div class="item">
            <div class="big">고려대 사범대</div>
            <div class="lbl">2026학년도 대입 합격 &middot; 김 O 수</div>
          </div>
          <div class="item">
            <div class="big">43%</div>
            <div class="lbl">2025년 초·중1 기말 내신대비 재원생 백점 만점 비율</div>
          </div>
          <div class="item">
            <div class="big">5~9년</div>
            <div class="lbl">명문고·명문대 합격생의 평균 수강 기간</div>
          </div>
        </div>
        <p style="text-align:center;margin-top:22px">
          <a class="btn ghost" href="#/alumni">졸업생 소개 보기</a>
        </p>
      </div>
    </section>

    <div class="star-band red"></div>

    <section class="section">
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">Contact</span>
          <h2>상담 문의</h2>
          <p>수업 상담은 전화 또는 카카오 채널로 편하게 문의해 주세요.</p>
        </div>
        <div class="contact-grid" id="home-contact"></div>
      </div>
    </section>
  `));

  renderContactGrid($("#home-contact", view), settings);
}

function renderContactGrid(root, s) {
  if (!root) return;
  const items = [
    ["Office", s.phone, `tel:${(s.phone || "").replace(/-/g, "")}`],
    ["Mobile", s.mobile, `tel:${(s.mobile || "").replace(/-/g, "")}`],
    ["E-mail", s.email, `mailto:${s.email || ""}`],
    ["카카오 채널", s.kakao, null],
    ["위치", s.address, null],
  ].filter(([, v]) => v);

  root.innerHTML = items
    .map(
      ([k, v, href]) => `<div class="contact-item">
        <div class="k">${esc(k)}</div>
        <div class="v">${href ? `<a href="${esc(href)}">${esc(v)}</a>` : esc(v)}</div>
      </div>`
    )
    .join("");
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
  el.innerHTML = rows.map(([k, v]) => `<div><span>${esc(k)}</span> ${esc(v)}</div>`).join("");
}

/* ============================================================
   시간표 안내 — 달력 + 그날의 시간별 클래스
   ============================================================ */

export async function renderTimetable(view) {
  view.innerHTML = "";
  view.append(html(`
    <div class="page-head"><div class="wrap">
      <h1>시간표 안내</h1>
      <p>날짜를 누르면 그날 진행되는 수업이 아래에 시간 순서대로 나옵니다.</p>
    </div></div>
    <section class="section tight"><div class="wrap">
      <div class="cal-head">
        <div class="cal-title" id="cal-title">&nbsp;</div>
        <div class="cal-nav">
          <button type="button" id="cal-prev" aria-label="이전 달">&lsaquo;</button>
          <button type="button" class="today-btn" id="cal-today">오늘</button>
          <button type="button" id="cal-next" aria-label="다음 달">&rsaquo;</button>
        </div>
      </div>
      <div class="calendar" id="calendar"></div>
      <div class="day-list" id="day-list"></div>
    </div></section>
    <section class="section soft"><div class="wrap">
      <div class="section-head"><span class="eyebrow">Weekly</span><h2>요일별 정규 수업</h2>
        <p>월·수·금은 60분, 화·목은 90분 수업입니다.</p></div>
      <div class="week-grid" id="week-grid"></div>
    </div></section>
  `));

  const classes = await getClasses();
  renderWeekGrid($("#week-grid", view), classes);

  const today = new Date();
  const state = {
    year: today.getFullYear(),
    month: today.getMonth(), // 0-based
    selected: toISODate(today),
    events: [],
  };

  // 날짜를 고르면 달력(선택 표시)과 아래 목록을 함께 다시 그린다.
  const redraw = () => {
    drawCalendar(view, state, classes, onPick);
    drawDayList(view, state, classes);
  };
  const onPick = (iso) => {
    state.selected = iso;
    redraw();
  };
  const reload = async () => {
    const monthKey = `${state.year}-${String(state.month + 1).padStart(2, "0")}`;
    try {
      const { events } = await apiGet(`public/events?month=${monthKey}`);
      state.events = events || [];
    } catch {
      state.events = [];
    }
    redraw();
  };

  $("#cal-prev", view).addEventListener("click", () => {
    state.month--;
    if (state.month < 0) { state.month = 11; state.year--; }
    reload();
  });
  $("#cal-next", view).addEventListener("click", () => {
    state.month++;
    if (state.month > 11) { state.month = 0; state.year++; }
    reload();
  });
  $("#cal-today", view).addEventListener("click", () => {
    const n = new Date();
    state.year = n.getFullYear();
    state.month = n.getMonth();
    state.selected = toISODate(n);
    reload();
  });

  await reload();
}

/** 특정 날짜(iso)에 열리는 정규 클래스 목록 */
function classesOnDate(classes, iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const code = JS_DAY_TO_CODE[new Date(y, m - 1, d).getDay()];
  return classes
    .filter((c) => String(c.days || "").split(",").includes(code))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}

function drawCalendar(view, state, classes, onPick) {
  const root = $("#calendar", view);
  const title = $("#cal-title", view);
  if (!root) return;

  title.textContent = `${state.year}년 ${state.month + 1}월`;

  const first = new Date(state.year, state.month, 1);
  const startOffset = first.getDay(); // 0=일
  const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
  const todayIso = toISODate(new Date());

  const eventsByDate = {};
  for (const ev of state.events) {
    (eventsByDate[ev.event_date] = eventsByDate[ev.event_date] || []).push(ev);
  }

  const cells = [];
  const dowNames = ["일", "월", "화", "수", "목", "금", "토"];
  cells.push(
    ...dowNames.map(
      (n, i) => `<div class="dow ${i === 0 ? "sun" : i === 6 ? "sat" : ""}">${n}</div>`
    )
  );

  // 앞쪽 빈칸 = 지난달 날짜
  const prevMonthDays = new Date(state.year, state.month, 0).getDate();
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push(`<div class="day other"><span class="dnum">${prevMonthDays - i}</span></div>`);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${state.year}-${String(state.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow = new Date(state.year, state.month, d).getDay();
    const cls = classesOnDate(classes, iso);
    const evs = eventsByDate[iso] || [];

    const pills = [];
    for (const ev of evs.slice(0, 2)) {
      pills.push(`<span class="pill ev">${esc(ev.title)}</span>`);
    }
    for (const c of cls.slice(0, Math.max(0, 2 - pills.length))) {
      pills.push(
        `<span class="pill" style="background:${esc(c.color || "#0C3190")}">${esc(c.start_time)} ${esc(c.name)}</span>`
      );
    }
    const total = evs.length + cls.length;
    const moreCount = total - pills.length;

    cells.push(`<button type="button" class="day${dow === 0 ? " sun" : dow === 6 ? " sat" : ""}${iso === todayIso ? " today" : ""}${iso === state.selected ? " selected" : ""}" data-date="${iso}">
      <span class="dnum">${d}</span>
      ${pills.join("")}
      ${moreCount > 0 ? `<span class="more">+${moreCount}</span>` : ""}
    </button>`);
  }

  // 뒤쪽 빈칸 = 다음달 날짜 (7의 배수로 맞춘다)
  const filled = startOffset + daysInMonth;
  const tail = (7 - (filled % 7)) % 7;
  for (let i = 1; i <= tail; i++) {
    cells.push(`<div class="day other"><span class="dnum">${i}</span></div>`);
  }

  root.innerHTML = cells.join("");
  for (const btn of $$(".day[data-date]", root)) {
    btn.addEventListener("click", () => onPick(btn.dataset.date));
  }
}

function drawDayList(view, state, classes) {
  const root = $("#day-list", view);
  if (!root) return;

  const iso = state.selected;
  const cls = classesOnDate(classes, iso);
  const evs = state.events.filter((e) => e.event_date === iso);

  const parts = [`<h3>${esc(formatDateKr(iso))}</h3>`];

  if (!cls.length && !evs.length) {
    parts.push(`<div class="empty">이 날은 예정된 수업이 없습니다.</div>`);
  } else {
    for (const ev of evs) {
      const t = ev.start_time ? `${ev.start_time}${ev.end_time ? " ~ " + ev.end_time : ""}` : "종일";
      parts.push(`<div class="slot event">
        <div class="time">${esc(t)}<small>${esc(EVENT_KIND_KR[ev.kind] || ev.kind)}</small></div>
        <div class="bar" style="background:#e60013"></div>
        <div class="body">
          <div class="nm">${esc(ev.title)}</div>
          <div class="meta">${esc([ev.class_name, ev.memo].filter(Boolean).join(" · ")) || "&nbsp;"}</div>
        </div>
      </div>`);
    }
    for (const c of cls) {
      parts.push(`<div class="slot">
        <div class="time">${esc(timeRange(c.start_time, c.duration_min))}<small>${esc(c.duration_min)}분</small></div>
        <div class="bar" style="background:${esc(c.color || "#0C3190")}"></div>
        <div class="body">
          <div class="nm">${esc(c.name)}</div>
          <div class="meta">${esc([c.level, daysToKr(c.days), c.teacher, c.room].filter(Boolean).join(" · "))}</div>
        </div>
      </div>`);
    }
  }
  root.innerHTML = parts.join("");
}

function renderWeekGrid(root, classes) {
  if (!root) return;
  const cols = ["MON", "TUE", "WED", "THU", "FRI"];
  root.innerHTML = cols
    .map((code) => {
      const list = classes
        .filter((c) => String(c.days || "").split(",").includes(code))
        .sort((a, b) => a.start_time.localeCompare(b.start_time));
      const items = list.length
        ? list
            .map(
              (c) => `<li style="border-left-color:${esc(c.color || "#0C3190")}">
                <b>${esc(c.name)}</b>
                <span>${esc(timeRange(c.start_time, c.duration_min))} · ${esc(c.duration_min)}분${c.level ? " · " + esc(c.level) : ""}</span>
              </li>`
            )
            .join("")
        : `<div class="none">수업 없음</div>`;
      return `<div class="week-col"><h4>${DAY_KR[code]}요일</h4><ul>${items}</ul></div>`;
    })
    .join("");
}

/* ============================================================
   졸업생 소개
   ============================================================ */

export async function renderAlumni(view) {
  view.innerHTML = "";
  view.append(html(`
    <div class="page-head"><div class="wrap">
      <h1>졸업생 소개</h1>
      <p>최소 5년에서 최대 9년까지 꾸준히 함께한 학생들이 만들어낸 결과입니다.</p>
    </div></div>
    <section class="section"><div class="wrap">
      <div class="alumni-grid" id="alumni-grid"><div class="loading">불러오는 중…</div></div>
    </div></section>
  `));

  try {
    const { alumni } = await apiGet("public/alumni");
    const root = $("#alumni-grid", view);
    if (!alumni || !alumni.length) {
      root.outerHTML = `<div class="empty">아직 등록된 졸업생이 없습니다.</div>`;
      return;
    }
    root.innerHTML = alumni
      .map(
        (a) => `<div class="alumni-card">
          ${a.year ? `<div class="yr">${esc(a.year)}</div>` : ""}
          <div class="nm">${esc(a.name)}</div>
          <div class="dest">${esc(a.dest || "")}</div>
          ${a.years ? `<div class="yrs">${esc(a.years)}</div>` : ""}
          ${a.note ? `<div class="note">${esc(a.note)}</div>` : ""}
        </div>`
      )
      .join("");
  } catch (e) {
    $("#alumni-grid", view).outerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

/* ============================================================
   학원 안내 — 사진 / 동영상
   ============================================================ */

export async function renderAbout(view) {
  view.innerHTML = "";
  view.append(html(`
    <div class="page-head"><div class="wrap">
      <h1>학원 안내</h1>
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
