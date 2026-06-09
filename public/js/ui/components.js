// Componentes y utilidades compartidas de la UI de Moni

// Función para inicializar/actualizar iconos de Lucide de forma segura
export function safeCreateIcons() {
  if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
    try {
      lucide.createIcons();
    } catch (e) {
      console.error("Error al renderizar los iconos Lucide:", e);
    }
  } else {
    console.warn("La librería Lucide no está disponible.");
  }
}

// Sanitización básica de caracteres HTML para prevenir XSS (SEC-03)
export function escapeHTML(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Mostrar Toast de notificación
export function showToast(title, message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  // Iconos de Toasts
  let iconName = "check-circle";
  if (type === "error") iconName = "alert-circle";
  if (type === "info") iconName = "info";
  if (type === "warning") iconName = "alert-triangle";

  // SEC-04: título y mensaje se escapan siempre (pueden contener texto del
  // usuario o respuestas de la IA)
  toast.innerHTML = `
    <div class="toast-icon">
      <i data-lucide="${iconName}"></i>
    </div>
    <div class="toast-content">
      <div class="toast-title">${escapeHTML(title)}</div>
      <div class="toast-message">${escapeHTML(message)}</div>
    </div>
    <button class="toast-close">
      <i data-lucide="x" style="width:14px; height:14px;"></i>
    </button>
  `;

  container.appendChild(toast);
  safeCreateIcons();

  const closeBtn = toast.querySelector(".toast-close");
  closeBtn.addEventListener("click", () => {
    removeToast(toast);
  });

  setTimeout(() => {
    removeToast(toast);
  }, 4500);
}

// Toast con acción "Deshacer" (UX: borrado inmediato reversible, sin confirm())
export function showUndoToast(title, message, onUndo, duration = 6000) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "toast toast-info";

  toast.innerHTML = `
    <div class="toast-icon">
      <i data-lucide="trash-2"></i>
    </div>
    <div class="toast-content">
      <div class="toast-title">${escapeHTML(title)}</div>
      <div class="toast-message">${escapeHTML(message)}</div>
    </div>
    <button class="toast-undo-btn">Deshacer</button>
    <button class="toast-close">
      <i data-lucide="x" style="width:14px; height:14px;"></i>
    </button>
  `;

  container.appendChild(toast);
  safeCreateIcons();

  let undone = false;
  const timer = setTimeout(() => removeToast(toast), duration);

  toast.querySelector(".toast-undo-btn").addEventListener("click", () => {
    if (undone) return;
    undone = true;
    clearTimeout(timer);
    removeToast(toast);
    if (typeof onUndo === "function") onUndo();
  });

  toast.querySelector(".toast-close").addEventListener("click", () => {
    clearTimeout(timer);
    removeToast(toast);
  });
}

// ---- Modales propios (reemplazo de confirm()/prompt() nativos) ----

function buildModalShell() {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 420px;">
      <div class="modal-header">
        <h3 class="app-modal-title"></h3>
      </div>
      <p class="app-modal-message" style="color: var(--text-muted); font-size: 0.92rem; line-height: 1.5; margin: 0 0 18px 0; white-space: pre-line;"></p>
      <div class="app-modal-input-wrap" style="display:none; margin-bottom: 18px;">
        <input type="text" class="form-control app-modal-input">
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button class="btn btn-secondary app-modal-cancel" type="button"></button>
        <button class="btn app-modal-confirm" type="button"></button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

// Modal de confirmación. Devuelve Promise<boolean>.
export function showConfirmModal({ title = "Confirmar", message = "", confirmText = "Confirmar", cancelText = "Cancelar", danger = false } = {}) {
  return new Promise(resolve => {
    const modal = buildModalShell();
    modal.querySelector(".app-modal-title").textContent = title;
    modal.querySelector(".app-modal-message").textContent = message;

    const btnConfirm = modal.querySelector(".app-modal-confirm");
    const btnCancel = modal.querySelector(".app-modal-cancel");
    btnConfirm.textContent = confirmText;
    btnConfirm.classList.add(danger ? "btn-danger" : "btn-primary");
    btnCancel.textContent = cancelText;

    const close = (result) => {
      modal.classList.remove("active");
      setTimeout(() => modal.remove(), 250);
      document.removeEventListener("keydown", onKey);
      resolve(result);
    };

    const onKey = (e) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    };

    btnConfirm.addEventListener("click", () => close(true));
    btnCancel.addEventListener("click", () => close(false));
    modal.addEventListener("click", (e) => { if (e.target === modal) close(false); });
    document.addEventListener("keydown", onKey);

    requestAnimationFrame(() => modal.classList.add("active"));
    btnConfirm.focus();
  });
}

// Modal con campo de texto. Devuelve Promise<string|null>.
export function showInputModal({ title = "", message = "", placeholder = "", confirmText = "Aceptar", cancelText = "Cancelar", type = "text" } = {}) {
  return new Promise(resolve => {
    const modal = buildModalShell();
    modal.querySelector(".app-modal-title").textContent = title;
    modal.querySelector(".app-modal-message").textContent = message;

    const inputWrap = modal.querySelector(".app-modal-input-wrap");
    const input = modal.querySelector(".app-modal-input");
    inputWrap.style.display = "block";
    input.placeholder = placeholder;
    input.type = type;

    const btnConfirm = modal.querySelector(".app-modal-confirm");
    const btnCancel = modal.querySelector(".app-modal-cancel");
    btnConfirm.textContent = confirmText;
    btnConfirm.classList.add("btn-primary");
    btnCancel.textContent = cancelText;

    const close = (result) => {
      modal.classList.remove("active");
      setTimeout(() => modal.remove(), 250);
      document.removeEventListener("keydown", onKey);
      resolve(result);
    };

    const onKey = (e) => {
      if (e.key === "Escape") close(null);
      if (e.key === "Enter") close(input.value.trim() || null);
    };

    btnConfirm.addEventListener("click", () => close(input.value.trim() || null));
    btnCancel.addEventListener("click", () => close(null));
    modal.addEventListener("click", (e) => { if (e.target === modal) close(null); });
    document.addEventListener("keydown", onKey);

    requestAnimationFrame(() => modal.classList.add("active"));
    input.focus();
  });
}

export function removeToast(toast) {
  if (!toast.parentNode) return;
  toast.classList.add("removing");
  toast.addEventListener("transitionend", () => {
    toast.remove();
  });
}
