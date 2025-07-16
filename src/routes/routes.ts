import { Router, Request, Response } from 'express';
import { upload } from '../utils/multer';
import { ocrController } from '../controller/ocrController';
const router = Router();

// Health check route
router.get('/ping', (req: Request, res: Response) => {
  res.status(200).json({ message: 'Backend is connected!' });
});

// OCR processing route
router.post('/ocr/process', upload, ocrController);

export default router;