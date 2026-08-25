/**
 * 재원생 · 졸업생 · 학부모 후기
 *
 * 후기는 로그인하지 않은 방문자도 쓸 수 있다.
 * 다만 올라간 글을 고치거나 지우는 일은 원장님(관리자)만 한다 —
 * 화면에도 원장님으로 로그인했을 때만 수정·삭제 단추가 붙고,
 * 서버에서도 관리자가 아니면 막는다.
 *
 * 목록은 홈 화면과 똑같은 카드로 보여 주고, 카드를 누르면 글 전체와 사진이 창으로 뜬다.
 */
import {
  $, $$, html, esc, api, apiPost, apiGet, toast, session,
  openModal, modalFooter, confirmBox, readForm,
} from "./core.js";
import { reviewMiniCardHtml, openReviewView, reviewPhotoUrl } from "./public-pages.js";

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
      const isAdmin = session.isAdmin;
      list.innerHTML = `<div class="rv-mini-grid">${reviews
        .map((r) => reviewCellHtml(r, isAdmin))
        .join("")}</div>`;
      bindCards(list, reviews, load);
    } catch (e) {
      list.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
  };

  $("#rv-new", view).addEventListener("click", () => openReviewForm(null, load));
  await load();
}

/* ---------- 목록 ---------- */

/**
 * 카드 한 장. 홈과 같은 카드를 그대로 쓰고, 원장님일 때만 아래에 수정·삭제 줄을 덧댄다.
 * (카드 자체가 button 이라 그 안에 단추를 넣을 수 없어서 바깥 상자로 감싼다)
 */
function reviewCellHtml(r, isAdmin) {
  return `<div class="rv-cell" data-id="${r.id}">
    ${reviewMiniCardHtml(r)}
    ${isAdmin
      ? `<div class="rv-cell-admin">
           <button class="btn sm ghost" type="button" data-act="edit">수정</button>
           <button class="btn sm danger" type="button" data-act="del">삭제</button>
         </div>`
      : ""}
  </div>`;
}

function bindCards(root, reviews, reload) {
  for (const cell of $$(".rv-cell[data-id]", root)) {
    const r = reviews.find((x) => String(x.id) === cell.dataset.id);
    if (!r) continue;

    const card = $(".rv-mini", cell);
    if (card) card.addEventListener("click", () => openReviewView(r));

    for (const btn of $$("[data-act]", cell)) {
      btn.addEventListener("click", () => {
        if (btn.dataset.act === "edit") return openReviewForm(r, reload);
        return askDelete(r, reload);
      });
    }
  }
}

/* ---------- 쓰기 / 수정 ---------- */

function openReviewForm(r, reload) {
  const isNew = !r;
  const isAdmin = session.isAdmin;

  // 고치는 일은 원장님만 한다. 주소를 직접 두드려 봐도 서버가 다시 막지만,
  // 화면에서도 여기서 한 번 걸러 준다.
  if (!isNew && !isAdmin) {
    return toast("후기 수정은 원장님만 할 수 있습니다.", true);
  }

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
                <img src="${esc(reviewPhotoUrl(p.r2_key))}" alt=""><span class="x">&times;</span>
              </button>`
            )
            .join("")}</div>
        </div>`
      : ""}

    <div class="field">
      <label>사진 ${isNew ? "" : "추가"} (최대 5장, 한 장당 10MB)</label>
      <input name="photos" type="file" accept="image/*" multiple>
    </div>

    ${isNew && !isAdmin
      ? `<div class="hint">올리신 후기는 바로 홈페이지에 올라갑니다.
           고치거나 지울 일이 생기면 원장님께 말씀해 주세요.</div>`
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

          const fd = new FormData();
          if (isNew) fd.append("author_name", d.author_name.trim());
          fd.append("title", d.title || "");
          fd.append("body", d.body.trim());
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
  if (!session.isAdmin) {
    return toast("후기 삭제는 원장님만 할 수 있습니다.", true);
  }
  if (!(await confirmBox(`${r.author_name}님의 후기를 삭제할까요?`))) return;
  try {
    await apiPost(`reviews/${r.id}/delete`, {});
    toast("삭제했습니다.");
    reload();
  } catch (e) {
    toast(e.message, true);
  }
}
