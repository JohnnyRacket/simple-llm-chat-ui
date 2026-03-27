# File Upload in Modern LLM Chat Applications -- Technical Report

## 1. What Happens When You Upload a File to ChatGPT / Claude / Gemini?

### General Pipeline

The flow from upload to model inference follows this general pattern across all major providers:

1. **Client-side**: The UI accepts the file, validates type/size, and either base64-encodes it or uploads it to a server-side storage endpoint.
2. **Server-side preprocessing**: The service extracts content from the file depending on its type:
   - **Text files** (`.txt`, `.md`, `.py`, `.csv`): Read directly as UTF-8 text.
   - **PDFs**: Parsed via a combination of text extraction AND page-to-image conversion (for charts, diagrams, visual layouts).
   - **Images** (`.png`, `.jpg`, `.webp`, `.gif`): Passed directly to the vision component of the multimodal model.
   - **Spreadsheets** (`.xlsx`, `.csv`): Undergo spreadsheet-specific augmentation -- typically converted to a structured text representation (markdown tables or similar).
   - **Office docs** (`.docx`, `.pptx`): Text-only extraction.
3. **Token encoding**: The extracted text is tokenized. Images are encoded into the model's internal visual representation (patch embeddings).
4. **Prompt assembly**: The extracted content is inserted into the message array as structured content blocks alongside the user's text query.
5. **Inference**: The model processes text tokens + image patch embeddings together in its context window.

### Provider-Specific Differences

**ChatGPT (OpenAI)**:
- PDFs: Text + page images extracted. Non-PDF documents are text-only.
- For the Assistants/Responses API with File Search enabled, documents are chunked, embedded into a vector store, and retrieved via hybrid semantic + keyword search (RAG).
- Images go through a vision pipeline with configurable detail levels (`low`, `high`, `auto`).

**Claude (Anthropic)**:
- PDFs: Each page is converted to an image AND text is extracted alongside it. The model receives both representations per page. This is why Claude can analyze charts and visual layouts in PDFs.
- Token cost: 1,500-3,000 tokens per page (text) + image token costs per page.
- Non-PDF files (`.csv`, `.xlsx`, `.docx`, `.md`, `.txt`): Handled via the Files API with text extraction only.

**Gemini (Google)**:
- Accepts a very broad range of file types natively (PDF, images, audio, video).
- Files can be provided inline (up to 100MB, 50MB for PDFs), via the File API (up to 2GB per file, temporary 48hr storage), via Google Cloud Storage, or via external HTTPS/signed URLs.
- Native multimodal architecture processes all modalities together.

---

## 2. Text Extraction and Preprocessing

### PDF Parsing

PDFs are a visual format, not a structured data format. Extraction is non-trivial:

**Text-based PDFs:**
- Libraries like PyMuPDF (MuPDF), pdfplumber, PyPDF2, and pdf.js are commonly used.
- PyMuPDF4LLM specifically converts PDFs to Markdown for better LLM consumption, preserving structure (headings, tables, lists).
- The most reliable approach is converting PDFs to structured Markdown before feeding to an LLM.

**Scanned/Image-based PDFs:**
- Require OCR (Optical Character Recognition).
- Common OCR engines: Tesseract, Google Cloud Vision, AWS Textract, Azure Document Intelligence.
- Preprocessing pipeline: noise reduction, deskewing, rescaling, binarization, then OCR.

**How Anthropic handles PDFs internally:**
1. Convert each page to an image.
2. Extract text from each page.
3. Send both the page image and the extracted text to the model together.
4. The model can thus read text AND interpret visual elements (charts, tables, diagrams).

**How OpenAI handles PDFs:**
- Similar dual approach: text extraction + page images.
- For File Search (RAG): PDFs are chunked (default 800 tokens, 400 overlap), embedded with `text-embedding-3-large`, and stored in a vector store for retrieval.

