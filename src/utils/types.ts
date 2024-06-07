import { ObjectId } from 'mongoose';

export type IncomingMessage = {
  message: {
    id: string;
    time: string;
    text: string;
    user: {
      id: string;
      name: string;
      avatar?: string;
    };
  };
  to: string;
  conversationId: string;
};

export type OutgoingMessageResponse = {
  message: {
    id: string;
    time: string;
    text: string;
    user: {
      id: string;
      name: string;
      avatar?: string;
    };
  };
  from: {
    id: string;
    name: string;
    avatar?: string;
  };
  conversationId: string;
};

interface UserProfile {
  id: string;
  name: string;
  avatar?: string;
}

interface Chat {
  id: string;
  time: string;
  text: string;
  user: UserProfile;
}

export interface Conversation {
  id: string;
  chats: Chat[];
  peerProfile: UserProfile;
}

export type PopulatedChat = {
  _id: ObjectId;
  content: string;
  timestamp: Date;
  sentBy: { name: string; _id: ObjectId; avatar?: { url: string } };
};

export type PopulatedParticipant = {
  _id: ObjectId;
  name: string;
  avatar?: { url: string };
};
