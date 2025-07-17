import { Request, Response, NextFunction } from 'express';
import Tesseract from 'tesseract.js';
import fs from 'fs';
import { CustomError } from '../utils/customError';
import { AadhaarUploadField } from '../utils/enums';
import { OcrResult, MulterFiles } from '../utils/types';
import { validateAadhaarImages } from '../utils/validation';

export const ocrController = async (req: Request, res: Response, next: NextFunction) => {
  console.log('[DEBUG] Received request for /api/ocr/process:', {
    method: req.method,
    url: req.url,
    headers: req.headers,
    files: req.files,
    body: req.body,
  });
  
  try {
    const files = req.files as MulterFiles;

    if (!files || !files[AadhaarUploadField.FrontImage] || !files[AadhaarUploadField.BackImage]) {
      console.log('[DEBUG] Missing files in request:', files);
      throw new CustomError('Both front and back images are required', 400);
    }

    console.log('[DEBUG] Validating Aadhaar images...');
    await validateAadhaarImages(files);

    const frontImage = files[AadhaarUploadField.FrontImage]![0];
    const backImage = files[AadhaarUploadField.BackImage]![0];
    console.log('[DEBUG] Processing files:', { frontImage: frontImage.filename, backImage: backImage.filename });

    console.log('[DEBUG] Starting OCR for front image...');
    const frontResult = await Tesseract.recognize(frontImage.path, 'eng', {
      logger: (m) => console.log('[Tesseract] Front:', m),
    });
    
    console.log('[DEBUG] Starting OCR for back image...');
    const backResult = await Tesseract.recognize(backImage.path, 'eng', {
      logger: (m) => console.log('[Tesseract] Back:', m),
    });

    console.log('[DEBUG] OCR results:', { frontText: frontResult.data.text, backText: backResult.data.text });
    
    const parsedData: OcrResult = {
      name: extractName(frontResult.data.text),
      aadhaarNumber: extractAadhaarNumber(frontResult.data.text + ' ' + backResult.data.text),
      dob: extractDateOfBirth(frontResult.data.text),
      address: extractAddress(frontResult.data.text),
    };

    console.log('[DEBUG] Parsed data:', parsedData);
    
    try {
      fs.unlinkSync(frontImage.path);
      fs.unlinkSync(backImage.path);
      console.log('[DEBUG] Successfully cleaned up files:', { frontImage: frontImage.path, backImage: backImage.path });
    } catch (cleanupError) {
      console.error('[DEBUG] Error cleaning up files:', cleanupError);
    }

    console.log('[DEBUG] Sending response with status 200');
    res.status(200).json(parsedData);
  } catch (error) {
    console.log('[DEBUG] Error caught in ocrController:', error);
    if (error instanceof CustomError) {
      console.log('[DEBUG] Sending CustomError response:', { status: error.statusCode, message: error.message });
      res.status(error.statusCode).json({ error: error.message });
    } else {
      console.error('[DEBUG] Sending generic error response:', error);
      res.status(500).json({ error: 'Error processing images' });
    }
    next(error);
  }
};

