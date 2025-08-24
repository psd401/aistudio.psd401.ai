import {
  AttachmentAdapter,
  PendingAttachment,
  CompleteAttachment,
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
} from "@assistant-ui/react";

/**
 * Vision-capable image adapter for LLMs like GPT-4V, Claude 3, Gemini Pro Vision
 * Sends images as base64 data URLs to vision-capable models
 */
export class VisionImageAdapter implements AttachmentAdapter {
  accept = "image/jpeg,image/png,image/webp,image/gif";

  async add({ file }: { file: File }): Promise<PendingAttachment> {
    // Validate file size (20MB limit for most LLMs)
    const maxSize = 20 * 1024 * 1024; // 20MB
    if (file.size > maxSize) {
      throw new Error("Image size exceeds 20MB limit");
    }

    // Return pending attachment while processing
    return {
      id: crypto.randomUUID(),
      type: "image",
      name: file.name,
      contentType: file.type,
      file,
      status: { 
        type: "running",
        reason: "uploading",
        progress: 0
      },
    };
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    // Convert image to base64 data URL
    const base64 = await this.fileToBase64DataURL(attachment.file);

    // Return in assistant-ui format with image content
    return {
      id: attachment.id,
      type: "image",
      name: attachment.name,
      contentType: attachment.contentType || "image/jpeg",
      content: [
        {
          type: "image",
          image: base64, // data:image/jpeg;base64,... format
        },
      ],
      status: { type: "complete" },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async remove(_attachment: PendingAttachment): Promise<void> {
    // Cleanup if needed (e.g., revoke object URLs if you created any)
  }

  private async fileToBase64DataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // FileReader result is already a data URL
        resolve(reader.result as string);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}

/**
 * PDF document adapter
 * Handles PDF files by converting to base64 for processing
 * Future enhancement: Add text extraction using pdf.js
 */
export class PDFAttachmentAdapter implements AttachmentAdapter {
  accept = "application/pdf";

  async add({ file }: { file: File }): Promise<PendingAttachment> {
    // Validate file size
    const maxSize = 10 * 1024 * 1024; // 10MB limit
    if (file.size > maxSize) {
      throw new Error("PDF size exceeds 10MB limit");
    }

    return {
      id: crypto.randomUUID(),
      type: "document",
      name: file.name,
      contentType: file.type,
      file,
      status: { 
        type: "running",
        reason: "uploading",
        progress: 0
      },
    };
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    // Option 1: Extract text from PDF (requires pdf parsing library)
    // const text = await this.extractTextFromPDF(attachment.file);

    // Option 2: Convert to base64 for API processing
    const base64Data = await this.fileToBase64(attachment.file);

    return {
      id: attachment.id,
      type: "document",
      name: attachment.name,
      contentType: attachment.contentType || "application/pdf",
      content: [
        {
          type: "text",
          text: `[PDF Document: ${attachment.name}]\nBase64 data: ${base64Data.substring(0, 50)}...`,
        },
      ],
      status: { type: "complete" },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async remove(_attachment: PendingAttachment): Promise<void> {
    // Cleanup if needed
  }

  private async fileToBase64(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  // Optional: Extract text from PDF using a library like pdf.js
  // private async extractTextFromPDF(file: File): Promise<string> {
  //   // Implementation would use pdf.js or similar
  //   // This is a placeholder
  //   return "Extracted PDF text content";
  // }
}

/**
 * Creates a composite adapter combining all attachment adapters for Nexus
 * Includes:
 * - Vision-capable image adapter (for AI models with vision)
 * - Simple image adapter (for display-only)
 * - Simple text adapter (for text files)
 * - PDF adapter (for document processing)
 */
export function createNexusAttachmentAdapter() {
  return new CompositeAttachmentAdapter([
    new VisionImageAdapter(),           // For vision-capable models
    new SimpleImageAttachmentAdapter(), // For display-only images
    new SimpleTextAttachmentAdapter(),  // For text files
    new PDFAttachmentAdapter(),         // For PDF documents
  ]);
}