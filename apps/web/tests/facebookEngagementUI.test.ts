import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider } from '../components/LanguageProvider';
import { FacebookEngagementStatusView } from '../components/social/FacebookEngagementStatus';
import { FacebookCommentsView } from '../components/posts/FacebookPostComments';
import { facebookSendNotice } from '../lib/facebookEngagement';
const render=(element:React.ReactElement)=>{(globalThis as any).React=React;return renderToStaticMarkup(React.createElement(LanguageProvider,null,element));};
test('accountStatusAndCommentRendering',()=>{
  const capabilities={readComments:{status:'available' as const},replyComments:{status:'available' as const},readMessages:{status:'missing' as const},replyMessages:{status:'missing' as const},subscription:{status:'unknown' as const}};
  const html=render(React.createElement(FacebookEngagementStatusView,{capabilities,canManage:true,loading:false,error:null,onAuthorize:()=>{},onRefresh:()=>{}}));
  assert.match(html,/补充授权/);assert.match(html,/未获准/);assert.match(html,/尚未确认/);assert.match(html,/facebook.png/);
  const missing=render(React.createElement(FacebookCommentsView,{items:[],missingPostId:true,canReply:false,error:null,busy:false,drafts:{},onDraft:()=>{},onReply:()=>{},onRefresh:()=>{}}));
  assert.match(missing,/真实帖子 ID/);assert.doesNotMatch(missing,/暂无评论/);
  const empty=render(React.createElement(FacebookCommentsView,{items:[],missingPostId:false,canReply:false,error:null,busy:false,drafts:{},onDraft:()=>{},onReply:()=>{},onRefresh:()=>{}}));
  assert.match(empty,/暂无评论/);assert.doesNotMatch(empty,/发送回复/);
});
test('unknownReplyShowsPendingVerification',()=>{
  assert.match(facebookSendNotice({status:'unknown',diagnosticId:'trace'},'zh-CN'),/待核实/);
  assert.match(facebookSendNotice({status:'sent',providerId:'mid'},'en'),/sent/);
});
