const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Readable } = require("node:stream");
const { test } = require("node:test");
const multipart = require("../src/middleware/multipart");
const coverImages = require("../src/services/coverImageService");
const courseQueries = require("../src/queries/courseQueries");

const boundary = "----lms-cover-test";

function multipartBody({ fileBuffer = Buffer.alloc(0), filename = "", mimetype = "image/jpeg", fields = {} } = {}) {
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="cover_image_file"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`));
  parts.push(fileBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return Buffer.concat(parts);
}

function parseBody(body) {
  const request = Readable.from([body]);
  request.headers = {
    "content-type": `multipart/form-data; boundary=${boundary}`,
    "content-length": String(body.length)
  };
  return new Promise((resolve, reject) => {
    multipart.parseMultipart(request, {}, (error) => error ? reject(error) : resolve(request));
  });
}

async function exists(filepath) {
  try { await fs.access(filepath); return true; } catch { return false; }
}

function jpegBytes(size = 4) {
  const buffer = Buffer.alloc(size);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  return buffer;
}

test("multipart cho phép request lớn hơn file limit và chặn file trên 5 MiB", async () => {
  const accepted = await parseBody(multipartBody({
    fileBuffer: jpegBytes(multipart.MAX_FILE_SIZE),
    filename: "cover.jpg",
    fields: { title: "Khóa học thử" }
  }));
  assert.equal(accepted.file.size, multipart.MAX_FILE_SIZE);
  assert.equal(accepted.fileError, undefined);
  assert.equal(accepted.body.title, "Khóa học thử");

  const rejected = await parseBody(multipartBody({
    fileBuffer: jpegBytes(multipart.MAX_FILE_SIZE + 1),
    filename: "cover.jpg"
  }));
  assert.equal(rejected.file, null);
  assert.match(rejected.fileError, /5 MB/);
});

test("multipart chặn tổng request vượt quá 7 MiB", async () => {
  const body = Buffer.alloc(multipart.MAX_REQUEST_SIZE + 1);
  const request = Readable.from([body]);
  request.headers = {
    "content-type": `multipart/form-data; boundary=${boundary}`,
    "content-length": String(body.length)
  };
  await new Promise((resolve, reject) => {
    multipart.parseMultipart(request, {}, (error) => error ? reject(error) : resolve());
  });
  assert.match(request.fileError, /biểu mẫu tải lên vượt quá giới hạn/i);
});

test("service yêu cầu MIME khớp magic bytes và bỏ qua tên file gốc", async () => {
  assert.equal(coverImages.detectExtension({ buffer: jpegBytes(), mimetype: "image/png" }), null);
  assert.equal(coverImages.detectExtension({ buffer: jpegBytes(), mimetype: "image/jpeg", size: coverImages.MAX_COVER_SIZE + 1 }), null);

  const saved = await coverImages.saveCoverImage({
    originalname: "../../not-allowed.php",
    mimetype: "image/jpeg",
    buffer: jpegBytes()
  });
  try {
    assert.match(saved.url, /^\/uploads\/covers\/\d+-[0-9a-f-]+\.jpg$/);
    assert.equal(path.basename(saved.filepath).includes("not-allowed"), false);
    assert.equal(await exists(saved.filepath), true);
  } finally {
    await coverImages.removeSavedCover(saved.filepath);
  }
  assert.equal(await exists(saved.filepath), false);
});

test("ảnh mới được dọn khi cập nhật database thất bại", async () => {
  let newUrl = "";
  await assert.rejects(
    () => coverImages.persistCourseCoverUpdate({
      file: { mimetype: "image/jpeg", buffer: jpegBytes() },
      currentUrl: null,
      update: async (coverUrl) => { newUrl = coverUrl; throw new Error("database failed"); },
      confirmExists: async () => ({ id: 1 })
    }),
    /database failed/
  );
  assert.equal(await exists(coverImages.managedFilepathFromUrl(newUrl)), false);
});

test("affectedRows bằng 0 vẫn thành công nếu bản ghi còn tồn tại", async () => {
  const result = await coverImages.persistCourseCoverUpdate({
    file: { mimetype: "image/jpeg", buffer: jpegBytes() },
    currentUrl: null,
    update: async () => [{ affectedRows: 0 }],
    confirmExists: async () => ({ id: 4 })
  });
  try {
    assert.equal(result.ok, true);
  } finally {
    await coverImages.removeSavedCover(result.filepath);
  }
});

test("ảnh mới được dọn và trả not_found khi bản ghi không còn thuộc phạm vi", async () => {
  const result = await coverImages.persistCourseCoverUpdate({
    file: { mimetype: "image/jpeg", buffer: jpegBytes() },
    currentUrl: null,
    update: async () => [{ affectedRows: 0 }],
    confirmExists: async () => null
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "not_found");
  assert.equal(await exists(result.filepath), false);
});

test("ảnh cũ chỉ bị xóa khi không còn khóa học khác tham chiếu", async () => {
  const old = await coverImages.saveCoverImage({ mimetype: "image/jpeg", buffer: jpegBytes() });
  try {
    const kept = await coverImages.removeOldCoverIfUnreferenced({
      currentUrl: old.url,
      newUrl: "/uploads/covers/new.jpg",
      courseId: 8,
      countReferences: async () => 1
    });
    assert.equal(kept.reason, "still_referenced");
    assert.equal(await exists(old.filepath), true);

    const removed = await coverImages.removeOldCoverIfUnreferenced({
      currentUrl: old.url,
      newUrl: "/uploads/covers/newer.jpg",
      courseId: 8,
      countReferences: async () => 0
    });
    assert.equal(removed.removed, true);
    assert.equal(await exists(old.filepath), false);
  } finally {
    await coverImages.removeSavedCover(old.filepath);
  }
});

test("URL ngoài uploads/covers không được đưa vào thao tác xóa", async () => {
  let checked = false;
  const result = await coverImages.removeOldCoverIfUnreferenced({
    currentUrl: "https://example.test/cover.jpg",
    newUrl: "/uploads/covers/new.jpg",
    courseId: 1,
    countReferences: async () => { checked = true; return 0; }
  });
  assert.equal(result.skipped, true);
  assert.equal(checked, false);
});

test("course query đếm tham chiếu ảnh và loại trừ khóa đang cập nhật", async () => {
  let call;
  const pool = {
    execute: async (sql, params) => {
      call = { sql, params };
      return [[{ reference_count: "2" }]];
    }
  };
  assert.equal(await courseQueries.countCoverReferences(pool, "/uploads/covers/a.jpg", 9), 2);
  assert.match(call.sql, /cover_image_url = \?/);
  assert.match(call.sql, /id <> \?/);
  assert.deepEqual(call.params, ["/uploads/covers/a.jpg", 9]);
});

test("preview giữ nguyên khi change event không có file sau Cancel", async () => {
  const source = await fs.readFile(path.join(__dirname, "../public/js/course-form.js"), "utf8");
  assert.match(source, /const file = upload\.files && upload\.files\[0\];\s+if \(!file\) return;/);
  assert.match(source, /if \(file\.size > MAX_FILE_SIZE\)/);
});
