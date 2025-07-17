import { MulterFiles } from './types';
import { CustomError } from './customError';
import { AadhaarUploadField } from './enums';
import Tesseract from 'tesseract.js';

export const validateAadhaarImages = async (files: MulterFiles): Promise<void> => {
  console.log('[DEBUG] Validating files:', files);

  if (!files || !files[AadhaarUploadField.FrontImage] || !files[AadhaarUploadField.BackImage]) {
    console.log('[DEBUG] Validation failed: Missing required files');
    throw new CustomError('Both front and back images are required', 400);
  }

  const frontImage = files[AadhaarUploadField.FrontImage]![0];
  const backImage = files[AadhaarUploadField.BackImage]![0];

  console.log('[DEBUG] Checking file types:', {
    frontType: frontImage.mimetype,
    backType: backImage.mimetype,
  });

  if (!['image/jpeg', 'image/png'].includes(frontImage.mimetype) || 
      !['image/jpeg', 'image/png'].includes(backImage.mimetype)) {
    console.log('[DEBUG] Validation failed: Invalid image types');
    throw new CustomError('Invalid image format. Use JPEG or PNG', 400);
  }

  if (frontImage.size > 5 * 1024 * 1024 || backImage.size > 5 * 1024 * 1024) {
    console.log('[DEBUG] Validation failed: File size exceeds 5MB');
    throw new CustomError('File size exceeds 5MB limit', 400);
  }

  // Enhanced OCR validation to check if images actually contain Aadhaar content
  // AND verify they are uploaded on the correct side
  try {
    console.log('[DEBUG] Performing OCR validation...');
    const frontValidation = await validateAadhaarContent(frontImage.path, 'front');
    const backValidation = await validateAadhaarContent(backImage.path, 'back');
    
    // Check if images are swapped
    if (frontValidation.isValid && backValidation.isValid) {
      const frontActualSide = await detectAadhaarSide(frontImage.path);
      const backActualSide = await detectAadhaarSide(backImage.path);
      
      console.log('[DEBUG] Detected sides:', { frontActualSide, backActualSide });
      
      if (frontActualSide === 'back' && backActualSide === 'front') {
        throw new CustomError('Images are uploaded in wrong order. Please upload the front image in the front slot and back image in the back slot', 400);
      }
      
      if (frontActualSide === 'back' && backActualSide !== 'front') {
        throw new CustomError('The image uploaded as front appears to be the back of Aadhaar card. Please upload the correct front image', 400);
      }
      
      if (backActualSide === 'front' && frontActualSide !== 'back') {
        throw new CustomError('The image uploaded as back appears to be the front of Aadhaar card. Please upload the correct back image', 400);
      }
      
      if (frontActualSide === backActualSide && frontActualSide !== 'unknown') {
        throw new CustomError(`Both images appear to be the ${frontActualSide} side of Aadhaar card. Please upload one front and one back image`, 400);
      }
    }
    
    if (!frontValidation.isValid) {
      throw new CustomError(`Front image validation failed: ${frontValidation.reason}`, 400);
    }
    
    if (!backValidation.isValid) {
      throw new CustomError(`Back image validation failed: ${backValidation.reason}`, 400);
    }
    
    console.log('[DEBUG] OCR validation passed for both images');
  } catch (error) {
    if (error instanceof CustomError) {
      throw error;
    }
    console.log('[DEBUG] OCR validation skipped due to error:', error);
    // Continue without OCR validation in case of technical issues
  }

  console.log('[DEBUG] Validation passed for all checks');
};

interface ValidationResult {
  isValid: boolean;
  reason?: string;
}

// New function to detect which side of Aadhaar card an image represents
async function detectAadhaarSide(imagePath: string): Promise<'front' | 'back' | 'unknown'> {
  try {
    console.log('[DEBUG] Detecting Aadhaar side for image...');
    
    const { data: { text } } = await Tesseract.recognize(imagePath, 'eng', {
      logger: () => {}, // Silent logging
    });
    
    const normalizedText = text.toLowerCase();
    
    // Front side indicators (stronger indicators first)
    const frontIndicators = [
      { pattern: /\d{4}\s?\d{4}\s?\d{4}/, weight: 3 }, // Aadhaar number pattern
      { pattern: /dob|date.*birth/i, weight: 2 }, // Date of birth
      { pattern: /male|female/i, weight: 2 }, // Gender
      { pattern: /d\/o|s\/o|w\/o/i, weight: 2 }, // Relation indicators
      { pattern: /enrol.*no/i, weight: 1 }, // Enrollment number
    ];
    
    // Back side indicators
    const backIndicators = [
      { pattern: /address/i, weight: 3 }, // Address keyword
      { pattern: /help@uidai|www\.uidai/i, weight: 3 }, // Contact information
      { pattern: /valid throughout.*country/i, weight: 2 }, // Validity text
      { pattern: /avail.*services/i, weight: 2 }, // Services text
      { pattern: /mobile.*number.*email/i, weight: 2 }, // Update mobile/email text
      { pattern: /carry.*smartphone/i, weight: 1 }, // Mobile app reference
      { pattern: /pin.*code.*\d{6}/i, weight: 2 }, // PIN code in address
    ];
    
    let frontScore = 0;
    let backScore = 0;
    
    // Calculate scores for front indicators
    for (const indicator of frontIndicators) {
      if (indicator.pattern.test(normalizedText)) {
        frontScore += indicator.weight;
        console.log('[DEBUG] Front indicator found:', indicator.pattern, 'weight:', indicator.weight);
      }
    }
    
    // Calculate scores for back indicators
    for (const indicator of backIndicators) {
      if (indicator.pattern.test(normalizedText)) {
        backScore += indicator.weight;
        console.log('[DEBUG] Back indicator found:', indicator.pattern, 'weight:', indicator.weight);
      }
    }
    
    console.log('[DEBUG] Side detection scores:', { frontScore, backScore });
    
    // Determine the side based on scores
    if (frontScore > backScore && frontScore >= 3) {
      return 'front';
    } else if (backScore > frontScore && backScore >= 3) {
      return 'back';
    } else if (frontScore === backScore && frontScore > 0) {
      // If scores are equal, look for more specific indicators
      if (normalizedText.includes('help@uidai') || normalizedText.includes('www.uidai')) {
        return 'back';
      }
      if (/\d{4}\s?\d{4}\s?\d{4}/.test(text) && (normalizedText.includes('dob') || normalizedText.includes('male') || normalizedText.includes('female'))) {
        return 'front';
      }
    }
    
    return 'unknown';
    
  } catch (error) {
    console.error('[DEBUG] Error detecting Aadhaar side:', error);
    return 'unknown';
  }
}

