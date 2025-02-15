require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises; // Changed to use promise-based fs
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const addImageMetadata = require("./helpers/metadata-generator");

const app = express();
const port = process.env.PORT || 5000;
const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

app.use(express.json());
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

const upload = multer({
  storage: multer.diskStorage({
    destination: "uploads/",
    filename: (req, file, cb) => {
      cb(null, file.originalname);
    },
  }),
});

const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
  responseMimeType: "text/plain",
};

async function uploadToGemini(filePath, mimeType) {
  const uploadResult = await fileManager.uploadFile(filePath, {
    mimeType,
    displayName: path.basename(filePath),
  });
  return uploadResult.file;
}

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

app.post(
  "/generate-seo/multiple",
  upload.array("images", 10),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No files uploaded." });
      }

      console.log(
        "Uploaded Files:",
        req.files.map((file) => file.originalname)
      );

      // Upload to Gemini AI and get metadata
      const uploadedFiles = await Promise.all(
        req.files.map(async (file) => uploadToGemini(file.path, file.mimetype))
      );

      const prompt = `Generate SEO friendly title, description, and 50 keywords for each image as a JSON array of objects.  Only return the JSON. Do not include any other text. Each object in the array should have the following structure:
        [
          {
            "title": "generated title for image 1",
            "description": "generated description for image 1",
            "keywords": ["keyword1", "keyword2", ...]
          },
          {
            "title": "generated title for image 2",
            "description": "generated description for image 2",
            "keywords": ["keyword1", "keyword2", ...]
          },
          ...
        ]
    `;

      const chatSession = model.startChat({
        generationConfig,
        safetySettings,
        history: [
          {
            role: "user",
            parts: uploadedFiles
              .map((file) => ({
                fileData: {
                  mimeType: file.mimeType,
                  fileUri: file.uri,
                },
              }))
              .concat({ text: prompt }),
          },
        ],
      });

      const result = await chatSession.sendMessage("Generate SEO metadata.");
      const jsonResponse = await result.response.text();
      const cleanedResponse = jsonResponse
        .replace(/^```json/, "")
        .replace(/```$/, "")
        .trim();
      const metadataArray = JSON.parse(cleanedResponse);

      // Process images with metadata
      const processedImages = await Promise.all(
        req.files.map(async (file, index) => {
          const metadata = metadataArray[index];
          const outputImage = await addImageMetadata(file.path, metadata);
          return {
            path: outputImage.outputPath,
            ...metadata,
          };
        })
      );

      res.status(200).json(processedImages);
    } catch (error) {
      console.error("Error processing images:", error);
      res.status(500).json({ error: error.message });
    } finally {
      try {
        await Promise.all(req.files.map((file) => fs.unlink(file.path)));
      } catch (err) {
        console.warn("Cleanup error:", err.message);
      }
    }
  }
);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