### Structured Data (Spreadsheets, CSVs)

- CSVs are typically read as text and formatted into markdown tables or kept as comma-separated rows.
- Excel files (`.xlsx`) require library-level parsing (e.g., openpyxl, SheetJS) to extract cell data, then formatted as text.
- OpenAI specifically notes that spreadsheets undergo "spreadsheet-specific augmentation" -- likely formatting cells into readable tabular text.

---

## 3. Image Handling in Multimodal Models

### How Multimodal Models Receive Images

Modern multimodal LLMs (GPT-4o, Claude 3.5/4, Gemini) use **vision encoders** (typically ViT-based) that convert images into patch embeddings. These embeddings are projected into the same vector space as text token embeddings and processed together by the transformer.

### API Formats

**OpenAI (Chat Completions API):**
```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "What is in this image?" },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://example.com/image.jpg",
        "detail": "high"
      }
    }
  ]
}
```
Base64 variant: `"url": "data:image/jpeg;base64,{base64data}"`

**OpenAI (Responses API):**
```json
{
  "type": "input_image",
  "image_url": "data:image/jpeg;base64,{base64data}"
}
```
Or with file ID: `{ "type": "input_file", "file_id": "file-abc123" }`

**Anthropic (Messages API):**
```json
{
  "type": "image",
  "source": {
    "type": "base64",
    "media_type": "image/jpeg",
    "data": "{base64data}"
  }
}
```
Or URL: `{ "type": "image", "source": { "type": "url", "url": "https://..." } }`
Or file_id: `{ "type": "image", "source": { "type": "file", "file_id": "file_abc123" } }`

**Google Gemini:**
```python
# Inline
types.Part.from_bytes(data=image_bytes, mime_type='image/jpeg')

# File API
uploaded = client.files.upload(file="image.jpg")
# Then reference: uploaded (file object) in contents array

# URL
Part.from_uri(file_uri="https://example.com/image.jpg", mime_type="image/jpeg")
```

### Supported Formats
- **OpenAI**: PNG, JPEG, GIF, WebP
- **Anthropic**: JPEG, PNG, GIF, WebP
- **Gemini**: BMP, JPEG, PNG, WebP

### Detail / Resolution
- **OpenAI**: `detail` parameter (`low` = 512x512 fixed, `high` = up to 2048px longest edge, tiled into 512x512 patches). Low = 85 tokens. High = 85 tokens per tile + 170 base.
- **Anthropic**: Images resized to fit within 1568px on longest side. Token cost calculated based on image dimensions.
- **Gemini**: Handled internally; supports up to 100MB inline.

---

## 4. Context Window Considerations

### The Core Problem
Even the largest context windows (200K tokens for Claude, 128K for GPT-4o, 1M+ for Gemini) can be exceeded by large files. A dense 100-page PDF could easily use 150K-300K tokens.

### Strategies Used by Providers

**Direct Context (Small Files):**
- If the file fits in the context window, it is inserted directly into the prompt as content blocks.
- This is what happens with most API calls -- the full content goes into the context.

**RAG / File Search (Large Files):**
- **OpenAI File Search**: Documents are chunked (800 tokens, 400 overlap), embedded, stored in a vector store. At query time, hybrid semantic + keyword search retrieves the top relevant chunks. This is the Assistants/Responses API "file_search" tool.
- **LibreChat RAG API**: Uses LangChain + PGVector. Documents are chunked, embedded, and retrieved on query.
- **Open WebUI**: Supports RAG pipelines with configurable embedding models and vector stores.

**Chunking Strategies:**
- **Fixed-size chunking**: Split every N tokens with M overlap. Simple, predictable.
- **Semantic chunking**: Respect paragraph/section boundaries. Better coherence but more complex.
- **Recursive character splitting**: LangChain's default -- tries to split on paragraphs, then sentences, then words.
- OpenAI's default: 800 tokens max chunk, 400 token overlap.

