import fs from "fs";
import path from "path";
import multer from "multer";
import { HttpError } from "../utils/errors";

export const uploadRoot = path.resolve(process.cwd(), "uploads");
export const maxMediaUploadBytes = 250 * 1024 * 1024;
export const maxMediaUploadMegabytes = Math.round(maxMediaUploadBytes / (1024 * 1024));

fs.mkdirSync(uploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadRoot);
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`;
    callback(null, safeName);
  }
});

export const mediaUpload = multer({
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
