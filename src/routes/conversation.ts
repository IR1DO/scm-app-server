import { Router } from 'express';
import {
  getConversation,
  getLastChats,
  getOrCreateConversation,
} from 'src/controllers/conversation';
import { isAuth } from 'src/middleware/auth';

const conversationRouter = Router();

conversationRouter.get('/with/:peerId', isAuth, getOrCreateConversation);
conversationRouter.get('/chats/:conversationId', isAuth, getConversation);
conversationRouter.get('/last-chats', isAuth, getLastChats);

export default conversationRouter;
