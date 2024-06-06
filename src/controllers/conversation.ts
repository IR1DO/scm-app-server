import { isValid } from 'date-fns';
import { RequestHandler } from 'express';
import { isValidObjectId } from 'mongoose';
import ConversationModel from 'src/models/conversation';
import UserModel from 'src/models/user';
import { sendErrorRes } from 'src/utils/helper';

export const getOrCreateConversation: RequestHandler = async (req, res) => {
  const { peerId } = req.params;
  if (!isValidObjectId(peerId)) {
    return sendErrorRes(res, 'Invalid peer id.', 422);
  }

  const user = await UserModel.findById(peerId);
  if (!user) {
    return sendErrorRes(res, 'User not found.', 404);
  }

  const participants = [req.user.id, peerId];
  const participantsId = participants.sort().join('_');

  const conversation = await ConversationModel.findOneAndUpdate(
    { participantsId },
    {
      // insert only if upsert founds nothing as participants
      $setOnInsert: {
        participantsId,
        participants,
      },
    },
    { upsert: true, new: true }
  );

  res.json({ conversationId: conversation._id });
};
