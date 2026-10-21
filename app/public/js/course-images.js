(() => {
  function markBroken(image) {
    const frame = image.closest("[data-cover-frame]");
    if (!frame) return;
    image.hidden = true;
    frame.classList.add("is-placeholder");
    frame.setAttribute("role", "img");
    frame.setAttribute("aria-label", image.alt || "Khóa học chưa có ảnh bìa");
  }

  function showFallback(image) {
    const fallback = image.dataset.coverFallback;
    if (fallback && image.getAttribute("src") !== fallback) {
      image.src = fallback;
      image.hidden = false;
      return;
    }
    markBroken(image);
  }

  document.querySelectorAll("[data-course-cover]").forEach((image) => {
    image.addEventListener("error", () => showFallback(image));
    if (image.complete && image.naturalWidth === 0) showFallback(image);
  });
})();
