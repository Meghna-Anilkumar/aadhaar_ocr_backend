import { MulterFiles } from './types';
import { CustomError } from './customError';
import { AadhaarUploadField } from './enums';
import Tesseract from 'tesseract.js';

interface ValidationResult {
  isValid: boolean;
  reason?: string;
}

interface IdentifyingInfo {
  aadhaarNumber?: string;
  name?: string;
  dob?: string;
  gender?: string;
  enrollmentId?: string;
  pinCode?: string;
}


export const validateAadhaarImages = async (files: MulterFiles): Promise<void> => {

  if (
    !files ||
    !files[AadhaarUploadField.FrontImage] ||
    !files[AadhaarUploadField.BackImage]
  ) {
    throw new CustomError('Both front and back images are required', 400);
  }

  const frontImage = files[AadhaarUploadField.FrontImage]![0];
  const backImage = files[AadhaarUploadField.BackImage]![0];


  const validTypes = ['image/jpeg', 'image/png'];
  if (
    !validTypes.includes(frontImage.mimetype) ||
    !validTypes.includes(backImage.mimetype)
  ) {
    throw new CustomError('Invalid image format. Use JPEG or PNG', 400);
  }


  const MAX_SIZE = 5 * 1024 * 1024;
  if (frontImage.size > MAX_SIZE || backImage.size > MAX_SIZE) {
    throw new CustomError('File size exceeds 5MB limit', 400);
  }

  try {
    const frontValid = await validateAadhaarContent(frontImage.path, 'front');
    const backValid = await validateAadhaarContent(backImage.path, 'back');

    if (!frontValid.isValid) {
      throw new CustomError(`Front image validation failed: ${frontValid.reason}`, 400);
    }
    if (!backValid.isValid) {
      throw new CustomError(`Back image validation failed: ${backValid.reason}`, 400);
    }

    const frontSide = await detectAadhaarSide(frontImage.path);
    const backSide = await detectAadhaarSide(backImage.path);

    if (frontSide === 'back' && backSide === 'front') {
      throw new CustomError(
        'Images are uploaded in wrong order. Please upload the front image in the front slot and back image in the back slot',
        400
      );
    }
    if (frontSide === 'back') {
      throw new CustomError(
        'The image uploaded as front appears to be the back of Aadhaar card. Please upload the correct front image',
        400
      );
    }
    if (backSide === 'front') {
      throw new CustomError(
        'The image uploaded as back appears to be the front of Aadhaar card. Please upload the correct back image',
        400
      );
    }
    if (frontSide === backSide && frontSide !== 'unknown') {
      throw new CustomError(
        `Both images appear to be the ${frontSide} side of Aadhaar card. Please upload one front and one back image`,
        400
      );
    }


    const sameCard = await verifySameAadhaarCard(frontImage.path, backImage.path);
    if (!sameCard.isValid) {
      throw new CustomError(`Images validation failed: ${sameCard.reason}`, 400);
    }

    console.log('All validation checks passed');
  } catch (error) {
    if (error instanceof CustomError) throw error;
    console.error('Unexpected validation error:', error);
    throw new CustomError('Image validation failed due to processing error', 400);
  }
};


async function verifySameAadhaarCard(
  frontPath: string,
  backPath: string
): Promise<ValidationResult> {
  try {
    const [frontRes, backRes] = await Promise.all([
      Tesseract.recognize(frontPath, 'eng', { logger: () => {} }),
      Tesseract.recognize(backPath, 'eng', { logger: () => {} }),
    ]);

    const frontData = extractIdentifyingInfo(frontRes.data.text);
    const backData = extractIdentifyingInfo(backRes.data.text);

    const checks = [
      verifyByAadhaarNumber(frontData, backData),
      verifyByPersonalInfo(frontData, backData),
      verifyByCommonElements(frontData, backData),
    ];

    const passed = checks.filter((c) => c.isValid);
    const failed = checks.filter((c) => !c.isValid);


    if (passed.length >= 2 || checks[0].isValid) {
      return { isValid: true };
    }

    const mismatch = failed.find((c) => c.reason?.includes('mismatch'));
    if (mismatch) {
      return { isValid: false, reason: `Different cards detected. ${mismatch.reason}` };
    }

    return { isValid: true }; 
  } catch (err) {
    console.error('Same-card verification failed:', err);
    return { isValid: true };
  }
}