**Summarization:**
- For extremely long documents, a map-reduce summarization can compress content before insertion into context.
- Some UIs offer "summarize then query" workflows.

**Page Limits:**
- Anthropic enforces max 600 pages per request (100 pages for 200K context models).
- Recommendation: split large PDFs into sections.

---

## 5. The API Perspective -- Exact Mechanisms

### OpenAI API

**Three ways to provide files:**

1. **Base64 inline** (Chat Completions / Responses):
```json
{
  "type": "input_file",
  "filename": "report.pdf",
  "file_data": "data:application/pdf;base64,{base64string}"
}
```

2. **File ID** (upload first via `/v1/files`):
```bash
curl https://api.openai.com/v1/files \
  -F purpose="user_data" \
  -F file="@report.pdf"
# Returns: { "id": "file-abc123", ... }
```
Then reference: `{ "type": "input_file", "file_id": "file-abc123" }`

3. **External URL**:
```json
{ "type": "input_file", "file_url": "https://example.com/report.pdf" }
```

4. **File Search (RAG)**:
```bash
# Create vector store, add files, then use file_search tool
```
Chunking: 800 tokens default, 400 overlap. Embedding: `text-embedding-3-large`.

### Anthropic API

**Three ways to provide files:**

1. **Base64 inline**:
```json
{
  "type": "document",
  "source": {
    "type": "base64",
    "media_type": "application/pdf",
    "data": "{base64string}"
  }
}
```

2. **URL**:
```json
{
  "type": "document",
  "source": {
    "type": "url",
    "url": "https://example.com/report.pdf"
  }
}
```

3. **Files API** (beta, `files-api-2025-04-14`):
```bash
curl -X POST https://api.anthropic.com/v1/files \
  -H "anthropic-beta: files-api-2025-04-14" \
  -F "file=@document.pdf"
# Returns file_id
```
Then: `{ "type": "document", "source": { "type": "file", "file_id": "file_abc123" } }`

File limits: 500MB per file, 500GB per org. Max 32MB per request payload (use Files API for larger).

For images, use `"type": "image"` instead of `"type": "document"` with the same source options.

### Google Gemini API

**Four input methods:**

1. **Inline data** (up to 100MB, 50MB for PDFs):
```python
types.Part.from_bytes(data=file_bytes, mime_type='application/pdf')
```

2. **File API** (up to 2GB per file, 48hr temporary storage):
```python
uploaded = client.files.upload(file="large_video.mp4")
response = client.models.generate_content(
    model="gemini-3-flash-preview",
    contents=["Summarize this", uploaded]
)
```

3. **Google Cloud Storage** (permanent, up to 2GB per file):
```python
registered = client.files.register_files(uris=["gs://bucket/file.pdf"])
```

4. **External URLs** (up to 100MB, supports S3 presigned, Azure SAS, GCS signed):
```python
Part.from_uri(file_uri="https://example.com/file.pdf", mime_type="application/pdf")
```

---

## 6. Local LLM Setup (llama.cpp)

### Multimodal Capabilities

llama.cpp supports multimodal input through **libmtmd** (multi-modal library). The architecture:

1. A **vision encoder** (mmproj -- multimodal projector) converts images into embeddings.
2. These embeddings are injected into the text model's embedding space.
3. The combined text + image embeddings are processed by the LLM.

**Supported vision models** (as of 2025):
- Gemma 3, SmolVLM, Pixtral, Qwen 2/2.5 VL, Mistral Small 3.1, InternVL, Llama 4 Scout, Moondream2, LLaVA variants, MiniCPM-V

**Running multimodal models:**
```bash
# From HuggingFace (auto-downloads mmproj)
llama-server -hf ggml-org/gemma-3-4b-it-GGUF

# Local files (need both model + projector)
llama-server -m model.gguf --mmproj projector.gguf
```

