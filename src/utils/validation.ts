import { MulterFiles } from './types';
import { CustomError } from './customError';
import { AadhaarUploadField } from './enums';
import Tesseract from 'tesseract.js';

export const validateAadhaarImages = async (files: MulterFiles): Promise<void> => {

  if (!files || !files[AadhaarUploadField.FrontImage] || !files[AadhaarUploadField.BackImage]) {

    throw new CustomError('Both front and back images are required', 400);
  }

  const frontImage = files[AadhaarUploadField.FrontImage]![0];
  const backImage = files[AadhaarUploadField.BackImage]![0];

  console.log('Checking file types:', {
    frontType: frontImage.mimetype,
    backType: backImage.mimetype,
  });

  if (!['image/jpeg', 'image/png'].includes(frontImage.mimetype) || 
      !['image/jpeg', 'image/png'].includes(backImage.mimetype)) {
    console.log('Validation failed: Invalid image types');
    throw new CustomError('Invalid image format. Use JPEG or PNG', 400);
  }

  if (frontImage.size > 5 * 1024 * 1024 || backImage.size > 5 * 1024 * 1024) {
    console.log('Validation failed: File size exceeds 5MB');
    throw new CustomError('File size exceeds 5MB limit', 400);
  }


  try {
    console.log('Performing OCR validation...');
    const frontValidation = await validateAadhaarContent(frontImage.path, 'front');
    const backValidation = await validateAadhaarContent(backImage.path, 'back');
    
    if (frontValidation.isValid && backValidation.isValid) {
      const frontActualSide = await detectAadhaarSide(frontImage.path);
      const backActualSide = await detectAadhaarSide(backImage.path);
      
      console.log('Detected sides:', { frontActualSide, backActualSide });
      
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


      const sameCardValidation = await verifySameAadhaarCard(frontImage.path, backImage.path);
      if (!sameCardValidation.isValid) {
        throw new CustomError(`Images validation failed: ${sameCardValidation.reason}`, 400);
      }
    }
    
    if (!frontValidation.isValid) {
      throw new CustomError(`Front image validation failed: ${frontValidation.reason}`, 400);
    }
    
    if (!backValidation.isValid) {
      throw new CustomError(`Back image validation failed: ${backValidation.reason}`, 400);
    }
    
    console.log('OCR validation passed for both images');
  } catch (error) {
    if (error instanceof CustomError) {
      throw error;
    }
    console.log('OCR validation skipped due to error:', error);

  }

  console.log('Validation passed for all checks');
};

interface ValidationResult {
  isValid: boolean;
  reason?: string;
}


async function verifySameAadhaarCard(frontImagePath: string, backImagePath: string): Promise<ValidationResult> {
  try {
    console.log('Verifying both images belong to the same Aadhaar card...');
    
    const frontResult = await Tesseract.recognize(frontImagePath, 'eng', {
      logger: () => {}, 
    });
    
    const backResult = await Tesseract.recognize(backImagePath, 'eng', {
      logger: () => {},
    });
    
    const frontText = frontResult.data.text;
    const backText = backResult.data.text;
    
    console.log('Extracted texts for comparison');

    const frontData = extractIdentifyingInfo(frontText);
    const backData = extractIdentifyingInfo(backText);
    
    console.log('Extracted identifying info:', { frontData, backData });
    
   
    const verifications = [
      verifyByAadhaarNumber(frontData, backData),
      verifyByPersonalInfo(frontData, backData),
      verifyByCommonElements(frontData, backData)
    ];
    
    const successfulVerifications = verifications.filter(v => v.isValid);
    const failedVerifications = verifications.filter(v => !v.isValid);
    
    console.log('Verification results:', {
      successful: successfulVerifications.length,
      failed: failedVerifications.length,
      details: verifications
    });
    

    if (successfulVerifications.length >= 2 || 
        verifications[0].isValid) { 
      return { isValid: true };
    }
    

    const explicitMismatches = failedVerifications.filter(v => 
      v.reason && v.reason.includes('mismatch')
    );
    
    if (explicitMismatches.length > 0) {
      return { 
        isValid: false, 
        reason: `The uploaded images appear to belong to different Aadhaar cards. ${explicitMismatches[0].reason}` 
      };
    }
    

    console.log('Insufficient data for verification, but no explicit mismatches found');
    return { isValid: true };
    
  } catch (error) {
    console.error('Error verifying same Aadhaar card:', error);
    return { isValid: true };
  }
}

