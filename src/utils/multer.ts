import multer from 'multer';
import path from 'path';
import { CustomError } from './customError';
import { AadhaarUploadField } from './enums';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

export const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new CustomError('Invalid file type. Only JPEG or PNG allowed.', 400));
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
}).fields([
  { name: AadhaarUploadField.FrontImage, maxCount: 1 },
  { name: AadhaarUploadField.BackImage, maxCount: 1 },
]);