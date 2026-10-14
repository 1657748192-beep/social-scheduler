import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider } from '../components/LanguageProvider';
import { SocialAccountProfileLink } from '../components/social/SocialAccountProfileLink';

test('account homepage link opens separately and distinguishes Facebook Pages', () => {
  (globalThis as typeof globalThis & {React:typeof React}).React=React;
  const html=renderToStaticMarkup(React.createElement(LanguageProvider,null,React.createElement(SocialAccountProfileLink,{platform:'facebook',profileUrl:'https://www.facebook.com/profile.php?id=182945841568122'})));
  assert.match(html,/查看公共主页/);
  assert.match(html,/target="_blank"/);
  assert.match(html,/rel="noopener noreferrer"/);
  assert.match(html,/href="https:\/\/www.facebook.com\/profile.php\?id=182945841568122"/);
});
test('missing or unsafe profile links cannot be clicked', () => {
  (globalThis as typeof globalThis & {React:typeof React}).React=React;
  for(const profileUrl of [null,'javascript:alert(1)','https://evil.test/andy','https://www.facebook.com.evil.test/andy']) {
    const html=renderToStaticMarkup(React.createElement(LanguageProvider,null,React.createElement(SocialAccountProfileLink,{platform:'facebook',profileUrl})));
    assert.match(html,/主页链接暂不可用/);
    assert.doesNotMatch(html,/href=/);
  }
});
