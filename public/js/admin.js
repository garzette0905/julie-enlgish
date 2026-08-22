/**
 * 관리자 화면 — 상담요청 · 학원생 · 클래스 · 상담일지 · 학원소식(사진/동영상) · 졸업생 · 설정
 * 원장님(role=admin)만 들어올 수 있다.
 */
import {
  $, $$, html, esc, api, apiGet, apiPost, apiPatch, apiDelete, apiPut,
  toast, session, refreshSession, openModal, modalFooter, confirmBox, readForm,
  DAY_CODES, DAY_KR, daysToKr, timeRange, toISODate, formatDateKr,
  STATUS_KR, STATUS_BADGE,
} from "./core.js";
import { clearCache, mediaSrc, youtubeId } from "./public-pages.js";

const TABS = [
  { key: "inquiries", label: "상담 요청" },
  { key: "students", label: "학원생 관리" },
  { key: "notify", label: "원생 알림" },
  { key: "tuition", label: "원비관리" },
  { key: "classes", label: "클래스 관리" },
  { key: "media", label: "학원 소식" },
  { key: "alumni", label: "졸업생 관리" },
  { key: "settings", label: "사이트 설정" },
];

export async function renderAdmin(view, tab = "inquiries") {
  // 쿠키 만료로 화면 상태만 남아 있을 수 있으니 들어올 때마다 서버에 확인한다.
  await refreshSession();
  if (!session.isAdmin) {
    view.innerHTML = `<div class="section"><div class="wrap">
      <div class="empty">관리자만 볼 수 있는 화면입니다. <a href="#/login" style="color:var(--navy);font-weight:600">로그인</a></div>
    </div></div>`;
    return;
  }

  if (!TABS.some((t) => t.key === tab)) tab = "inquiries";

  view.innerHTML = "";
  view.append(html(`
    <div class="page-head"><div class="wrap">
      <h1>관리자 화면</h1>
      <p>${esc(session.user.name)}님 · 학원 운영에 필요한 모든 등록·수정을 여기서 합니다.</p>
    </div></div>
    <section class="section tight"><div class="wrap">
      <div class="admin-shell">
        <nav class="admin-nav">
          ${TABS.map((t) => `<a href="#/admin/${t.key}" class="${t.key === tab ? "active" : ""}">${esc(t.label)}</a>`).join("")}
        </nav>
        <div class="admin-body" id="admin-body"><div class="loading">불러오는 중…</div></div>
      </div>
    </div></section>
  `));

  const body = $("#admin-body", view);
  const renderers = {
    inquiries: adminInquiries,
    students: adminStudents,
    notify: adminNotify,
    tuition: adminTuitionScreen,
    classes: adminClasses,
    media: adminMedia,
    alumni: adminAlumni,
    settings: adminSettings,
  };
  await renderers[tab](body);
}

/* ============================================================
   상담 요청 — 홈페이지에서 들어온 상담신청 / 문의
   ============================================================ */

const INQ_KIND_KR = { consult: "상담신청", question: "문의" };
const INQ_STATUS_KR = { new: "신규", doing: "연락중", done: "완료" };
const INQ_STATUS_BADGE = { new: "red", doing: "amber", done: "green" };

async function adminInquiries(body) {
  body.innerHTML = `
    <div class="admin-toolbar">
      <div class="grow" id="inq-counts" style="font-size:14px;color:var(--text-muted)"></div>
      <select id="inq-kind" style="max-width:140px">
        <option value="">전체 종류</option>
        <option value="consult">상담신청</option>
        <option value="question">문의</option>
      </select>
      <select id="inq-status" style="max-width:140px">
        <option value="">전체 상태</option>
        <option value="new">신규</option>
        <option value="doing">연락중</option>
        <option value="done">완료</option>
      </select>
    </div>
    <div id="inq-list"><div class="loading">불러오는 중…</div></div>`;

  const list = $("#inq-list", body);
  const kindEl = $("#inq-kind", body);
  const statusEl = $("#inq-status", body);

  const load = async () => {
    list.innerHTML = `<div class="loading">불러오는 중…</div>`;
    const params = new URLSearchParams();
    if (kindEl.value) params.set("kind", kindEl.value);
    if (statusEl.value) params.set("status", statusEl.value);

    try {
      const { inquiries, counts } = await apiGet(`admin/inquiries?${params}`);
      $("#inq-counts", body).innerHTML =
        `신규 <b style="color:var(--red)">${counts.new || 0}</b>건 · ` +
        `연락중 ${counts.doing || 0}건 · 완료 ${counts.done || 0}건`;

      if (!inquiries.length) {
        list.innerHTML = `<div class="empty">해당하는 상담 요청이 없습니다.</div>`;
        return;
      }
      list.innerHTML = inquiries.map(inquiryCard).join("");
      bindInquiryCards(list, inquiries, load);
    } catch (e) {
      list.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
  };

  kindEl.addEventListener("change", load);
  statusEl.addEventListener("change", load);
  await load();
}

function inquiryCard(q) {
  // 상담신청과 문의는 받는 항목이 달라서, 값이 있는 것만 줄로 만든다.
  const rows = [
    ["학교", q.school],
    ["학년", q.grade],
    ["영어 학습 수준", q.english_level],
    ["학생 연락처", q.student_phone],
  ].filter(([, v]) => v);

  const tel = String(q.parent_phone || "").replace(/[^0-9+]/g, "");

  return `<div class="inq-card${q.status === "new" ? " is-new" : ""}" data-id="${q.id}">
    <div class="inq-top">
      <div>
        <span class="badge ${q.kind === "consult" ? "red" : ""}">${esc(INQ_KIND_KR[q.kind] || q.kind)}</span>
        <span class="badge ${INQ_STATUS_BADGE[q.status] || "gray"}">${esc(INQ_STATUS_KR[q.status] || q.status)}</span>
        <span class="inq-when">${esc(q.created_at)}</span>
      </div>
      <div class="inq-no">#${q.id}</div>
    </div>

    <div class="inq-name">${esc(q.student_name)}</div>
    <div class="inq-phone">
      부모님 <a href="tel:${esc(tel)}">${esc(q.parent_phone)}</a>
    </div>

    ${rows.length ? `<div class="inq-rows">${rows
      .map(([k, v]) => `<span><i>${esc(k)}</i> ${esc(v)}</span>`)
      .join("")}</div>` : ""}

    ${q.message ? `<div class="inq-msg">${esc(q.message)}</div>` : ""}
    ${q.admin_memo ? `<div class="inq-memo"><b>메모</b> ${esc(q.admin_memo)}</div>` : ""}
    ${q.notified ? "" : `<div class="inq-warn">알림 전송에 실패한 건입니다. 내용은 정상 접수되었습니다.</div>`}

    <div class="inq-actions">
      ${q.status !== "doing" ? `<button class="btn sm ghost" data-act="doing">연락중</button>` : ""}
      ${q.status !== "done" ? `<button class="btn sm ghost" data-act="done">완료</button>` : ""}
      ${q.status !== "new" ? `<button class="btn sm ghost" data-act="new">신규로</button>` : ""}
      <button class="btn sm ghost" data-act="memo">메모</button>
      <button class="btn sm danger" data-act="del">삭제</button>
    </div>
  </div>`;
}

function bindInquiryCards(root, inquiries, reload) {
  for (const card of $$(".inq-card[data-id]", root)) {
    const q = inquiries.find((x) => String(x.id) === card.dataset.id);
    for (const btn of $$("[data-act]", card)) {
      btn.addEventListener("click", async () => {
        const act = btn.dataset.act;

        if (act === "del") {
          if (!(await confirmBox(`${q.student_name} 학생의 ${INQ_KIND_KR[q.kind]}을(를) 삭제할까요?`))) return;
          try {
            await apiDelete(`admin/inquiries/${q.id}`);
            toast("삭제했습니다.");
            reload();
          } catch (e) {
            toast(e.message, true);
          }
          return;
        }

        if (act === "memo") return openInquiryMemo(q, reload);

        try {
          await apiPatch(`admin/inquiries/${q.id}`, { status: act });
          toast(`${INQ_STATUS_KR[act]}(으)로 바꿨습니다.`);
          reload();
        } catch (e) {
          toast(e.message, true);
        }
      });
    }
  }
}

function openInquiryMemo(q, reload) {
  const form = html(`<form novalidate>
    <div class="field">
      <label>처리 메모</label>
      <textarea name="admin_memo" placeholder="통화 결과, 상담 일정 등">${esc(q.admin_memo || "")}</textarea>
    </div>
  </form>`);

  const modal = openModal({
    title: `${q.student_name} · ${INQ_KIND_KR[q.kind]} 메모`,
    body: form,
    footer: modalFooter([
      { label: "취소", cls: "ghost", onClick: () => modal.close() },
      {
        label: "저장",
        cls: "red",
        onClick: async (btn) => {
          btn.disabled = true;
          try {
            await apiPatch(`admin/inquiries/${q.id}`, { admin_memo: readForm(form).admin_memo });
            toast("저장했습니다.");
            modal.close();
            reload();
          } catch (e) {
            toast(e.message, true);
            btn.disabled = false;
          }
        },
      },
    ]),
  });
}

/* ============================================================
   학원생 관리
   ============================================================ */

async function adminStudents(body) {
  body.innerHTML = `
    <div class="admin-toolbar">
      <input class="grow" type="search" id="stu-q" placeholder="이름·아이디·학교로 찾기">
      <select id="stu-status" style="max-width:150px">
        <option value="">전체 상태</option>
        <option value="pending">승인대기</option>
        <option value="active">사용중</option>
        <option value="inactive">중지</option>
      </select>
      <button class="btn red" type="button" id="stu-new">＋ 학원생 등록</button>
    </div>
    <div class="card"><div class="table-scroll"><table class="data" id="stu-table"></table></div></div>`;

  const table = $("#stu-table", body);
  const qEl = $("#stu-q", body);
  const stEl = $("#stu-status", body);

  const load = async () => {
    table.innerHTML = `<tbody><tr><td class="loading">불러오는 중…</td></tr></tbody>`;
    const params = new URLSearchParams();
    if (qEl.value.trim()) params.set("q", qEl.value.trim());
    if (stEl.value) params.set("status", stEl.value);

    try {
      const { users } = await apiGet(`admin/users?${params}`);
      drawStudentTable(table, users, load);
    } catch (e) {
      table.innerHTML = `<tbody><tr><td class="empty">${esc(e.message)}</td></tr></tbody>`;
    }
  };

  let timer = null;
  qEl.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(load, 250);
  });
  stEl.addEventListener("change", load);
  $("#stu-new", body).addEventListener("click", () => openStudentModal(null, load));

  await load();
}

