"use strict";

const STORAGE_KEY = "task-manager-v2";
const LEGACY_STORAGE_KEY = "task-manager-v1";

const COLORS = [
  "#fff1c6",
  "#fbe3d3",
  "#edc0f5",
  "#deefd4",
  "#d9e9f7"
];

const byId = (id) =>
  document.getElementById(id);

const form = byId("taskForm");
const dialog = byId("taskDialog");

const state = {
  tasks: loadTasks(),
  selected: null
};


/* ==============================
   データの保存と読み込み
============================== */

function loadTasks() {
  try {
    const saved =
      localStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem(
        LEGACY_STORAGE_KEY
      ) ||
      "[]";

    const parsed = JSON.parse(saved);

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(state.tasks)
  );
}


/* ==============================
   日付と時刻
============================== */

function localDateString(
  date = new Date()
) {
  const offset =
    date.getTimezoneOffset() * 60000;

  return new Date(
    date.getTime() - offset
  )
    .toISOString()
    .slice(0, 10);
}

function normalizeTime(value) {
  const text =
    String(value || "").trim();

  /*
   930、0930、9:30、09:30に対応
  */
  const match = text.match(
    /^(\d{1,2})(?::?)(\d{2})$/
  );

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    hour > 23 ||
    minute > 59
  ) {
    return null;
  }

  return (
    `${String(hour).padStart(2, "0")}:` +
    `${String(minute).padStart(2, "0")}`
  );
}

function joinDateTime(date, time) {
  const normalized =
    normalizeTime(time);

  if (!date || !normalized) {
    return null;
  }

  return `${date}T${normalized}`;
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "ja-JP",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }
  ).format(date);
}

function formatTime(value) {
  return new Intl.DateTimeFormat(
    "ja-JP",
    {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }
  ).format(new Date(value));
}


/* ==============================
   安全な文字表示
============================== */

function escapeHtml(value = "") {
  return String(value).replace(
    /[&<>'"]/g,
    (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      "\"": "&quot;"
    }[character])
  );
}


/* ==============================
   通知
============================== */

function showToast(message) {
  const toast = byId("toast");

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(
    () => {
      toast.classList.remove("show");
    },
    1800
  );
}


/* ==============================
   画面切り替え
============================== */

