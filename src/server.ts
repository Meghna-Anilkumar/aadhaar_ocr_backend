import dotenv from 'dotenv';
import fs from 'fs';
import app from './app';

dotenv.config();

if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});