function drawStudentTable(table, users, reload) {
  if (!users.length) {
    table.innerHTML = `<tbody><tr><td class="empty">해당하는 학원생이 없습니다.</td></tr></tbody>`;
    return;
  }
  table.innerHTML = `
    <thead><tr>
      <th>이름</th><th>아이디</th><th>학교 / 학년 / 반</th><th>연락처</th>
      <th>클래스</th><th>상태</th><th>상담</th><th></th>
    </tr></thead>
    <tbody>${users
      .map(
        (u) => `<tr data-id="${u.id}">
          <td><b>${esc(u.name)}</b>${u.role === "admin" ? ` <span class="badge red">관리자</span>` : ""}</td>
          <td style="color:var(--text-muted)">${esc(u.login_id)}</td>
          <td>${esc([u.school, u.grade, u.class_no].filter(Boolean).join(" / ")) || "-"}</td>
          <td style="color:var(--text-muted)">${esc(u.phone || "-")}</td>
          <td>${esc(u.class_names || "-")}</td>
          <td><span class="badge ${STATUS_BADGE[u.status] || "gray"}">${esc(STATUS_KR[u.status] || u.status)}</span></td>
          <td>${u.counsel_count ? `<span class="badge">${u.counsel_count}건</span>` : "-"}</td>
          <td class="actions">
            ${u.status === "pending" ? `<button class="btn sm red" data-act="approve">승인</button>` : ""}
            <button class="btn sm ghost" data-act="counsel">상담일지</button>
            <button class="btn sm ghost" data-act="edit">수정</button>
            <button class="btn sm danger" data-act="del">삭제</button>
          </td>
        </tr>`
      )
      .join("")}</tbody>`;

  for (const tr of $$("tbody tr[data-id]", table)) {
    const id = tr.dataset.id;
    const user = users.find((u) => String(u.id) === id);
    for (const btn of $$("[data-act]", tr)) {
      btn.addEventListener("click", async () => {
        const act = btn.dataset.act;
        if (act === "edit") return openStudentModal(user, reload);
        if (act === "counsel") return openCounselModal(user);
        if (act === "approve") {
          try {
            await apiPatch(`admin/users/${id}`, { status: "active" });
            toast(`${user.name}님을 승인했습니다.`);
            reload();
          } catch (e) {
            toast(e.message, true);
          }
          return;
        }
        if (act === "del") {
          if (!(await confirmBox(`${user.name}님을 삭제할까요? 상담일지와 수강 정보도 함께 지워집니다.`))) return;
          try {
            await apiDelete(`admin/users/${id}`);
            toast("삭제했습니다.");
            reload();
          } catch (e) {
            toast(e.message, true);
          }
        }
      });
    }
  }
}