function extractName(text: string): string {
  console.log('[DEBUG] Extracting name from text:', text);
  
  // Clean and normalize text
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // Strategy 1: Look for name patterns specific to Aadhaar cards
  // Names in Aadhaar cards often appear after enrollment info but before D/O, S/O, W/O
  
  let enrollmentFound = false;
  let nameFound = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();
    
    // Mark when we've passed enrollment/government section
    if (lowerLine.includes('enrolment') || lowerLine.includes('enrollment')) {
      enrollmentFound = true;
      continue;
    }
    
    // If we've found enrollment section, look for the name
    if (enrollmentFound && !nameFound) {
      // Skip obvious non-name lines
      if (lowerLine.includes('government') || 
          lowerLine.includes('authority') || 
          lowerLine.includes('india') ||
          lowerLine.includes('unique identification') ||
          lowerLine.includes('enrolment') ||
          lowerLine.includes('enrollment') ||
          lowerLine.includes('no.') ||
          lowerLine.includes('mobile') ||
          lowerLine.includes('phone') ||
          lowerLine.includes('aadhaar') ||
          lowerLine.includes('dob') ||
          lowerLine.includes('date') ||
          lowerLine.includes('birth') ||
          lowerLine.includes('female') ||
          lowerLine.includes('male') ||
          line.match(/^\d+/) || // Starts with numbers
          line.match(/^\d{4}\s?\d{4}\s?\d{4}$/) || // Aadhaar number pattern
          line.length < 2 || 
          line.length > 50) {
        continue;
      }
      
      // Check if this line contains D/O, S/O, W/O (relation indicators)
      if (lowerLine.includes('d/o') || lowerLine.includes('s/o') || lowerLine.includes('w/o')) {
        // This line contains relation info, so the name should be before this
        // Look backwards for the actual name
        for (let j = i - 1; j >= 0; j--) {
          const prevLine = lines[j];
          if (isValidNameLine(prevLine)) {
            console.log('[DEBUG] Found name before relation line:', prevLine);
            return prevLine.trim();
          }
        }
        continue;
      }
      
      // Check if this line looks like a valid name
      if (isValidNameLine(line)) {
        console.log('[DEBUG] Found potential name after enrollment:', line);
        return line.trim();
      }
    }
  }
  
  // Strategy 2: Look for common name patterns in the text
  // Sometimes names appear in specific contexts
  
  // Look for standalone name lines that are clearly names
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip government/system lines
    if (line.toLowerCase().includes('government') || 
        line.toLowerCase().includes('authority') || 
        line.toLowerCase().includes('india') ||
        line.toLowerCase().includes('unique identification') ||
        line.toLowerCase().includes('enrolment') ||
        line.toLowerCase().includes('aadhaar')) {
      continue;
    }
    
    // Look for lines that are clearly names (proper case, reasonable length)
    if (isValidNameLine(line) && isProperNameCase(line)) {
      // Additional check: make sure it's not followed immediately by system text
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
      if (!nextLine.toLowerCase().includes('government') && 
          !nextLine.toLowerCase().includes('authority')) {
        console.log('[DEBUG] Found properly formatted name:', line);
        return line.trim();
      }
    }
  }
  
  // Strategy 3: Extract name from relation patterns (D/O, S/O, W/O)
  const relationMatch = text.match(/([A-Za-z\s]+)\s+(?:D\/O|S\/O|W\/O)/i);
  if (relationMatch) {
    const potentialName = relationMatch[1].trim();
    if (isValidNameLine(potentialName)) {
      console.log('[DEBUG] Found name before relation pattern:', potentialName);
      return potentialName;
    }
  }
  
  // Strategy 4: Look for repeated names (names often appear twice in Aadhaar)
  const nameWords = new Map<string, number>();
  
  for (const line of lines) {
    if (isValidNameLine(line)) {
      const words = line.split(/\s+/);
      for (const word of words) {
        if (word.length > 2) {
          const lowerWord = word.toLowerCase();
          nameWords.set(lowerWord, (nameWords.get(lowerWord) || 0) + 1);
        }
      }
    }
  }
  
  // Find the most frequent name-like word
  let mostFrequentName = '';
  let maxCount = 0;
  
  for (const [word, count] of nameWords) {
    if (count > maxCount && count > 1) {
      // Find the original case version of this word
      for (const line of lines) {
        if (isValidNameLine(line) && line.toLowerCase().includes(word)) {
          const words = line.split(/\s+/);
          for (const w of words) {
            if (w.toLowerCase() === word) {
              mostFrequentName = w;
              maxCount = count;
              break;
            }
          }
        }
      }
    }
  }
  
  if (mostFrequentName) {
    console.log('[DEBUG] Found repeated name:', mostFrequentName);
    return mostFrequentName;
  }
  
  return 'Not found';
}

