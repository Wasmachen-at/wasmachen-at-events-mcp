import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCategoriesForAgents, type AgentCategory } from '../api-client.js';
import {
  authorize,
  rateLimitedResult,
  recordUsage,
  unauthorizedResult,
  type AuthContext,
} from '../auth.js';

interface CategoryNode {
  id: string;
  name: string;
  i18nKey: string;
  translations: Record<string, string>;
  subCategories?: CategoryNode[];
}

const categorySchema: z.ZodType<CategoryNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    i18nKey: z.string(),
    translations: z.record(z.string(), z.string()),
    subCategories: z.array(categorySchema).optional(),
  }),
);

function mapCategory(category: AgentCategory): CategoryNode {
  return {
    id: category.id,
    name: category.name,
    i18nKey: category.i18nKey,
    translations: category.translations ?? {},
    subCategories: category.subCategories?.map(mapCategory),
  };
}

function summarizeAsText(categories: CategoryNode[]): string {
  if (!categories.length) return 'No categories found.';
  const lines = categories.map((category) => {
    const subs = category.subCategories?.length
      ? ` (${category.subCategories.map((sub) => sub.name).join(', ')})`
      : '';
    return `- ${category.name} [${category.i18nKey}]${subs}`;
  });
  return `${categories.length} top-level categories:\n${lines.join('\n')}`;
}

export function registerListCategoriesTool(
  server: McpServer,
  context: AuthContext = {},
): void {
  const toolConfig = {
    title: 'List event categories on wasmachen.at',
    description:
      'List the top-level event category vocabulary on wasmachen.at, with ' +
      'translations and sub-categories. Use the `i18nKey` values as the ' +
      '`categories` filter in search-events, nearby-events, and trending-events.',
    inputSchema: {},
    outputSchema: {
      categories: z.array(categorySchema),
    },
  };

  const handler = async () => {
    const auth = await authorize(context.apiKey);
    if (!auth.ok) {
      return auth.rateLimited
        ? rateLimitedResult(auth.retryAfter)
        : unauthorizedResult();
    }

    let categories: CategoryNode[];
    try {
      const raw = await getCategoriesForAgents();
      categories = raw.map(mapCategory);
    } catch (error) {
      console.error('list-categories: backend request failed', error);
      return {
        content: [
          {
            type: 'text' as const,
            text: 'The wasmachen.at category list is temporarily unavailable. Please try again.',
          },
        ],
        structuredContent: { categories: [] },
        isError: true,
      };
    }

    recordUsage(context.apiKey, 'list-categories', categories.length);
    return {
      content: [{ type: 'text' as const, text: summarizeAsText(categories) }],
      structuredContent: { categories },
    };
  };

  server.registerTool('list-categories', toolConfig, handler);
}