async function openStudentModal(user, reload) {
  const isNew = !user;
  let classes = [];
  let myClassIds = [];

  try {
    const r = await apiGet("admin/classes");
    classes = r.classes || [];
  } catch { /* 클래스가 아직 없을 수 있다 */ }

  if (!isNew) {
    try {
      const r = await apiGet(`admin/users/${user.id}`);
      myClassIds = (r.classes || []).map((c) => String(c.id));
      user = { ...user, ...r.user };
    } catch { /* 무시 */ }
  }

  const v = (k) => esc((user && user[k]) || "");
  const form = html(`<form id="stu-form" novalidate>
    <div class="grid-2">
      <div class="field">
        <label>아이디 <span style="color:var(--red)">*</span></label>
        <div class="field-row">
          <input name="login_id" type="text" value="${v("login_id")}" placeholder="영문·숫자 4자 이상">
          <button class="btn ghost" type="button" id="sf-check">중복확인</button>
        </div>
        <div class="hint" id="sf-hint">&nbsp;</div>
      </div>
      <div class="field">
        <label>이름 <span style="color:var(--red)">*</span></label>
        <input name="name" type="text" value="${v("name")}">
      </div>
    </div>

    <div class="field">
      <label>${isNew ? "비밀번호 <span style=\"color:var(--red)\">*</span>" : "비밀번호 재설정"}</label>
      <input name="password" type="password" autocomplete="new-password" placeholder="${isNew ? "4자 이상" : "바꿀 때만 입력하세요"}">
      ${isNew ? "" : `<div class="hint">입력하면 해당 회원의 기존 로그인은 모두 해제됩니다.</div>`}
    </div>

    <div class="grid-3">
      <div class="field"><label>학교</label><input name="school" type="text" value="${v("school")}"></div>
      <div class="field"><label>학년</label><input name="grade" type="text" value="${v("grade")}"></div>
      <div class="field"><label>반</label><input name="class_no" type="text" value="${v("class_no")}"></div>
    </div>

    <div class="grid-2">
      <div class="field"><label>전화번호</label><input name="phone" type="tel" value="${v("phone")}"></div>
      <div class="field"><label>이메일</label><input name="email" type="email" value="${v("email")}"></div>
    </div>

    <div class="grid-2">
      <div class="field">
        <label>상태</label>
        <select name="status">
          <option value="active">사용중</option>
          <option value="pending">승인대기</option>
          <option value="inactive">중지</option>
        </select>
      </div>
      <div class="field">
        <label>권한</label>
        <select name="role">
          <option value="student">학원생</option>
          <option value="admin">관리자</option>
        </select>
      </div>
    </div>

    <div class="field">
      <label>특기사항</label>
      <textarea name="note" placeholder="알레르기, 형제자매, 주의사항 등" style="min-height:80px">${v("note")}</textarea>
    </div>

    <div class="field">
      <label>수강 클래스 연결</label>
      <div class="check-list" id="sf-classes">
        ${classes.length
          ? classes
              .map(
                (c) => `<label><input type="checkbox" data-multi="1" name="class_ids" value="${c.id}"
                  ${myClassIds.includes(String(c.id)) ? "checked" : ""}>
                  <span>${esc(c.name)} · ${esc(daysToKr(c.days))} ${esc(timeRange(c.start_time, c.duration_min))}</span></label>`
              )
              .join("")
          : `<div style="padding:14px;color:var(--text-faint);font-size:13.5px">먼저 클래스를 만들어 주세요.</div>`}
      </div>
    </div>
  </form>`);

  if (user) {
    $("[name=status]", form).value = user.status || "active";
    $("[name=role]", form).value = user.role || "student";
  }

  const hint = $("#sf-hint", form);
  $("#sf-check", form).addEventListener("click", async () => {
    const val = $("[name=login_id]", form).value.trim();
    if (!isNew && user && val === user.login_id) {
      hint.className = "hint ok";
      hint.textContent = "지금 쓰고 있는 아이디입니다.";
      return;
    }
    try {
      const r = await apiGet(`auth/check-id?login_id=${encodeURIComponent(val)}`);
      hint.className = `hint ${r.available ? "ok" : "err"}`;
      hint.textContent = r.reason;
    } catch (e) {
      hint.className = "hint err";
      hint.textContent = e.message;
    }
  });

  const modal = openModal({
    title: isNew ? "학원생 등록" : `${user.name} 정보 수정`,
    body: form,
    wide: true,
    footer: modalFooter([
      { label: "취소", cls: "ghost", onClick: () => modal.close() },
      {
        label: "저장",
        cls: "red",
        onClick: async (btn) => {
          const d = readForm(form);
          if (!d.login_id.trim()) return toast("아이디를 입력해 주세요.", true);
          if (!d.name.trim()) return toast("이름을 입력해 주세요.", true);
          if (isNew && !d.password) return toast("비밀번호를 입력해 주세요.", true);

          const payload = {
            login_id: d.login_id.trim(),
            name: d.name.trim(),
            school: d.school,
            grade: d.grade,
            class_no: d.class_no,
            phone: d.phone,
            email: d.email,
            note: d.note,
            status: d.status,
            role: d.role,
            class_ids: d.class_ids || [],
          };
          if (d.password) payload.password = d.password;

          btn.disabled = true;
          btn.textContent = "저장 중…";
          try {
            if (isNew) await apiPost("admin/users", payload);
            else await apiPatch(`admin/users/${user.id}`, payload);
            toast("저장했습니다.");
            modal.close();
            reload();
          } catch (e) {
            toast(e.message, true);
            btn.disabled = false;
            btn.textContent = "저장";
          }
        },
      },
    ]),
  });
}

/* ---------- 상담일지 ---------- */

async function openCounselModal(user) {
  const body = html(`<div>
    <form id="cl-form" style="margin-bottom:22px">
      <div class="grid-2">
        <div class="field"><label>상담 날짜</label>
          <input name="log_date" type="date" value="${toISODate(new Date())}"></div>
        <div class="field"><label>제목</label>
          <input name="title" type="text" placeholder="학부모 전화상담"></div>
      </div>
      <div class="field">
        <label>내용 <span style="color:var(--red)">*</span></label>
        <textarea name="content" placeholder="상담 내용을 적어 주세요."></textarea>
      </div>
      <button class="btn red" type="submit" id="cl-add">상담일지 추가</button>
    </form>
    <hr style="border:0;border-top:1px solid var(--border);margin:0 0 18px">
    <div id="cl-list"><div class="loading">불러오는 중…</div></div>
  </div>`);

  const modal = openModal({ title: `${user.name} · 상담일지`, body, wide: true });
  const list = $("#cl-list", body);

  const load = async () => {
    try {
      const { logs } = await apiGet(`admin/users/${user.id}/counsel`);
      if (!logs.length) {
        list.innerHTML = `<div class="empty">아직 상담일지가 없습니다.</div>`;
        return;
      }
      list.innerHTML = logs
        .map(
          (l) => `<div class="log-item" data-id="${l.id}">
            <div class="top">
              <div>
                <div class="dt">${esc(formatDateKr(l.log_date))}</div>
                ${l.title ? `<div class="ti">${esc(l.title)}</div>` : ""}
              </div>
              <button class="btn sm danger" data-del="${l.id}">삭제</button>
            </div>
            <div class="ct">${esc(l.content)}</div>
            ${l.author ? `<div class="by">작성 · ${esc(l.author)}</div>` : ""}
          </div>`
        )
        .join("");

      for (const b of $$("[data-del]", list)) {
        b.addEventListener("click", async () => {
          if (!(await confirmBox("이 상담일지를 삭제할까요?"))) return;
          try {
            await apiDelete(`admin/counsel/${b.dataset.del}`);
            toast("삭제했습니다.");
            load();
          } catch (e) {
            toast(e.message, true);
          }
        });
      }
    } catch (e) {
      list.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
  };

  $("#cl-form", body).addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = readForm($("#cl-form", body));
    if (!d.content.trim()) return toast("상담 내용을 입력해 주세요.", true);
    const btn = $("#cl-add", body);
    btn.disabled = true;
    try {
      await apiPost(`admin/users/${user.id}/counsel`, {
        log_date: d.log_date,
        title: d.title,
        content: d.content,
      });
      $("[name=title]", body).value = "";
      $("[name=content]", body).value = "";
      toast("상담일지를 추가했습니다.");
      load();
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
    }
  });

  await load();
}

