import fetch from 'node-fetch';

import { FastifyPluginAsync } from 'fastify';

import { Item, ItemType, UnknownExtra } from '@graasp/sdk';

import { createSchema } from './schemas';

interface GraaspEmbeddedLinkItemOptions {
  /** \<protocol\>://\<hostname\>:\<port\> */
  iframelyHrefOrigin: string;
}

interface EmbeddedLinkItemExtra extends UnknownExtra {
  embeddedLink: {
    title: string;
    descritpion: string;
    url: string;
    html: string;
    thumbnails: string[];
    icons: string[];
  };
}

type IframelyLink = {
  rel: string[];
  href: string;
};

type IframelyResponse = {
  meta: {
    title?: string;
    description?: string;
  };
  html: string;
  links: IframelyLink[];
};

const plugin: FastifyPluginAsync<GraaspEmbeddedLinkItemOptions> = async (fastify, options) => {
  const { iframelyHrefOrigin } = options;
  const {
    items: { taskManager, extendCreateSchema },
    taskRunner: runner,
  } = fastify;

  if (!iframelyHrefOrigin) throw new Error('graasp-embedded-link-item: mandatory options missing');

  // "install" custom schema for validating embedded link items creation
  extendCreateSchema(createSchema);

  // register pre create handler to pre fetch link metadata
  const createItemTaskName = taskManager.getCreateTaskName();
  runner.setTaskPreHookHandler<Item<EmbeddedLinkItemExtra>>(
    createItemTaskName,
    async (item: Partial<Item<EmbeddedLinkItemExtra>>) => {
      const { type: itemType, extra } = item;
      const { embeddedLink } = extra ?? {};

      if (itemType !== ItemType.LINK || !embeddedLink) return;

      const { url } = embeddedLink;

      const response = await fetch(`${iframelyHrefOrigin}/iframely?uri=${encodeURIComponent(url)}`);
      // better clues on how to extract the metadata here: https://iframely.com/docs/links
      const { meta = {}, html, links = [] } = (await response.json()) as IframelyResponse;
      const { title, description } = meta;

      // TODO: maybe all the code below should be moved to another place if it gets more complex
      if (title) {
        item.name = title.trim();
      }
      if (description) {
        item.description = description.trim();
      }
      if (html) {
        embeddedLink.html = html;
      }

      embeddedLink.thumbnails = links
        .filter(({ rel }) => hasThumbnailRel(rel))
        .map(({ href }) => href);

      embeddedLink.icons = links
        .filter(({ rel }: { rel: string[] }) => hasIconRel(rel))
        .map(({ href }) => href);
    },
  );
};

const hasRel = (rel: string[], value: string) => rel.some((r) => r === value);
const hasThumbnailRel = (rel: string[]) => hasRel(rel, 'thumbnail');
const hasIconRel = (rel: string[]) => hasRel(rel, 'icon');

export default plugin;
