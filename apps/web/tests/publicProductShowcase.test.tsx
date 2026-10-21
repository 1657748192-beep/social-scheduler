import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PublicHomeContent} from '../components/public/PublicHomeContent';
import {PublicHeader,PublicFooter} from '../components/public/PublicSiteChrome';
(globalThis as any).React=React;

test('public product navigation exposes screenshots and legal destinations without login',()=>{
 const html=renderToStaticMarkup(<><PublicHeader locale="en" page="home"/><PublicHomeContent locale="en"/><PublicFooter locale="en"/></>);
 assert.match(html,/Social Scheduler/);
 assert.doesNotMatch(html,/BufferHelp Social Scheduler/);
 assert.match(html,/id="product-tour"/);
 assert.match(html,/src="\/product\/accounts-en.png"/);
 assert.match(html,/src="\/product\/composer-en.png"/);
 assert.match(html,/href="\/en\/privacy"/);
 assert.match(html,/href="\/en\/terms"/);
 assert.match(html,/user\.info\.profile/);
 assert.match(html,/Demo data/);
});

test('Chinese public product tour also explains optional profile access',()=>{
 const html=renderToStaticMarkup(<PublicHomeContent locale="zh-CN"/>);
 assert.match(html,/user\.info\.profile/);
 assert.match(html,/演示数据/);
 assert.match(html,/id="product-tour"/);
});
