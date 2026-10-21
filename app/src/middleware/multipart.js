const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_REQUEST_SIZE = 7 * 1024 * 1024;

function parseHeaders(rawHeaders) {
  const headers = {};
  rawHeaders.split("\r\n").forEach((line) => {
    const separator = line.indexOf(":");
    if (separator < 1) return;
    headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
  });
  return headers;
}

function parseDisposition(value) {
  const name = /(?:^|;)\s*name="([^"]*)"/i.exec(value || "");
  const filename = /(?:^|;)\s*filename="([^"]*)"/i.exec(value || "");
  return { name: name && name[1], filename: filename && filename[1] };
}

function parseMultipartBuffer(buffer, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const headerSeparator = Buffer.from("\r\n\r\n");
  const fields = {};
  let file = null;
  let cursor = buffer.indexOf(delimiter);
  let partCount = 0;

  if (cursor !== 0) throw new Error("Multipart body không hợp lệ.");

  while (cursor >= 0) {
    cursor += delimiter.length;
    if (buffer.subarray(cursor, cursor + 2).toString() === "--") break;
    if (buffer.subarray(cursor, cursor + 2).toString() !== "\r\n") {
      throw new Error("Multipart boundary không hợp lệ.");
    }
    cursor += 2;

    const headerEnd = buffer.indexOf(headerSeparator, cursor);
    if (headerEnd < 0) throw new Error("Multipart header không hợp lệ.");
    const headers = parseHeaders(buffer.subarray(cursor, headerEnd).toString("utf8"));
    const disposition = parseDisposition(headers["content-disposition"]);
    if (!disposition.name) throw new Error("Multipart field không có tên.");

    const contentStart = headerEnd + headerSeparator.length;
    const nextBoundary = buffer.indexOf(delimiter, contentStart);
    if (nextBoundary < 0) throw new Error("Multipart content không kết thúc đúng cách.");
    const contentEnd = nextBoundary - 2;
    if (contentEnd < contentStart) throw new Error("Multipart content không hợp lệ.");

    partCount += 1;
    if (partCount > 20) throw new Error("Form có quá nhiều trường dữ liệu.");

    const content = buffer.subarray(contentStart, contentEnd);
    if (disposition.filename !== null) {
      if (disposition.name === "cover_image_file" && disposition.filename) {
        file = {
          originalname: disposition.filename,
          mimetype: headers["content-type"] || "",
          buffer: content,
          size: content.length
        };
      }
    } else {
      fields[disposition.name] = content.toString("utf8");
    }

    cursor = nextBoundary;
  }

  return { fields, file };
}

function parseMultipart(req, res, next) {
  const contentType = String(req.headers["content-type"] || "");
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) return next();

  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!boundaryMatch) {
    req.fileError = "Form tải ảnh không hợp lệ.";
    req.body = {};
    return next();
  }

  const declaredLength = Number(req.headers["content-length"] || 0);
  if (declaredLength > MAX_REQUEST_SIZE) {
    req.fileError = "Biểu mẫu tải lên vượt quá giới hạn cho phép.";
    req.body = {};
    req.resume();
    return req.on("end", next);
  }

  const chunks = [];
  let total = 0;
  let tooLarge = false;

  req.on("data", (chunk) => {
    total += chunk.length;
    if (total <= MAX_REQUEST_SIZE) chunks.push(chunk);
    else tooLarge = true;
  });
  req.on("error", next);
  req.on("end", () => {
    if (tooLarge) {
      req.fileError = "Biểu mẫu tải lên vượt quá giới hạn cho phép.";
      req.body = {};
      return next();
    }
    try {
      const parsed = parseMultipartBuffer(Buffer.concat(chunks), boundaryMatch[1] || boundaryMatch[2]);
      req.body = parsed.fields;
      req.file = parsed.file;
      if (req.file && req.file.size > MAX_FILE_SIZE) {
        req.file = null;
        req.fileError = "Ảnh tải lên không được vượt quá 5 MB.";
      }
      return next();
    } catch {
      req.fileError = "Không thể đọc form tải ảnh.";
      req.body = {};
      return next();
    }
  });
}

module.exports = { MAX_FILE_SIZE, MAX_REQUEST_SIZE, parseMultipart };
