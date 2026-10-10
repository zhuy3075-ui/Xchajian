export function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string };
export function mdToBlocks(raw: string): {
  title: string;
  blocks: ({ type: 'html'; html: string } | { type: 'image'; ref: string })[];
};