/* ============================================================
   원생 알림 — 클래스별로 원생을 골라 알림 내용을 적는다
   (발송은 아직 준비 중이라 버튼을 눌러지지 않게 두었다)
   ============================================================ */

async function adminNotify(body) {
  body.innerHTML = `
    <div class="admin-toolbar">
      <div class="grow" style="font-size:14px;color:var(--text-muted)">
        클래스별로 묶인 원생 명단입니다. 알림을 보낼 학생을 골라 주세요.
      </div>
      <span class="badge" id="nt-count">0명 선택</span>
    </div>
    <div id="nt-root"><div class="loading">불러오는 중…</div></div>`;

  const root = $("#nt-root", body);

  try {
    const { classes, unassigned } = await apiGet("admin/roster");

    const groups = [
      ...classes.map((c) => ({
        key: `class-${c.id}`,
        title: c.name,
        meta: `${daysToKr(c.days)} · ${timeRange(c.start_time, c.duration_min)}${c.level ? " · " + c.level : ""}`,
        color: c.color || "#0C3190",
        off: !c.active,
        students: c.students,
      })),
      {
        key: "none",
        title: "클래스 미배정",
        meta: "아직 어느 클래스에도 연결되지 않은 원생",
        color: "#8b95a8",
        students: unassigned,
      },
    ].filter((g) => g.students.length);

    if (!groups.length) {
      root.innerHTML = `<div class="empty">등록된 원생이 없습니다.</div>`;
      return;
    }

    root.innerHTML =
      groups.map(rosterGroup).join("") +
      `<div class="card pad nt-compose">
        <div class="field">
          <label>알림 내용</label>
          <textarea id="nt-msg" placeholder="예) 이번 주 금요일은 학원 사정으로 휴강입니다." style="min-height:120px"></textarea>
          <div class="hint"><span id="nt-len">0</span>자</div>
        </div>
        <div class="nt-send">
          <button class="btn red" type="button" id="nt-send" disabled>발송 (개발중)</button>
          <span class="hint">발송 기능은 준비 중입니다. 지금은 대상 선택과 내용 작성까지만 됩니다.</span>
        </div>
      </div>`;

    const countEl = $("#nt-count", body);
    const refreshCount = () => {
      const n = $$("#nt-root .nt-student input:checked", body).length;
      countEl.textContent = `${n}명 선택`;
      countEl.classList.toggle("red", n > 0);
    };

    // 클래스 제목 옆 체크는 그 반 전체를 한 번에 켜고 끈다.
    for (const head of $$(".nt-all", root)) {
      head.addEventListener("change", () => {
        const group = head.closest(".nt-group");
        for (const cb of $$(".nt-student input", group)) cb.checked = head.checked;
        refreshCount();
      });
    }
    for (const cb of $$(".nt-student input", root)) {
      cb.addEventListener("change", () => {
        const group = cb.closest(".nt-group");
        const all = $$(".nt-student input", group);
        $(".nt-all", group).checked = all.every((x) => x.checked);
        refreshCount();
      });
    }

    const msg = $("#nt-msg", root);
    msg.addEventListener("input", () => {
      $("#nt-len", root).textContent = String(msg.value.length);
    });

    refreshCount();
  } catch (e) {
    root.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

function rosterGroup(g) {
  return `<div class="card nt-group" data-key="${esc(g.key)}">
    <div class="nt-head" style="border-left-color:${esc(g.color)}">
      <label class="nt-head-check">
        <input type="checkbox" class="nt-all">
        <span>
          <b>${esc(g.title)}</b>${g.off ? ` <span class="badge gray">종료</span>` : ""}
          <i>${esc(g.meta)} · ${g.students.length}명</i>
        </span>
      </label>
    </div>
    <div class="nt-students">
      ${g.students
        .map(
          (s) => `<label class="nt-student">
            <input type="checkbox" value="${s.id}">
            <span class="nm">${esc(s.name)}</span>
            <span class="sub">${esc([s.school, s.grade].filter(Boolean).join(" ")) || "-"}</span>
            ${s.status !== "active" ? `<span class="badge ${STATUS_BADGE[s.status] || "gray"}">${esc(STATUS_KR[s.status] || s.status)}</span>` : ""}
          </label>`
        )
        .join("")}
    </div>
  </div>`;
}

/* ============================================================
   원비 관리 — 월별 금액 · 납부 여부 · 특기사항
   ============================================================ */

const won = (n) => (Number(n) || 0).toLocaleString("ko-KR");

async function adminTuitionScreen(body) {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  body.innerHTML = `
    <div class="admin-toolbar">
      <input type="month" id="tu-month" value="${thisMonth}" style="max-width:170px">
      <div class="grow" id="tu-summary" style="font-size:14px;color:var(--text-muted)"></div>
      <button class="btn" type="button" id="tu-save">저장</button>
    </div>
    <div class="card"><div class="table-scroll"><table class="data" id="tu-table"></table></div></div>
    <div class="card pad nt-compose" style="margin-top:14px">
      <label class="tu-notify-line">
        <input type="checkbox" id="tu-notify-on">
        <span>원비 미납 학생에게 알림 보내기</span>
      </label>
      <div class="hint" id="tu-notify-hint" style="margin:6px 0 12px"></div>
      <div class="nt-send">
        <button class="btn red" type="button" id="tu-send" disabled>미납 알림 발송 (개발중)</button>
        <span class="hint">발송 기능은 준비 중입니다.</span>
      </div>
    </div>`;

  const monthEl = $("#tu-month", body);
  const table = $("#tu-table", body);

  const load = async () => {
    table.innerHTML = `<tbody><tr><td class="loading">불러오는 중…</td></tr></tbody>`;
    try {
      const { students, summary } = await apiGet(`admin/tuition?month=${monthEl.value}`);

      $("#tu-summary", body).innerHTML =
        `원생 ${summary.count}명 · 청구 <b>${won(summary.total)}원</b> · ` +
        `수납 <b style="color:#1f7a4b">${won(summary.paidTotal)}원</b> · ` +
        `미납 <b style="color:var(--red)">${summary.unpaid}명</b>`;

      if (!students.length) {
        table.innerHTML = `<tbody><tr><td class="empty">등록된 원생이 없습니다.</td></tr></tbody>`;
        return;
      }

      table.innerHTML = `
        <thead><tr>
          <th>이름</th><th>학교 / 학년</th><th>클래스</th>
          <th style="width:130px">원비(원)</th><th style="width:70px">납부</th>
          <th>특기사항</th><th style="width:70px">알림</th>
        </tr></thead>
        <tbody>${students
          .map(
            (s) => `<tr data-uid="${s.id}">
              <td><b>${esc(s.name)}</b></td>
              <td>${esc([s.school, s.grade].filter(Boolean).join(" / ")) || "-"}</td>
              <td style="color:var(--text-muted)">${esc(s.class_names || "-")}</td>
              <td><input class="tu-amount" type="number" min="0" step="1000" inputmode="numeric"
                         value="${s.amount === null ? "" : s.amount}" placeholder="0"></td>
              <td style="text-align:center">
                <input class="tu-paid" type="checkbox" ${s.paid ? "checked" : ""}>
              </td>
              <td><input class="tu-memo" type="text" value="${esc(s.memo || "")}" placeholder="형제 할인 등"></td>
              <td style="text-align:center">
                <input class="tu-pick" type="checkbox" ${!s.paid && (s.amount || 0) > 0 ? "checked" : ""}>
              </td>
            </tr>`
          )
          .join("")}</tbody>`;

      const syncNotifyHint = () => {
        const picked = $$(".tu-pick:checked", table).length;
        $("#tu-notify-hint", body).textContent = `미납 알림 대상 ${picked}명이 선택되어 있습니다.`;
      };
      for (const cb of $$(".tu-pick", table)) cb.addEventListener("change", syncNotifyHint);
      // 납부로 체크하면 미납 알림 대상에서 자동으로 빠진다.
      for (const cb of $$(".tu-paid", table)) {
        cb.addEventListener("change", () => {
          const row = cb.closest("tr");
          if (cb.checked) $(".tu-pick", row).checked = false;
          syncNotifyHint();
        });
      }
      syncNotifyHint();
    } catch (e) {
      table.innerHTML = `<tbody><tr><td class="empty">${esc(e.message)}</td></tr></tbody>`;
    }
  };

  monthEl.addEventListener("change", load);

  $("#tu-save", body).addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const rows = $$("tbody tr[data-uid]", table).map((tr) => ({
      user_id: Number(tr.dataset.uid),
      amount: Number($(".tu-amount", tr).value) || 0,
      paid: $(".tu-paid", tr).checked,
      memo: $(".tu-memo", tr).value,
    }));
    if (!rows.length) return;

    btn.disabled = true;
    btn.textContent = "저장 중…";
    try {
      const r = await apiPut("admin/tuition", { month: monthEl.value, rows });
      toast(`${r.saved}명 저장했습니다.`);
      load();
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "저장";
    }
  });

  await load();
}

