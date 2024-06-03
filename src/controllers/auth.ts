import { RequestHandler } from 'express';
import UserModel from 'src/models/user';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import AuthVerificationTokenModel from 'src/models/authVerificationToken';
import { sendErrorRes } from 'src/utils/helper';
import jwt from 'jsonwebtoken';
import mail from 'src/utils/mail';
import PassResetTokenModel from 'src/models/passResetToken';
import { isValidObjectId } from 'mongoose';
import cloudUploader from 'src/cloud';

const VERIFICATION_LINK = process.env.VERIFICATION_LINK;
const PASSWORD_RESET_LINK = process.env.PASSWORD_RESET_LINK;
const JWT_SECRET = process.env.JWT_SECRET!;

export const createNewUser: RequestHandler = async (req, res) => {
  /*
  1. Read incoming data like: name, email, password.
  2. Check if we already have account with same user.
  3. Send error if yes otherwise create new account and save user inside DB.
  4. Generate and store verification token.
  5. Send verification link with token to register email.
  */

  const { name, email, password } = req.body;

  const existingUser = await UserModel.findOne({ email: email });
  if (existingUser) {
    return sendErrorRes(
      res,
      'Unauthorized request, email is already in use!',
      401
    );
  }

  const user = await UserModel.create({ name, email, password });
  const token = crypto.randomBytes(36).toString('hex');
  const link = `${VERIFICATION_LINK}?id=${user._id}&token=${token}`;

  await AuthVerificationTokenModel.create({ owner: user._id, token });
  await mail.sendVerification(user.email, link);

  res.json({ message: 'Please check your inbox.' });
};

export const verifyEmail: RequestHandler = async (req, res) => {
  /* 
  1. Read incoming data like: id and token.
  2. Find the token inside DB (using owner id).
  3. Send error if token not found.
  4. Check if the token is valid or not (because we have the encrypted value).
  5. If not valid send error otherwise update user is verified.
  6. Remove token from database.
  7. Send success message.
  */

  const { id, token } = req.body;

  const authToken = await AuthVerificationTokenModel.findOne({ owner: id });
  if (!authToken) {
    return sendErrorRes(res, 'Unauthorized request.', 403);
  }

  const isMatched = await authToken.compareToken(token);
  if (!isMatched) {
    return sendErrorRes(res, 'Unauthorized request, invalid token.', 403);
  }

  await UserModel.findByIdAndUpdate(id, { verified: true });
  await AuthVerificationTokenModel.findByIdAndDelete(authToken._id);

  res.json({ message: 'Thanks for joining us, your email is verified.' });
};

export const generateVerificationLink: RequestHandler = async (req, res) => {
  /*
  1. check if user is authenticated or not.
  2. remove previous token if any.
  3. create/store new token.
  4. send link inside users email.
  5. send response back.
  */

  const { id } = req.user;
  const token = crypto.randomBytes(36).toString('hex');
  const link = `${VERIFICATION_LINK}?id=${id}&token=${token}`;

  await AuthVerificationTokenModel.findOneAndDelete({ owner: id });
  await AuthVerificationTokenModel.create({ owner: id, token });
  await mail.sendVerification(req.user.email, link);

  res.json({ message: 'Please check your inbox.' });
};

export const signIn: RequestHandler = async (req, res) => {
  /*
  1. Read incoming data like: email and password.
  2. Find user with the provided email.
  3. Send error if user not found.
  4. Check if the password is valid or not (because password is in encrypted form).
  5. If not valid send error otherwise generate access & refresh token.
  6. Store refresh token inside DB.
  7. Send both tokens to user.
  */

  const { email, password } = req.body;

  const user = await UserModel.findOne({ email });
  if (!user) {
    return sendErrorRes(res, 'Email/Password mismatch', 403);
  }

  const isMatched = await user.comparePassword(password);
  if (!isMatched) {
    return sendErrorRes(res, 'Email/Password mismatch', 403);
  }

  const payload = { id: user._id };
  const accessToken = jwt.sign(payload, JWT_SECRET, {
    expiresIn: '15m',
  });
  const refreshToken = jwt.sign(payload, JWT_SECRET);

  if (!user.tokens) {
    user.tokens = [refreshToken];
  } else {
    user.tokens.push(refreshToken);
  }

  await user.save();

  res.json({
    profile: {
      id: user._id,
      email: user.email,
      name: user.name,
      verified: user.verified,
      avatar: user.avatar?.url,
    },
    tokens: { refresh: refreshToken, access: accessToken },
  });
};

export const sendProfile: RequestHandler = async (req, res) => {
  res.json({
    profile: req.user,
  });
};

