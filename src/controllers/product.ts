import { UploadApiResponse } from 'cloudinary';
import { RequestHandler } from 'express';
import { isValidObjectId } from 'mongoose';
import cloudUploader, { cloudApi } from 'src/cloud';
import ProductModel from 'src/models/product';
import { UserDocument } from 'src/models/user';
import categories from 'src/utils/categories';
import { sendErrorRes } from 'src/utils/helper';

const uploadImage = (filePath: string): Promise<UploadApiResponse> => {
  return cloudUploader.upload(filePath, {
    width: 1280,
    height: 720,
    crop: 'fill',
  });
};

export const listNewProduct: RequestHandler = async (req, res) => {
  /*
  1. User must be authenticated.
  2. User can upload images as well.
  3. Validate incoming data.
  4. Create Product.
  5. Validate and Upload File (or Files) - note (restrict image qty).
  6. And send the response back.
  */

  const { name, description, price, category, purchasingDate } = req.body;
  const newProduct = new ProductModel({
    owner: req.user.id,
    name,
    description,
    price,
    category,
    purchasingDate,
  });

  const { images } = req.files;
  if (!images) {
    return sendErrorRes(res, 'No images uploaded.', 422);
  }

  // Validate file
  const isMultipleImages = Array.isArray(images);
  if (isMultipleImages) {
    if (images.length > 5) {
      return sendErrorRes(res, 'No more than 5 image files allowed.', 422);
    } else {
      for (let img of images) {
        if (!img.mimetype?.startsWith('image')) {
          return sendErrorRes(res, 'Invalid file type.', 422);
        }
      }
    }
  } else {
    if (!images.mimetype?.startsWith('image')) {
      return sendErrorRes(res, 'Invalid file type.', 422);
    }
  }

  // Upload file
  if (isMultipleImages) {
    const uploadPromise = images.map((file) => uploadImage(file.filepath));
    const uploadResults = await Promise.all(uploadPromise);

    newProduct.images = uploadResults.map(({ secure_url, public_id }) => {
      return { url: secure_url, id: public_id };
    });
    newProduct.thumbnail = newProduct.images[0].url;
  } else {
    const { secure_url, public_id } = await uploadImage(images.filepath);
    newProduct.images = [{ url: secure_url, id: public_id }];
    newProduct.thumbnail = newProduct.images[0].url;
  }

  await newProduct.save();

  res.status(201).json({ message: 'Added new product.' });
};

export const updateProduct: RequestHandler = async (req, res) => {
  /*
  1. User must be authenticated.
  2. User can upload images as well.
  3. Validate incoming data.
  4. Update normal properties (if the product is made by the same user).
  5. Upload and update images (restrict image qty).
  6. And send the response back.
  */

  const productId = req.params.id;
  if (!isValidObjectId(productId)) {
    return sendErrorRes(res, 'Invalid product id.', 422);
  }

  const { name, description, price, category, purchasingDate, thumbIndex } =
    req.body;
  const product = await ProductModel.findOneAndUpdate(
    { _id: productId, owner: req.user.id },
    { name, description, price, category, purchasingDate },
    { new: true }
  );
  if (!product) {
    return sendErrorRes(res, 'Product not found.', 404);
  }

  const { images } = req.files;
  if (images) {
    // validate file
    const isMultipleImages = Array.isArray(images);
    if (isMultipleImages) {
      if ((product.images?.length || 0) + images.length > 5) {
        return sendErrorRes(res, 'No more than 5 image files allowed.', 422);
      } else {
        for (let img of images) {
          if (!img.mimetype?.startsWith('image')) {
            return sendErrorRes(res, 'Invalid file type.', 422);
          }
        }
      }
    } else {
      if ((product.images?.length || 0) > 4) {
        return sendErrorRes(res, 'No more than 5 image files allowed.', 422);
      } else if (!images.mimetype?.startsWith('image')) {
        return sendErrorRes(res, 'Invalid file type.', 422);
      }
    }

    // upload file
    if (isMultipleImages) {
      const uploadPromise = images.map((file) => uploadImage(file.filepath));
      const uploadResults = await Promise.all(uploadPromise);

      const newImages = uploadResults.map(({ secure_url, public_id }) => {
        return { url: secure_url, id: public_id };
      });

      if (product.images) {
        product.images.push(...newImages);
      } else {
        product.images = newImages;
      }
    } else {
      const { secure_url, public_id } = await uploadImage(images.filepath);

      if (product.images) {
        product.images.push({ url: secure_url, id: public_id });
      } else {
        product.images = [{ url: secure_url, id: public_id }];
      }
    }
  }

  // update thumbnail
  const updatedImages = product.images;
  if (updatedImages?.length) {
    if (thumbIndex >= 0) {
      product.thumbnail = updatedImages.map((img) => img.url)[thumbIndex];
    } else {
      const imageUrls = updatedImages.map((img) => img.url) || [];
      if (!imageUrls.some((img) => product.thumbnail?.includes(img))) {
        product.thumbnail = updatedImages[0].url;
      }
    }
  } else {
    product.thumbnail =
      'https://www.goetheharare.org/wp-content/plugins/penci-portfolio//images/no-thumbnail.jpg';
  }

  await product.save();

  res.status(201).json({ message: 'Product updated successfully.' });
};

