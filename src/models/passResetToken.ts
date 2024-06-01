import { Schema, model } from 'mongoose';
import { hash, compare, genSalt } from 'bcrypt';

interface PassResetTokenDocument extends Document {
  owner: Schema.Types.ObjectId;
  token: string;
  createdAt: Date;
}

interface Methods {
  compareToken(token: string): Promise<boolean>;
}

const schema = new Schema<PassResetTokenDocument, {}, Methods>({
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  token: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    expires: 3600, // 60 * 60 * 1
    default: Date.now(),
  },
});

schema.pre('save', async function (next) {
  if (this.isModified('token')) {
    const salt = await genSalt(10);
    this.token = await hash(this.token, salt);
  }

  next();
});

schema.methods.compareToken = async function (token: string) {
  return await compare(token, this.token);
};

const PassResetTokenModel = model('PassResetToken', schema);
export default PassResetTokenModel;
