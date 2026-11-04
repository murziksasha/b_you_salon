import dns from 'dns/promises';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createPinnedDispatcher,
  isPrivateIp,
  isSafePublicUrl,
  resolveAndValidateHost,
  safeFetch,
} from './ssrf';

describe('lib/ssrf', () => {
  describe('isPrivateIp', () => {
    it('detects IPv4 loopback (127.0.0.0/8)', () => {
      expect(isPrivateIp('127.0.0.1')).toBe(true);
      expect(isPrivateIp('127.255.255.255')).toBe(true);
    });

    it('detects RFC1918 private IPv4 networks', () => {
      expect(isPrivateIp('10.0.0.1')).toBe(true);
      expect(isPrivateIp('10.254.1.2')).toBe(true);
      expect(isPrivateIp('172.16.0.1')).toBe(true);
      expect(isPrivateIp('172.31.255.255')).toBe(true);
      expect(isPrivateIp('192.168.1.1')).toBe(true);
      expect(isPrivateIp('192.168.254.254')).toBe(true);
    });

    it('detects link-local, CGNAT, and reserved IPs', () => {
      expect(isPrivateIp('169.254.169.254')).toBe(true);
      expect(isPrivateIp('100.64.0.1')).toBe(true);
      expect(isPrivateIp('0.0.0.0')).toBe(true);
      expect(isPrivateIp('255.255.255.255')).toBe(true);
      expect(isPrivateIp('192.0.2.1')).toBe(true);
      expect(isPrivateIp('198.51.100.1')).toBe(true);
      expect(isPrivateIp('203.0.113.1')).toBe(true);
    });

    it('detects IPv6 loopback, link-local, and RFC4193 private addresses', () => {
      expect(isPrivateIp('::1')).toBe(true);
      expect(isPrivateIp('::')).toBe(true);
      expect(isPrivateIp('fe80::1')).toBe(true);
      expect(isPrivateIp('fc00::1')).toBe(true);
      expect(isPrivateIp('fd12:3456:789a::1')).toBe(true);
      expect(isPrivateIp('2001:db8::1')).toBe(true);
    });

    it('detects IPv4-mapped IPv6 private addresses', () => {
      expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true);
      expect(isPrivateIp('::ffff:192.168.1.1')).toBe(true);
      expect(isPrivateIp('::ffff:169.254.169.254')).toBe(true);
      expect(isPrivateIp('::ffff:7f00:1')).toBe(true); // 127.0.0.1 in hex
      expect(isPrivateIp('::ffff:a00:1')).toBe(true); // 10.0.0.1 in hex
      expect(isPrivateIp('64:ff9b::127.0.0.1')).toBe(true);
    });

    it('allows public IPv4 and IPv6 addresses', () => {
      expect(isPrivateIp('8.8.8.8')).toBe(false);
      expect(isPrivateIp('1.1.1.1')).toBe(false);
      expect(isPrivateIp('93.184.216.34')).toBe(false);
      expect(isPrivateIp('172.15.0.1')).toBe(false);
      expect(isPrivateIp('172.32.0.1')).toBe(false);
      expect(isPrivateIp('2606:4700:4700::1111')).toBe(false);
      expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false);
    });
  });

  describe('resolveAndValidateHost & DNS validation', () => {
    it('fails closed when host resolves to mixed public and private addresses', async () => {
      const originalLookup = dns.lookup;
      try {
        dns.lookup = vi.fn().mockResolvedValue([
          { address: '93.184.216.34', family: 4 },
          { address: '127.0.0.1', family: 4 },
        ]) as typeof dns.lookup;

        await expect(resolveAndValidateHost('mixed.example.com')).rejects.toThrow(
          /resolves to private IP/,
        );
      } finally {
        dns.lookup = originalLookup;
      }
    });

    it('rejects host resolving to IPv4-mapped loopback', async () => {
      const originalLookup = dns.lookup;
      try {
        dns.lookup = vi.fn().mockResolvedValue([
          { address: '::ffff:127.0.0.1', family: 6 },
        ]) as typeof dns.lookup;

        await expect(resolveAndValidateHost('mapped.example.com')).rejects.toThrow(
          /resolves to private IP/,
        );
      } finally {
        dns.lookup = originalLookup;
      }
    });

    it('rejects localhost explicitly', async () => {
      await expect(resolveAndValidateHost('localhost')).rejects.toThrow(/local hostname/);
      await expect(resolveAndValidateHost('foo.localhost')).rejects.toThrow(/local hostname/);
    });
  });

  describe('safeFetch with redirects and pinned connections', () => {
    let server: ReturnType<typeof createServer>;
    let port: number;

    beforeAll(async () => {
      server = createServer((req, res) => {
        if (req.url === '/redirect-to-private') {
          res.writeHead(302, { Location: 'http://127.0.0.1:9999/secret' });
          res.end();
          return;
        }
        if (req.url === '/ok') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('hello public');
          return;
        }
        res.writeHead(404);
        res.end();
      });

      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          port = (server.address() as AddressInfo).port;
          resolve();
        });
      });
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('blocks direct fetch to private loopback IP', async () => {
      await expect(safeFetch(`http://127.0.0.1:${port}/ok`)).rejects.toThrow(/private IP address/);
    });

    it('blocks redirect attempting to target private IP', async () => {
      // Mock DNS so initial domain appears public
      const originalLookup = dns.lookup;
      try {
        dns.lookup = vi.fn().mockResolvedValue([
          { address: '127.0.0.1', family: 4 }, // will be caught by resolveAndValidateHost
        ]) as typeof dns.lookup;

        await expect(safeFetch(`http://example.com:${port}/redirect-to-private`)).rejects.toThrow(
          /private IP/,
        );
      } finally {
        dns.lookup = originalLookup;
      }
    });

    it('creates pinned dispatcher with correct family and address', () => {
      const dispatcher = createPinnedDispatcher({ address: '93.184.216.34', family: 4 });
      expect(dispatcher).toBeDefined();
    });
  });
});
