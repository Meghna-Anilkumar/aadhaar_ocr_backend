import Tesseract from 'tesseract.js';
import fs from 'fs';
import { OcrResult } from '../utils/types';
import { IOcrService } from '../interfaces/IOcrServices';
import { CustomError } from '../utils/customError';
import { MESSAGES } from '../constants/messages';
import { HttpStatusCode } from '../utils/enums';
import { 
  extractName, 
  extractAadhaarNumber, 
  extractDateOfBirth, 
  extractAddress 
} from '../utils/extraction';

export class OcrService implements IOcrService {

  public async processAadhaarImages(frontImagePath: string, backImagePath: string): Promise<OcrResult> {
    try {
      console.log('Starting OCR for front image...');
      const frontResult = await Tesseract.recognize(frontImagePath, 'eng', {
        logger: (m) => console.log('Front:', m),
      });

      console.log('Starting OCR for back image...');
      const backResult = await Tesseract.recognize(backImagePath, 'eng', {
        logger: (m) => console.log('Back:', m),
      });

      console.log('OCR results:', {
        frontText: frontResult.data.text,
        backText: backResult.data.text,
      });

      const parsedData: OcrResult = {
        name: extractName(frontResult.data.text),
        aadhaarNumber: extractAadhaarNumber(frontResult.data.text + ' ' + backResult.data.text),
        dob: extractDateOfBirth(frontResult.data.text),
        address: extractAddress(frontResult.data.text),
      };

      console.log('Parsed data:', parsedData);

      this._cleanupFiles(frontImagePath, backImagePath);

      return parsedData;

    } catch (error) {
      this._cleanupFiles(frontImagePath, backImagePath);
      throw new CustomError(
        MESSAGES.OCR_PROCESSING_ERROR, 
        HttpStatusCode.INTERNAL_SERVER_ERROR
      );
    }
  }

  private _cleanupFiles(frontImagePath: string, backImagePath: string): void {
    try {
      fs.unlinkSync(frontImagePath);
      fs.unlinkSync(backImagePath);

      console.log('Successfully cleaned up files:', {
        frontImage: frontImagePath,
        backImage: backImagePath,
      });

    } catch (cleanupError) {
      console.error('Error cleaning up files:', cleanupError);
    }
  }
}