**Server API** (OpenAI-compatible `/chat/completions`):
```json
{
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": "What is in this image?" },
      {
        "type": "image_url",
        "image_url": {
          "url": "data:image/jpeg;base64,{base64data}"
        }
      }
    ]
  }]
}
```

### Text File Processing

For text files with local LLMs, there is no built-in file processing pipeline. It IS effectively prompt injection:

1. **Your application** reads the file and extracts text (using whatever library you choose).
2. You insert that text into the prompt/message content.
3. The LLM sees it as regular text tokens.

This means for a local setup, YOU are responsible for:
- PDF text extraction (PyMuPDF, pdfplumber, etc.)
- OCR for scanned documents (Tesseract, etc.)
- Spreadsheet parsing
- Chunking / RAG if the file exceeds context window
- Image encoding to base64 for vision models

### Audio Support
Experimental: Ultravox 0.5 and Voxtral models support audio input through libmtmd, but quality is noted as "reduced."

---

## 7. Common Patterns for Building File Upload in Chat UIs

### Architecture Overview

The typical architecture for file upload in an LLM chat UI:

```
[Browser/Client]
    |
    | 1. User selects file
    | 2. Client validates type/size
    | 3. Upload to server (multipart/form-data or base64)
    |
[Backend Server / API Route]
    |
    | 4. Store file (temp or persistent)
    | 5. Detect file type
    | 6. Route to appropriate processor:
    |    - Images -> base64 encode or store & get URL
    |    - PDFs -> text extract + optionally page images
    |    - Text files -> read content
    |    - Spreadsheets -> parse to structured text
    |
    | 7. Decision: Direct context vs RAG?
    |    - Small file -> inject into prompt
    |    - Large file -> chunk, embed, store in vector DB
    |
    | 8. Assemble API request with content blocks
    |
[LLM Provider API / Local LLM]
    |
    | 9. Process and generate response
    |
[Stream response back to client]
```

### How Open Source Chat UIs Implement This

**LibreChat:**
- Priority-based file processing: OCR -> STT -> Text Parsing -> Fallback
- Two modes: "Upload to Provider" (sends directly to OpenAI/Anthropic/Google API) and "Upload as Text" (extracts text locally, injects into prompt)
- RAG integration via LangChain + PGVector (PostgreSQL)
- Configurable per-endpoint: file size limits, MIME type filters, token limits
- Configuration in `librechat.yaml` with `fileConfig` object

**Open WebUI:**
- Built-in RAG pipeline with configurable embedding models
- Document uploads go into "workspaces" or directly into chat
- Supports Ollama and OpenAI-compatible backends
- YouTube-based RAG and web search RAG pipelines

**AnythingLLM:**
- "Workspaces" system: documents organized into isolated contexts
- Built-in vector database (LanceDB) or external (Pinecone, Chroma, etc.)
- Document processing pipeline: upload -> parse -> chunk -> embed -> store
- Supports direct chat with documents or workspace-level knowledge

**LobeChat:**
- Plugin-based architecture for file handling
- Supports multimodal providers directly (passes images/files to provider APIs)
- Knowledge base feature for RAG

### Key Implementation Patterns

**Pattern 1: Direct Provider Upload (simplest)**
- Best when: Using a provider that natively supports the file type
- How: Base64-encode file client-side (or server-side), include in API request as content block
- Example: Sending an image to Claude/GPT-4o as a base64 image content block

**Pattern 2: Server-Side Text Extraction + Prompt Injection**
- Best when: Using text-only models, or wanting control over extraction
- How: Server extracts text from file, inserts into system/user message
- Libraries: PyMuPDF4LLM, pdfplumber, mammoth (docx), SheetJS (xlsx)

**Pattern 3: RAG with Vector Store**
- Best when: Files are large, or you want persistent knowledge bases
- How: Chunk -> Embed -> Store in vector DB -> Retrieve relevant chunks at query time
- Stack: LangChain/LlamaIndex + Chroma/PGVector/Pinecone + embedding model

