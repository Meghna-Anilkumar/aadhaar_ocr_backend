import { OcrResult } from '../utils/types';

export interface IOcrRepository {
  extractName(text: string): string;
  extractAadhaarNumber(text: string): string;
  extractDateOfBirth(text: string): string;
  extractAddress(text: string): string;
}