/* ============================================================
   클래스 관리
   ============================================================ */

async function adminClasses(body) {
  body.innerHTML = `
    <div class="admin-toolbar">
      <div class="grow" style="font-size:14px;color:var(--text-muted)">
        월·수·금은 60분, 화·목은 90분이 기본입니다. 요일과 시작 시간을 자유롭게 지정할 수 있습니다.
      </div>
      <button class="btn red" type="button" id="cls-new">＋ 클래스 생성</button>
    </div>
    <div class="card"><div class="table-scroll"><table class="data" id="cls-table"></table></div></div>`;

  const table = $("#cls-table", body);

  const load = async () => {
    table.innerHTML = `<tbody><tr><td class="loading">불러오는 중…</td></tr></tbody>`;
    try {
      const { classes } = await apiGet("admin/classes");
      clearCache();
      if (!classes.length) {
        table.innerHTML = `<tbody><tr><td class="empty">아직 클래스가 없습니다. 오른쪽 위에서 만들어 주세요.</td></tr></tbody>`;
        return;
      }
      table.innerHTML = `
        <thead><tr><th>클래스</th><th>요일</th><th>시간</th><th>과정</th><th>인원</th><th>상태</th><th></th></tr></thead>
        <tbody>${classes
          .map(
            (c) => `<tr data-id="${c.id}">
              <td><span style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${esc(c.color || "#0C3190")};margin-right:7px"></span><b>${esc(c.name)}</b></td>
              <td>${esc(daysToKr(c.days))}</td>
              <td style="font-variant-numeric:tabular-nums">${esc(timeRange(c.start_time, c.duration_min))} <span style="color:var(--text-faint)">(${esc(c.duration_min)}분)</span></td>
              <td>${esc(c.level || "-")}</td>
              <td>${c.student_count || 0}명</td>
              <td><span class="badge ${c.active ? "green" : "gray"}">${c.active ? "운영중" : "종료"}</span></td>
              <td class="actions">
                <button class="btn sm ghost" data-act="students">학생</button>
                <button class="btn sm ghost" data-act="edit">수정</button>
                <button class="btn sm danger" data-act="del">삭제</button>
              </td>
            </tr>`
          )
          .join("")}</tbody>`;

      for (const tr of $$("tbody tr[data-id]", table)) {
        const c = classes.find((x) => String(x.id) === tr.dataset.id);
        for (const btn of $$("[data-act]", tr)) {
          btn.addEventListener("click", async () => {
            const act = btn.dataset.act;
            if (act === "edit") return openClassModal(c, load);
            if (act === "students") return openClassStudents(c);
            if (act === "del") {
              if (!(await confirmBox(`"${c.name}" 클래스를 삭제할까요? 연결된 수강 정보도 함께 지워집니다.`))) return;
              try {
                await apiDelete(`admin/classes/${c.id}`);
                toast("삭제했습니다.");
                load();
              } catch (e) {
                toast(e.message, true);
              }
            }
          });
        }
      }
    } catch (e) {
      table.innerHTML = `<tbody><tr><td class="empty">${esc(e.message)}</td></tr></tbody>`;
    }
  };

  $("#cls-new", body).addEventListener("click", () => openClassModal(null, load));
  await load();
}