export const deleteProduct: RequestHandler = async (req, res) => {
  /*
  1. User must be authenticated.
  2. Validate the product id.
  3. Remove if it is made by the same user.
  4. Remove images as well (from cloud).
  5. And send the response back.
  */

  const productId = req.params.id;
  if (!isValidObjectId(productId)) {
    return sendErrorRes(res, 'Invalid product id.', 422);
  }

  const product = await ProductModel.findOneAndDelete({
    _id: productId,
    owner: req.user.id,
  });
  if (!product) {
    return sendErrorRes(res, 'Product not found.', 404);
  }

  const images = product.images || [];
  if (images.length) {
    const ids = images.map((img) => img.id);
    await cloudApi.delete_resources(ids);
  }

  res.json({ message: 'Product removed successfully.' });
};

export const deleteProductImage: RequestHandler = async (req, res) => {
  /*
  1. User must be authenticated.
  2. Validate the product id.
  3. Remove the image from db (if it is made by the same user).
  4. Remove from cloud as well.
  5. And send the response back.
  */

  const { productId, imageId } = req.params;
  if (!isValidObjectId(productId)) {
    return sendErrorRes(res, 'Invalid product id.', 422);
  }

  const product = await ProductModel.findOneAndUpdate(
    { _id: productId, owner: req.user.id },
    {
      $pull: {
        images: { id: imageId },
      },
    },
    { new: true }
  );
  if (!product) {
    return sendErrorRes(res, 'Product not found.', 404);
  }

  await cloudUploader.destroy(imageId);

  res.json({ message: 'Image remove successfully.' });
};

export const getProductDetail: RequestHandler = async (req, res) => {
  /*
  1. User must be authenticated (optional).
  2. Validate the product id.
  3. Find Product by the id.
  4. Format data.
  5. And send the response back.
  */

  const productId = req.params.id;
  if (!isValidObjectId(productId)) {
    return sendErrorRes(res, 'Invalid product id.', 422);
  }

  const product = await ProductModel.findById(productId).populate<{
    owner: UserDocument;
  }>('owner');
  if (!product) {
    return sendErrorRes(res, 'Product not found.', 404);
  }

  res.json({
    product: {
      id: product._id,
      name: product.name,
      description: product.description,
      price: product.price,
      category: product.category,
      images: product.images?.map((img) => img.url),
      thumbnail: product.thumbnail,
      purchasingDate: product.purchasingDate,
      seller: {
        id: product.owner._id,
        name: product.owner.name,
        avatar: product.owner.avatar?.url,
      },
    },
  });
};

export const getProductsByCategory: RequestHandler = async (req, res) => {
  /*
  1. User must be authenticated (optional).
  2. Validate the category.
  3. Find products by category (apply pagination if needed).
  4. Format data.
  5. And send the response back.
  */

  const category = req.params.category;
  const { page = '1', limit = '10' } = req.query as {
    page: string;
    limit: string;
  };

  if (!categories.includes(category)) {
    return sendErrorRes(res, 'Invalid category.', 422);
  }

  const products = await ProductModel.find({ category })
    .sort('-createdAt')
    .skip((parseInt(page) - 1) * parseInt(limit))
    .limit(parseInt(limit));
  if (!products.length) {
    return sendErrorRes(res, 'No products found.', 404);
  }

  const listings = products.map((product) => {
    return {
      id: product._id,
      name: product.name,
      description: product.description,
      price: product.price,
      category: product.category,
      thumbnail: product.thumbnail,
      purchasingDate: product.purchasingDate,
    };
  });

  res.json({ products: listings });
};

export const getLatestProducts: RequestHandler = async (req, res) => {
  /*
  1. User must be authenticated (optional).
  2. Find all the products with sorted date (apply limit/pagination if needed).
  3. Format data.
  4. And send the response back.
  */

  const products = await ProductModel.find().sort('-createdAt').limit(10);
  if (!products.length) {
    return sendErrorRes(res, 'No products found.', 404);
  }

  const listings = products.map((product) => {
    return {
      id: product._id,
      name: product.name,
      description: product.description,
      price: product.price,
      category: product.category,
      thumbnail: product.thumbnail,
      purchasingDate: product.purchasingDate,
    };
  });

  res.json({ products: listings });
};

export const getListings: RequestHandler = async (req, res) => {
  /*
  1. User must be authenticated.
  2. Find all the products created by this user (apply pagination if needed).
  3. Format data.
  4. And send the response back.
  */

  const { page = '1', limit = '10' } = req.query as {
    page: string;
    limit: string;
  };

  const products = await ProductModel.find({ owner: req.user.id })
    .sort('-createdAt')
    .skip((parseInt(page) - 1) * parseInt(limit))
    .limit(parseInt(limit));
  if (!products.length) {
    return sendErrorRes(res, 'No products found.', 404);
  }

  const listings = products.map((product) => {
    return {
      id: product._id,
      name: product.name,
      description: product.description,
      price: product.price,
      category: product.category,
      images: product.images?.map((img) => img.url),
      thumbnail: product.thumbnail,
      purchasingDate: product.purchasingDate,
      seller: {
        id: req.user.id,
        name: req.user.name,
        avatar: req.user.avatar,
      },
    };
  });

  res.json({ products: listings });
};
