import fs from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { HttpError } from "../utils/errors";

export const uploadRoot = path.resolve(process.cwd(), "uploads");
export const maxMediaUploadBytes = 250 * 1024 * 1024;
export const maxMediaUploadMegabytes = Math.round(maxMediaUploadBytes / (1024 * 1024));

fs.mkdirSync(uploadRoot, { recursive: true });

export function createMediaUpload(destination: string) {
  const storage: multer.StorageEngine = {
    _handleFile(req, file, callback) {
      const filename = `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`;
      const filePath = path.join(destination, filename);
      const output = fs.createWriteStream(filePath, { flags: "wx" });
      let finished = false;
      const remove = () => fs.unlink(filePath, error => {
        if (error && error.code !== "ENOENT") console.error("Failed to remove interrupted upload", error.code);
      });
      const detach = () => { req.off("aborted", abort); req.off("end", detach); };
      const abort = () => {
        file.stream.unpipe(output);
        file.stream.destroy();
        // Keep completed siblings covered until the entire multipart body ends.
        if (finished) remove();
        else output.destroy(new HttpError(408, "上传超时，请重试"));
        detach();
      };
      req.once("aborted", abort);
      req.once("end", detach);
      output.once("error", error => { detach(); callback(error); });
      output.once("close", () => { if (!finished) remove(); });
      output.once("finish", () => {
        finished = true;
        callback(null, { destination, filename, path: filePath, size: output.bytesWritten });
      });
      file.stream.once("error", () => { detach(); output.destroy(); });
      file.stream.pipe(output);
      if (req.aborted) abort();
    },
    _removeFile(_req, file, callback) {
      fs.unlink(file.path, error => callback(error?.code === "ENOENT" ? null : error));
    }
  };
  return multer({
    storage,
    limits: {
      fileSize: maxMediaUploadBytes
    },
    fileFilter: (_req, file, callback) => {
      if (!file.mimetype.startsWith("image/") && !file.mimetype.startsWith("video/")) {
        callback(new HttpError(400, "Only image or video uploads are supported"));
        return;
      }

      callback(null, true);
    }
  });
}

export const mediaUpload = createMediaUpload(uploadRoot);
