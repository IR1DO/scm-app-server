import { Document, Schema, model } from 'mongoose';
import categories from 'src/utils/categories';

type productImage = { url: string; id: string };

export interface ProductDocument extends Document {
  owner: Schema.Types.ObjectId;
  name: string;
  description: string;
  price: number;
  category: string;
  images?: productImage[];
  thumbnail?: string;
  purchasingDate: Date;
}

const productSchema = new Schema<ProductDocument>(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
    },
    category: {
      type: String,
      enum: categories,
      required: true,
    },
    images: [
      {
        type: Object,
        url: String,
        id: String,
      },
    ],
    thumbnail: {
      type: String,
    },
    purchasingDate: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

const ProductModel = model('Product', productSchema);

export default ProductModel;
