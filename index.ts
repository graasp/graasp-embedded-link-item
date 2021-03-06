import { FastifyPluginAsync } from 'fastify';
import fetch from 'node-fetch';
import { Item, UnknownExtra } from 'graasp';
import { createSchema } from './schemas';

interface GraaspEmbeddedLinkItemOptions {
  /** \<protocol\>://\<hostname\>:\<port\> */
  iframelyHrefOrigin: string,
}

interface EmbeddedLinkItemExtra extends UnknownExtra {
  embeddedLink: {
    title: string,
    descritpion: string,
    url: string,
    html: string,
    thumbnails: string[],
    icons: string[]
  }
}

const ITEM_TYPE = 'embeddedLink';

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
  runner.setTaskPreHookHandler<Item<EmbeddedLinkItemExtra>>(createItemTaskName,
    async (item) => {
      const { type: itemType, extra: { embeddedLink } = {} } = item;
      if (itemType !== ITEM_TYPE || !embeddedLink) return;

      const { url } = embeddedLink;

      const response = await fetch(`${iframelyHrefOrigin}/iframely?uri=${encodeURIComponent(url)}`);
      // better clues on how to extract the metadata here: https://iframely.com/docs/links
      const { meta = {}, html, links = [] } = await response.json();
      const { title, description } = meta;

      // TODO: maybe all the code below should be moved to another place if it gets more complex
      if (title) item.name = title;
      if (description) item.description = description;
      if (html) embeddedLink.html = html;

      embeddedLink.thumbnails = links
        .filter(({ rel }: { rel: string[] }) => hasThumbnailRel(rel))
        .map(({ href }: { href: string }) => href);

      embeddedLink.icons = links
        .filter(({ rel }: { rel: string[] }) => hasIconRel(rel))
        .map(({ href }: { href: string }) => href);
    });
};

const hasRel = (rel: string[], value: string) => rel.some(r => r === value);
const hasThumbnailRel = (rel: string[]) => hasRel(rel, 'thumbnail');
const hasIconRel = (rel: string[]) => hasRel(rel, 'icon');

export default plugin;
