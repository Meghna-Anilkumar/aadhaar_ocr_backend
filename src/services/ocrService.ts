import Tesseract from 'tesseract.js';
import fs from 'fs';
import { OcrResult } from '../utils/types';
import { IOcrRepository } from '../interfaces/IOcrRepository';
import { IOcrService } from '../interfaces/IOcrServices';
import { CustomError } from '../utils/customError';
import { MESSAGES } from '../constants/messages';
import { HttpStatusCode } from '../utils/enums';

export class OcrService implements IOcrService {
  private ocrRepository: IOcrRepository;

  constructor(ocrRepository: IOcrRepository) {
    this.ocrRepository = ocrRepository;
  }

  public async processAadhaarImages(frontImagePath: string, backImagePath: string): Promise<OcrResult> {
    try {
      console.log('Starting OCR for front image...');
      const frontResult = await Tesseract.recognize(frontImagePath, 'eng', {
        logger: (m) => console.log('[Tesseract] Front:', m),
      });

      console.log('Starting OCR for back image...');
      const backResult = await Tesseract.recognize(backImagePath, 'eng', {
        logger: (m) => console.log('[Tesseract] Back:', m),
      });

      console.log('OCR results:', { frontText: frontResult.data.text, backText: backResult.data.text });

      const parsedData: OcrResult = {
        name: this.ocrRepository.extractName(frontResult.data.text),
        aadhaarNumber: this.ocrRepository.extractAadhaarNumber(frontResult.data.text + ' ' + backResult.data.text),
        dob: this.ocrRepository.extractDateOfBirth(frontResult.data.text),
        address: this.ocrRepository.extractAddress(frontResult.data.text),
      };

      console.log('Parsed data:', parsedData);

      try {
        fs.unlinkSync(frontImagePath);
        fs.unlinkSync(backImagePath);
        console.log('Successfully cleaned up files:', { frontImage: frontImagePath, backImage: backImagePath });
      } catch (cleanupError) {
        console.error('Error cleaning up files:', cleanupError);
      }

      return parsedData;
    } catch (error) {
      throw new CustomError(MESSAGES.OCR_PROCESSING_ERROR, HttpStatusCode.INTERNAL_SERVER_ERROR);
    }
  }
}