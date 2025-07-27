import { OcrResult } from '../utils/types';

export interface IOcrService {
  processAadhaarImages(frontImagePath: string, backImagePath: string): Promise<OcrResult>;
}