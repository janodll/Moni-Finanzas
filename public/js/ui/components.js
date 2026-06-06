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

  toast.innerHTML = `
    <div class="toast-icon">
      <i data-lucide="${iconName}"></i>
    </div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
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

export function removeToast(toast) {
  if (!toast.parentNode) return;
  toast.classList.add("removing");
  toast.addEventListener("transitionend", () => {
    toast.remove();
  });
}
