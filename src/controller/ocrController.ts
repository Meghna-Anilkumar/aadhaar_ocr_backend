import { Request, Response, NextFunction } from 'express';
import { IOcrService } from '../interfaces/IOcrServices';
import { CustomError } from '../utils/customError';
import { AadhaarUploadField } from '../utils/enums';
import { MulterFiles } from '../utils/types';
import { validateAadhaarImages } from '../utils/validation';
import { MESSAGES } from '../constants/messages';
import { HttpStatusCode } from '../utils/enums';

export class OcrController {
  private ocrService: IOcrService;

  constructor(ocrService: IOcrService) {
    this.ocrService = ocrService;
  }

  public processOcr = async (req: Request, res: Response, next: NextFunction) => {
    console.log('Received request for /api/ocr/process:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      files: req.files,
      body: req.body,
    });

    try {
      const files = req.files as MulterFiles;

      if (!files || !files[AadhaarUploadField.FrontImage] || !files[AadhaarUploadField.BackImage]) {
        console.log('Missing files in request:', files);
        throw new CustomError(MESSAGES.MISSING_FILES, HttpStatusCode.BAD_REQUEST);
      }

      console.log('Validating Aadhaar images...');
      await validateAadhaarImages(files);

      const frontImage = files[AadhaarUploadField.FrontImage]![0];
      const backImage = files[AadhaarUploadField.BackImage]![0];
      console.log('Processing files:', { frontImage: frontImage.filename, backImage: backImage.filename });

      const parsedData = await this.ocrService.processAadhaarImages(frontImage.path, backImage.path);

      console.log('Sending response with status 200');
      res.status(HttpStatusCode.OK).json(parsedData);
    } catch (error) {
      console.log('Error caught in ocrController:', error);
      if (error instanceof CustomError) {
        console.log('Sending CustomError response:', { status: error.statusCode, message: error.message });
        res.status(error.statusCode).json({ error: error.message });
      } else {
        console.error('Sending generic error response:', error);
        res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json({ error: MESSAGES.OCR_PROCESSING_ERROR });
      }
      next(error);
    }
  };
}