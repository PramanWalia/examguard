import { Router } from 'express';

import { attemptRouter } from './attempt.js';
import { authRouter } from './auth.js';
import { examRouter } from './exam.js';
import { questionRouter } from './question.js';
import { userRouter } from './user.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/questions', questionRouter);
apiRouter.use('/exams', examRouter);
apiRouter.use('/attempts', attemptRouter);