function verifyByAadhaarNumber(
  f: IdentifyingInfo,
  b: IdentifyingInfo
): ValidationResult {
  if (f.aadhaarNumber && b.aadhaarNumber) {
    return f.aadhaarNumber === b.aadhaarNumber
      ? { isValid: true }
      : {
          isValid: false,
          reason: `Aadhaar mismatch: front (${f.aadhaarNumber}) ≠ back (${b.aadhaarNumber})`,
        };
  }
  return { isValid: false, reason: 'Aadhaar number missing on one/both sides' };
}

function verifyByPersonalInfo(
  f: IdentifyingInfo,
  b: IdentifyingInfo
): ValidationResult {
  const reasons: string[] = [];
  let matches = 0;

  if (f.enrollmentId && b.enrollmentId) {
    f.enrollmentId === b.enrollmentId ? matches++ : reasons.push('Enrollment ID mismatch');
  }
  if (f.gender && b.gender) {
    f.gender === b.gender ? matches++ : reasons.push('Gender mismatch');
  }
  if (f.dob && b.dob) {
    f.dob === b.dob ? matches++ : reasons.push('DOB mismatch');
  }

  if (reasons.length > 0) return { isValid: false, reason: reasons.join(', ') };
  return matches > 0 ? { isValid: true } : { isValid: false, reason: 'No personal info match' };
}

function verifyByCommonElements(
  f: IdentifyingInfo,
  b: IdentifyingInfo
): ValidationResult {
  if (f.pinCode && b.pinCode) {
    return f.pinCode === b.pinCode
      ? { isValid: true }
      : { isValid: false, reason: 'PIN code mismatch' };
  }

  if (f.name && b.name) {
    const fWords = f.name.toLowerCase().split(/\s+/);
    const bWords = b.name.toLowerCase().split(/\s+/);
    const common = fWords.some((w) => bWords.some((bw) => bw.includes(w) || w.includes(bw)));
    return common
      ? { isValid: true }
      : { isValid: false, reason: 'Name does not match' };
  }

  return { isValid: false, reason: 'No common elements' };
}

function extractIdentifyingInfo(text: string): IdentifyingInfo {
  const info: IdentifyingInfo = {};

  // Aadhaar number
  const aadMatch = text.match(/\b(\d{4})\s*(\d{4})\s*(\d{4})\b/);
  if (aadMatch) info.aadhaarNumber = aadMatch[1] + aadMatch[2] + aadMatch[3];

  // Enrollment ID
  const enrMatch = text.match(/\b(\d{4}\/\d{5}\/\d{5})\b|\b(\d{14})\b/);
  if (enrMatch) info.enrollmentId = enrMatch[1] || enrMatch[2];

  // Gender
  const genderMatch = text.match(/\b(MALE|FEMALE)\b/i);
  if (genderMatch) info.gender = genderMatch[1].toLowerCase();

  // DOB
  const dobMatch = text.match(/\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/);
  if (dobMatch) info.dob = dobMatch[1];

  // PIN 
  const pinMatch = text.match(/\b(\d{6})\b/g);
  if (pinMatch && info.aadhaarNumber && !info.aadhaarNumber.includes(pinMatch[0])) {
    info.pinCode = pinMatch[0];
  }


  const lines = text.split('\n').map((l) => l.trim());
  for (const line of lines) {
    if (
      line.length > 2 &&
      line.length < 50 &&
      /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(line) &&
      !/government|india|uidai|dob|male|female/i.test(line)
    ) {
      if (!info.name || line.length > info.name.length) info.name = line;
    }
  }

  return info;
}


