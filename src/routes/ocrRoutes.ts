import { Router, Request, Response } from 'express';
import { upload } from '../utils/multer';
import { OcrController } from '../controller/ocrController';
import { OcrService } from '../services/ocrService';
import { OcrRepository } from '../repositories/ocrRepository';
import { ROUTES } from '../constants/routes';
import { MESSAGES } from '../constants/messages';
import { HttpStatusCode } from '../utils/enums';

const router = Router();
const ocrRepository = new OcrRepository();
const ocrService = new OcrService(ocrRepository);
const ocrController = new OcrController(ocrService);


// OCR processing route
router.post(ROUTES.OCR_PROCESS, upload, ocrController.processOcr.bind(ocrController));

export default router;