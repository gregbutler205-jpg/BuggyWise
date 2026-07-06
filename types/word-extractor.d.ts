declare module "word-extractor" {
  class Document {
    getBody(): string;
  }
  export default class WordExtractor {
    extract(input: string | Buffer): Promise<Document>;
  }
}
