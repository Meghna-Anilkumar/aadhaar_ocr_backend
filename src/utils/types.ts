import { AadhaarUploadField } from './enums';

export interface OcrResult {
  name: string;
  aadhaarNumber: string;
  dob: string;
  address: string;
}

export interface MulterFiles {
  [AadhaarUploadField.FrontImage]?: Express.Multer.File[];
  [AadhaarUploadField.BackImage]?: Express.Multer.File[];
}