async function detectAadhaarSide(imagePath: string): Promise<'front' | 'back' | 'unknown'> {
  try {
    const { data } = await Tesseract.recognize(imagePath, 'eng', { logger: () => {} });
    const txt = data.text.toLowerCase();

    const front = [
      { re: /\d{4}\s?\d{4}\s?\d{4}/, w: 3 },
      { re: /dob|date.*birth/i, w: 2 },
      { re: /male|female/i, w: 2 },
      { re: /d\/o|s\/o|w\/o/i, w: 2 },
      { re: /enrol.*no/i, w: 1 },
    ];

    const back = [
      { re: /address/i, w: 3 },
      { re: /help@uidai|www\.uidai/i, w: 3 },
      { re: /valid throughout.*country/i, w: 2 },
      { re: /avail.*services/i, w: 2 },
      { re: /mobile.*number.*email/i, w: 2 },
      { re: /carry.*smartphone/i, w: 1 },
      { re: /pin.*code.*\d{6}/i, w: 2 },
    ];

    let fScore = 0,
      bScore = 0;
    front.forEach((i) => i.re.test(txt) && (fScore += i.w));
    back.forEach((i) => i.re.test(txt) && (bScore += i.w));

    if (fScore > bScore && fScore >= 3) return 'front';
    if (bScore > fScore && bScore >= 3) return 'back';
    if (fScore === bScore && fScore > 0) {
      if (/help@uidai|www\.uidai/.test(txt)) return 'back';
      if (/\d{4}\s?\d{4}\s?\d{4}/.test(data.text) && /dob|male|female/.test(txt))
        return 'front';
    }
    return 'unknown';
  } catch (err) {
    console.error('Side detection failed:', err);
    return 'unknown';
  }
}


async function validateAadhaarContent(
  imagePath: string,
  side: 'front' | 'back'
): Promise<ValidationResult> {
  try {
    const { data } = await Tesseract.recognize(imagePath, 'eng', { logger: () => {} });
    const txt = data.text;
    const lower = txt.toLowerCase();


    const hasUidaiRef =
      /uidai|unique identification authority of india|government of india/i.test(lower);

    if (!hasUidaiRef) {
      return {
        isValid: false,
        reason: 'Missing UIDAI / Government of India reference',
      };
    }

    if (side === 'front') {
      const hasAadhaar = /\d{4}\s?\d{4}\s?\d{4}/.test(txt);
      const hasPersonal =
        /dob|date.*birth|male|female/i.test(lower) || /d\/o|s\/o|w\/o/i.test(lower);

      if (!hasAadhaar)
        return { isValid: false, reason: 'No valid Aadhaar number found on front' };
      if (!hasPersonal)
        return { isValid: false, reason: 'Missing personal info (DOB/Gender/Relation) on front' };

      return { isValid: true };
    } else {
      const hasAddress =
        /address|pin|state|district/i.test(lower) || /\d{6}/.test(txt);

      if (!hasAddress)
        return { isValid: false, reason: 'Missing address block on back' };

      return { isValid: true };
    }
  } catch (err) {
    console.error(`OCR failed for ${side} validation:`, err);
    return { isValid: false, reason: 'OCR processing failed' };
  }
}

export function isValidAadhaarNumber(num: string): boolean {
  const clean = num.replace(/\s/g, '');
  if (!/^\d{12}$/.test(clean)) return false;
  if (/^[01]/.test(clean)) return false;

  const digits = clean.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 11; i++) sum += digits[i] * (i + 1);
  return (sum % 11) === digits[11];
}

export function cleanExtractedText(text: string): string {
  return text.replace(/[^\w\s\/.,-]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isValidDate(str: string): boolean {
  return /^\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}$/.test(str);
}