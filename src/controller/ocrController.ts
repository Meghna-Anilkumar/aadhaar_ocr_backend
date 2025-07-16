import { Request, Response, NextFunction } from 'express';
import Tesseract from 'tesseract.js';
import fs from 'fs';
import { CustomError } from '../utils/customError';
import { AadhaarUploadField } from '../utils/enums';
import { OcrResult, MulterFiles } from '../utils/types';
import { validateAadhaarImages } from '../utils/validation';

export const ocrController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Type assertion for req.files
    const files = req.files as MulterFiles;

    // Validate Aadhaar images
    await validateAadhaarImages(files);

    const frontImage = files[AadhaarUploadField.FrontImage]![0];
    const backImage = files[AadhaarUploadField.BackImage]![0];

    // Perform OCR on front and back images
    const frontResult = await Tesseract.recognize(frontImage.path, 'eng', {
      logger: (m) => console.log(m),
    });
    const backResult = await Tesseract.recognize(backImage.path, 'eng', {
      logger: (m) => console.log(m),
    });

    // Parse OCR results
    const parsedData: OcrResult = {
      name: extractField(frontResult.data.text, 'name'),
      aadhaarNumber: extractField(frontResult.data.text, 'aadhaar'),
      dob: extractField(frontResult.data.text, 'dob'),
      address: extractField(backResult.data.text, 'address'),
    };

    // Clean up uploaded files
    try {
      fs.unlinkSync(frontImage.path);
      fs.unlinkSync(backImage.path);
    } catch (cleanupError) {
      console.error('Error cleaning up files:', cleanupError);
    }

    // Send response
    res.status(200).json(parsedData);
  } catch (error) {
    if (error instanceof CustomError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      console.error('OCR processing error:', error);
      res.status(500).json({ error: 'Error processing images' });
    }
    next(error);
  }
};

// Helper function to extract fields from OCR text
function extractField(text: string, field: string): string {
  const normalizedText = text.replace(/\s+/g, ' ').trim().toLowerCase();

  if (field === 'aadhaar') {
    const aadhaarRegex = /\d{4}\s?\d{4}\s?\d{4}/;
    const match = text.match(aadhaarRegex);
    return match ? match[0].replace(/\s/g, '') : 'Not found';
  }

  if (field === 'name') {
    const nameRegex = /Name\s*:\s*([A-Za-z\s]+)/i;
    const match = text.match(nameRegex);
    return match ? match[1].trim() : 'Not found';
  }

  if (field === 'dob') {
    const dobRegex = /\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/;
    const match = text.match(dobRegex);
    return match ? match[0] : 'Not found';
  }

  if (field === 'address') {
    const addressRegex = /Address\s*:\s*([\s\S]*?)(?=\n[A-Z]|$)/i;
    const match = text.match(addressRegex);
    return match ? match[1].trim() : 'Not found';
  }

  return 'Not found';
}