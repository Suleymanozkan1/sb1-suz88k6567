import { useEffect } from 'react';

interface Props {
  title: string;
  description?: string;
  path?: string;
  noindex?: boolean;
}

const SITE = 'https://duguntakip.com';

function setMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/** Sayfa başlığı ve meta etiketlerini yöneten yardımcı bileşen */
export default function Seo({ title, description, path, noindex }: Props) {
  useEffect(() => {
    document.title = title;

    if (description) {
      setMeta('meta[name="description"]', 'name', 'description', description);
      setMeta('meta[property="og:description"]', 'property', 'og:description', description);
    }
    setMeta('meta[property="og:title"]', 'property', 'og:title', title);
    setMeta('meta[name="robots"]', 'name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');

    if (path) {
      const href = `${SITE}${path}`;
      let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'canonical';
        document.head.appendChild(link);
      }
      link.href = href;
      setMeta('meta[property="og:url"]', 'property', 'og:url', href);
    }
  }, [title, description, path, noindex]);

  return null;
}
