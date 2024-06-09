import 'dotenv/config';
import 'express-async-errors';
import 'src/db';
import express from 'express';
import authRouter from 'routes/auth';
import productRouter from './routes/product';
import { sendErrorRes } from './utils/helper';
import http from 'http';
import { Server } from 'socket.io';
import { TokenExpiredError, verify } from 'jsonwebtoken';
import morgan from 'morgan';
import conversationRouter from './routes/conversation';
import { IncomingMessage, OutgoingMessageResponse } from './utils/types';
import ConversationModel from './models/conversation';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  path: '/socket-message',
});

app.use(morgan('dev'));
app.use(express.static('src/public'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// API Routes
app.use('/auth', authRouter);
app.use('/product', productRouter);
app.use('/conversation', conversationRouter);

// Socket IO
io.use((socket, next) => {
  const socketReq = socket.handshake.auth as { token: string } | undefined;
  if (!socketReq?.token) {
    return next(new Error('Unauthorized request.'));
  }

  try {
    socket.data.jwtDecode = verify(socketReq.token, process.env.JWT_SECRET!);
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      return next(new Error('Session expired.'));
    }

    return next(new Error('Invalid token.'));
  }

  next();
});

io.on('connection', (socket) => {
  const socketData = socket.data as { jwtDecode: { id: string } };
  const userId = socketData.jwtDecode.id; // FIXME ?why so verbose?

  socket.join(userId);
  console.log('Joiner: ', userId); // DEBUG

  socket.on('chat:new', async (data: IncomingMessage) => {
    const { message, to, conversationId } = data;

    await ConversationModel.findByIdAndUpdate(conversationId, {
      $push: {
        chats: {
          sentBy: message.user.id,
          content: message.text,
          timestamp: message.time, // mongoose will handle the cast from iso_string to date
        },
      },
    });

    const messageResponse: OutgoingMessageResponse = {
      message,
      from: message.user,
      conversationId,
    };

    socket.to(to).emit('chat:message', messageResponse);
  });
});

app.use(function (err, req, res, next) {
  res.status(500).json({ message: err.message });
} as express.ErrorRequestHandler);

app.use('*', (req, res) => {
  sendErrorRes(res, 'Page Not Found', 404);
});

server.listen(8000, () => {
  console.log('The app is running on http://localhost:8000');
});
