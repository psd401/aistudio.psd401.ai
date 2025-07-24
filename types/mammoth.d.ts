declare module 'mammoth' {
  interface Message {
    type: string;
    message: string;
  }

  interface Result<T> {
    value: T;
    messages: Message[];
  }

  interface ConversionOptions {
    buffer?: Buffer;
    path?: string;
    arrayBuffer?: ArrayBuffer;
  }

  interface ConvertToHtmlOptions extends ConversionOptions {
    styleMap?: string | string[];
    includeDefaultStyleMap?: boolean;
    convertImage?: any;
    ignoreEmptyParagraphs?: boolean;
    idPrefix?: string;
    transformDocument?: any;
  }

  interface Images {
    imgElement: (image: any) => any;
  }

  export function convertToHtml(options: ConvertToHtmlOptions): Promise<Result<string>>;
  export function convertToMarkdown(options: ConversionOptions): Promise<Result<string>>;
  export function extractRawText(options: ConversionOptions): Promise<Result<string>>;
  export const images: Images;

  export default {
    convertToHtml,
    convertToMarkdown,
    extractRawText,
    images
  };
}