function isValidNameLine(line: string): boolean {
  // Check if line contains only letters, spaces, and common name characters
  if (!/^[A-Za-z\s.'-]+$/.test(line)) {
    return false;
  }
  
  // Check length constraints
  if (line.length < 2 || line.length > 50) {
    return false;
  }
  
  // Check for common non-name words
  const lowerLine = line.toLowerCase();
  const excludeWords = [
    'government', 'authority', 'india', 'unique', 'identification',
    'enrolment', 'enrollment', 'aadhaar', 'mobile', 'phone', 'address',
    'dob', 'date', 'birth', 'male', 'female', 'pin', 'code', 'state',
    'district', 'kerala', 'kannur', 'your', 'no', 'card', 'helps',
    'valid', 'throughout', 'country', 'avail', 'various', 'services',
    'carry', 'smart', 'phone', 'keep', 'updated', 'email'
  ];
  
  for (const word of excludeWords) {
    if (lowerLine.includes(word)) {
      return false;
    }
  }
  
  // Check if it's not all caps (system text is often all caps)
  if (line === line.toUpperCase() && line.length > 10) {
    return false;
  }
  
  // Check if it has reasonable word count (1-4 words for names)
  const wordCount = line.trim().split(/\s+/).length;
  if (wordCount > 4) {
    return false;
  }
  
  return true;
}

function isProperNameCase(line: string): boolean {
  // Check if the line follows proper name capitalization
  const words = line.split(/\s+/);
  
  for (const word of words) {
    if (word.length > 0) {
      // First letter should be uppercase, rest can be mixed case
      if (word[0] !== word[0].toUpperCase()) {
        return false;
      }
      
      // Check if it's not all caps (unless it's a short word)
      if (word.length > 2 && word === word.toUpperCase()) {
        return false;
      }
    }
  }
  
  return true;
}

function extractAadhaarNumber(text: string): string {
  console.log('[DEBUG] Extracting Aadhaar number from combined text');
  
  // Clean text and remove extra spaces
  const cleanText = text.replace(/[^0-9\s]/g, ' ').replace(/\s+/g, ' ');
  
  // Look for 12-digit number pattern (with or without spaces)
  const patterns = [
    /\b(\d{4})\s+(\d{4})\s+(\d{4})\b/g,  // 1234 5678 9012
    /\b(\d{4})(\d{4})(\d{4})\b/g,        // 123456789012
    /\b(\d{3})\s+(\d{3})\s+(\d{3})\s+(\d{3})\b/g, // Alternative spacing
  ];
  
  for (const pattern of patterns) {
    const matches = [...cleanText.matchAll(pattern)];
    for (const match of matches) {
      let number = '';
      if (match.length === 4) {
        number = match[1] + match[2] + match[3];
      } else if (match.length === 5) {
        number = match[1] + match[2] + match[3] + match[4];
      } else {
        number = match[0].replace(/\s/g, '');
      }
      
      if (number.length === 12) {
        console.log('[DEBUG] Found Aadhaar number:', number);
        return number;
      }
    }
  }
  
  return 'Not found';
}

function extractDateOfBirth(text: string): string {
  console.log('[DEBUG] Extracting DOB from text');
  
  // Look for DOB label patterns
  const dobPatterns = [
    /DOB\s*:?\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i,
    /Date\s+of\s+Birth\s*:?\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i,
    /Birth\s*:?\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i,
    /DOB\s*:?\s*(\d{2})(\d{2})(\d{4})/i,  // DDMMYYYY format
  ];
  
  for (const pattern of dobPatterns) {
    const match = text.match(pattern);
    if (match) {
      if (match.length === 4) {
        // Handle DDMMYYYY format
        const day = match[1];
        const month = match[2];
        const year = match[3];
        console.log('[DEBUG] Found DOB (DDMMYYYY):', `${day}/${month}/${year}`);
        return `${day}/${month}/${year}`;
      } else {
        console.log('[DEBUG] Found DOB:', match[1]);
        return match[1];
      }
    }
  }
  
  // Look for date patterns near "Female" or "Male" text
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.toLowerCase().includes('female') || line.toLowerCase().includes('male')) {
      // Check current line and previous lines for date
      for (let j = Math.max(0, i - 2); j <= i; j++) {
        const checkLine = lines[j];
        const dateMatch = checkLine.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4})/);
        if (dateMatch) {
          console.log('[DEBUG] Found DOB near gender:', dateMatch[1]);
          return dateMatch[1];
        }
      }
    }
  }
  
  return 'Not found';
}

function extractAddress(text: string): string {
  console.log('[DEBUG] Extracting address from text');
  
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  let addressParts: string[] = [];
  let foundAddressStart = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Look for address indicators
    if (line.toLowerCase().includes('d/o') || line.toLowerCase().includes('s/o') || line.toLowerCase().includes('w/o')) {
      foundAddressStart = true;
      continue;
    }
    
    if (foundAddressStart) {
      // Skip the parent/spouse name line
      if (i > 0 && lines[i-1].toLowerCase().includes('d/o')) {
        continue;
      }
      
      // Collect address components
      if (line.length > 2 && 
          !line.toLowerCase().includes('government') &&
          !line.toLowerCase().includes('authority') &&
          !line.toLowerCase().includes('mobile') &&
          !line.toLowerCase().includes('aadhaar') &&
          !line.toLowerCase().includes('dob') &&
          !line.toLowerCase().includes('female') &&
          !line.toLowerCase().includes('male') &&
          !line.match(/^\d{4}\s?\d{4}\s?\d{4}$/)) {
        
        addressParts.push(line);
      }
      
      // Stop if we've collected enough parts or hit certain keywords
      if (addressParts.length >= 5 || line.toLowerCase().includes('mobile')) {
        break;
      }
    }
  }
  
  if (addressParts.length > 0) {
    const address = addressParts.join(', ').trim();
    console.log('[DEBUG] Found address:', address);
    return address;
  }
  
  return 'Not found';
}