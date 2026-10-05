import multer from "multer";
import path from "path";
import fs from "fs";

// import fs from "fs/promises"; 
export const createUpload = (folderName: string) => {
  const uploadPath = path.join(__dirname, "..", "uploads", folderName);
  fs.mkdirSync(uploadPath, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_, __, cb) => {
      cb(null, uploadPath);
    },
    filename: (_, file, cb) => {
      const unique = `${Date.now()}${Math.round(Math.random() * 1e5)}${path.extname(file.originalname)}`;
      cb(null, unique);
    },
  });

  return multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  });
};

export const createUploadFields = (fieldFolders: Record<string, string>) => {
  Object.values(fieldFolders).forEach((folderName) => {
    fs.mkdirSync(path.join(__dirname, "..", "uploads", folderName), {
      recursive: true,
    });
  });

  const storage = multer.diskStorage({
    destination: (_, file, cb) => {
      const folderName = fieldFolders[file.fieldname];

      if (!folderName) {
        return cb(new Error(`Unexpected upload field: ${file.fieldname}`), "");
      }

      cb(null, path.join(__dirname, "..", "uploads", folderName));
    },
    filename: (_, file, cb) => {
      const unique = `${Date.now()}${Math.round(Math.random() * 1e5)}${path.extname(file.originalname)}`;
      cb(null, unique);
    },
  });

  return multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
  });
};


export const createUploadFile = (folderName: string) => {
  const uploadPath = path.join(__dirname, "..", "uploads", folderName);
  fs.mkdirSync(uploadPath, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_, __, cb) => {
      cb(null, uploadPath);
    },
    filename: (_, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e5)}${path.extname(file.originalname)}`;
      cb(null, unique);
    },
  });

  return multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (_, file, cb) => {
      // ✅ ອະນຸຍາດພຽງແຕ່ image, pdf, doc
      const allowed = /jpeg|jpg|png|pdf|doc|docx|svg|webp|zip/;
      const ext = allowed.test(path.extname(file.originalname).toLowerCase());
      const mime = allowed.test(file.mimetype);
      
      if (ext && mime) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only images, PDF, and documents allowed.'));
      }
    },
  });
};

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
export const deleteFile = (folderName: string, fileName: string): boolean => {
  try {
    const filePath = path.join(__dirname, "..", "uploads", folderName, fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`✅ Deleted file: ${fileName} from ${folderName}`);
      return true;
    }
    console.warn(`⚠️ File not found: ${fileName} in ${folderName}`);
    return false;
  } catch (error) {
    console.error(`❌ Error deleting file "${fileName}" from "${folderName}":`, error);
    return false;
  }
};

export const deleteFileByPath = (filePath: string): boolean => {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
        return false;
    } catch (error) {
        console.error("Error deleting file:", error);
        return false;
    }
};


export const deleteUploadedFilesError = async (
  files?: Express.Multer.File[] | { [key: string]: Express.Multer.File[] }
) => {
  if (!files) return;

  let fileList: Express.Multer.File[] = [];

  if (Array.isArray(files)) {
    fileList = files;
  } else {
    Object.values(files).forEach(arr => fileList.push(...arr));
  }

  await Promise.all(
    fileList.map(async (file) => {
      try {
        if (!file?.path) return;

        const absPath = path.resolve(file.path);

        await fs.promises.unlink(absPath); // ✅ async delete
      } catch (err: any) {
        // ❗ ignore file not found
        if (err.code !== "ENOENT") {
          console.error("Delete file error:", file.path, err);
        }
      }
    })
  );
};


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
export const editFile = (
  folderName: string,
  oldFileName: string | null,
  newFile: Express.Multer.File | undefined
): string | null => {
  try {
    if (!newFile) return null;
    if (oldFileName) {
      deleteFile(folderName, oldFileName);
    }
    return newFile.filename;
  } catch (error) {
    console.error("Error editing file:", error);
    return null;
  }
};
