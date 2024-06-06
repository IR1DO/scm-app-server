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
  console.log(socket.data);
  console.log('user is connected.');
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
