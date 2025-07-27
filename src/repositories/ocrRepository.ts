import { IOcrRepository } from '../interfaces/IOcrRepository';

export class OcrRepository implements IOcrRepository {
  public extractName(text: string): string {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    let enrollmentFound = false;
    let nameFound = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lowerLine = line.toLowerCase();

      if (lowerLine.includes('enrolment') || lowerLine.includes('enrollment')) {
        enrollmentFound = true;
        continue;
      }

      if (enrollmentFound && !nameFound) {
        if (
          lowerLine.includes('government') ||
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
          line.match(/^\d+/) ||
          line.match(/^\d{4}\s?\d{4}\s?\d{4}$/) ||
          line.length < 2 ||
          line.length > 50
        ) {
          continue;
        }

        if (lowerLine.includes('d/o') || lowerLine.includes('s/o') || lowerLine.includes('w/o')) {
          for (let j = i - 1; j >= 0; j--) {
            const prevLine = lines[j];
            if (this.isValidNameLine(prevLine)) {
              console.log('[DEBUG] Found name before relation line:', prevLine);
              return prevLine.trim();
            }
          }
          continue;
        }

        if (this.isValidNameLine(line)) {
          console.log('[DEBUG] Found potential name after enrollment:', line);
          return line.trim();
        }
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (
        line.toLowerCase().includes('government') ||
        line.toLowerCase().includes('authority') ||
        line.toLowerCase().includes('india') ||
        line.toLowerCase().includes('unique identification') ||
        line.toLowerCase().includes('enrolment') ||
        line.toLowerCase().includes('aadhaar')
      ) {
        continue;
      }

      if (this.isValidNameLine(line) && this.isProperNameCase(line)) {
        const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
        if (!nextLine.toLowerCase().includes('government') && !nextLine.toLowerCase().includes('authority')) {
          return line.trim();
        }
      }
    }

    const relationMatch = text.match(/([A-Za-z\s]+)\s+(?:D\/O|S\/O|W\/O)/i);
    if (relationMatch) {
      const potentialName = relationMatch[1].trim();
      if (this.isValidNameLine(potentialName)) {
        console.log('[DEBUG] Found name before relation pattern:', potentialName);
        return potentialName;
      }
    }

    const nameWords = new Map<string, number>();
    for (const line of lines) {
      if (this.isValidNameLine(line)) {
        const words = line.split(/\s+/);
        for (const word of words) {
          if (word.length > 2) {
            const lowerWord = word.toLowerCase();
            nameWords.set(lowerWord, (nameWords.get(lowerWord) || 0) + 1);
          }
        }
      }
    }

    let mostFrequentName = '';
    let maxCount = 0;
    for (const [word, count] of nameWords) {
      if (count > maxCount && count > 1) {
        for (const line of lines) {
          if (this.isValidNameLine(line) && line.toLowerCase().includes(word)) {
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
      return mostFrequentName;
    }

    return 'Not found';
  }

  private isValidNameLine(line: string): boolean {
    if (!/^[A-Za-z\s.'-]+$/.test(line)) {
      return false;
    }

    if (line.length < 2 || line.length > 50) {
      return false;
    }

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

    if (line === line.toUpperCase() && line.length > 10) {
      return false;
    }

    const wordCount = line.trim().split(/\s+/).length;
    if (wordCount > 4) {
      return false;
    }

    return true;
  }

  private isProperNameCase(line: string): boolean {
    const words = line.split(/\s+/);
    for (const word of words) {
      if (word.length > 0) {
        if (word[0] !== word[0].toUpperCase()) {
          return false;
        }
        if (word.length > 2 && word === word.toUpperCase()) {
          return false;
        }
      }
    }
    return true;
  }

  public extractAadhaarNumber(text: string): string {
    const cleanText = text.replace(/[^0-9\s]/g, ' ').replace(/\s+/g, ' ');
    const patterns = [
      /\b(\d{4})\s+(\d{4})\s+(\d{4})\b/g,
      /\b(\d{4})(\d{4})(\d{4})\b/g,
      /\b(\d{3})\s+(\d{3})\s+(\d{3})\s+(\d{3})\b/g,
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

  public extractDateOfBirth(text: string): string {
    console.log('[DEBUG] Extracting DOB from text');
    const dobPatterns = [
      /DOB\s*:?\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i,
      /Date\s+of\s+Birth\s*:?\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i,
      /Birth\s*:?\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i,
      /DOB\s*:?\s*(\d{2})(\d{2})(\d{4})/i,
    ];

    for (const pattern of dobPatterns) {
      const match = text.match(pattern);
      if (match) {
        if (match.length === 4) {
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

    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.toLowerCase().includes('female') || line.toLowerCase().includes('male')) {
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

  public extractAddress(text: string): string {
    console.log('[DEBUG] Extracting address from text');
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    let addressParts: string[] = [];
    let foundAddressStart = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.toLowerCase().includes('d/o') || line.toLowerCase().includes('s/o') || line.toLowerCase().includes('w/o')) {
        foundAddressStart = true;
        continue;
      }

      if (foundAddressStart) {
        if (i > 0 && lines[i - 1].toLowerCase().includes('d/o')) {
          continue;
        }

        if (
          line.length > 2 &&
          !line.toLowerCase().includes('government') &&
          !line.toLowerCase().includes('authority') &&
          !line.toLowerCase().includes('mobile') &&
          !line.toLowerCase().includes('aadhaar') &&
          !line.toLowerCase().includes('dob') &&
          !line.toLowerCase().includes('female') &&
          !line.toLowerCase().includes('male') &&
          !line.match(/^\d{4}\s?\d{4}\s?\d{4}$/)
        ) {
          addressParts.push(line);
        }

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
}