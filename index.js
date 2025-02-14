require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");

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

const upload = multer({ dest: "uploads/" });
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

// API for single image SEO generation
app.post("/generate-seo/single", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const file = await uploadToGemini(req.file.path, req.file.mimetype);
    const prompt = `Generate SEO friendly title, description, and 50 keywords as a JSON object for the following image. Only return the JSON. Do not include any other text.
        {
          "title": "generated title",
          "description": "generated description",
          "keywords": ["keyword1", "keyword2", ...]
        }
    `;
    const chatSession = model.startChat({
      generationConfig,
      safetySettings,
      history: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                mimeType: file.mimeType,
                fileUri: file.uri,
              },
            },
            { text: prompt },
          ],
        },
      ],
    });

    const result = await chatSession.sendMessage(
      "Generate SEO details, returning only a JSON object."
    );
    fs.unlinkSync(req.file.path); // Remove local file after processing

    try {
      const jsonResponse = result.response.text();
      const cleanedResponse = jsonResponse
        .replace(/^```json/, "")
        .replace(/```$/, "")
        .trim();

      const parsedJson = JSON.parse(cleanedResponse);
      res.json(parsedJson);
    } catch (parseError) {
      console.error("JSON parsing error:", parseError);
      console.error("Raw response from Gemini:", result.response.text());
      return res.status(500).json({
        error: "Failed to parse JSON response. " + parseError.message,
      });
    }
  } catch (error) {
    console.error("Gemini API error:", error);
    res.status(500).json({ error: error.message });
  }
});

// API for multiple images SEO generation (max 10 images)
app.post(
  "/generate-seo/multiple",
  upload.array("images", 10),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No files uploaded." });
      }

      const uploadedFiles = await Promise.all(
        req.files.map(async (file) => {
          return await uploadToGemini(file.path, file.mimetype);
        })
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

      const result = await chatSession.sendMessage(
        "Generate SEO details, returning only a JSON array."
      );
      req.files.forEach((file) => fs.unlinkSync(file.path)); // Remove local files after processing

      try {
        const jsonResponse = result.response.text();
        const cleanedResponse = jsonResponse
          .replace(/^```json/, "")
          .replace(/```$/, "")
          .trim();

        const parsedJson = JSON.parse(cleanedResponse);
        console.log(parsedJson);
        res.status(200).json(parsedJson);
      } catch (parseError) {
        console.error("JSON parsing error:", parseError);
        console.error("Raw response from Gemini:", result.response.text());
        return res.status(500).json({
          error: "Failed to parse JSON response. " + parseError.message,
        });
      }
    } catch (error) {
      console.error("Gemini API error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

const addImageMetadata = require("./helpers/metadata-generator");

async function example() {
  try {
    const result = await addImageMetadata("./uploads/test.jpg", {
      title: "Beautiful Sunset",
      description: "A stunning sunset captured at the beach",
      keywords: ["sunset", "beach", "nature", "photography"],
    });

    console.log(result);
  } catch (error) {
    console.error(error);
  }
}
example();
