import express, { Application } from 'express';
import morgan from 'morgan';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import routes from './routes/ocrRoutes';

dotenv.config();

const app: Application = express();


app.use(
  cors({
    origin: process.env.ORIGIN || 'http://localhost:5173',
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  })
);


app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(morgan('dev'));
app.use(cookieParser());


app.use('/api', routes);


app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    return next(err); 
  }
  if (err instanceof Error) {
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  } else {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default app;