function openClassModal(c, reload) {
  const isNew = !c;
  const selected = String((c && c.days) || "").split(",");
  const v = (k, d = "") => esc((c && c[k] !== null && c[k] !== undefined ? c[k] : d));

  const form = html(`<form novalidate>
    <div class="field">
      <label>클래스 이름 <span style="color:var(--red)">*</span></label>
      <input name="name" type="text" value="${v("name")}" placeholder="파닉스 A">
    </div>

    <div class="field">
      <label>수업 요일 <span style="color:var(--red)">*</span></label>
      <div class="daypick">
        ${DAY_CODES.map(
          (d) => `<label><input type="checkbox" data-multi="1" name="days" value="${d}" ${selected.includes(d) ? "checked" : ""}><span>${DAY_KR[d]}</span></label>`
        ).join("")}
      </div>
      <div class="hint">월·수·금 60분 / 화·목 90분이 기본 구성입니다.</div>
    </div>

    <div class="grid-3">
      <div class="field"><label>시작 시간 <span style="color:var(--red)">*</span></label>
        <input name="start_time" type="time" value="${v("start_time", "16:00")}" step="300"></div>
      <div class="field"><label>수업 길이(분)</label>
        <select name="duration_min">
          <option value="60">60분</option>
          <option value="90">90분</option>
          <option value="45">45분</option>
          <option value="120">120분</option>
        </select></div>
      <div class="field"><label>색상</label>
        <select name="color">
          <option value="#0C3190">네이비</option>
          <option value="#E60013">레드</option>
          <option value="#7A1FA2">퍼플</option>
          <option value="#1F7A4B">그린</option>
          <option value="#B8760B">앰버</option>
        </select></div>
    </div>

    <div class="grid-3">
      <div class="field"><label>과정</label>
        <input name="level" type="text" value="${v("level")}" placeholder="파닉스 / 초등 / 선행중등"></div>
      <div class="field"><label>선생님</label>
        <input name="teacher" type="text" value="${v("teacher", "Julie")}"></div>
      <div class="field"><label>강의실</label>
        <input name="room" type="text" value="${v("room")}"></div>
    </div>

    <div class="field"><label>메모</label>
      <textarea name="memo" style="min-height:70px">${v("memo")}</textarea></div>

    <div class="field">
      <label style="display:flex;align-items:center;gap:9px;cursor:pointer">
        <input name="active" type="checkbox" style="width:auto" ${isNew || c.active ? "checked" : ""}>
        <span>운영 중인 클래스 (체크를 풀면 시간표에서 숨겨집니다)</span>
      </label>
    </div>
  </form>`);

  $("[name=duration_min]", form).value = String((c && c.duration_min) || 60);
  $("[name=color]", form).value = (c && c.color) || "#0C3190";

  // 요일을 고르면 길이를 자동으로 맞춰준다 (화·목만 고르면 90분).
  for (const cb of $$("[name=days]", form)) {
    cb.addEventListener("change", () => {
      const days = $$("[name=days]", form).filter((x) => x.checked).map((x) => x.value);
      if (!days.length) return;
      const onlyTueThu = days.every((d) => d === "TUE" || d === "THU");
      const onlyMWF = days.every((d) => d === "MON" || d === "WED" || d === "FRI");
      if (onlyTueThu) $("[name=duration_min]", form).value = "90";
      else if (onlyMWF) $("[name=duration_min]", form).value = "60";
    });
  }

  const modal = openModal({
    title: isNew ? "클래스 생성" : `${c.name} 수정`,
    body: form,
    wide: true,
    footer: modalFooter([
      { label: "취소", cls: "ghost", onClick: () => modal.close() },
      {
        label: "저장",
        cls: "red",
        onClick: async (btn) => {
          const d = readForm(form);
          if (!d.name.trim()) return toast("클래스 이름을 입력해 주세요.", true);
          if (!d.days || !d.days.length) return toast("수업 요일을 하나 이상 선택해 주세요.", true);
          if (!d.start_time) return toast("시작 시간을 입력해 주세요.", true);

          const payload = {
            name: d.name.trim(),
            days: d.days.join(","),
            start_time: d.start_time,
            duration_min: Number(d.duration_min),
            level: d.level,
            teacher: d.teacher,
            room: d.room,
            color: d.color,
            memo: d.memo,
            active: !!d.active,
          };

          btn.disabled = true;
          btn.textContent = "저장 중…";
          try {
            if (isNew) await apiPost("admin/classes", payload);
            else await apiPatch(`admin/classes/${c.id}`, payload);
            toast("저장했습니다.");
            modal.close();
            reload();
          } catch (e) {
            toast(e.message, true);
            btn.disabled = false;
            btn.textContent = "저장";
          }
        },
      },
    ]),
  });
}

