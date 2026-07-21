import { describe, expect, it } from 'vitest';
import { isPrivateIp, truncateIp } from './net';

describe('isPrivateIp', () => {
  it('reconnaît loopback et plages privées IPv4', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.0.0.5')).toBe(true);
    expect(isPrivateIp('192.168.1.42')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('172.31.255.254')).toBe(true);
  });

  it('reconnaît loopback / ULA / link-local IPv6 (dont IPv4 mappée)', () => {
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('::ffff:192.168.0.10')).toBe(true);
    expect(isPrivateIp('fd12:3456::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
  });

  it('rejette les adresses publiques et les valeurs vides', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('203.0.113.9')).toBe(false);
    expect(isPrivateIp('172.32.0.1')).toBe(false); // hors 16..31
    expect(isPrivateIp('2a01:e0a::1')).toBe(false);
    expect(isPrivateIp(undefined)).toBe(false);
    expect(isPrivateIp('')).toBe(false);
  });
});

describe('truncateIp', () => {
  it('tronque une IPv4 aux deux premiers octets', () => {
    expect(truncateIp('88.186.251.122')).toBe('88.186.x.x');
    expect(truncateIp('::ffff:203.0.113.9')).toBe('203.0.x.x');
  });

  it('tronque une IPv6 aux trois premiers groupes', () => {
    expect(truncateIp('2a01:e0a:ebe:de90:211:32ff:fe:1')).toBe('2a01:e0a:ebe::');
  });

  it('renvoie une chaîne vide pour une entrée vide', () => {
    expect(truncateIp('')).toBe('');
    expect(truncateIp(undefined)).toBe('');
  });
});
