import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const worlds = defineCollection({
  loader: glob({ pattern: '**/index.md', base: './src/content/worlds' }),
  schema: z.object({
    name: z.string(),
    tagline: z.string(),
    description: z.string(),
    genre: z.string(),
    themes: z.array(z.string()).default([]),
    banner: z.string().nullable().optional(),
    thumbnail: z.string().nullable().optional(),
    order: z.number().default(0),
  }),
});

const characters = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/characters' }),
  schema: z.object({
    name: z.string(),
    world: z.string(),
    title: z.string().optional(),
    portrait: z.string().nullable().optional(),
    age: z.string().optional(),
    species: z.string().optional(),
    role: z.string().optional(),
    traits: z.array(z.string()).default([]),
    chatEnabled: z.boolean().default(false),
    chatPromptFile: z.string().optional(),
    order: z.number().default(0),
  }),
});

const fiction = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/fiction' }),
  schema: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('novel-meta'),
      novelTitle: z.string(),
      synopsis: z.string(),
      world: z.string(),
      status: z.enum(['ongoing', 'completed', 'hiatus']).default('ongoing'),
      cover: z.string().nullable().optional(),
      order: z.number().default(0),
    }),
    z.object({
      type: z.literal('chapter'),
      novel: z.string(),
      chapterNumber: z.number(),
      chapterTitle: z.string(),
      order: z.number().default(0),
    }),
  ]),
});

const prompts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/prompts' }),
  schema: z.object({
    characterId: z.string(),
    model: z.string().default('gpt-4o-mini'),
    temperature: z.number().default(0.8),
    maxTokens: z.number().default(1024),
  }),
});

export const collections = { worlds, characters, fiction, prompts };
