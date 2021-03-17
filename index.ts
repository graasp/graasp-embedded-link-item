import { FastifyPluginAsync } from 'fastify';
import { Item, UnknownExtra } from 'graasp';
import fetch from 'node-fetch';

interface GraaspEmbeddedLinkItemOptions {
  /** \<protocol\>://\<hostname\>:\<port\> */
  iframelyHrefOrigin: string,
}

interface EmbeddedLinkItemExtra extends UnknownExtra {
  embeddedLinkItem: {
    title: string,
    descritpion: string,
    url: string,
    html: string,
    thumbnails: string[]
  }
}

const ITEM_TYPE = 'embedded-link';

const plugin: FastifyPluginAsync<GraaspEmbeddedLinkItemOptions> = async (fastify, options) => {
  const { iframelyHrefOrigin } = options;
  const { items: { taskManager }, taskRunner: runner } = fastify;

  if (!iframelyHrefOrigin) throw new Error('graasp-embedded-link-item: mandatory options missing');

  // register pre create handler to pre fetch link metadata
  const createItemTaskName = taskManager.getCreateTaskName();
  runner.setTaskPreHookHandler<Item<EmbeddedLinkItemExtra>>(createItemTaskName,
    async (item) => {
      const { type: itemType, extra: { embeddedLinkItem } = {} } = item;
      if (itemType !== ITEM_TYPE || !embeddedLinkItem) return;

      const { url } = embeddedLinkItem;

      const response = await fetch(`${iframelyHrefOrigin}/iframely?uri=${encodeURIComponent(url)}`);
      // better clues on how to extract the metadata here: https://iframely.com/docs/links
      const { meta: { title, description }, html, links } = await response.json();

      // TODO: maybe all the code below should be moved to another place if it gets more co
      if (title) item.name = title;
      if (description) item.description = description;
      if (html) embeddedLinkItem.html = html;

      if (links.length) {
        embeddedLinkItem.thumbnails = links
          .reduce((acc: string[], { rel, href }: { rel: string[], href: string }) => {
            if (hasThumbnailRel(rel)) acc.push(href);
            return acc;
          }, []);
      }
    });
};

const hasRel = (rel: string[], value: string) => rel.some(r => r === value);
const hasThumbnailRel = (rel: string[]) => hasRel(rel, 'thumbnail');

export default plugin;