**Pattern 4: Hybrid (Provider Upload + RAG Fallback)**
- Best when: Building a flexible system
- How: Small files / images -> send directly to provider. Large documents -> RAG pipeline.
- This is what LibreChat does with its dual "Upload to Provider" / "Upload as Text" modes.

### For Your Project (simple-llm-chat-ui with Vercel AI SDK)

Given your stack (Next.js, Vercel AI SDK `ai`, `@ai-sdk/openai-compatible`), the most practical approach:

1. **Images**: Accept image uploads on the client, base64-encode them, and include them as content parts in the message using the AI SDK's multimodal message format. The AI SDK supports `{ type: "image", image: base64data }` content parts.

2. **Text files / Code**: Read file content on the client (FileReader API), include as text in the user message.

3. **PDFs**: Two options:
   - If your backend target supports PDFs natively (Claude, GPT-4o, Gemini): base64-encode and send as a document/file content block.
   - If not: Use a server-side library (pdf-parse, pdfjs-dist) to extract text, then inject into the prompt.

4. **Large files**: Implement a simple chunking strategy or use a vector store if you need persistent knowledge.

---

## Summary Table: Provider File Handling Comparison

| Feature | OpenAI | Anthropic | Google Gemini | llama.cpp |
|---------|--------|-----------|---------------|-----------|
| Image input | base64, URL, file_id | base64, URL, file_id | inline bytes, File API, URL, GCS | base64 (OpenAI-compat) |
| PDF native | Yes (text + images) | Yes (text + page images) | Yes (inline or File API) | No (manual extraction) |
| Max file size | 512MB (Files API) | 500MB (Files API) | 2GB (File API) | N/A (manual) |
| RAG built-in | Yes (File Search + Vector Stores) | No (direct context only) | No (direct context only) | No |
| Context window | 128K (GPT-4o) | 200K (Claude 3.5/4) | 1M+ (Gemini 2.5) | Model-dependent |
| File persistence | Permanent (Files API) | Permanent (Files API) | 48hr (File API), permanent (GCS) | N/A |
| Spreadsheet support | Yes (augmented) | Via Files API | Yes (inline) | No (manual) |

---

## Sources

- [Anthropic Files API](https://docs.anthropic.com/en/docs/build-with-claude/files)
- [Anthropic PDF Support](https://platform.claude.com/docs/en/docs/build-with-claude/pdf-support)
- [Anthropic Vision](https://platform.claude.com/docs/en/build-with-claude/vision)
- [OpenAI Images and Vision](https://platform.openai.com/docs/guides/images-vision)
- [OpenAI File Inputs](https://developers.openai.com/api/docs/guides/file-inputs)
- [OpenAI File Search / Retrieval](https://platform.openai.com/docs/guides/retrieval)
- [OpenAI File Search RAG Cookbook](https://cookbook.openai.com/examples/file_search_responses)
- [Gemini File Input Methods](https://ai.google.dev/gemini-api/docs/file-input-methods)
- [Gemini Files API](https://ai.google.dev/gemini-api/docs/files)
- [llama.cpp Multimodal Documentation](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md)
- [llama.cpp Multimodal DeepWiki](https://deepwiki.com/ggml-org/llama.cpp/7.5-multimodal-support)
- [LibreChat File Configuration](https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/file_config)
- [Weaviate Chunking Strategies for RAG](https://weaviate.io/blog/chunking-strategies-for-rag)
- [PyMuPDF4LLM for PDF Extraction](https://pymupdf.readthedocs.io/en/latest/rag.html)
- [OpenAI Vector Stores Guide](https://www.eesel.ai/blog/openai-vector-stores)
- [Anthropic PDF Cookbook](https://github.com/anthropics/anthropic-cookbook/blob/main/misc/pdf_upload_summarization.ipynb)
