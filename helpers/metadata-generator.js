const sharp = require("sharp");
const fs = require("fs/promises");
const path = require("path");

/**
 * Adds or updates metadata for various image formats
 * @param {string} imagePath - Path to the image file
 * @param {Object} metadata - Metadata to be added
 * @returns {Promise<Object>} - Object containing status and output path
 */
async function addImageMetadata(imagePath, metadata) {
  try {
    if (!imagePath || !metadata) {
      throw new Error("Image path and metadata are required");
    }

    // Check if file exists
    await fs.access(imagePath);

    // Get file extension
    const ext = path.extname(imagePath).toLowerCase();

    if (!ext) {
      throw new Error(`File has no extension: ${imagePath}`);
    }

    const supportedFormats = [".jpg", ".jpeg", ".png", ".webp", ".tiff"];
    if (!supportedFormats.includes(ext)) {
      throw new Error(`Unsupported image format: ${ext}`);
    }

    const outputDir = path.join(path.dirname(imagePath), "processed");
    await fs.mkdir(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, path.basename(imagePath));

    switch (ext) {
      case ".jpg":
      case ".jpeg":
        await handleJpegMetadata(imagePath, outputPath, metadata);
        break;
      case ".png":
        await handlePngMetadata(imagePath, outputPath, metadata);
        break;
      case ".webp":
        await handleWebPMetadata(imagePath, outputPath, metadata);
        break;
      case ".tiff":
        await handleTiffMetadata(imagePath, outputPath, metadata);
        break;
    }

    return { status: "success", outputPath, message: "Metadata added" };
  } catch (error) {
    throw new Error(`Failed to add metadata: ${error.message}`);
  }
}

/**
 * Handle JPEG metadata
 * @private
 */
async function handleJpegMetadata(inputPath, outputPath, metadata) {
  const image = sharp(inputPath);

  const exifMetadata = {
    IFD0: {
      ImageDescription: metadata.description,
      XPTitle: metadata.title,
      XPKeywords: metadata.keywords.join(";"),
    },
  };

  const iptcMetadata = {
    ObjectName: metadata.title,
    Caption: metadata.description,
    Keywords: metadata.keywords,
  };

  await image
    .withMetadata({ exif: exifMetadata, iptc: iptcMetadata })
    .toFile(outputPath);
}

/**
 * Handle PNG metadata
 * @private
 */
async function handlePngMetadata(inputPath, outputPath, metadata) {
  const image = sharp(inputPath);
  const pngMetadata = {
    Title: metadata.title,
    Description: metadata.description,
    Keywords: metadata.keywords.join(", "),
  };

  await image.withMetadata({ png: { text: pngMetadata } }).toFile(outputPath);
}

/**
 * Handle WebP metadata
 * @private
 */
async function handleWebPMetadata(inputPath, outputPath, metadata) {
  const image = sharp(inputPath);
  const webpMetadata = {
    Title: metadata.title,
    Description: metadata.description,
    Keywords: metadata.keywords.join(", "),
  };

  await image.withMetadata({ webp: { xmp: webpMetadata } }).toFile(outputPath);
}

/**
 * Handle TIFF metadata
 * @private
 */
async function handleTiffMetadata(inputPath, outputPath, metadata) {
  const image = sharp(inputPath);
  const tiffMetadata = {
    ImageDescription: metadata.description,
    DocumentName: metadata.title,
    Keywords: metadata.keywords.join(";"),
  };

  await image.withMetadata({ tiff: tiffMetadata }).toFile(outputPath);
}

module.exports = addImageMetadata;