interface IdentifyingInfo {
  aadhaarNumber?: string;
  name?: string;
  dob?: string;
  gender?: string;
  enrollmentId?: string;
  pinCode?: string;
}

function extractIdentifyingInfo(text: string): IdentifyingInfo {
  const info: IdentifyingInfo = {};
  

  const aadhaarMatch = text.match(/\b(\d{4})\s*(\d{4})\s*(\d{4})\b/);
  if (aadhaarMatch) {
    info.aadhaarNumber = aadhaarMatch[1] + aadhaarMatch[2] + aadhaarMatch[3];
  }
  

  const enrollmentMatch = text.match(/\b(\d{4}\/\d{5}\/\d{5})\b|\b(\d{14})\b/);
  if (enrollmentMatch) {
    info.enrollmentId = enrollmentMatch[1] || enrollmentMatch[2];
  }
  

  const genderMatch = text.match(/\b(MALE|FEMALE)\b/i);
  if (genderMatch) {
    info.gender = genderMatch[1].toLowerCase();
  }
  

  const dobMatch = text.match(/\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/);
  if (dobMatch) {
    info.dob = dobMatch[1];
  }
  

  const pinMatch = text.match(/\b(\d{6})\b/);
  if (pinMatch && !info.aadhaarNumber?.includes(pinMatch[1])) {
    info.pinCode = pinMatch[1];
  }
  

  const lines = text.split('\n').map(line => line.trim());
  for (const line of lines) {
    if (line.length > 2 && line.length < 50 && 
        /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(line) &&
        !line.toLowerCase().includes('government') &&
        !line.toLowerCase().includes('india') &&
        !line.toLowerCase().includes('uidai') &&
        !line.includes('DOB') &&
        !line.includes('MALE') &&
        !line.includes('FEMALE')) {
      if (!info.name || line.length > info.name.length) {
        info.name = line;
      }
    }
  }
  
  return info;
}

function verifyByAadhaarNumber(frontData: IdentifyingInfo, backData: IdentifyingInfo): ValidationResult {
  if (frontData.aadhaarNumber && backData.aadhaarNumber) {
    if (frontData.aadhaarNumber === backData.aadhaarNumber) {
      return { isValid: true };
    } else {
      return { 
        isValid: false, 
        reason: `Aadhaar numbers don't match: front (${frontData.aadhaarNumber}) vs back (${backData.aadhaarNumber})` 
      };
    }
  }
  

  return { isValid: false, reason: 'Aadhaar number not clearly readable in both images' };
}

function verifyByPersonalInfo(frontData: IdentifyingInfo, backData: IdentifyingInfo): ValidationResult {
  let matches = 0;
  let mismatches = 0;
  const reasons: string[] = [];
  
  if (frontData.enrollmentId && backData.enrollmentId) {
    if (frontData.enrollmentId === backData.enrollmentId) {
      matches++;
    } else {
      mismatches++;
      reasons.push(`Enrollment IDs don't match`);
    }
  }
  

  if (frontData.gender && backData.gender) {
    if (frontData.gender === backData.gender) {
      matches++;
    } else {
      mismatches++;
      reasons.push(`Gender information doesn't match`);
    }
  }
  

  if (frontData.dob && backData.dob) {
    if (frontData.dob === backData.dob) {
      matches++;
    } else {
      mismatches++;
      reasons.push(`Date of birth doesn't match`);
    }
  }
  
  if (mismatches > 0) {
    return { isValid: false, reason: reasons.join(', ') };
  }
  
  if (matches >= 1) {
    return { isValid: true };
  }
  
  return { isValid: false, reason: 'Insufficient personal information to verify' };
}

function verifyByCommonElements(frontData: IdentifyingInfo, backData: IdentifyingInfo): ValidationResult {
  let commonElements = 0;
  

  if (frontData.pinCode && backData.pinCode) {
    if (frontData.pinCode === backData.pinCode) {
      commonElements++;
    } else {
      return { isValid: false, reason: 'PIN codes don\'t match between front and back images' };
    }
  }
  

  if (frontData.name && backData.name) {
    const frontNameWords = frontData.name.toLowerCase().split(' ');
    const backNameWords = backData.name.toLowerCase().split(' ');
    
    const commonWords = frontNameWords.filter(word => 
      backNameWords.some(backWord => 
        backWord.includes(word) || word.includes(backWord)
      )
    );
    
    if (commonWords.length > 0) {
      commonElements++;
    } else {
      return { isValid: false, reason: 'Names don\'t appear to match between images' };
    }
  }
  
  if (commonElements > 0) {
    return { isValid: true };
  }
  
  return { isValid: false, reason: 'No common identifying elements found' };
}

