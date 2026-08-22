/**
 * 로그인 · 회원가입 · 나의 수업 · 내 정보
 */
import {
  $, $$, html, esc, apiGet, apiPost, apiPatch, toast, session, setUser, refreshSession,
  readForm, daysToKr, timeRange, formatDateKr, EVENT_KIND_KR, confirmBox,
} from "./core.js";

/* ============================================================
   로그인 / 회원가입 (한 화면 안에서 탭으로 전환)
   ============================================================ */

export function renderLogin(view, { mode = "login" } = {}) {
  view.innerHTML = "";
  view.append(html(`
    <div class="page-head"><div class="wrap">
      <h1>로그인</h1>
      <p>학원생·학부모님은 발급받은 아이디로 로그인하면 나의 수업을 확인할 수 있습니다.</p>
    </div></div>
    <section class="section"><div class="wrap"><div id="auth-card"></div></div></section>
  `));

  const root = $("#auth-card", view);
  const draw = (m) => (m === "signup" ? drawSignup(root, draw) : drawLogin(root, draw));
  draw(mode);
}

function drawLogin(root, switchTo) {
  root.innerHTML = "";
  const card = html(`<div class="panel-card">
    <form id="login-form" novalidate>
      <div class="field">
        <label for="li-id">아이디</label>
        <input id="li-id" name="login_id" type="text" autocomplete="username" placeholder="아이디 또는 이메일" required>
      </div>
      <div class="field">
        <label for="li-pw">비밀번호</label>
        <input id="li-pw" name="password" type="password" autocomplete="current-password" required>
      </div>
      <button class="btn block" type="submit" id="li-submit">로그인</button>
      <p style="text-align:center;margin:18px 0 0;font-size:14px;color:var(--text-muted)">
        아직 계정이 없으신가요?
        <a href="#" id="go-signup" style="color:var(--red);font-weight:600">회원가입</a>
      </p>
    </form>
  </div>`);
  root.append(card);

  $("#go-signup", card).addEventListener("click", (e) => {
    e.preventDefault();
    switchTo("signup");
  });

  $("#login-form", card).addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#li-submit", card);
    const data = readForm(card);
    if (!data.login_id || !data.password) return toast("아이디와 비밀번호를 입력해 주세요.", true);

    btn.disabled = true;
    btn.textContent = "확인 중…";
    try {
      const { user } = await apiPost("auth/login", { login_id: data.login_id.trim(), password: data.password });
      setUser(user);
      toast(`${user.name}님, 환영합니다.`);
      location.hash = user.role === "admin" ? "#/admin" : "#/my";
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
      btn.textContent = "로그인";
    }
  });
}

