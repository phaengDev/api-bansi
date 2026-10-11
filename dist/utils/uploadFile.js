"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.editFile = exports.deleteUploadedFilesError = exports.deleteFileByPath = exports.deleteFile = exports.createUploadFile = exports.createUploadFields = exports.createUpload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// import fs from "fs/promises"; 
const createUpload = (folderName) => {
    const uploadPath = path_1.default.join(__dirname, "..", "uploads", folderName);
    fs_1.default.mkdirSync(uploadPath, { recursive: true });
    const storage = multer_1.default.diskStorage({
        destination: (_, __, cb) => {
            cb(null, uploadPath);
        },
        filename: (_, file, cb) => {
            const unique = `${Date.now()}${Math.round(Math.random() * 1e5)}${path_1.default.extname(file.originalname)}`;
            cb(null, unique);
        },
    });
    return (0, multer_1.default)({
        storage,
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    });
};
exports.createUpload = createUpload;
const createUploadFields = (fieldFolders) => {
    Object.values(fieldFolders).forEach((folderName) => {
        fs_1.default.mkdirSync(path_1.default.join(__dirname, "..", "uploads", folderName), {
            recursive: true,
        });
    });
    const storage = multer_1.default.diskStorage({
        destination: (_, file, cb) => {
            const folderName = fieldFolders[file.fieldname];
            if (!folderName) {
                return cb(new Error(`Unexpected upload field: ${file.fieldname}`), "");
            }
            cb(null, path_1.default.join(__dirname, "..", "uploads", folderName));
        },
        filename: (_, file, cb) => {
            const unique = `${Date.now()}${Math.round(Math.random() * 1e5)}${path_1.default.extname(file.originalname)}`;
            cb(null, unique);
        },
    });
    return (0, multer_1.default)({
        storage,
        limits: { fileSize: 5 * 1024 * 1024 },
    });
};
exports.createUploadFields = createUploadFields;
const createUploadFile = (folderName) => {
    const uploadPath = path_1.default.join(__dirname, "..", "uploads", folderName);
    fs_1.default.mkdirSync(uploadPath, { recursive: true });
    const storage = multer_1.default.diskStorage({
        destination: (_, __, cb) => {
            cb(null, uploadPath);
        },
        filename: (_, file, cb) => {
            const unique = `${Date.now()}-${Math.round(Math.random() * 1e5)}${path_1.default.extname(file.originalname)}`;
            cb(null, unique);
        },
    });
    return (0, multer_1.default)({
        storage,
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
        fileFilter: (_, file, cb) => {
            // ✅ ອະນຸຍາດພຽງແຕ່ image, pdf, doc
            const allowed = /jpeg|jpg|png|pdf|doc|docx|svg|webp|zip/;
            const ext = allowed.test(path_1.default.extname(file.originalname).toLowerCase());
            const mime = allowed.test(file.mimetype);
            if (ext && mime) {
                cb(null, true);
            }
            else {
                cb(new Error('Invalid file type. Only images, PDF, and documents allowed.'));
            }
        },
    });
};
exports.createUploadFile = createUploadFile;
/** * Delete a file from the specified folder
 * - Returns true if deleted successfully, false otherwise
 */
// export const deleteFile = (folderName: string, fileName: string): boolean => {
//   try {
//     const filePath = path.join(__dirname, "..", "uploads", folderName, fileName);
//     if (fs.existsSync(filePath)) {
//       fs.unlinkSync(filePath);
//       return true;
//     }
//     return false; // File not found
//   } catch (error) {
//     console.error(`Error deleting file "${fileName}" from folder "${folderName}":`, error);
//     return false;
//   }
// };
const deleteFile = (folderName, fileName) => {
    try {
        const filePath = path_1.default.join(__dirname, "..", "uploads", folderName, fileName);
        if (fs_1.default.existsSync(filePath)) {
            fs_1.default.unlinkSync(filePath);
            console.log(`✅ Deleted file: ${fileName} from ${folderName}`);
            return true;
        }
        console.warn(`⚠️ File not found: ${fileName} in ${folderName}`);
        return false;
    }
    catch (error) {
        console.error(`❌ Error deleting file "${fileName}" from "${folderName}":`, error);
        return false;
    }
};
exports.deleteFile = deleteFile;
const deleteFileByPath = (filePath) => {
    try {
        if (fs_1.default.existsSync(filePath)) {
            fs_1.default.unlinkSync(filePath);
            return true;
        }
        return false;
    }
    catch (error) {
        console.error("Error deleting file:", error);
        return false;
    }
};
exports.deleteFileByPath = deleteFileByPath;
const deleteUploadedFilesError = async (files) => {
    if (!files)
        return;
    let fileList = [];
    if (Array.isArray(files)) {
        fileList = files;
    }
    else {
        Object.values(files).forEach(arr => fileList.push(...arr));
    }
    await Promise.all(fileList.map(async (file) => {
        try {
            if (!file?.path)
                return;
            const absPath = path_1.default.resolve(file.path);
            await fs_1.default.promises.unlink(absPath); // ✅ async delete
        }
        catch (err) {
            // ❗ ignore file not found
            if (err.code !== "ENOENT") {
                console.error("Delete file error:", file.path, err);
            }
        }
    }));
};
exports.deleteUploadedFilesError = deleteUploadedFilesError;
// export const deleteUploadedFilesError = (
//   files?: Express.Multer.File[] | { [key: string]: Express.Multer.File[] }
// ) => {
//   if (!files) return;
//   let fileList: Express.Multer.File[] = [];
//   if (Array.isArray(files)) {
//     fileList = files;
//   } else if (typeof files === "object") {
//     Object.values(files).forEach(arr => fileList.push(...arr));
//   }
//   for (const file of fileList) {
//     try {
//       if (!file.path) continue;
//       const absPath = path.resolve(file.path);
//       if (fs.existsSync(absPath)) {
//         fs.unlinkSync(absPath);
//       }
//     } catch (err) {
//       console.error("Delete file error:", file.path, err);
//     }
//   }
// };
/**
 * Replace an existing file with a new one (edit file)
 * - Deletes the old file if it exists
 * - Returns the new filename or null if failed
 */
const editFile = (folderName, oldFileName, newFile) => {
    try {
        if (!newFile)
            return null;
        if (oldFileName) {
            (0, exports.deleteFile)(folderName, oldFileName);
        }
        return newFile.filename;
    }
    catch (error) {
        console.error("Error editing file:", error);
        return null;
    }
};
exports.editFile = editFile;
