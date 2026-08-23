/**
 * 재원생 · 졸업생 · 학부모 후기
 *
 * 원장님도 쓰고, 로그인하지 않은 방문자도 쓸 수 있다.
 * 익명으로 쓴 글은 글쓴이가 정한 비밀번호로만 고치거나 지울 수 있고,
 * 원장님은 비밀번호 없이 모든 글을 고치고 지운다.
 */
import {
  $, $$, html, esc, api, apiGet, apiPost, toast, session,
  openModal, modalFooter, confirmBox, readForm, kstDate,
} from "./core.js";

export async function renderReviews(view) {
  view.innerHTML = "";
  view.append(html(`
    <div class="page-head"><div class="wrap">
      <h1>재원생 · 졸업생 · 학부모 후기</h1>
      <p>쥴리 잉글리쉬와 함께한 이야기를 남겨 주세요. 사진도 함께 올릴 수 있습니다.</p>
    </div></div>
    <section class="section"><div class="wrap">
      <div class="admin-toolbar" style="justify-content:flex-end">
        <button class="btn red" type="button" id="rv-new">＋ 후기 쓰기</button>
      </div>
      <div id="rv-list"><div class="loading">불러오는 중…</div></div>
    </div></section>
  `));

  const list = $("#rv-list", view);

  const load = async () => {
    try {
      const { reviews } = await apiGet("reviews");
      if (!reviews.length) {
        list.innerHTML = `<div class="empty">아직 등록된 후기가 없습니다.<br>첫 번째 후기를 남겨 주세요.</div>`;
        return;
      }
      list.innerHTML = reviews.map(reviewCard).join("");
      bindCards(list, reviews, load);
    } catch (e) {
      list.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
  };

  $("#rv-new", view).addEventListener("click", () => openReviewForm(null, load));
  await load();
}

/* ---------- 목록 ---------- */

const photoUrl = (key) => `/api/media/file/${key.split("/").map(encodeURIComponent).join("/")}`;

function reviewCard(r) {
  const photos = r.photos || [];
  return `<article class="rv-card" data-id="${r.id}">
    <div class="rv-head">
      <div>
        <span class="rv-author">${esc(r.author_name)}</span>
        ${r.author_role === "admin" ? `<span class="badge red">원장</span>` : ""}
      </div>
      <span class="rv-date">${esc(kstDate(r.created_at))}</span>
    </div>

    ${r.title ? `<h3 class="rv-title">${esc(r.title)}</h3>` : ""}
    <div class="rv-body">${esc(r.body)}</div>

    ${photos.length
      ? `<div class="rv-photos">${photos
          .map(
            (p) => `<button type="button" class="rv-photo" data-src="${esc(photoUrl(p.r2_key))}">
              <img src="${esc(photoUrl(p.r2_key))}" alt="" loading="lazy">
            </button>`
          )
          .join("")}</div>`
      : ""}

    <div class="rv-actions">
      <button class="btn sm ghost" data-act="edit">수정</button>
      <button class="btn sm danger" data-act="del">삭제</button>
    </div>
  </article>`;
}

function bindCards(root, reviews, reload) {
  for (const card of $$(".rv-card[data-id]", root)) {
    const r = reviews.find((x) => String(x.id) === card.dataset.id);

    for (const b of $$(".rv-photo[data-src]", card)) {
      b.addEventListener("click", () => openPhoto(b.dataset.src));
    }

    for (const btn of $$("[data-act]", card)) {
      btn.addEventListener("click", () => {
        if (btn.dataset.act === "edit") return openReviewForm(r, reload);
        return askDelete(r, reload);
      });
    }
  }
}

function openPhoto(src) {
  const box = html(`<div class="lightbox"><button class="close" type="button" aria-label="닫기">&times;</button><img src="${esc(src)}" alt=""></div>`);
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

/* ---------- 쓰기 / 수정 ---------- */

function openReviewForm(r, reload) {
  const isNew = !r;
  const isAdmin = session.isAdmin;
  // 원장님은 비밀번호를 쓰지 않는다. 원장님이 쓴 글도 원장님만 고칠 수 있다.
  const needPassword = !isAdmin;

  const photos = (r && r.photos) || [];

  const form = html(`<form id="rv-form" novalidate>
    ${isNew
      ? `<div class="field">
           <label>이름 <span class="req">*</span></label>
           <input name="author_name" type="text" placeholder="${isAdmin ? esc(session.user.name) : "홍길동 학부모"}"
                  value="${isAdmin ? esc(session.user.name) : ""}" maxlength="30">
         </div>`
      : `<div class="field"><label>이름</label><input type="text" value="${esc(r.author_name)}" readonly></div>`}

    <div class="field">
      <label>제목</label>
      <input name="title" type="text" value="${esc((r && r.title) || "")}" placeholder="비워 두셔도 됩니다" maxlength="80">
    </div>

    <div class="field">
      <label>내용 <span class="req">*</span></label>
      <textarea name="body" style="min-height:150px" maxlength="4000">${esc((r && r.body) || "")}</textarea>
    </div>

    ${photos.length
      ? `<div class="field">
          <label>올려둔 사진 (지울 사진을 눌러 주세요)</label>
          <div class="rv-edit-photos">${photos
            .map(
              (p) => `<button type="button" class="rv-edit-photo" data-pid="${p.id}">
                <img src="${esc(photoUrl(p.r2_key))}" alt=""><span class="x">&times;</span>
              </button>`
            )
            .join("")}</div>
        </div>`
      : ""}

    <div class="field">
      <label>사진 ${isNew ? "" : "추가"} (최대 5장, 한 장당 10MB)</label>
      <input name="photos" type="file" accept="image/*" multiple>
    </div>

    ${needPassword
      ? `<div class="field">
           <label>비밀번호 <span class="req">*</span></label>
           <input name="password" type="password" autocomplete="off" placeholder="${isNew ? "4자 이상 · 나중에 수정할 때 필요합니다" : "글을 쓸 때 정한 비밀번호"}">
           <div class="hint">${isNew ? "이 비밀번호가 있어야 나중에 직접 고치거나 지울 수 있습니다." : ""}</div>
         </div>`
      : ""}
  </form>`);

  // 지울 사진을 눌러서 표시해 둔다 (실제 삭제는 저장할 때).
  const removeIds = new Set();
  for (const b of $$(".rv-edit-photo", form)) {
    b.addEventListener("click", () => {
      const pid = b.dataset.pid;
      if (removeIds.has(pid)) {
        removeIds.delete(pid);
        b.classList.remove("marked");
      } else {
        removeIds.add(pid);
        b.classList.add("marked");
      }
    });
  }

  const modal = openModal({
    title: isNew ? "후기 쓰기" : "후기 수정",
    body: form,
    footer: modalFooter([
      { label: "취소", cls: "ghost", onClick: () => modal.close() },
      {
        label: "저장",
        cls: "red",
        onClick: async (btn) => {
          const d = readForm(form);
          if (isNew && !String(d.author_name || "").trim()) return toast("이름을 입력해 주세요.", true);
          if (!String(d.body || "").trim()) return toast("내용을 입력해 주세요.", true);
          if (needPassword && !d.password) return toast("비밀번호를 입력해 주세요.", true);
          if (needPassword && isNew && d.password.length < 4) {
            return toast("비밀번호를 4자 이상 입력해 주세요.", true);
          }

          const fd = new FormData();
          if (isNew) fd.append("author_name", d.author_name.trim());
          fd.append("title", d.title || "");
          fd.append("body", d.body.trim());
          if (needPassword) fd.append("password", d.password);
          if (removeIds.size) fd.append("remove_photos", [...removeIds].join(","));

          const files = [...($("[name=photos]", form).files || [])];
          if (files.length > 5) return toast("사진은 최대 5장까지 올릴 수 있습니다.", true);
          for (const f of files) fd.append("photos", f);

          btn.disabled = true;
          btn.textContent = "저장 중…";
          try {
            await api(isNew ? "reviews" : `reviews/${r.id}`, { method: "POST", body: fd });
            toast(isNew ? "후기를 올렸습니다." : "수정했습니다.");
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

/* ---------- 삭제 ---------- */

async function askDelete(r, reload) {
  // 원장님은 바로 확인만 하고 지운다.
  if (session.isAdmin) {
    if (!(await confirmBox(`${r.author_name}님의 후기를 삭제할까요?`))) return;
    try {
      await apiPost(`reviews/${r.id}/delete`, {});
      toast("삭제했습니다.");
      reload();
    } catch (e) {
      toast(e.message, true);
    }
    return;
  }

  if (r.author_role === "admin") {
    return toast("원장님이 쓴 글은 삭제할 수 없습니다.", true);
  }

  const form = html(`<form novalidate>
    <p style="margin:0 0 16px;font-size:15px">글을 쓸 때 정한 비밀번호를 입력해 주세요.</p>
    <div class="field">
      <label>비밀번호</label>
      <input name="password" type="password" autocomplete="off">
    </div>
  </form>`);

  const modal = openModal({
    title: "후기 삭제",
    body: form,
    footer: modalFooter([
      { label: "취소", cls: "ghost", onClick: () => modal.close() },
      {
        label: "삭제",
        cls: "danger",
        onClick: async (btn) => {
          const d = readForm(form);
          if (!d.password) return toast("비밀번호를 입력해 주세요.", true);
          btn.disabled = true;
          try {
            await apiPost(`reviews/${r.id}/delete`, { password: d.password });
            toast("삭제했습니다.");
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