async function detectAadhaarSide(imagePath: string): Promise<'front' | 'back' | 'unknown'> {
  try {
    console.log('Detecting Aadhaar side for image...');
    
    const { data: { text } } = await Tesseract.recognize(imagePath, 'eng', {
      logger: () => {}, 
    });
    
    const normalizedText = text.toLowerCase();
  
    const frontIndicators = [
      { pattern: /\d{4}\s?\d{4}\s?\d{4}/, weight: 3 }, 
      { pattern: /dob|date.*birth/i, weight: 2 }, 
      { pattern: /male|female/i, weight: 2 }, 
      { pattern: /d\/o|s\/o|w\/o/i, weight: 2 }, 
      { pattern: /enrol.*no/i, weight: 1 }, 
    ];
    
    const backIndicators = [
      { pattern: /address/i, weight: 3 }, 
      { pattern: /help@uidai|www\.uidai/i, weight: 3 }, 
      { pattern: /valid throughout.*country/i, weight: 2 }, 
      { pattern: /avail.*services/i, weight: 2 }, 
      { pattern: /mobile.*number.*email/i, weight: 2 }, 
      { pattern: /carry.*smartphone/i, weight: 1 }, 
      { pattern: /pin.*code.*\d{6}/i, weight: 2 }, 
    ];
    
    let frontScore = 0;
    let backScore = 0;
    
    for (const indicator of frontIndicators) {
      if (indicator.pattern.test(normalizedText)) {
        frontScore += indicator.weight;
        console.log(' Front indicator found:', indicator.pattern, 'weight:', indicator.weight);
      }
    }
    
    for (const indicator of backIndicators) {
      if (indicator.pattern.test(normalizedText)) {
        backScore += indicator.weight;
        console.log(' Back indicator found:', indicator.pattern, 'weight:', indicator.weight);
      }
    }
    
    console.log('Side detection scores:', { frontScore, backScore });

    if (frontScore > backScore && frontScore >= 3) {
      return 'front';
    } else if (backScore > frontScore && backScore >= 3) {
      return 'back';
    } else if (frontScore === backScore && frontScore > 0) {
      if (normalizedText.includes('help@uidai') || normalizedText.includes('www.uidai')) {
        return 'back';
      }
      if (/\d{4}\s?\d{4}\s?\d{4}/.test(text) && (normalizedText.includes('dob') || normalizedText.includes('male') || normalizedText.includes('female'))) {
        return 'front';
      }
    }
    
    return 'unknown';
    
  } catch (error) {
    console.error('Error detecting Aadhaar side:', error);
    return 'unknown';
  }
}

async function validateAadhaarContent(imagePath: string, expectedSide: 'front' | 'back'): Promise<ValidationResult> {
  try {
    console.log(`Validating ${expectedSide} image content...`);
    
    const { data: { text } } = await Tesseract.recognize(imagePath, 'eng', {
      logger: () => {}, 
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
                            /\d{6}/.test(text); 
      
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
    console.error(`Error validating ${expectedSide} image:`, error);
    return { isValid: false, reason: 'Could not process image for validation' };
  }
}


export function isValidAadhaarNumber(aadhaarNumber: string): boolean {
  const cleanNumber = aadhaarNumber.replace(/\s/g, '');
  
  if (!/^\d{12}$/.test(cleanNumber)) {
    return false;
  }
  
  if (cleanNumber.startsWith('0') || cleanNumber.startsWith('1')) {
    return false;
  }
  
  const digits = cleanNumber.split('').map(Number);
  let sum = 0;
  
  for (let i = 0; i < 11; i++) {
    sum += digits[i] * (i + 1);
  }
  
  const checksum = sum % 11;
  const lastDigit = digits[11];
  
  return checksum === lastDigit;
}

export function cleanExtractedText(text: string): string {
  return text
    .replace(/[^\w\s\/.,-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isValidDate(dateString: string): boolean {
  const dateFormats = [
    /^\d{2}\/\d{2}\/\d{4}$/,
    /^\d{2}-\d{2}-\d{4}$/,
    /^\d{2}\.\d{2}\.\d{4}$/,
  ];
  
  return dateFormats.some(format => format.test(dateString));
}