async function validateAadhaarContent(imagePath: string, expectedSide: 'front' | 'back'): Promise<ValidationResult> {
  try {
    console.log(`[DEBUG] Validating ${expectedSide} image content...`);
    
    const { data: { text } } = await Tesseract.recognize(imagePath, 'eng', {
      logger: () => {}, // Silent logging for validation
    });
    
    const normalizedText = text.toLowerCase();
    
    if (expectedSide === 'front') {
      // Front side should contain:
      // 1. Government of India or UIDAI reference
      // 2. Aadhaar number pattern
      // 3. Basic personal info structure
      
      const hasGovernmentRef = normalizedText.includes('government') || 
                              normalizedText.includes('india') ||
                              normalizedText.includes('uidai') ||
                              normalizedText.includes('unique identification');
      
      const hasAadhaarNumber = /\d{4}\s?\d{4}\s?\d{4}/.test(text);
      
      const hasPersonalInfo = normalizedText.includes('dob') || 
                             normalizedText.includes('date') ||
                             normalizedText.includes('birth') ||
                             normalizedText.includes('female') ||
                             normalizedText.includes('male');
      
      if (!hasGovernmentRef) {
        return { isValid: false, reason: 'Does not appear to be an official government document' };
      }
      
      if (!hasAadhaarNumber) {
        return { isValid: false, reason: 'No valid Aadhaar number found' };
      }
      
      if (!hasPersonalInfo) {
        return { isValid: false, reason: 'Missing personal information typically found on Aadhaar front' };
      }
      
      return { isValid: true };
      
    } else {
      // Back side should contain:
      // 1. Address information
      // 2. UIDAI reference
      // 3. Help contact or website
      
      const hasUidaiRef = normalizedText.includes('uidai') ||
                         normalizedText.includes('unique identification') ||
                         normalizedText.includes('government') ||
                         normalizedText.includes('india');
      
      const hasAddressInfo = normalizedText.includes('address') ||
                            normalizedText.includes('pin') ||
                            normalizedText.includes('state') ||
                            normalizedText.includes('district') ||
                            /\d{6}/.test(text); // PIN code pattern
      
      const hasContactInfo = normalizedText.includes('help') ||
                            normalizedText.includes('www') ||
                            normalizedText.includes('uidai.gov');
      
      if (!hasUidaiRef) {
        return { isValid: false, reason: 'Does not appear to be an official UIDAI document' };
      }
      
      if (!hasAddressInfo) {
        return { isValid: false, reason: 'Missing address information typically found on Aadhaar back' };
      }
      
      return { isValid: true };
    }
    
  } catch (error) {
    console.error(`[DEBUG] Error validating ${expectedSide} image:`, error);
    return { isValid: false, reason: 'Could not process image for validation' };
  }
}

// Additional utility function to check Aadhaar number validity
export function isValidAadhaarNumber(aadhaarNumber: string): boolean {
  // Remove any spaces or formatting
  const cleanNumber = aadhaarNumber.replace(/\s/g, '');
  
  // Check if it's exactly 12 digits
  if (!/^\d{12}$/.test(cleanNumber)) {
    return false;
  }
  
  // Aadhaar numbers starting with 0 or 1 are invalid
  if (cleanNumber.startsWith('0') || cleanNumber.startsWith('1')) {
    return false;
  }
  
  // Simple checksum validation (basic implementation)
  // Note: Full Aadhaar validation requires more complex algorithms
  const digits = cleanNumber.split('').map(Number);
  let sum = 0;
  
  for (let i = 0; i < 11; i++) {
    sum += digits[i] * (i + 1);
  }
  
  const checksum = sum % 11;
  const lastDigit = digits[11];
  
  return checksum === lastDigit;
}

// Utility to clean and format extracted text
export function cleanExtractedText(text: string): string {
  return text
    .replace(/[^\w\s\/.,-]/g, ' ') // Remove special characters except common ones
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim();
}

// Utility to validate date format
export function isValidDate(dateString: string): boolean {
  const dateFormats = [
    /^\d{2}\/\d{2}\/\d{4}$/, // DD/MM/YYYY
    /^\d{2}-\d{2}-\d{4}$/, // DD-MM-YYYY
    /^\d{2}\.\d{2}\.\d{4}$/, // DD.MM.YYYY
  ];
  
  return dateFormats.some(format => format.test(dateString));
}