function drawSignup(root, switchTo) {
  root.innerHTML = "";
  const card = html(`<div class="panel-card">
    <h2 style="font-size:21px;color:var(--navy);margin-bottom:6px">회원가입</h2>
    <p style="margin:0 0 20px;font-size:14px;color:var(--text-muted)">
      가입 신청 후 원장님 승인이 끝나면 로그인할 수 있습니다.
    </p>
    <form id="signup-form" novalidate>
      <div class="field">
        <label for="su-id">아이디 <span style="color:var(--red)">*</span></label>
        <div class="field-row">
          <input id="su-id" name="login_id" type="text" autocomplete="username" placeholder="영문·숫자 4자 이상">
          <button class="btn ghost" type="button" id="su-check">중복확인</button>
        </div>
        <div class="hint" id="su-id-hint">아이디는 영문, 숫자와 . _ - @ 를 쓸 수 있습니다.</div>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="su-pw">비밀번호 <span style="color:var(--red)">*</span></label>
          <input id="su-pw" name="password" type="password" autocomplete="new-password" placeholder="4자 이상">
        </div>
        <div class="field">
          <label for="su-pw2">비밀번호 확인 <span style="color:var(--red)">*</span></label>
          <input id="su-pw2" type="password" autocomplete="new-password">
        </div>
      </div>

      <div class="field">
        <label for="su-name">학생 이름 <span style="color:var(--red)">*</span></label>
        <input id="su-name" name="name" type="text" placeholder="홍길동">
      </div>

      <div class="grid-3">
        <div class="field">
          <label for="su-school">학교</label>
          <input id="su-school" name="school" type="text" placeholder="초당초">
        </div>
        <div class="field">
          <label for="su-grade">학년</label>
          <input id="su-grade" name="grade" type="text" placeholder="4학년">
        </div>
        <div class="field">
          <label for="su-class">반</label>
          <input id="su-class" name="class_no" type="text" placeholder="3반">
        </div>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="su-phone">전화번호</label>
          <input id="su-phone" name="phone" type="tel" placeholder="010-0000-0000">
        </div>
        <div class="field">
          <label for="su-email">이메일</label>
          <input id="su-email" name="email" type="email" placeholder="name@example.com">
        </div>
      </div>

      <button class="btn red block" type="submit" id="su-submit" style="margin-top:6px">가입 신청</button>
      <p style="text-align:center;margin:18px 0 0;font-size:14px;color:var(--text-muted)">
        이미 계정이 있으신가요?
        <a href="#" id="go-login" style="color:var(--navy);font-weight:600">로그인</a>
      </p>
    </form>
  </div>`);
  root.append(card);

  $("#go-login", card).addEventListener("click", (e) => {
    e.preventDefault();
    switchTo("login");
  });

  const idInput = $("#su-id", card);
  const hint = $("#su-id-hint", card);
  // 중복확인을 통과한 아이디를 기억해 두고, 값이 바뀌면 다시 확인하게 만든다.
  let checkedId = null;

  idInput.addEventListener("input", () => {
    if (checkedId !== idInput.value.trim()) {
      checkedId = null;
      hint.className = "hint";
      hint.textContent = "아이디는 영문, 숫자와 . _ - @ 를 쓸 수 있습니다.";
    }
  });

  const doCheck = async () => {
    const v = idInput.value.trim();
    if (!v) {
      hint.className = "hint err";
      hint.textContent = "아이디를 입력해 주세요.";
      return false;
    }
    try {
      const r = await apiGet(`auth/check-id?login_id=${encodeURIComponent(v)}`);
      hint.className = `hint ${r.available ? "ok" : "err"}`;
      hint.textContent = r.reason;
      checkedId = r.available ? v : null;
      return r.available;
    } catch (e) {
      hint.className = "hint err";
      hint.textContent = e.message;
      return false;
    }
  };
  $("#su-check", card).addEventListener("click", doCheck);

  $("#signup-form", card).addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = readForm(card);
    const pw2 = $("#su-pw2", card).value;

    if (!data.login_id.trim()) return toast("아이디를 입력해 주세요.", true);
    if (!data.password) return toast("비밀번호를 입력해 주세요.", true);
    if (data.password !== pw2) return toast("비밀번호 확인이 일치하지 않습니다.", true);
    if (!data.name.trim()) return toast("학생 이름을 입력해 주세요.", true);

    // 중복확인을 안 눌렀으면 제출 직전에 대신 확인해 준다.
    if (checkedId !== data.login_id.trim()) {
      const ok = await doCheck();
      if (!ok) return toast("아이디를 다시 확인해 주세요.", true);
    }

    const btn = $("#su-submit", card);
    btn.disabled = true;
    btn.textContent = "신청 중…";
    try {
      const r = await apiPost("auth/signup", {
        login_id: data.login_id.trim(),
        password: data.password,
        name: data.name.trim(),
        school: data.school,
        grade: data.grade,
        class_no: data.class_no,
        phone: data.phone,
        email: data.email,
      });
      root.innerHTML = `<div class="panel-card" style="text-align:center">
        <div style="font-size:44px;line-height:1">&#9989;</div>
        <h2 style="font-size:20px;color:var(--navy);margin:12px 0 8px">가입 신청이 접수되었습니다</h2>
        <p style="font-size:14.5px;color:var(--text-muted);margin:0 0 20px">${esc(r.message)}</p>
        <a class="btn" href="#/">홈으로</a>
      </div>`;
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
      btn.textContent = "가입 신청";
    }
  });
}

/* ============================================================
   나의 수업
   ============================================================ */

