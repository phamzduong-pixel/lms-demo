(() => {
  const upload = document.querySelector("[data-cover-upload]");
  let preview = document.querySelector("[data-cover-preview]");
  const emptyLabel = document.querySelector("[data-cover-preview-label]");
  if (!upload || (!preview && !emptyLabel)) return;

  let objectUrl = "";
  const MAX_FILE_SIZE = 5 * 1024 * 1024;

  const showPreviewFallback = () => {
    if (preview) preview.hidden = true;
    if (emptyLabel) {
      emptyLabel.hidden = false;
      emptyLabel.textContent = "Không thể tải ảnh bìa";
    }
  };

  const watchPreview = (image) => {
    if (!image) return;
    image.addEventListener("error", showPreviewFallback, { once: true });
    if (image.complete && image.naturalWidth === 0) showPreviewFallback();
  };

  watchPreview(preview);

  upload.addEventListener("change", () => {
    const file = upload.files && upload.files[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      upload.setCustomValidity("Ảnh tải lên không được vượt quá 5 MB.");
      return;
    }
    upload.setCustomValidity("");
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);

    if (!preview && emptyLabel) {
      preview = document.createElement("img");
      preview.dataset.coverPreview = "";
      emptyLabel.parentElement.prepend(preview);
      emptyLabel.hidden = true;
    }
    if (preview) {
      preview.hidden = false;
      if (emptyLabel) emptyLabel.hidden = true;
      preview.src = objectUrl;
      preview.alt = "Ảnh xem trước";
      watchPreview(preview);
    }
  });

})();
