(() => {
  function markBroken(image) {
    const frame = image.closest("[data-cover-frame]");
    if (!frame) return;
    image.hidden = true;
    frame.classList.add("is-placeholder");
    frame.setAttribute("role", "img");
    frame.setAttribute("aria-label", image.alt || "Khóa học chưa có ảnh bìa");
  }

  document.querySelectorAll("[data-course-cover]").forEach((image) => {
    image.addEventListener("error", () => markBroken(image), { once: true });
    if (image.complete && image.naturalWidth === 0) markBroken(image);
  });
})();
