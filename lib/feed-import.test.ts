import { describe, expect, it } from 'vitest';
import {
  buildCharacteristics,
  cleanFeedDescription,
  decodeHtmlEntities,
  detectFeedFormat,
  parseLivestaJson,
  parseLivestaXml,
  stripHtmlToPlainText,
  type FeedProduct,
} from './feed-import';

describe('feed-import', () => {
  describe('detectFeedFormat', () => {
    it('detects xml from format query parameter', () => {
      expect(detectFeedFormat('https://example.com/feed?format=xml')).toBe('xml');
      expect(detectFeedFormat('https://example.com/feed?other=1&format=xml')).toBe('xml');
    });

    it('detects xml from file extension or string content', () => {
      expect(detectFeedFormat('https://example.com/export.xml')).toBe('xml');
      expect(detectFeedFormat('https://example.com/feed/file.XML')).toBe('xml');
    });

    it('detects xml by sniffing content', () => {
      expect(detectFeedFormat('https://example.com/feed', '<?xml version="1.0"?><catalog></catalog>')).toBe('xml');
      expect(detectFeedFormat('https://example.com/feed', '<yml_catalog></yml_catalog>')).toBe('xml');
      expect(detectFeedFormat('https://example.com/feed?format=xml', '{"shop":{}}')).toBe('json');
    });

    it('defaults to json for other urls', () => {
      expect(detectFeedFormat('https://example.com/feed')).toBe('json');
      expect(detectFeedFormat('https://example.com/feed?format=json')).toBe('json');
      expect(detectFeedFormat('invalid-url')).toBe('json');
    });
  });

  describe('buildCharacteristics', () => {
    it('builds characteristics string from present fields', () => {
      const product: FeedProduct = {
        sku: '123',
        name: 'Cream',
        description: 'Desc',
        price: 150,
        thumbUrl: '',
        netVolume: '50',
        unit: 'мл',
        weight: '0.15',
        quantity: '10',
      };

      const result = buildCharacteristics(product);
      expect(result).toBe("Об'єм: 50 мл\nВага: 0.15 кг\nЗалишок: 10");
    });

    it('formats volume without unit if unit is absent', () => {
      const product: FeedProduct = {
        sku: '123',
        name: 'Cream',
        description: '',
        price: 100,
        thumbUrl: '',
        netVolume: '100',
      };

      expect(buildCharacteristics(product)).toBe("Об'єм: 100");
    });

    it('skips zero or missing weights and empty fields', () => {
      const product: FeedProduct = {
        sku: '123',
        name: 'Cream',
        description: '',
        price: 100,
        thumbUrl: '',
        weight: '0.000',
      };

      expect(buildCharacteristics(product)).toBe('');
    });
  });

  describe('parseLivestaJson', () => {
    it('returns empty array for invalid inputs', () => {
      expect(parseLivestaJson(null)).toEqual([]);
      expect(parseLivestaJson(undefined)).toEqual([]);
      expect(parseLivestaJson('string')).toEqual([]);
      expect(parseLivestaJson({})).toEqual([]);
    });

    it('parses directly from array of items', () => {
      const raw = [
        {
          sku: 'SKU-1',
          name: 'Shampoo',
          description: 'Hair care',
          price: '250',
          price_red: '200',
          thumb: 'https://example.com/img1.jpg',
          weight: '0.3',
          net_volume: '250',
          unit: 'мл',
          quantity: '5',
        },
      ];

      const res = parseLivestaJson(raw);
      expect(res).toHaveLength(1);
      expect(res[0]).toEqual({
        sku: 'SKU-1',
        name: 'Shampoo',
        description: 'Hair care',
        price: 200,
        rrp: 250,
        thumbUrl: 'https://example.com/img1.jpg',
        weight: '0.3',
        netVolume: '250',
        unit: 'мл',
        quantity: '5',
      });
    });

    it('parses real Livesta API shop.products response', () => {
      const raw = {
        shop: {
          products: [
            {
              productId: 10759,
              name: 'Бальзам LIVESTA',
              sku: '111904',
              picture: 'https://livesta.ua/image.jpg',
              price: '400.0000',
              special: '229.0000',
              netVolume: '500.00',
              unit: 'мл',
              weight: '0.500',
              quantity: '1648.000',
              description: '<p>Тест</p>',
            },
          ],
        },
      };

      const res = parseLivestaJson(raw);
      expect(res).toHaveLength(1);
      expect(res[0]).toMatchObject({
        sku: '111904',
        name: 'Бальзам LIVESTA',
        price: 229,
        rrp: 400,
        thumbUrl: 'https://livesta.ua/image.jpg',
        netVolume: '500.00',
        unit: 'мл',
        weight: '0.500',
      });
    });

    it('parses wrapped in products or data field', () => {
      const raw = {
        products: [{ sku: 'SKU-2', name: 'Soap', price: 50 }],
      };

      const res = parseLivestaJson(raw);
      expect(res).toHaveLength(1);
      expect(res[0]?.sku).toBe('SKU-2');
      expect(res[0]?.price).toBe(50);
      expect(res[0]?.rrp).toBeUndefined();
    });

    it('skips items missing sku or name', () => {
      const raw = [
        { sku: '', name: 'No SKU' },
        { sku: 'SKU-3', name: '' },
        { sku: 'SKU-4', name: 'Valid' },
      ];

      const res = parseLivestaJson(raw);
      expect(res).toHaveLength(1);
      expect(res[0]?.sku).toBe('SKU-4');
    });
  });

  describe('parseLivestaXml', () => {
    it('returns empty array for invalid xml', () => {
      expect(parseLivestaXml('not xml <<>>')).toEqual([]);
    });

    it('parses Livesta style <products><item> XML', () => {
      const xml = `
        <yml_catalog date="29-09-26">
          <shop>
            <products>
              <item id="0">
                <productId>10759</productId>
                <picture>https://livesta.ua/image.jpg</picture>
                <name>Бальзам LIVESTA</name>
                <sku>111904</sku>
                <price>400.0000</price>
                <special>229.0000</special>
                <netVolume>500.00</netVolume>
                <unit>мл</unit>
              </item>
            </products>
          </shop>
        </yml_catalog>
      `;

      const res = parseLivestaXml(xml);
      expect(res).toHaveLength(1);
      expect(res[0]).toMatchObject({
        sku: '111904',
        name: 'Бальзам LIVESTA',
        price: 229,
        rrp: 400,
        thumbUrl: 'https://livesta.ua/image.jpg',
        netVolume: '500',
        unit: 'мл',
      });
    });

    it('parses xml with product nodes', () => {
      const xml = `
        <catalog>
          <products>
            <product>
              <sku>XML-1</sku>
              <name>Serum</name>
              <description>Face serum</description>
              <price>400</price>
              <price_red>320</price_red>
              <thumb>https://example.com/serum.jpg</thumb>
              <net_volume>30</net_volume>
              <unit>мл</unit>
            </product>
          </products>
        </catalog>
      `;

      const res = parseLivestaXml(xml);
      expect(res).toHaveLength(1);
      expect(res[0]).toMatchObject({
        sku: 'XML-1',
        name: 'Serum',
        description: 'Face serum',
        price: 320,
        rrp: 400,
        thumbUrl: 'https://example.com/serum.jpg',
        netVolume: '30',
        unit: 'мл',
      });
    });
  });

  describe('cleanFeedDescription & stripHtmlToPlainText', () => {
    it('decodes escaped HTML entities including nested ones', () => {
      expect(decodeHtmlEntities('&lt;p&gt;Hello &amp;amp; World&lt;/p&gt;')).toBe('<p>Hello & World</p>');
    });

    it('strips doctype, head, style, and script tags and retains safe HTML', () => {
      const dirty = `&lt;!DOCTYPE html&gt;&lt;html dir=&quot;ltr&quot;&gt;&lt;head&gt;&lt;style type=&quot;text/css&quot;&gt;body{color:red;}&lt;/style&gt;&lt;/head&gt;&lt;body&gt;&lt;p&gt;Бальзам з екстрактом &lt;b&gt;каштана&lt;/b&gt;.&lt;/p&gt;&lt;/body&gt;&lt;/html&gt;`;
      const cleaned = cleanFeedDescription(dirty);
      expect(cleaned).toBe('<p>Бальзам з екстрактом <b>каштана</b>.</p>');
      expect(cleaned).not.toContain('DOCTYPE');
      expect(cleaned).not.toContain('style');
      expect(cleaned).not.toContain('color:red');
    });

    it('handles plain text gracefully', () => {
      expect(cleanFeedDescription('Простий опис товару')).toBe('Простий опис товару');
      expect(cleanFeedDescription('')).toBe('');
      expect(cleanFeedDescription(null)).toBe('');
    });

    it('converts HTML to clean plain text for card previews', () => {
      const html = '<p>Бальзам з екстрактом <b>кінського каштана</b>.</p><p>Другий абзац.</p>';
      expect(stripHtmlToPlainText(html)).toBe('Бальзам з екстрактом кінського каштана. Другий абзац.');
    });
  });
});