export const grantAccessToken: RequestHandler = async (req, res) => {
  /* 
  1. Read and verify refresh token.
  2. Find user with payload.id and refresh token.
  3. If the refresh token is valid and no user found, token is compromised.
  4. Remove all the previous tokens and seed error response.
  5. If the token is valid and user found create new refresh and access token.
  6. Remove previous token, update user and send new tokens.
  */

  const { refreshToken } = req.body;
  if (!refreshToken) {
    return sendErrorRes(res, 'Unauthorized request.', 403);
  }

  const payload = jwt.verify(refreshToken, JWT_SECRET) as { id: string };
  if (!payload.id) {
    return sendErrorRes(res, 'Unauthorized request.', 401);
  }

  const user = await UserModel.findOne({
    _id: payload.id,
    tokens: refreshToken,
  });
  if (!user) {
    // User is compromised, remove all the previous tokens
    await UserModel.findByIdAndUpdate(payload.id, { tokens: [] });
    return sendErrorRes(res, 'Unauthorized request.', 401);
  }

  const newAccessToken = jwt.sign({ id: user._id }, JWT_SECRET, {
    expiresIn: '15m',
  });
  const newRefreshToken = jwt.sign({ id: user._id }, JWT_SECRET);

  user.tokens = user.tokens.filter((t) => t !== refreshToken);
  user.tokens.push(newRefreshToken);
  await user.save();

  res.json({
    profile: {
      id: user._id,
      email: user.email,
      name: user.name,
      verified: user.verified,
      avatar: user.avatar?.url,
    },
    tokens: { refresh: newRefreshToken, access: newAccessToken },
  });
};

export const signOut: RequestHandler = async (req, res) => {
  /*
  Remove the refresh token
  */

  const { refreshToken } = req.body;

  const user = await UserModel.findOne({
    _id: req.user.id,
    tokens: refreshToken,
  });
  if (!user) {
    return sendErrorRes(res, 'Unauthorized request.', 401);
  }

  user.tokens = user.tokens.filter((t) => t !== refreshToken);
  await user.save();

  res.send();
};

export const generateForgetPassLink: RequestHandler = async (req, res) => {
  /*
  1. Ask for users email.
  2. Find user with given email.
  3. Send error if there is no user.
  4. Else generate password reset token (first remove if there is any).
  5. Generate reset link (like we did for verification).
  6. Send link inside user's email.
  7. Send response back.
  */

  const { email } = req.body;

  const user = await UserModel.findOne({ email });
  if (!user) {
    return sendErrorRes(res, 'Account not found.', 404);
  }

  // Remove token
  await PassResetTokenModel.findOneAndDelete({ owner: user._id });

  const token = crypto.randomBytes(36).toString('hex');
  await PassResetTokenModel.create({ owner: user._id, token });

  const passResetLink = `${PASSWORD_RESET_LINK}?id=${user._id}&token=${token}`;
  await mail.sendPasswordResetLink(user.email, passResetLink);

  res.json({ message: 'Please check your inbox.' });
};

export const grantValid: RequestHandler = async (req, res) => {
  res.json({ valid: true });
};

export const updatePassword: RequestHandler = async (req, res) => {
  /*
  1. Read user id, reset pass token and password.
  2. Validate all these things.
  3. If valid find user with the given id.
  4. Check if user is using same password.
  5. If there is no user or user is using the same password send error res.
  6. Else update new password.
  7. Remove password reset token.
  8. Send confirmation email.
  9. Send response back.
  */

  const { id, password } = req.body;

  const user = await UserModel.findById(id);
  if (!user) {
    return sendErrorRes(res, 'Unauthorized access.', 403);
  }

  const isMatched = await user.comparePassword(password);
  if (isMatched) {
    return sendErrorRes(res, 'The new password must be different.', 422);
  }

  user.password = password;
  await user.save();

  await PassResetTokenModel.findOneAndDelete({ owner: user._id });

  await mail.sendPasswordUpdateMessage(user.email);

  res.json({ message: 'Password resets successfully.' });
};

export const updateProfile: RequestHandler = async (req, res) => {
  /*
  1. User must be logged in (authenticated).
  2. Name must be valid.
  3. Find user and update the name.
  4. Send new profile back.
  */

  const { name } = req.body;

  if (typeof name !== 'string' || name.trim().length <= 0) {
    return sendErrorRes(res, 'Invalid name.', 422);
  }

  await UserModel.findByIdAndUpdate(req.user.id, { name });

  res.json({ profile: { ...req.user, name } });
};

export const updateAvatar: RequestHandler = async (req, res) => {
  /*
  1. User must be logged in.
  2. Read incoming file.
  3. File type must be image.
  4. Check if user already have avatar or not.
  5. If yes then remove the old avatar.
  6. Upload new avatar and update user.
  7. Send response back.
  */

  const { avatar } = req.files;
  if (Array.isArray(avatar)) {
    return sendErrorRes(res, 'Multiple files are not allowed.', 422);
  }
  if (!avatar.mimetype?.startsWith('image')) {
    return sendErrorRes(res, 'Invalid image file is not allowed.', 422);
  }

  const user = await UserModel.findById(req.user.id);
  if (!user) {
    return sendErrorRes(res, 'User not found.', 404);
  }

  if (user.avatar?.id) {
    // Remove previous avatar file
    await cloudUploader.destroy(user.avatar.id);
  }

  // Upload new avatar file
  const { secure_url: url, public_id: id } = await cloudUploader.upload(
    avatar.filepath,
    {
      width: 300,
      height: 300,
      crop: 'thumb',
      gravity: 'face',
    }
  );
  user.avatar = { url, id };
  await user.save();

  res.json({ profile: { ...req.user, avatar: user.avatar.url } });
};

export const sendPublicProfile: RequestHandler = async (req, res) => {
  const profileId = req.params.id;
  if (!isValidObjectId(profileId)) {
    return sendErrorRes(res, 'Invalid profile id.', 422);
  }

  const user = await UserModel.findById(profileId);
  if (!user) {
    return sendErrorRes(res, 'Profile not found.', 404);
  }

  res.json({
    profile: { id: user._id, name: user.name, avatar: user.avatar?.url },
  });
};