export async function renderMy(view) {
  // 로그인 전이면 로그인 화면을 대신 보여준다 ("나의 수업"을 누르면 로그인으로).
  if (!session.isLoggedIn) {
    await refreshSession();
    if (!session.isLoggedIn) {
      renderLogin(view);
      return;
    }
  }

  view.innerHTML = "";
  view.append(html(`
    <section class="section"><div class="wrap">
      <div id="my-root"><div class="loading">불러오는 중…</div></div>
    </div></section>
  `));

  const root = $("#my-root", view);
  const u = session.user;

  try {
    const { classes, events } = await apiGet("my/classes");

    const chips = [u.school, u.grade, u.class_no].filter(Boolean);
    const head = `<div class="my-head">
      <h2>${esc(u.name)}님의 수업</h2>
      <p>등록된 클래스와 앞으로의 일정입니다.</p>
      ${chips.length ? `<div class="chips">${chips.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>` : ""}
    </div>`;

    let body = "";
    if (!classes.length) {
      body = `<div class="empty">아직 연결된 클래스가 없습니다.<br>원장님이 클래스를 연결하면 여기에 표시됩니다.</div>`;
    } else {
      body = `<h3 style="font-size:18px;color:var(--navy);margin-bottom:12px">내 클래스</h3>` +
        classes
          .map(
            (c) => `<div class="slot">
              <div class="time">${esc(timeRange(c.start_time, c.duration_min))}<small>${esc(c.duration_min)}분</small></div>
              <div class="bar" style="background:${esc(c.color || "#0C3190")}"></div>
              <div class="body">
                <div class="nm">${esc(c.name)}</div>
                <div class="meta">${esc([daysToKr(c.days) + "요일", c.level, c.teacher, c.room].filter(Boolean).join(" · "))}</div>
                ${c.memo ? `<div class="meta">${esc(c.memo)}</div>` : ""}
              </div>
            </div>`
          )
          .join("");
    }

    const upcoming = (events || []).filter((e) => e.event_date >= new Date().toISOString().slice(0, 10));
    let evHtml = "";
    if (upcoming.length) {
      evHtml = `<h3 style="font-size:18px;color:var(--navy);margin:30px 0 12px">다가오는 일정</h3>` +
        upcoming
          .map(
            (e) => `<div class="slot event">
              <div class="time">${esc(formatDateKr(e.event_date).replace(/^\d+년 /, ""))}<small>${esc(EVENT_KIND_KR[e.kind] || e.kind)}</small></div>
              <div class="bar" style="background:#e60013"></div>
              <div class="body">
                <div class="nm">${esc(e.title)}</div>
                <div class="meta">${esc([e.start_time, e.memo].filter(Boolean).join(" · ")) || "&nbsp;"}</div>
              </div>
            </div>`
          )
          .join("");
    }

    root.innerHTML = head + body + evHtml +
      `<p style="margin-top:26px"><a class="btn ghost" href="#/me">내 정보 수정</a></p>`;
  } catch (e) {
    root.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

/* ============================================================
   내 정보 (아이디·비밀번호 포함 수정)
   ============================================================ */

export async function renderMe(view) {
  if (!session.isLoggedIn) {
    await refreshSession();
    if (!session.isLoggedIn) {
      renderLogin(view);
      return;
    }
  }
  const u = session.user;

  view.innerHTML = "";
  view.append(html(`
    <div class="page-head"><div class="wrap">
      <h1>내 정보</h1>
      <p>아이디와 비밀번호를 포함해 언제든지 직접 고칠 수 있습니다.</p>
    </div></div>
    <section class="section"><div class="wrap">
      <div class="panel-card">
        <form id="me-form" novalidate>
          <div class="field">
            <label for="me-id">아이디</label>
            <div class="field-row">
              <input id="me-id" name="login_id" type="text" value="${esc(u.login_id)}" autocomplete="username">
              <button class="btn ghost" type="button" id="me-check">중복확인</button>
            </div>
            <div class="hint" id="me-id-hint">아이디를 바꾸면 다음 로그인부터 새 아이디를 쓰게 됩니다.</div>
          </div>

          <div class="field">
            <label for="me-name">이름</label>
            <input id="me-name" name="name" type="text" value="${esc(u.name)}">
          </div>

          <div class="grid-3">
            <div class="field"><label for="me-school">학교</label>
              <input id="me-school" name="school" type="text" value="${esc(u.school || "")}"></div>
            <div class="field"><label for="me-grade">학년</label>
              <input id="me-grade" name="grade" type="text" value="${esc(u.grade || "")}"></div>
            <div class="field"><label for="me-class">반</label>
              <input id="me-class" name="class_no" type="text" value="${esc(u.class_no || "")}"></div>
          </div>

          <div class="grid-2">
            <div class="field"><label for="me-phone">전화번호</label>
              <input id="me-phone" name="phone" type="tel" value="${esc(u.phone || "")}"></div>
            <div class="field"><label for="me-email">이메일</label>
              <input id="me-email" name="email" type="email" value="${esc(u.email || "")}"></div>
          </div>

          <hr style="border:0;border-top:1px solid var(--border);margin:22px 0">
          <h3 style="font-size:16px;color:var(--navy);margin-bottom:6px">비밀번호 변경</h3>
          <p style="margin:0 0 14px;font-size:13.5px;color:var(--text-muted)">바꾸지 않으려면 비워 두세요.</p>

          <div class="field">
            <label for="me-cur">현재 비밀번호</label>
            <input id="me-cur" type="password" autocomplete="current-password">
          </div>
          <div class="grid-2">
            <div class="field"><label for="me-new">새 비밀번호</label>
              <input id="me-new" type="password" autocomplete="new-password"></div>
            <div class="field"><label for="me-new2">새 비밀번호 확인</label>
              <input id="me-new2" type="password" autocomplete="new-password"></div>
          </div>

          <button class="btn block" type="submit" id="me-save" style="margin-top:8px">저장</button>
        </form>

        <button class="btn ghost block" type="button" id="me-logout" style="margin-top:10px">로그아웃</button>
      </div>
    </div></section>
  `));

  const card = $(".panel-card", view);
  const idInput = $("#me-id", card);
  const hint = $("#me-id-hint", card);

  $("#me-check", card).addEventListener("click", async () => {
    const v = idInput.value.trim();
    if (v === u.login_id) {
      hint.className = "hint ok";
      hint.textContent = "지금 쓰고 있는 아이디입니다.";
      return;
    }
    try {
      const r = await apiGet(`auth/check-id?login_id=${encodeURIComponent(v)}`);
      hint.className = `hint ${r.available ? "ok" : "err"}`;
      hint.textContent = r.reason;
    } catch (e) {
      hint.className = "hint err";
      hint.textContent = e.message;
    }
  });

  $("#me-form", card).addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = readForm(card);
    const cur = $("#me-cur", card).value;
    const nw = $("#me-new", card).value;
    const nw2 = $("#me-new2", card).value;

    if (nw || nw2) {
      if (nw !== nw2) return toast("새 비밀번호 확인이 일치하지 않습니다.", true);
      if (!cur) return toast("현재 비밀번호를 입력해 주세요.", true);
    }

    const payload = {
      login_id: data.login_id.trim(),
      name: data.name.trim(),
      school: data.school,
      grade: data.grade,
      class_no: data.class_no,
      phone: data.phone,
      email: data.email,
    };
    if (nw) {
      payload.current_password = cur;
      payload.new_password = nw;
    }

    const btn = $("#me-save", card);
    btn.disabled = true;
    btn.textContent = "저장 중…";
    try {
      const { user } = await apiPatch("me", payload);
      setUser(user);
      $("#me-cur", card).value = "";
      $("#me-new", card).value = "";
      $("#me-new2", card).value = "";
      toast("저장했습니다.");
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "저장";
    }
  });

  $("#me-logout", card).addEventListener("click", async () => {
    if (!(await confirmBox("로그아웃 하시겠습니까?", { okLabel: "로그아웃", danger: false }))) return;
    await apiPost("auth/logout", {});
    setUser(null);
    toast("로그아웃했습니다.");
    location.hash = "#/";
  });
}
