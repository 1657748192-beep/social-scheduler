import React from 'react';
import {createRoot} from 'react-dom/client';
import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {PathnameContext} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import {LanguageProvider} from '../../components/LanguageProvider';
import DashboardPageContent from '../../components/dashboard/DashboardPageContent';
import type {SocialAccount} from '../../lib/api';

const accounts:SocialAccount[]=[
  {id:'ig-brand',platform:'instagram',displayName:'mooyamcosmetic',profileUrl:'https://www.instagram.com/mooyamcosmetic/'},
  {id:'ig-second',platform:'instagram',displayName:'rayewier257964',profileUrl:'https://www.instagram.com/rayewier257964/'},
  {id:'fb',platform:'facebook',displayName:'Factory Wholesale',accountType:'page',profileUrl:'https://www.facebook.com/61554219602183',status:'permission_missing'},
  {id:'youtube',platform:'youtube',displayName:'Mooyam Cosmetics',profileUrl:'https://www.youtube.com/@mooyam'},
  {id:'youtube-second',platform:'youtube',displayName:'Andy peng',status:'disconnected'},
  {id:'tiktok',platform:'tiktok',displayName:'mooyamcosmetic',profileUrl:'https://www.tiktok.com/@mooyamcosmetic'},
  {id:'tiktok-second',platform:'tiktok',displayName:'andypeng97',status:'token_expired'},
  {id:'pinterest',platform:'pinterest',displayName:'Mooyam Daily Care',profileUrl:'https://www.pinterest.com/mooyam/'}
].map(a=>({providerAccountId:'demo-'+a.id,status:'active',capabilities:{},createdAt:'2026-10-17T01:00:00Z',credential:{scopes:a.platform==='tiktok'?['user.info.basic','user.info.stats','video.list']:a.platform==='facebook'?['pages_show_list','pages_manage_posts']:a.platform==='instagram'?['instagram_business_basic','instagram_business_content_publish']:a.platform==='pinterest'?['boards:read','pins:write']:['https://www.googleapis.com/auth/youtube.upload'],updatedAt:'2026-10-17T01:00:00Z'},...a})) as SocialAccount[];
const platforms=['instagram','facebook','youtube','tiktok','pinterest'];
localStorage.setItem('social_scheduler_token','local-fixture-only');
window.fetch=async(raw,init)=>{
  const url=new URL(String(raw));
  if(init?.method&&init.method!=='GET')return Response.json({message:'Local preview is read-only'},{status:403});
  if(url.pathname.endsWith('/auth/me'))return Response.json({id:'demo',name:'Andy',email:'demo@example.test'});
  if(url.pathname.endsWith('/workspaces'))return Response.json([{id:'demo-workspace',name:"Andy's Workspace",role:'owner'},{id:'empty-workspace',name:'Empty Workspace',role:'viewer'}]);
  if(url.pathname.endsWith('/integrations/oauth/status'))return Response.json(platforms.map(platform=>({platform,platformParam:platform,displayName:platform==='tiktok'?'TikTok':platform==='youtube'?'YouTube':platform.charAt(0).toUpperCase()+platform.slice(1),configured:true})));
  if(url.pathname.endsWith('/social-accounts'))return Response.json(url.pathname.includes('empty-workspace')?[]:accounts);
  if(url.pathname.endsWith('/tiktok-stats'))return Response.json({status:'ok',followerCount:12,followingCount:3,likesCount:45,videoCount:5,fetchedAt:'2026-10-17T01:00:00Z'});
  if(url.pathname.endsWith('/facebook-management/status'))return Response.json({enabled:true,configured:true});
  return Response.json({message:'Unavailable in read-only preview'},{status:404});
};
const router={back(){},forward(){},refresh(){},push(){},replace(){},prefetch:async()=>{}};
createRoot(document.getElementById('root')!).render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/social-accounts"><LanguageProvider><DashboardPageContent accountsOnly/></LanguageProvider></PathnameContext.Provider></AppRouterContext.Provider>);
