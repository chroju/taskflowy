export interface RichTextOptions {
  imageUrls?: boolean;
}
export function isImageUrl(url: string | null | undefined): boolean;
export function renderRichText(raw: string | null | undefined, opts?: RichTextOptions): string;
export function renderRichTitle(raw: string | null | undefined, opts?: RichTextOptions): string;
export function plainTextWithImageUrls(raw: string | null | undefined): string;
