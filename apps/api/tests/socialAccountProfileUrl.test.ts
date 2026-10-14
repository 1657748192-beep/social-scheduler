import assert from 'node:assert/strict';
import test from 'node:test';
import { socialAccountProfileUrl } from '../src/services/socialAccountProfileUrl';

test('profile links use reliable Page/channel IDs and saved platform usernames, not display names', () => {
  const cases = [
    [{platform:'facebook',providerAccountId:'182945841568122'}, 'https://www.facebook.com/profile.php?id=182945841568122'],
    [{platform:'youtube',providerAccountId:'UCabcdefghijklmnopqrstuv'}, 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv'],
    [{platform:'instagram',providerAccountId:'1781',capabilities:{profileUsername:'mooyamcosmetic'}}, 'https://www.instagram.com/mooyamcosmetic/'],
    [{platform:'pinterest',providerAccountId:'123',capabilities:{profileUsername:'mooyam'}}, 'https://www.pinterest.com/mooyam/'],
    [{platform:'tiktok',providerAccountId:'opaque',capabilities:{profileUrl:'https://www.tiktok.com/@mooyamcosmetic'}}, 'https://www.tiktok.com/@mooyamcosmetic'],
    [{platform:'tiktok',providerAccountId:'opaque',displayName:'mooyamcosmetic'}, null],
    [{platform:'instagram',providerAccountId:'1781',displayName:'Unknown Name'}, null]
  ] as const;
  for (const [account, expected] of cases) assert.equal(socialAccountProfileUrl(account), expected);
});

test('profile URLs reject hostile hosts, credentials, tokens, non-profile paths and malformed identifiers', () => {
  for (const profileUrl of ['javascript:alert(1)', 'https://www.tiktok.com.evil.test/@andy', 'https://evil.test/@andy', 'https://user:password@www.tiktok.com/@andy', 'https://www.tiktok.com/@andy?access_token=secret', 'https://www.tiktok.com/login', 'https://www.instagram.com/andy/']) {
    assert.equal(socialAccountProfileUrl({platform:'tiktok',providerAccountId:'opaque',capabilities:{profileUrl}}),null);
  }
  assert.equal(socialAccountProfileUrl({platform:'youtube',providerAccountId:'Some channel name'}),null);
  assert.equal(socialAccountProfileUrl({platform:'instagram',providerAccountId:'1',capabilities:{profileUsername:'../login'}}),null);
  assert.equal(socialAccountProfileUrl({platform:'facebook',providerAccountId:'1&access_token=secret'}),null);
});
