import { Router } from 'express';
import { upload } from '../utils/multer';
import { OcrController } from '../controller/ocrController';
import { OcrService } from '../services/ocrService';
import { ROUTES } from '../constants/routes';


const router = Router();

const ocrService = new OcrService();
const ocrController = new OcrController(ocrService);


router.post(ROUTES.OCR_PROCESS, upload, ocrController.processOcr.bind(ocrController));

export default router;