function showScreen(screenId) {
  document
    .querySelectorAll(".screen")
    .forEach((screen) => {
      screen.classList.toggle(
        "active",
        screen.id === screenId
      );
    });

  document
    .querySelectorAll(
      ".bottom-nav button"
    )
    .forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.screen ===
          screenId
      );
    });

  const isGreenHeader =
    screenId === "inputScreen" ||
    screenId === "listScreen";

  document.querySelector(
    ".header"
  ).style.background = isGreenHeader
    ? "var(--header-green)"
    : "var(--header-blue)";

  document.querySelector(
    ".header h1"
  ).style.color = isGreenHeader
    ? "#70af45"
    : "#477dc9";

  if (
    screenId === "timelineScreen"
  ) {
    renderTimeline();
  }

  if (
    screenId === "listScreen"
  ) {
    renderLists();
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


/* ==============================
   表示色
============================== */

function renderColors() {
  byId("colorOptions").innerHTML =
    COLORS.map(
      (color, index) => `
        <label
          class="color-choice${
            index === 0
              ? " selected"
              : ""
          }"
          style="background:${color}"
          aria-label="表示色${index + 1}"
        >
          <input
            type="radio"
            name="taskColor"
            value="${color}"
            ${
              index === 0
                ? "checked"
                : ""
            }
          >
        </label>
      `
    ).join("");

  updateTaskFormColor();
}

function updateTaskFormColor() {
  const selected =
    document.querySelector(
      'input[name="taskColor"]:checked'
    );

  if (!selected) {
    return;
  }

  /*
   選択色をタスク入力欄全体に反映
  */
  form.style.backgroundColor =
    selected.value;

  document
    .querySelectorAll(".color-choice")
    .forEach((choice) => {
      choice.classList.toggle(
        "selected",
        choice.contains(selected)
      );
    });
}

function resetForm() {
  form.reset();

  const firstColor =
    document.querySelector(
      'input[name="taskColor"]'
    );

  if (firstColor) {
    firstColor.checked = true;
  }

  updateTaskFormColor();
}


/* ==============================
   時系列用データ
============================== */

function getTimelineEvents(date) {
  const events = [];

  state.tasks
    .filter(
      (task) => !task.completedAt
    )
    .forEach((task) => {
      if (
        task.startAt &&
        !task.startAcknowledged &&
        task.startAt.slice(0, 10) ===
          date
      ) {
        events.push({
          task,
          type: "start",
          time: task.startAt
        });
      }

      if (
        task.deadlineAt &&
        task.deadlineAt.slice(0, 10) ===
          date
      ) {
        events.push({
          task,
          type: "deadline",
          time: task.deadlineAt
        });
      }
    });

  return events.sort(
    (first, second) =>
      new Date(first.time) -
      new Date(second.time)
  );
}


/* ==============================
   時系列画面
============================== */

function renderTimeline() {
  const selectedDate =
    byId("timelineDate").value ||
    localDateString();

  byId("timelineDate").value =
    selectedDate;

  const events =
    getTimelineEvents(selectedDate);

  const container =
    byId("timelineItems");

  const axis =
    byId("timelineAxis");

  if (!events.length) {
    container.innerHTML = `
      <p class="empty-message">
        この日の予定はありません。
      </p>
    `;

    axis.classList.add("hidden");

    return;
  }

  container.innerHTML =
    events.map(
      ({
        task,
        type,
        time
      }) => `
        <div class="timeline-group">
          <div class="timeline-time">
            ${formatTime(time)}
          </div>

          <div class="timeline-cards">
            <button
              type="button"
              class="task-card ${type}"
              style="--task-color:${
                task.color || COLORS[0]
              }"
              data-task-id="${task.id}"
              data-event-type="${type}"
            >
              ${escapeHtml(task.name)}

              <small>
                ${
                  type === "start"
                    ? "開始時刻"
                    : "締め切り時刻"
                }
              </small>
            </button>
          </div>
        </div>
      `
    ).join("");

  requestAnimationFrame(
    updateTimelineAxis
  );
}


/* ==============================
   時系列の矢印
============================== */

function updateTimelineAxis() {
  const groups = [
    ...byId("timelineItems")
      .querySelectorAll(
        ".timeline-group"
      )
  ];

  const axis =
    byId("timelineAxis");

  if (!groups.length) {
    axis.classList.add("hidden");
    return;
  }

  const first = groups[0];
  const last =
    groups[groups.length - 1];

  const itemsTop =
    byId("timelineItems").offsetTop;

  const start =
    itemsTop +
    first.offsetTop +
    first.offsetHeight / 2;

  const end =
    itemsTop +
    last.offsetTop +
    last.offsetHeight / 2;

  axis.style.top =
    `${start}px`;

  axis.style.height =
    `${Math.max(end - start, 30)}px`;

  axis.classList.remove("hidden");
}


/* ==============================
   表示期間
============================== */

function withinPeriod(
  date,
  start,
  end
) {
  return Boolean(
    date &&
    (!start || date >= start) &&
    (!end || date <= end)
  );
}


/* ==============================
   一覧の行
============================== */

function pendingRow(task) {
  return `
    <tr
      class="clickable-row"
      data-task-id="${task.id}"
    >
      <td>
        ${escapeHtml(task.name)}
      </td>

      <td>
        ${formatDateTime(task.startAt)}
      </td>

      <td>
        ${formatDateTime(
          task.deadlineAt
        )}
      </td>

      <td>
        ${escapeHtml(task.memo || "")}
      </td>
    </tr>
  `;
}

function completedRow(task) {
  return `
    <tr>
      <td>
        ${escapeHtml(task.name)}
      </td>

      <td>
        ${formatDateTime(
          task.completedAt
        )}
      </td>

      <td>
        ${escapeHtml(task.memo || "")}
      </td>
    </tr>
  `;
}


/* ==============================
   一覧画面
============================== */

function renderLists() {
  const start =
    byId("listStartDate").value;

  const end =
    byId("listEndDate").value;

  const error =
    byId("periodError");

  if (
    start &&
    end &&
    start > end
  ) {
    error.textContent =
      "終了日は開始日以降にしてください。";

    byId(
      "completedTable"
    ).innerHTML = "";

    byId(
      "pendingTable"
    ).innerHTML = "";

    return;
  }

  error.textContent = "";

  /*
   未完了タスクは締め切り日を基準に抽出
  */
  const pending = state.tasks
    .filter((task) => {
      return (
        !task.completedAt &&
        task.deadlineAt
      );
    })
    .filter((task) => {
      return withinPeriod(
        task.deadlineAt.slice(0, 10),
        start,
        end
      );
    })
    .sort((first, second) => {
      return (
        new Date(first.deadlineAt) -
        new Date(second.deadlineAt)
      );
    });

  /*
   完了済みタスクは完了日を基準に抽出
  */
  const completed = state.tasks
    .filter(
      (task) => task.completedAt
    )
    .filter((task) => {
      return withinPeriod(
        localDateString(
          new Date(task.completedAt)
        ),
        start,
        end
      );
    })
    .sort((first, second) => {
      return (
        new Date(second.completedAt) -
        new Date(first.completedAt)
      );
    });

  if (pending.length) {
    byId("pendingTable").innerHTML =
      pending
        .map(pendingRow)
        .join("");
  } else {
    byId("pendingTable").innerHTML = `
      <tr class="empty-row">
        <td colspan="4">
          該当する未完了タスクはありません。
        </td>
      </tr>
    `;
  }

  if (completed.length) {
    byId("completedTable").innerHTML =
      completed
        .map(completedRow)
        .join("");
  } else {
    byId("completedTable").innerHTML = `
      <tr class="empty-row">
        <td colspan="3">
          該当する完了済みタスクはありません。
        </td>
      </tr>
    `;
  }
}


/* ==============================
   予定確認画面
============================== */

function openTaskDialog(
  taskId,
  eventType
) {
  const task = state.tasks.find(
    (item) => item.id === taskId
  );

  if (!task) {
    return;
  }

  state.selected = {
    taskId,
    eventType
  };

  const isStart =
    eventType === "start";

  byId("dialogName").textContent =
    task.name;

  byId(
    "dialogTimeTitle"
  ).textContent = isStart
    ? "開始時刻"
    : "締め切り時刻";

  byId("dialogTime").textContent =
    formatDateTime(
      isStart
        ? task.startAt
        : task.deadlineAt
    );

  byId("dialogMemo").textContent =
    task.memo || "なし";

  byId(
    "dialogConfirm"
  ).textContent = isStart
    ? "了解"
    : "完了";

  byId(
    "dialogConfirm"
  ).classList.toggle(
    "acknowledge",
    isStart
  );

  dialog.showModal();
}

function confirmSelectedTask() {
  if (!state.selected) {
    return;
  }

  const task = state.tasks.find(
    (item) => {
      return (
        item.id ===
        state.selected.taskId
      );
    }
  );

  if (!task) {
    return;
  }

  if (
    state.selected.eventType ===
    "start"
  ) {
    /*
     開始時刻の「了解」は
     開始カードだけを消す
    */
    task.startAcknowledged = true;

    showToast(
      "開始予定を確認しました"
    );
  } else {
    /*
     締め切り時刻の「完了」は
     タスクを完了済みに移動
    */
    task.completedAt =
      new Date().toISOString();

    showToast(
      "タスクを完了しました"
    );
  }

  saveTasks();

  dialog.close();

  state.selected = null;

  renderTimeline();
  renderLists();
}


/* ==============================
   タスク登録
============================== */

form.addEventListener(
  "submit",
  (event) => {
    event.preventDefault();

    const name =
      byId("taskName")
        .value
        .trim();

    const startDate =
      byId("startDate").value;

    const startTime =
      byId("startTime")
        .value
        .trim();

    const deadlineDate =
      byId("deadlineDate").value;

    const deadlineTime =
      byId("deadlineTime")
        .value
        .trim();

    const hasAnyStart =
      Boolean(
        startDate ||
        startTime
      );

    const startAt = hasAnyStart
      ? joinDateTime(
          startDate,
          startTime
        )
      : "";

    const deadlineAt =
      joinDateTime(
        deadlineDate,
        deadlineTime
      );

    if (
      hasAnyStart &&
      !startAt
    ) {
      showToast(
        "開始日と開始時刻を両方入力してください"
      );

      if (!startDate) {
        byId("startDate").focus();
      } else {
        byId("startTime").focus();
      }

      return;
    }

    if (!deadlineAt) {
      showToast(
        "締め切り日と時刻を入力してください"
      );

      if (!deadlineDate) {
        byId("deadlineDate").focus();
      } else {
        byId("deadlineTime").focus();
      }

      return;
    }

    if (
      startAt &&
      new Date(startAt) >
        new Date(deadlineAt)
    ) {
      showToast(
        "開始時刻は締め切り時刻以前にしてください"
      );

      return;
    }

    const selectedColor =
      document.querySelector(
        'input[name="taskColor"]:checked'
      );

    state.tasks.push({
      id:
        typeof crypto !== "undefined" &&
        crypto.randomUUID
          ? crypto.randomUUID()
          : (
            `${Date.now()}-` +
            `${Math.random()}`
          ),

      name,

      startAt,

      deadlineAt,

      memo:
        byId("taskMemo")
          .value
          .trim(),

      color:
        selectedColor
          ? selectedColor.value
          : COLORS[0],

      startAcknowledged: false,

      completedAt: null,

      createdAt:
        new Date().toISOString()
    });

    saveTasks();

    resetForm();

    showToast(
      "タスクを登録しました"
    );

    byId("timelineDate").value =
      deadlineDate;

    showScreen(
      "timelineScreen"
    );
  }
);


/* ==============================
   下部メニュー
============================== */

document
  .querySelector(".bottom-nav")
  .addEventListener(
    "click",
    (event) => {
      const button =
        event.target.closest(
          "button[data-screen]"
        );

      if (!button) {
        return;
      }

      showScreen(
        button.dataset.screen
      );
    }
  );


/* ==============================
   時系列タスクの選択
============================== */

byId("timelineItems")
  .addEventListener(
    "click",
    (event) => {
      const card =
        event.target.closest(
          "button.task-card"
        );

      if (!card) {
        return;
      }

      openTaskDialog(
        card.dataset.taskId,
        card.dataset.eventType
      );
    }
  );


/* ==============================
   一覧タスクの選択
============================== */

byId("pendingTable")
  .addEventListener(
    "click",
    (event) => {
      const row =
        event.target.closest(
          "tr[data-task-id]"
        );

      if (!row) {
        return;
      }

      openTaskDialog(
        row.dataset.taskId,
        "deadline"
      );
    }
  );


/* ==============================
   その他の操作
============================== */

byId("cancelButton")
  .addEventListener(
    "click",
    resetForm
  );

byId("colorOptions")
  .addEventListener(
    "change",
    updateTaskFormColor
  );

byId("timelineDate")
  .addEventListener(
    "change",
    renderTimeline
  );

byId("listStartDate")
  .addEventListener(
    "change",
    renderLists
  );

byId("listEndDate")
  .addEventListener(
    "change",
    renderLists
  );

byId("dialogBack")
  .addEventListener(
    "click",
    () => {
      dialog.close();
    }
  );

byId("dialogConfirm")
  .addEventListener(
    "click",
    confirmSelectedTask
  );

window.addEventListener(
  "resize",
  updateTimelineAxis
);

dialog.addEventListener(
  "click",
  (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  }
);


/* ==============================
   初期表示
============================== */

renderColors();

byId("timelineDate").value =
  localDateString();

renderTimeline();
renderLists();

showScreen("inputScreen");