import { Request, Response, NextFunction } from 'express';
import { IOcrService } from '../interfaces/IOcrServices';
import { CustomError } from '../utils/customError';
import { AadhaarUploadField, HttpStatusCode } from '../utils/enums';
import { MulterFiles } from '../utils/types';
import { validateAadhaarImages } from '../utils/validation';
import { MESSAGES } from '../constants/messages';

export class OcrController {
  private _ocrService: IOcrService;

  constructor(ocrService: IOcrService) {
    this._ocrService = ocrService;
  }

  public processOcr = async (req: Request, res: Response, next: NextFunction) => {
    console.log('Incoming OCR request:', {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers,
      files: req.files,
      body: req.body,
    });

    try {
      const files = req.files as MulterFiles;

      if (!files || !files[AadhaarUploadField.FrontImage] || !files[AadhaarUploadField.BackImage]) {
        console.log('Missing required uploads:', files);
        throw new CustomError(MESSAGES.MISSING_FILES, HttpStatusCode.BAD_REQUEST);
      }

      console.log('Validating Aadhaar images...');
      await validateAadhaarImages(files);

      const frontImage = files[AadhaarUploadField.FrontImage]![0];
      const backImage = files[AadhaarUploadField.BackImage]![0];

      console.log('Extracted files:', {
        front: frontImage.filename,
        back: backImage.filename,
      });

      // Process OCR
      const parsedData = await this._ocrService.processAadhaarImages(
        frontImage.path,
        backImage.path
      );

      console.log('OCR completed. Sending response.');

      return res.status(HttpStatusCode.OK).json(parsedData);

    } catch (error) {
      console.error('Error inside OcrController:', error);

      if (error instanceof CustomError) {
        console.log('Returning CustomError response:', {
          status: error.statusCode,
          message: error.message,
        });

        res.status(error.statusCode).json({ error: error.message });
      } else {
        console.log('Returning generic OCR error.');
        res
          .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
          .json({ error: MESSAGES.OCR_PROCESSING_ERROR });
      }

      next(error);
    }
  };
}