async function openClassStudents(c) {
  const body = html(`<div id="cs-root"><div class="loading">불러오는 중…</div></div>`);
  openModal({ title: `${c.name} · 수강생`, body, wide: true });

  try {
    const { students } = await apiGet(`admin/classes/${c.id}/students`);
    if (!students.length) {
      body.innerHTML = `<div class="empty">아직 이 클래스에 연결된 학원생이 없습니다.<br>
        학원생 관리에서 학생을 열고 "수강 클래스 연결"에 체크해 주세요.</div>`;
      return;
    }
    body.innerHTML = `<div class="table-scroll"><table class="data">
      <thead><tr><th>이름</th><th>학교 / 학년 / 반</th><th>연락처</th><th>상태</th></tr></thead>
      <tbody>${students
        .map(
          (s) => `<tr>
            <td><b>${esc(s.name)}</b></td>
            <td>${esc([s.school, s.grade, s.class_no].filter(Boolean).join(" / ")) || "-"}</td>
            <td>${esc(s.phone || "-")}</td>
            <td><span class="badge ${STATUS_BADGE[s.status] || "gray"}">${esc(STATUS_KR[s.status] || s.status)}</span></td>
          </tr>`
        )
        .join("")}</tbody></table></div>`;
  } catch (e) {
    body.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

/* ============================================================
   학원 소식 — 사진 / 동영상
   ============================================================ */

async function adminMedia(body) {
  body.innerHTML = `
    <div class="admin-toolbar">
      <div class="grow" style="font-size:14px;color:var(--text-muted)">
        사진·짧은 영상은 파일로 올리고(95MB 이하), 긴 영상은 유튜브 링크로 등록하세요.
      </div>
      <button class="btn ghost" type="button" id="md-link">＋ 유튜브 링크</button>
      <button class="btn red" type="button" id="md-upload">＋ 파일 올리기</button>
    </div>
    <div id="md-root"><div class="loading">불러오는 중…</div></div>`;

  const root = $("#md-root", body);

  const load = async () => {
    try {
      const { media } = await apiGet("admin/media");
      if (!media.length) {
        root.innerHTML = `<div class="empty">아직 등록된 사진·동영상이 없습니다.</div>`;
        return;
      }
      root.innerHTML = `<div class="media-grid">${media
        .map((m) => {
          const src = mediaSrc(m);
          let frame;
          if (m.kind === "youtube") {
            const id = youtubeId(m.url);
            frame = id
              ? `<div class="frame"><img src="https://i.ytimg.com/vi/${esc(id)}/hqdefault.jpg" alt=""><span class="play">&#9654;</span></div>`
              : `<div class="frame"></div>`;
          } else if (m.kind === "video") {
            frame = `<div class="frame"><video src="${esc(src)}#t=0.5" preload="metadata" muted></video><span class="play">&#9654;</span></div>`;
          } else {
            frame = `<div class="frame"><img src="${esc(src)}" alt="" loading="lazy"></div>`;
          }
          return `<div class="media-item" data-id="${m.id}">
            ${frame}
            <div class="cap">
              <b>${esc(m.title || "(제목 없음)")}</b>
              ${m.description ? `<span>${esc(m.description)}</span>` : ""}
              <span style="margin-top:8px">
                <button class="btn sm ghost" data-act="edit">수정</button>
                <button class="btn sm danger" data-act="del">삭제</button>
              </span>
            </div>
          </div>`;
        })
        .join("")}</div>`;

      for (const card of $$(".media-item[data-id]", root)) {
        const m = media.find((x) => String(x.id) === card.dataset.id);
        for (const btn of $$("[data-act]", card)) {
          btn.addEventListener("click", async () => {
            if (btn.dataset.act === "edit") return openMediaEdit(m, load);
            if (!(await confirmBox("이 항목을 삭제할까요? 올린 파일도 함께 지워집니다."))) return;
            try {
              await apiDelete(`admin/media/${m.id}`);
              toast("삭제했습니다.");
              load();
            } catch (e) {
              toast(e.message, true);
            }
          });
        }
      }
    } catch (e) {
      root.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
  };

  $("#md-upload", body).addEventListener("click", () => openUploadModal(load));
  $("#md-link", body).addEventListener("click", () => openYoutubeModal(load));
  await load();
}

function openUploadModal(reload) {
  const form = html(`<form novalidate>
    <div class="field">
      <label>사진 / 동영상 파일 <span style="color:var(--red)">*</span></label>
      <input name="file" type="file" accept="image/*,video/*" multiple>
      <div class="hint">한 파일당 95MB까지. 여러 개를 한 번에 고를 수 있습니다.</div>
    </div>
    <div class="field"><label>제목 (비우면 파일 이름을 씁니다)</label>
      <input name="title" type="text"></div>
    <div class="field"><label>설명</label>
      <input name="description" type="text" placeholder="2026년 봄학기 수업 모습"></div>
    <div class="field"><label>정렬 순서 (숫자가 작을수록 앞)</label>
      <input name="sort_order" type="number" value="0"></div>
    <div id="up-progress" class="hint"></div>
  </form>`);

  const modal = openModal({
    title: "사진 · 동영상 올리기",
    body: form,
    footer: modalFooter([
      { label: "취소", cls: "ghost", onClick: () => modal.close() },
      {
        label: "올리기",
        cls: "red",
        onClick: async (btn) => {
          const fileInput = $("[name=file]", form);
          const files = [...(fileInput.files || [])];
          if (!files.length) return toast("파일을 골라 주세요.", true);

          const d = readForm(form);
          const prog = $("#up-progress", form);
          btn.disabled = true;

          let done = 0;
          for (const f of files) {
            prog.textContent = `${done + 1} / ${files.length} 올리는 중… (${f.name})`;
            const fd = new FormData();
            fd.append("file", f);
            // 여러 개를 한 번에 올릴 때는 각 파일 이름을 제목으로 둔다.
            fd.append("title", files.length === 1 && d.title ? d.title : f.name);
            if (d.description) fd.append("description", d.description);
            fd.append("sort_order", d.sort_order || "0");
            try {
              await api("admin/media", { method: "POST", body: fd });
              done++;
            } catch (e) {
              toast(`${f.name}: ${e.message}`, true);
            }
          }

          if (done) toast(`${done}개를 올렸습니다.`);
          modal.close();
          reload();
        },
      },
    ]),
  });
}

function openYoutubeModal(reload) {
  const form = html(`<form novalidate>
    <div class="field">
      <label>유튜브 주소 <span style="color:var(--red)">*</span></label>
      <input name="url" type="text" placeholder="https://www.youtube.com/watch?v=...">
      <div class="hint">youtu.be / shorts 주소도 됩니다.</div>
    </div>
    <div class="field"><label>제목</label><input name="title" type="text"></div>
    <div class="field"><label>설명</label><input name="description" type="text"></div>
    <div class="field"><label>정렬 순서</label><input name="sort_order" type="number" value="0"></div>
  </form>`);

  const modal = openModal({
    title: "유튜브 영상 등록",
    body: form,
    footer: modalFooter([
      { label: "취소", cls: "ghost", onClick: () => modal.close() },
      {
        label: "등록",
        cls: "red",
        onClick: async (btn) => {
          const d = readForm(form);
          if (!d.url.trim()) return toast("유튜브 주소를 입력해 주세요.", true);
          if (!youtubeId(d.url)) return toast("유튜브 주소를 다시 확인해 주세요.", true);
          btn.disabled = true;
          try {
            await apiPost("admin/media", {
              kind: "youtube",
              url: d.url.trim(),
              title: d.title,
              description: d.description,
              sort_order: Number(d.sort_order) || 0,
            });
            toast("등록했습니다.");
            modal.close();
            reload();
          } catch (e) {
            toast(e.message, true);
            btn.disabled = false;
          }
        },
      },
    ]),
  });
}

function openMediaEdit(m, reload) {
  const form = html(`<form novalidate>
    <div class="field"><label>제목</label><input name="title" type="text" value="${esc(m.title || "")}"></div>
    <div class="field"><label>설명</label><input name="description" type="text" value="${esc(m.description || "")}"></div>
    <div class="field"><label>정렬 순서</label><input name="sort_order" type="number" value="${esc(m.sort_order || 0)}"></div>
    ${m.kind === "youtube" ? `<div class="field"><label>유튜브 주소</label><input name="url" type="text" value="${esc(m.url || "")}"></div>` : ""}
  </form>`);

  const modal = openModal({
    title: "내용 수정",
    body: form,
    footer: modalFooter([
      { label: "취소", cls: "ghost", onClick: () => modal.close() },
      {
        label: "저장",
        cls: "red",
        onClick: async (btn) => {
          const d = readForm(form);
          btn.disabled = true;
          try {
            await apiPatch(`admin/media/${m.id}`, {
              title: d.title,
              description: d.description,
              sort_order: Number(d.sort_order) || 0,
              ...(d.url !== undefined ? { url: d.url } : {}),
            });
            toast("저장했습니다.");
            modal.close();
            reload();
          } catch (e) {
            toast(e.message, true);
            btn.disabled = false;
          }
        },
      },
    ]),
  });
}

/* ============================================================
   졸업생 관리
   ============================================================ */

async function adminAlumni(body) {
  body.innerHTML = `
    <div class="admin-toolbar">
      <div class="grow" style="font-size:14px;color:var(--text-muted)">
        졸업생 소개 화면에 나오는 명단입니다. 순서 숫자가 작을수록 앞에 나옵니다.
      </div>
      <button class="btn red" type="button" id="al-new">＋ 졸업생 등록</button>
    </div>
    <div class="card"><div class="table-scroll"><table class="data" id="al-table"></table></div></div>`;

  const table = $("#al-table", body);

  const load = async () => {
    table.innerHTML = `<tbody><tr><td class="loading">불러오는 중…</td></tr></tbody>`;
    try {
      const { alumni } = await apiGet("admin/alumni");
      if (!alumni.length) {
        table.innerHTML = `<tbody><tr><td class="empty">등록된 졸업생이 없습니다.</td></tr></tbody>`;
        return;
      }
      table.innerHTML = `
        <thead><tr><th>순서</th><th>이름</th><th>학년도</th><th>진학처</th><th>수강 기간</th><th>비고</th><th></th></tr></thead>
        <tbody>${alumni
          .map(
            (a) => `<tr data-id="${a.id}">
              <td style="color:var(--text-faint)">${esc(a.sort_order)}</td>
              <td><b>${esc(a.name)}</b></td>
              <td>${esc(a.year || "-")}</td>
              <td>${esc(a.dest || "-")}</td>
              <td>${esc(a.years || "-")}</td>
              <td style="color:var(--text-muted)">${esc(a.note || "-")}</td>
              <td class="actions">
                <button class="btn sm ghost" data-act="edit">수정</button>
                <button class="btn sm danger" data-act="del">삭제</button>
              </td>
            </tr>`
          )
          .join("")}</tbody>`;

      for (const tr of $$("tbody tr[data-id]", table)) {
        const a = alumni.find((x) => String(x.id) === tr.dataset.id);
        for (const btn of $$("[data-act]", tr)) {
          btn.addEventListener("click", async () => {
            if (btn.dataset.act === "edit") return openAlumniModal(a, load);
            if (!(await confirmBox(`${a.name} 졸업생을 삭제할까요?`))) return;
            try {
              await apiDelete(`admin/alumni/${a.id}`);
              toast("삭제했습니다.");
              load();
            } catch (e) {
              toast(e.message, true);
            }
          });
        }
      }
    } catch (e) {
      table.innerHTML = `<tbody><tr><td class="empty">${esc(e.message)}</td></tr></tbody>`;
    }
  };

  $("#al-new", body).addEventListener("click", () => openAlumniModal(null, load));
  await load();
}

function openAlumniModal(a, reload) {
  const isNew = !a;
  const v = (k, d = "") => esc((a && a[k] !== null && a[k] !== undefined ? a[k] : d));

  const form = html(`<form novalidate>
    <div class="grid-2">
      <div class="field"><label>이름 <span style="color:var(--red)">*</span></label>
        <input name="name" type="text" value="${v("name")}" placeholder="김 O 수"></div>
      <div class="field"><label>학년도</label>
        <input name="year" type="text" value="${v("year")}" placeholder="26학년도"></div>
    </div>
    <div class="field"><label>진학처</label>
      <input name="dest" type="text" value="${v("dest")}" placeholder="고려대학교 사범대학"></div>
    <div class="grid-2">
      <div class="field"><label>수강 기간</label>
        <input name="years" type="text" value="${v("years")}" placeholder="6년 수업"></div>
      <div class="field"><label>정렬 순서</label>
        <input name="sort_order" type="number" value="${v("sort_order", 0)}"></div>
    </div>
    <div class="field"><label>비고</label>
      <input name="note" type="text" value="${v("note")}"></div>
  </form>`);

  const modal = openModal({
    title: isNew ? "졸업생 등록" : "졸업생 수정",
    body: form,
    footer: modalFooter([
      { label: "취소", cls: "ghost", onClick: () => modal.close() },
      {
        label: "저장",
        cls: "red",
        onClick: async (btn) => {
          const d = readForm(form);
          if (!d.name.trim()) return toast("이름을 입력해 주세요.", true);
          const payload = {
            name: d.name.trim(),
            year: d.year,
            dest: d.dest,
            years: d.years,
            note: d.note,
            sort_order: Number(d.sort_order) || 0,
          };
          btn.disabled = true;
          try {
            if (isNew) await apiPost("admin/alumni", payload);
            else await apiPatch(`admin/alumni/${a.id}`, payload);
            toast("저장했습니다.");
            modal.close();
            reload();
          } catch (e) {
            toast(e.message, true);
            btn.disabled = false;
          }
        },
      },
    ]),
  });
}

/* ============================================================
   사이트 설정
   ============================================================ */

const SETTING_FIELDS = [
  ["notice_banner", "홈 상단 모집 배너", "9월 개강 · 신규 파닉스반 모집 중"],
  ["phone", "대표 전화", "031-8005-9439"],
  ["mobile", "휴대폰", "010-3323-9439"],
  ["email", "이메일", "garzetta@hanmail.net"],
  ["address", "위치", "초당마을 삼부르네상스아파트 상가동 204호"],
  // 카카오 채널 자리는 "상담신청 · 문의" 화면이 대신한다.
];

const isUrl = (v) => /^https?:\/\/\S+$/i.test(String(v || "").trim());

async function adminSettings(body) {
  body.innerHTML = `<div class="loading">불러오는 중…</div>`;
  let settings = {};
  let updated = {};
  try {
    const r = await apiGet("public/settings");
    settings = r.settings || {};
    updated = r.updated || {};
  } catch { /* 무시 */ }

  body.innerHTML = `
    <div class="card pad">
      <form id="set-form" novalidate>
        ${SETTING_FIELDS.map(
          ([key, label, ph]) => `<div class="field" data-key="${key}">
            <label>${esc(label)}</label>
            <input name="${key}" type="text" value="${esc(settings[key] || "")}" placeholder="${esc(ph)}">
            <div class="open-link"></div>
          </div>`
        ).join("")}
        <div class="hint" style="margin-bottom:14px">
          배너를 비워 두면 홈 화면에서 배너 줄이 사라집니다.
          배너 문구를 바꾸면 <b style="color:var(--red)">14일 동안 NEW 표시</b>가 붙습니다.
          ${bannerNewNote(updated.notice_banner)}
        </div>
        <button class="btn red" type="submit" id="set-save">저장</button>
      </form>
    </div>`;

  // 값이 주소면 바로 열어볼 수 있게 링크를 달아 준다 (입력하는 즉시 갱신).
  const syncLinks = () => {
    for (const field of $$(".field[data-key]", body)) {
      const input = $("input", field);
      const slot = $(".open-link", field);
      slot.innerHTML = isUrl(input.value)
        ? `<a href="${esc(input.value.trim())}" target="_blank" rel="noopener noreferrer">${esc(input.value.trim())} ↗</a>`
        : "";
    }
  };
  syncLinks();
  $("#set-form", body).addEventListener("input", syncLinks);

  $("#set-form", body).addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = readForm($("#set-form", body));
    const btn = $("#set-save", body);
    btn.disabled = true;
    btn.textContent = "저장 중…";
    try {
      await apiPut("admin/settings", { settings: d });
      clearCache();
      toast("저장했습니다.");
      adminSettings(body); // NEW 표시 안내를 최신 상태로 다시 그린다
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
      btn.textContent = "저장";
    }
  });
}

/** 배너가 아직 NEW 로 보이는 중이면 언제까지인지 알려 준다. */
function bannerNewNote(sqlDateTime) {
  if (!sqlDateTime) return "";
  const t = Date.parse(String(sqlDateTime).replace(" ", "T") + "Z");
  if (Number.isNaN(t)) return "";
  const until = t + 14 * 24 * 60 * 60 * 1000;
  if (until < Date.now()) return "";
  const d = new Date(until);
  return `<br>지금 배너는 <b>${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일</b>까지 NEW 로 표시됩니다.`;
}
