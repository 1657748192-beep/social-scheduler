// From repo root: node apps/web/tests/browser/fixtures/composerFocusServer.cjs
// Then: npx --yes --package @playwright/cli playwright-cli -s=composer-focus open http://127.0.0.1:3189 --headed
// PowerShell: $probe=(Get-Content apps/web/tests/browser/replyComposerFocus.cjs -Raw) -replace '(?m)^//.*$','' -replace '\r?\n',' '
// npx --yes --package @playwright/cli playwright-cli -s=composer-focus run-code $probe
// Only synthetic component props are used; fixture rejects fetch/send/save/ack.
// A regression to the global outward focus ring must fail these geometry checks.
async (page) => {
 const results=[];
 for(const width of [1366,390]){
  await page.setViewportSize({width,height:900});
  for(const language of ['English','中文']){
   await page.getByRole('button',{name:language,exact:true}).click();
   const english=language==='English';
   for(const mode of ['reply','note']){
    await page.getByRole('tab',{name:mode==='reply'?(english?'Message reply':'私信回复'):(english?'Internal note':'内部备注'),exact:true}).click();
    const textbox=page.getByRole('textbox',{name:mode==='reply'?(english?'Reply text':'回复正文'):(english?'Internal note':'内部备注'),exact:true});
    for(let i=0;i<4&&!await textbox.evaluate(el=>el===document.activeElement);i++)await page.keyboard.press('Tab');
    if(!await textbox.evaluate(el=>el===document.activeElement))throw Error('Keyboard focus did not reach active input');
    await textbox.fill(english?'Local unsent draft for focus verification':'仅本地聚焦验证，不发送');
    const measured=await textbox.evaluate(el=>{
     const c=getComputedStyle(el),box=el.getBoundingClientRect(),parent=el.closest('.inbox-reply'),identity=parent.querySelector('.inbox-compose-identity').getBoundingClientRect(),footer=parent.querySelector('.inbox-compose-footer').getBoundingClientRect();
     return{focus:el.matches(':focus-visible'),outline:parseFloat(c.outlineWidth),offset:parseFloat(c.outlineOffset),topGap:box.top-identity.bottom,bottomGap:footer.top-box.bottom,width:box.width,parentWidth:parent.clientWidth,visibleInputs:[...parent.querySelectorAll('textarea')].filter(x=>getComputedStyle(x).display!=='none').length,overflow:document.documentElement.scrollWidth>innerWidth};
    });
    if(!measured.focus||measured.outline<1||measured.offset+measured.outline>0)throw Error('Focus ring escapes input and can cross identity text: '+JSON.stringify(measured));
    if(measured.topGap<6||measured.bottomGap<6||measured.width>measured.parentWidth||measured.visibleInputs!==1||measured.overflow)throw Error('Composer geometry or hidden-mode regression: '+JSON.stringify(measured));
    await textbox.blur();await textbox.click();if(await textbox.inputValue()!==(english?'Local unsent draft for focus verification':'仅本地聚焦验证，不发送'))throw Error('Mouse focus changed draft');
    if(mode==='reply')await page.screenshot({path:`focus-${width}-${english?'en':'zh'}.png`,fullPage:true});
    results.push({viewportWidth:width,language,mode,...measured});
   }
  }
 }
 const unrelated=page.getByRole('textbox',{name:'Unrelated field',exact:true});await unrelated.focus();
 if(await unrelated.evaluate(el=>parseFloat(getComputedStyle(el).outlineOffset))!==3)throw Error('Global focus style was unexpectedly changed');
 return{fullTheme:true,keyboardAndMouse:true,unrelatedFocusUnchanged:true,noSend:true,results};
}
