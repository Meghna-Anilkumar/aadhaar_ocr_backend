import Tesseract from 'tesseract.js';
import { CustomError } from './customError';
import { AadhaarUploadField } from './enums';
import { MulterFiles } from './types';

export async function validateAadhaarImages(files: MulterFiles): Promise<void> {
  const frontImage = files[AadhaarUploadField.FrontImage]?.[0];
  const backImage = files[AadhaarUploadField.BackImage]?.[0];

  if (!frontImage || !backImage) {
    throw new CustomError('Both front and back images are required', 400);
  }

  // Perform OCR to validate content
  const frontResult = await Tesseract.recognize(frontImage.path, 'eng');
  const backResult = await Tesseract.recognize(backImage.path, 'eng');

  const frontText = frontResult.data.text;
  const backText = backResult.data.text;

  // Validate front image (should contain Aadhaar number)
  const aadhaarRegex = /\d{4}\s?\d{4}\s?\d{4}/;
  if (!aadhaarRegex.test(frontText)) {
    throw new CustomError('Front image does not contain a valid Aadhaar number', 400);
  }

  // Validate back image (should contain address)
  const addressRegex = /Address\s*:/i;
  if (!addressRegex.test(backText)) {
    throw new CustomError('Back image does not contain an address', 400);
  }
}