const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const uploadDirectory = path.join(__dirname, "..", "public", "uploads", "covers");
const publicPrefix = "/uploads/covers/";
const MAX_COVER_SIZE = 5 * 1024 * 1024;
const managedFilenamePattern = /^\d+-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|gif|webp)$/;

function publicUrl(filename) {
  return publicPrefix + encodeURIComponent(filename);
}

function detectExtension(file) {
  const buffer = file && file.buffer;
  const mimetype = String(file && file.mimetype || "").toLowerCase();
  if (!Buffer.isBuffer(buffer) || !buffer.length) return null;
  if (buffer.length > MAX_COVER_SIZE || (file.size != null && Number(file.size) > MAX_COVER_SIZE)) return null;
  if (mimetype === "image/jpeg" && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return ".jpg";
  if (mimetype === "image/png" && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return ".png";
  if (mimetype === "image/gif" && buffer.subarray(0, 4).toString() === "GIF8") return ".gif";
  if (mimetype === "image/webp" && buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP") return ".webp";
  return null;
}

function managedFilepathFromUrl(value) {
  if (typeof value !== "string" || !value.startsWith(publicPrefix)) return null;
  const encodedFilename = value.slice(publicPrefix.length);
  if (!encodedFilename || encodedFilename.includes("/") || encodedFilename.includes("\\") || encodedFilename.includes("?") || encodedFilename.includes("#")) return null;
  let filename;
  try { filename = decodeURIComponent(encodedFilename); } catch { return null; }
  if (!managedFilenamePattern.test(filename)) return null;
  const filepath = path.resolve(uploadDirectory, filename);
  const directory = path.resolve(uploadDirectory) + path.sep;
  return filepath.startsWith(directory) ? filepath : null;
}

function isManagedFilepath(filepath) {
  if (typeof filepath !== "string") return false;
  const resolved = path.resolve(filepath);
  const directory = path.resolve(uploadDirectory) + path.sep;
  return resolved.startsWith(directory) && managedFilenamePattern.test(path.basename(resolved));
}

function logCleanupFailure(phase, filepath, error) {
  console.error(JSON.stringify({
    type: "cover_image_cleanup_failed",
    severity: "warning",
    phase,
    filename: path.basename(filepath),
    reason: error && error.code || "unlink_failed"
  }));
}

async function saveCoverImage(file) {
  const extension = detectExtension(file);
  if (!extension) return { error: "Chỉ chấp nhận ảnh JPG, PNG, GIF hoặc WebP hợp lệ, tối đa 5 MB." };
  await fsp.mkdir(uploadDirectory, { recursive: true });
  const filename = `${Date.now()}-${crypto.randomUUID()}${extension}`;
  const filepath = path.join(uploadDirectory, filename);
  await fsp.writeFile(filepath, file.buffer, { flag: "wx" });
  return { url: publicUrl(filename), filepath };
}

async function removeSavedCover(filepath, phase = "temporary_upload") {
  if (!isManagedFilepath(filepath)) return { removed: false, skipped: true };
  try {
    await fsp.unlink(filepath);
    return { removed: true };
  } catch (error) {
    if (error && error.code === "ENOENT") return { removed: false, alreadyMissing: true };
    logCleanupFailure(phase, filepath, error);
    return { removed: false, error: true };
  }
}

async function removeOldCoverIfUnreferenced({ currentUrl, newUrl, courseId, countReferences }) {
  if (!currentUrl || currentUrl === newUrl) return { removed: false, skipped: true };
  const filepath = managedFilepathFromUrl(currentUrl);
  if (!filepath || typeof countReferences !== "function") return { removed: false, skipped: true };

  let referenceCount;
  try {
    referenceCount = Number(await countReferences(currentUrl, courseId));
  } catch (error) {
    logCleanupFailure("reference_check", filepath, error);
    return { removed: false, error: true };
  }
  if (referenceCount > 0) return { removed: false, skipped: true, reason: "still_referenced" };
  return removeSavedCover(filepath, "old_cover");
}

async function resolveCoverImage({ file, currentUrl }) {
  if (file) return saveCoverImage(file);
  return { url: currentUrl || null };
}

async function persistCourseCoverUpdate({ file, currentUrl, update, confirmExists }) {
  const cover = await resolveCoverImage({ file, currentUrl });
  if (cover.error) return cover;

  try {
    const queryResult = await update(cover.url);
    const result = Array.isArray(queryResult) ? queryResult[0] : queryResult;
    if (!result) throw new Error("Course cover update did not return a database result.");
    if (Number(result.affectedRows) === 0 && !(await confirmExists())) {
      await removeSavedCover(cover.filepath, "database_rejected");
      return { ...cover, ok: false, reason: "not_found" };
    }
    return { ...cover, ok: true, result };
  } catch (error) {
    await removeSavedCover(cover.filepath, "database_failed");
    throw error;
  }
}

module.exports = {
  MAX_COVER_SIZE,
  detectExtension,
  managedFilepathFromUrl,
  removeOldCoverIfUnreferenced,
  removeSavedCover,
  resolveCoverImage,
  persistCourseCoverUpdate,
  saveCoverImage
};
